import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import {
  isGatewayProviderErrorClass,
  type GatewayProviderErrorClass,
  type ProtectedContentRef,
} from "./types";
import { classificationOutputSchema, type ClassificationOutput } from "@/lib/ai-work-engine/schemas";

type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

function canonicalValue(value: unknown): Canonical {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_CANONICAL_NUMBER");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("NON_CANONICAL_DATE");
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("NON_CANONICAL_OBJECT");
    }
    const out: Record<string, Canonical> = {};
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error(`NON_CANONICAL_VALUE:${key}`);
      out[key] = canonicalValue(child);
    }
    return out;
  }
  throw new Error("NON_CANONICAL_VALUE");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalFingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

const CONTENT_KEYS = /(raw|prompt|response|content|secret|credential|token|password)/i;

export function protectedContentRef(value: ProtectedContentRef): ProtectedContentRef {
  for (const key of Object.keys(value)) {
    if (CONTENT_KEYS.test(key)) throw new Error("PROTECTED_REFERENCE_CONTAINS_CONTENT");
  }
  if (!/^[A-Za-z0-9_.:-]{1,240}$/.test(value.id)) throw new Error("INVALID_PROTECTED_REFERENCE");
  if (!/^sha256:[a-f0-9]{64}$/.test(value.fingerprint)) {
    throw new Error("INVALID_PROTECTED_FINGERPRINT");
  }
  return Object.freeze({ ...value });
}

export function redactProviderFailure(errorClass: GatewayProviderErrorClass, httpStatus: number | null) {
  if (!isGatewayProviderErrorClass(errorClass)) throw new Error("UNKNOWN_PROVIDER_ERROR_CLASS");
  if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) {
    throw new Error("INVALID_PROVIDER_HTTP_STATUS");
  }
  return Object.freeze({ errorClass, httpStatus });
}

export type ClassificationValidation =
  | Readonly<{
      status: "valid";
      value: ClassificationOutput;
      responseEvidenceRef: `sha256:${string}`;
    }>
  | Readonly<{
      status: "invalid";
      failureClass: "malformed_provider_response";
      responseEvidenceRef: `sha256:${string}`;
    }>;

export function validateClassificationResponse(response: unknown): ClassificationValidation {
  const parsed = classificationOutputSchema.safeParse(response);
  if (!parsed.success) {
    return Object.freeze({
      status: "invalid" as const,
      failureClass: "malformed_provider_response" as const,
      responseEvidenceRef: canonicalFingerprint({
        contract: "classification-v1",
        valid: false,
        issueCodes: parsed.error.issues.map((issue) => issue.code).sort(),
      }),
    });
  }
  return Object.freeze({
    status: "valid" as const,
    value: parsed.data,
    responseEvidenceRef: canonicalFingerprint({
      contract: "classification-v1",
      valid: true,
      outputFingerprint: canonicalFingerprint(parsed.data),
    }),
  });
}

/** Content-free, operator-readable lineage for one logical gateway operation. */
export type GatewayAttemptLineageInput = Readonly<{
  attempt: number;
  routeKey: string | null;
  routeVersion: number | null;
  decision: "route_authorized" | "refused";
  reasonClass: string;
  holdStatus: "held" | "settled" | "released";
  heldMicros: bigint;
  settledMicros: bigint | null;
  dispatchState: "not_dispatched" | "settled" | "unaccounted";
  attemptStatus: string;
  errorClass: GatewayProviderErrorClass | null;
  providerRequestRef: string | null;
}>;

export type GatewayAttemptLineage = Readonly<{
  attempt: number;
  route: string | null;
  decision: string;
  reasonClass: string;
  spend: "held" | "settled" | "released";
  exposureMicros: bigint;
  dispatchState: string;
  attemptStatus: string;
  errorClass: GatewayProviderErrorClass | null;
  providerRequestRef: string | null;
}>;

export function projectGatewayAttemptLineage(
  attempts: readonly GatewayAttemptLineageInput[]
): readonly GatewayAttemptLineage[] {
  return Object.freeze(attempts.slice().sort((left, right) => left.attempt - right.attempt).map((attempt) =>
    Object.freeze({
      attempt: attempt.attempt,
      route: attempt.routeKey === null || attempt.routeVersion === null ? null : `${attempt.routeKey}@${attempt.routeVersion}`,
      decision: attempt.decision,
      reasonClass: attempt.reasonClass,
      spend: attempt.holdStatus,
      exposureMicros: attempt.holdStatus === "settled" ? (attempt.settledMicros ?? 0n) : attempt.holdStatus === "held" ? attempt.heldMicros : 0n,
      dispatchState: attempt.dispatchState,
      attemptStatus: attempt.attemptStatus,
      errorClass: attempt.errorClass,
      providerRequestRef: attempt.providerRequestRef,
    })
  ));
}

