import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { GatewayPolicySnapshot, GatewayRouteSnapshot } from "./policy";
import { appendGatewayAuditEvent } from "./evidence";

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

type GatewayBreakerDbRow = {
  id: string;
  scopeKind: string;
  scopeKey: string;
  generation: bigint;
  state: string;
  reasonClass: string;
};

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
  const parameters = scopes.flatMap((scope) => [scope.scopeKind, scope.scopeKey]);
  const predicates = scopes
    .map((_, index) => `("scopeKind"=$${index * 2 + 1} AND "scopeKey"=$${index * 2 + 2})`)
    .join(" OR ");
  const rows = await prisma.$queryRawUnsafe<GatewayBreakerDbRow[]>(
    `SELECT id,"scopeKind","scopeKey",generation,state,"reasonClass" FROM "ModelGatewayBreaker" WHERE ${predicates}`,
    ...parameters,
  );
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
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `gateway-breaker:${input.scope.scopeKind}:${input.scope.scopeKey}`,
    );
    const [current] = await tx.$queryRawUnsafe<GatewayBreakerDbRow[]>(
      `SELECT id,"scopeKind","scopeKey",generation,state,"reasonClass" FROM "ModelGatewayBreaker" WHERE "scopeKind"=$1 AND "scopeKey"=$2 FOR UPDATE`,
      input.scope.scopeKind,
      input.scope.scopeKey,
    );
    if (!current) {
      if (input.expectedGeneration !== 0n || input.nextState !== "open") {
        throw new StaleGatewayBreakerGenerationError();
      }
      const [created] = await tx.$queryRawUnsafe<GatewayBreakerDbRow[]>(
        `INSERT INTO "ModelGatewayBreaker" (id,"scopeKind","scopeKey",generation,state,"reasonClass","changedBy","changedAt") VALUES ($1,$2,$3,1,'open',$4,$5,now()) RETURNING id,"scopeKind","scopeKey",generation,state,"reasonClass"`,
        `mgb_${randomUUID().replaceAll("-", "")}`,
        input.scope.scopeKind,
        input.scope.scopeKey,
        input.reasonClass,
        input.actorId,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ModelGatewayBreakerEvent" (id,"scopeKind","scopeKey","priorGeneration","newGeneration","priorState","newState","reasonClass","actorId","correlationId","createdAt") VALUES ($1,$2,$3,0,1,'closed','open',$4,$5,$6,now())`,
        `mgbe_${randomUUID().replaceAll("-", "")}`,
        input.scope.scopeKind,
        input.scope.scopeKey,
        input.reasonClass,
        input.actorId,
        correlationId,
      );
      await appendGatewayAuditEvent(tx, {
        eventType: "model_gateway.breaker.opened",
        correlationId,
        actorId: input.actorId,
        errorClass: input.reasonClass,
      });
      if (!created) throw new StaleGatewayBreakerGenerationError();
      return Object.freeze({
        ...input.scope,
        generation: created.generation,
        state: created.state as "closed" | "open",
        reasonClass: created.reasonClass,
      });
    }
    if (current.generation !== input.expectedGeneration || current.state === input.nextState) {
      throw new StaleGatewayBreakerGenerationError();
    }
    const nextGeneration = current.generation + 1n;
    const updated = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE "ModelGatewayBreaker" SET generation=$3,state=$4,"reasonClass"=$5,"changedBy"=$6,"changedAt"=now() WHERE id=$1 AND generation=$2 RETURNING id`,
      current.id,
      input.expectedGeneration,
      nextGeneration,
      input.nextState,
      input.reasonClass,
      input.actorId,
    );
    if (updated.length !== 1) throw new StaleGatewayBreakerGenerationError();
    await tx.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayBreakerEvent" (id,"scopeKind","scopeKey","priorGeneration","newGeneration","priorState","newState","reasonClass","actorId","correlationId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
      `mgbe_${randomUUID().replaceAll("-", "")}`,
      input.scope.scopeKind,
      input.scope.scopeKey,
      current.generation,
      nextGeneration,
      current.state,
      input.nextState,
      input.reasonClass,
      input.actorId,
      correlationId,
    );
    await appendGatewayAuditEvent(tx, {
      eventType: input.nextState === "open"
        ? "model_gateway.breaker.opened"
        : "model_gateway.breaker.closed",
      correlationId,
      actorId: input.actorId,
      errorClass: input.reasonClass,
    });
    return Object.freeze({
      ...input.scope,
      generation: nextGeneration,
      state: input.nextState,
      reasonClass: input.reasonClass,
    });
  });
}
