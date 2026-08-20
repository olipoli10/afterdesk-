import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { GatewayPolicySnapshot, GatewayRouteSnapshot } from "./policy";

export const GATEWAY_BREAKER_SCOPE_KINDS = ["policy", "route", "model", "provider"] as const;
export type GatewayBreakerScopeKind = (typeof GATEWAY_BREAKER_SCOPE_KINDS)[number];

export type GatewayBreakerScope = Readonly<{
  scopeKind: GatewayBreakerScopeKind;
  scopeKey: string;
}>;

export type GatewayBreakerSnapshot = Readonly<{
  scopeKind: GatewayBreakerScopeKind;
  scopeKey: string;
  generation: bigint;
  state: "closed" | "open";
  reasonClass: string;
}>;

export type GatewayBreakerResolution =
  | Readonly<{ status: "clear"; generation: bigint }>
  | Readonly<{ status: "open"; scope: GatewayBreakerScope; generation: bigint }>;

export function gatewayBreakerScopes(input: {
  policy: Pick<GatewayPolicySnapshot, "policyKey">;
  route: Pick<GatewayRouteSnapshot, "routeKey" | "version" | "modelKey" | "billingProvider">;
}): readonly GatewayBreakerScope[] {
  return Object.freeze([
    Object.freeze({ scopeKind: "policy", scopeKey: input.policy.policyKey }),
    Object.freeze({ scopeKind: "route", scopeKey: `${input.route.routeKey}@${input.route.version}` }),
    Object.freeze({ scopeKind: "model", scopeKey: input.route.modelKey }),
    Object.freeze({ scopeKind: "provider", scopeKey: input.route.billingProvider }),
  ]);
}

/**
 * Missing rows are closed at generation zero. The summed generation is a
 * monotone fence for this exact scope set: any later open/close transition
 * increments one component and therefore invalidates the prior snapshot.
 */
export function resolveGatewayBreakers(input: {
  scopes: readonly GatewayBreakerScope[];
  snapshots: readonly GatewayBreakerSnapshot[];
}): GatewayBreakerResolution {
  let generation = 0n;
  for (const scope of input.scopes) {
    const snapshot = input.snapshots.find(
      (candidate) => candidate.scopeKind === scope.scopeKind && candidate.scopeKey === scope.scopeKey
    );
    if (!snapshot) continue;
    generation += snapshot.generation;
    if (snapshot.state === "open") return Object.freeze({ status: "open", scope, generation });
  }
  return Object.freeze({ status: "clear", generation });
}

export async function loadGatewayBreakerResolution(input: {
  policy: Pick<GatewayPolicySnapshot, "policyKey">;
  route: Pick<GatewayRouteSnapshot, "routeKey" | "version" | "modelKey" | "billingProvider">;
}): Promise<GatewayBreakerResolution> {
  const scopes = gatewayBreakerScopes(input);
  const rows = await prisma.modelGatewayBreaker.findMany({
    where: {
      OR: scopes.map((scope) => ({ scopeKind: scope.scopeKind, scopeKey: scope.scopeKey })),
    },
    select: { scopeKind: true, scopeKey: true, generation: true, state: true, reasonClass: true },
  });
  return resolveGatewayBreakers({
    scopes,
    snapshots: rows.map((row) => ({
      scopeKind: row.scopeKind as GatewayBreakerScopeKind,
      scopeKey: row.scopeKey,
      generation: row.generation,
      state: row.state as "closed" | "open",
      reasonClass: row.reasonClass,
    })),
  });
}

export class StaleGatewayBreakerGenerationError extends Error {
  constructor() {
    super("STALE_GATEWAY_BREAKER_GENERATION");
    this.name = "StaleGatewayBreakerGenerationError";
  }
}

export async function transitionGatewayBreaker(input: {
  scope: GatewayBreakerScope;
  expectedGeneration: bigint;
  nextState: "closed" | "open";
  reasonClass: string;
  actorId: string;
  correlationId?: string;
}): Promise<GatewayBreakerSnapshot> {
  const correlationId = input.correlationId ?? `breaker_${randomUUID().replaceAll("-", "")}`;
  return prisma.$transaction(async (tx) => {
    const current = await tx.modelGatewayBreaker.findUnique({
      where: { scopeKind_scopeKey: input.scope },
      select: { id: true, generation: true, state: true },
    });
    if (!current) {
      if (input.expectedGeneration !== 0n || input.nextState !== "open") {
        throw new StaleGatewayBreakerGenerationError();
      }
      const created = await tx.modelGatewayBreaker.create({
        data: {
          scopeKind: input.scope.scopeKind,
          scopeKey: input.scope.scopeKey,
          generation: 1n,
          state: "open",
          reasonClass: input.reasonClass,
          changedBy: input.actorId,
        },
        select: { generation: true, state: true, reasonClass: true },
      });
      await tx.modelGatewayBreakerEvent.create({
        data: {
          scopeKind: input.scope.scopeKind,
          scopeKey: input.scope.scopeKey,
          priorGeneration: 0n,
          newGeneration: 1n,
          priorState: "closed",
          newState: "open",
          reasonClass: input.reasonClass,
          actorId: input.actorId,
          correlationId,
        },
      });
      return Object.freeze({ ...input.scope, ...created, state: created.state as "closed" | "open" });
    }
    if (current.generation !== input.expectedGeneration || current.state === input.nextState) {
      throw new StaleGatewayBreakerGenerationError();
    }
    const nextGeneration = current.generation + 1n;
    const updated = await tx.modelGatewayBreaker.updateMany({
      where: { id: current.id, generation: input.expectedGeneration },
      data: {
        generation: nextGeneration,
        state: input.nextState,
        reasonClass: input.reasonClass,
        changedBy: input.actorId,
        changedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new StaleGatewayBreakerGenerationError();
    await tx.modelGatewayBreakerEvent.create({
      data: {
        scopeKind: input.scope.scopeKind,
        scopeKey: input.scope.scopeKey,
        priorGeneration: current.generation,
        newGeneration: nextGeneration,
        priorState: current.state,
        newState: input.nextState,
        reasonClass: input.reasonClass,
        actorId: input.actorId,
        correlationId,
      },
    });
    return Object.freeze({
      ...input.scope,
      generation: nextGeneration,
      state: input.nextState,
      reasonClass: input.reasonClass,
    });
  });
}