/**
 * Ordinary gateway evidence deliberately has no free-form payload.  The
 * allowlisted fields below are enough to reconstruct accountability without
 * turning the operational ledger into a second prompt/output store.
 */
export const GATEWAY_AUDIT_EVENT_TYPES = [
  "model_gateway.admission.accepted",
  "model_gateway.admission.refused",
  "model_gateway.policy.published",
  "model_gateway.policy.retired",
  "model_gateway.route.certified",
  "model_gateway.route.revoked",
  "model_gateway.decision.authorized",
  "model_gateway.decision.refused",
  "model_gateway.attempt.prepared",
  "model_gateway.attempt.dispatched",
  "model_gateway.attempt.settled",
  "model_gateway.attempt.failed",
  "model_gateway.attempt.uncertain",
  "model_gateway.breaker.opened",
  "model_gateway.breaker.closed",
  "model_gateway.spend.held",
  "model_gateway.spend.released",
  "model_gateway.spend.settled",
  "model_gateway.replay.converged",
  "voice_intake.session.created",
  "voice_intake.session.finishing",
  "voice_intake.session.cancelled",
  "voice_intake.session.ready",
  "voice_intake.session.incomplete",
  "voice_intake.session.uncertain",
  "voice_intake.session.purged",
  "voice_intake.segment.registered",
  "voice_intake.segment.replayed",
  "voice_intake.segment.refused",
  "voice_intake.segment.succeeded",
  "voice_intake.segment.failed",
  "voice_intake.segment.uncertain",
  "voice_intake.transcript.purged",
] as const;

export type GatewayAuditEventType = (typeof GATEWAY_AUDIT_EVENT_TYPES)[number];

type GatewayAuditEventShape = Readonly<{
  eventType: GatewayAuditEventType;
  correlationId: string;
  gatewayOperationId: string | null;
  tenantId: string | null;
  attemptId: string | null;
  decisionId: string | null;
  policyHash: string | null;
  routeHash: string | null;
  spendHoldId: string | null;
  billingProvider: string | null;
  amountMicros: bigint | null;
  errorClass: string | null;
  dispatchState: string | null;
  resultContractStatus: string | null;
  evidenceRef: string | null;
  actorId: string | null;
}>;

export type GatewayAuditEventInput = Partial<Omit<GatewayAuditEventShape, "eventType" | "correlationId">> &
  Pick<GatewayAuditEventShape, "eventType" | "correlationId">;

export type GatewayAuditEvent = GatewayAuditEventShape & Readonly<{
  id: string;
  createdAt: Date;
}>;

const AUDIT_KEYS = new Set([
  "eventType", "correlationId", "gatewayOperationId", "tenantId", "attemptId", "decisionId",
  "policyHash", "routeHash", "spendHoldId", "billingProvider", "amountMicros", "errorClass",
  "dispatchState", "resultContractStatus", "evidenceRef", "actorId",
]);
const SAFE_AUDIT_ID = /^[A-Za-z0-9_.:@/-]{1,240}$/;
const SAFE_AUDIT_CLASS = /^[a-z][a-z0-9_:-]{0,95}$/;

function auditNullableIdentifier(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !SAFE_AUDIT_ID.test(value)) throw new Error(`INVALID_GATEWAY_AUDIT_${field}`);
  return value;
}

function auditNullableHash(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(`INVALID_GATEWAY_AUDIT_${field}`);
  return value;
}

/** Validates a content-free event before it can enter the ordinary ledger. */
export function createGatewayAuditEvent(input: GatewayAuditEventInput): GatewayAuditEventShape {
  for (const key of Object.keys(input as object)) {
    if (!AUDIT_KEYS.has(key) || CONTENT_KEYS.test(key)) throw new Error("GATEWAY_AUDIT_CONTENT_FORBIDDEN");
  }
  if (!(GATEWAY_AUDIT_EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    throw new Error("INVALID_GATEWAY_AUDIT_EVENT_TYPE");
  }
  const correlationId = auditNullableIdentifier(input.correlationId, "CORRELATION_ID");
  if (correlationId === null) throw new Error("INVALID_GATEWAY_AUDIT_CORRELATION_ID");
  const amountMicros = input.amountMicros === undefined || input.amountMicros === null
    ? null : typeof input.amountMicros === "bigint" && input.amountMicros >= 0n
      ? input.amountMicros : (() => { throw new Error("INVALID_GATEWAY_AUDIT_AMOUNT"); })();
  const stableClass = (value: unknown, field: string): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || !SAFE_AUDIT_CLASS.test(value)) throw new Error(`INVALID_GATEWAY_AUDIT_${field}`);
    return value;
  };
  return Object.freeze({
    eventType: input.eventType,
    correlationId,
    gatewayOperationId: auditNullableIdentifier(input.gatewayOperationId, "OPERATION_ID"),
    tenantId: auditNullableIdentifier(input.tenantId, "TENANT_ID"),
    attemptId: auditNullableIdentifier(input.attemptId, "ATTEMPT_ID"),
    decisionId: auditNullableIdentifier(input.decisionId, "DECISION_ID"),
    policyHash: auditNullableHash(input.policyHash, "POLICY_HASH"),
    routeHash: auditNullableHash(input.routeHash, "ROUTE_HASH"),
    spendHoldId: auditNullableIdentifier(input.spendHoldId, "SPEND_HOLD_ID"),
    billingProvider: auditNullableIdentifier(input.billingProvider, "BILLING_PROVIDER"),
    amountMicros,
    errorClass: stableClass(input.errorClass, "ERROR_CLASS"),
    dispatchState: stableClass(input.dispatchState, "DISPATCH_STATE"),
    resultContractStatus: stableClass(input.resultContractStatus, "RESULT_CONTRACT_STATUS"),
    evidenceRef: auditNullableHash(input.evidenceRef, "EVIDENCE_REF"),
    actorId: auditNullableIdentifier(input.actorId, "ACTOR_ID"),
  });
}

/**
 * Appends one immutable, idempotent event in the caller's authoritative
 * transaction.  Its fingerprint excludes timestamps, so a replay converges
 * on the first durable event rather than manufacturing a second history.
 */
export async function appendGatewayAuditEvent(
  tx: Prisma.TransactionClient,
  input: GatewayAuditEventInput
): Promise<GatewayAuditEvent> {
  const event = createGatewayAuditEvent(input);
  const eventFingerprint = canonicalFingerprint(event);
  await tx.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayAuditEvent" (id,"eventType","correlationId","gatewayOperationId","tenantId","attemptId","decisionId","policyHash","routeHash","spendHoldId","billingProvider","amountMicros","errorClass","dispatchState","resultContractStatus","evidenceRef","actorId","eventFingerprint","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()) ON CONFLICT ("eventFingerprint") DO NOTHING`,
    `gwa_${randomUUID().replaceAll("-", "")}`,
    event.eventType, event.correlationId, event.gatewayOperationId, event.tenantId, event.attemptId,
    event.decisionId, event.policyHash, event.routeHash, event.spendHoldId, event.billingProvider,
    event.amountMicros, event.errorClass, event.dispatchState, event.resultContractStatus,
    event.evidenceRef, event.actorId, eventFingerprint
  );
  const [row] = await tx.$queryRawUnsafe<GatewayAuditEvent[]>(
    `SELECT id,"eventType","correlationId","gatewayOperationId","tenantId","attemptId","decisionId","policyHash","routeHash","spendHoldId","billingProvider","amountMicros","errorClass","dispatchState","resultContractStatus","evidenceRef","actorId","createdAt" FROM "ModelGatewayAuditEvent" WHERE "eventFingerprint"=$1`,
    eventFingerprint
  );
  if (!row) throw new Error("GATEWAY_AUDIT_PERSISTENCE_MISSING");
  return Object.freeze(row);
}

export type GatewayAuditReconstruction = Readonly<{
  operations: readonly (Readonly<{
    gatewayOperationId: string;
    tenantId: string | null;
    outcome: "succeeded" | "failed" | "uncertain" | "refused" | "active";
    attempts: number;
    events: readonly GatewayAuditEventType[];
  }>)[];
  breakers: readonly (Readonly<{ state: "open" | "closed"; actorId: string | null; correlationId: string }>)[];
}>;

/** A bounded operational projection; it intentionally excludes event internals. */
export function projectGatewayAuditReconstruction(events: readonly GatewayAuditEvent[]): GatewayAuditReconstruction {
  const byOperation = new Map<string, GatewayAuditEvent[]>();
  const breakers: Array<Readonly<{ state: "open" | "closed"; actorId: string | null; correlationId: string }>> = [];
  for (const event of events) {
    if (event.eventType === "model_gateway.breaker.opened" || event.eventType === "model_gateway.breaker.closed") {
      breakers.push(Object.freeze({
        state: event.eventType === "model_gateway.breaker.opened" ? "open" : "closed",
        actorId: event.actorId,
        correlationId: event.correlationId,
      }));
    }
    if (event.gatewayOperationId) {
      const current = byOperation.get(event.gatewayOperationId) ?? [];
      current.push(event);
      byOperation.set(event.gatewayOperationId, current);
    }
  }
  const outcomeFor = (items: readonly GatewayAuditEvent[]) => {
    const types = new Set(items.map((item) => item.eventType));
    if (types.has("model_gateway.attempt.uncertain")) return "uncertain" as const;
    if (types.has("model_gateway.attempt.settled")) return "succeeded" as const;
    if (types.has("model_gateway.attempt.failed")) return "failed" as const;
    if (types.has("model_gateway.decision.refused") || types.has("model_gateway.admission.refused")) return "refused" as const;
    return "active" as const;
  };
  return Object.freeze({
    operations: Object.freeze([...byOperation.entries()].map(([gatewayOperationId, items]) => Object.freeze({
      gatewayOperationId,
      tenantId: items[0]?.tenantId ?? null,
      outcome: outcomeFor(items),
      attempts: new Set(items.map((item) => item.attemptId).filter((value): value is string => value !== null)).size,
      events: Object.freeze(items.map((item) => item.eventType)),
    }))),
    breakers: Object.freeze(breakers),
  });
}

/**
 * Tenant readers are deliberately required to name their own tenant. There is
 * no ordinary all-tenant audit query; certification/breaker administration is
 * exposed only through a separately authorized admin projection.
 */
export async function loadTenantGatewayAuditReconstruction(input: {
  tenantId: string;
  gatewayOperationId?: string;
}): Promise<GatewayAuditReconstruction> {
  const tenantId = auditNullableIdentifier(input.tenantId, "TENANT_ID");
  if (tenantId === null) throw new Error("INVALID_GATEWAY_AUDIT_TENANT_ID");
  const operationId = auditNullableIdentifier(input.gatewayOperationId, "OPERATION_ID");
  const rows = await prisma.$queryRawUnsafe<GatewayAuditEvent[]>(
    `SELECT id,"eventType","correlationId","gatewayOperationId","tenantId","attemptId","decisionId","policyHash","routeHash","spendHoldId","billingProvider","amountMicros","errorClass","dispatchState","resultContractStatus","evidenceRef","actorId","createdAt" FROM "ModelGatewayAuditEvent" WHERE "tenantId"=$1 AND ($2::text IS NULL OR "gatewayOperationId"=$2) ORDER BY "createdAt",id`,
    tenantId,
    operationId
  );
  return projectGatewayAuditReconstruction(rows);
}

export type GatewayProviderInvoiceLine = Readonly<{
  attemptId: string;
  billingProvider: string;
  measuredCostMicros: bigint;
  invoiceEvidenceRef: `sha256:${string}`;
}>;

/**
 * Correlates provider invoice evidence only by the already-redacted attempt
 * identity. Invoice payloads and provider response bodies are never accepted.
 */
export function projectGatewayProviderInvoiceCorrelation(input: {
  events: readonly GatewayAuditEvent[];
  invoiceLines: readonly GatewayProviderInvoiceLine[];
}): readonly Readonly<{
  attemptId: string;
  billingProvider: string;
  heldMicros: bigint;
  measuredCostMicros: bigint;
  invoiceEvidenceRef: `sha256:${string}`;
}>[] {
  const held = new Map<string, GatewayAuditEvent>();
  for (const event of input.events) {
    if (event.eventType === "model_gateway.spend.held" && event.attemptId) held.set(event.attemptId, event);
  }
  return Object.freeze(input.invoiceLines.map((line) => {
    const hold = held.get(line.attemptId);
    if (!hold || hold.billingProvider !== line.billingProvider || hold.amountMicros === null) {
      throw new Error("GATEWAY_INVOICE_CORRELATION_UNAUTHORIZED");
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(line.invoiceEvidenceRef) || line.measuredCostMicros < 0n) {
      throw new Error("INVALID_GATEWAY_INVOICE_EVIDENCE");
    }
    return Object.freeze({
      attemptId: line.attemptId,
      billingProvider: line.billingProvider,
      heldMicros: hold.amountMicros,
      measuredCostMicros: line.measuredCostMicros,
      invoiceEvidenceRef: line.invoiceEvidenceRef,
    });
  }));
}
