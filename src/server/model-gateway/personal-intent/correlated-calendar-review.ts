import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "../evidence";
import { loadCorrelatedPersonalReceiptSubject } from "./correlated-receipt-subject";
import { inspectCorrelatedCalendarReferenceProof } from "./correlated-calendar-proof";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { personalCalendarDraftSchema, preparePersonalCalendarInTransaction } from "@/server/personal-assistant/calendar-actions";
import { temporalActorSchema, temporalRegistryClock, temporalRequireLive, type TemporalRegistryContext, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "@/server/personal-assistant/google-client";

const id = z.string().min(1).max(191), hex = z.string().regex(/^[a-f0-9]{64}$/);
const version = "personal-sms-correlated-calendar-review-v1";
const pilotExpiry = "2026-10-10T01:18:26Z";
const inputSchema = z.object({ enabled: z.literal(true), actor: temporalActorSchema,
  subject: z.object({ kind: z.literal("personal_sms_temporal_receipt"), receiptId: id }).strict() }).strict();
type Input = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const recordSchema = z.object({ id, workspaceId: id, userId: id, receiptId: id, clarificationId: id,
  originalSourceOperationId: id, replySourceOperationId: id, modelChildOperationId: id, modelGatewayOperationId: id, reviewActionId: id,
  calendarOperationId: id, calendarRequestId: z.string().uuid(), calendarRequestHash: hex, connectorAccountId: id, accountVersion: z.number().int().positive(),
  packetHash: hex, reviewVersion: z.literal(version), proof: z.unknown(), proofHash: hex,
  authorityRef: z.literal(PERSONAL_MODEL_AUTHORITY), pilotExpiresAt: z.date(), preparationExpiresAt: z.date(), createdAt: z.date() }).strict();
const columns = `id,"workspaceId","userId","receiptId","clarificationId","originalSourceOperationId","replySourceOperationId",
  "modelChildOperationId","modelGatewayOperationId","reviewActionId","calendarOperationId","calendarRequestId","calendarRequestHash",
  "connectorAccountId","accountVersion","packetHash","reviewVersion",proof,"proofHash","authorityRef",
  ("pilotExpiresAt" AT TIME ZONE 'UTC') AS "pilotExpiresAt",("preparationExpiresAt" AT TIME ZONE 'UTC') AS "preparationExpiresAt",
  ("createdAt" AT TIME ZONE 'UTC') AS "createdAt"`;
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function contextSnapshot(context: TemporalRegistryContext) {
  if (!Number.isFinite(context.deadlineAt)) throw new Error("CORRELATED_CALENDAR_DEADLINE_REQUIRED");
  return Object.freeze({ deadlineAt: Math.min(context.deadlineAt, Date.now() + 5000), signal: context.signal });
}
function requireLive(env: ConnectorEnvironment, context: TemporalRegistryContext) {
  temporalRequireLive(context, env);
  if (!enabled(env) || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== pilotExpiry)
    throw new Error("CORRELATED_CALENDAR_DISABLED_OR_PILOT_CHANGED");
}

/** Internal prepare-only transaction. No worker/route imports this producer.
 * Its provisional return is NOT a known commit. All side effects are DB-local. */
export async function prepareCorrelatedPersonalCalendarReviewInTransaction(tx: TemporalRegistryDB, raw: Input,
  env: ConnectorEnvironment, context: TemporalRegistryContext) {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  const input = inputSchema.parse(raw), c = contextSnapshot(context);
  if ("$transaction" in tx) throw new Error("CORRELATED_CALENDAR_CALLER_TRANSACTION_REQUIRED");
  const live = () => requireLive(env, c);
  live();
  // Canonical namespace-first locks, completed source proof, current permissions,
  // exact receipt recomputation and final DB clock all precede any calendar write.
  const subject = await loadCorrelatedPersonalReceiptSubject(tx, input, env, c); live();
  if (subject.status !== "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED") throw new Error("CORRELATED_CALENDAR_SUBJECT_REQUIRED");
  const reference = subject.reference, pins = subject.preparationContext;
  const proof = inspectCorrelatedCalendarReferenceProof(reference.proof, reference.proofHash); // Shape only; subject was authenticated above.
  const expectedExpiry = Math.min(Date.parse(pins.questionExpiresAt), Date.parse(pins.pilotExpiresAt));
  const inspectedAt = Date.parse(subject.inspectedAt);
  if (!Number.isFinite(expectedExpiry) || !Number.isFinite(inspectedAt) || inspectedAt >= expectedExpiry
    || reference.receiptId !== input.subject.receiptId || reference.packetHash !== subject.proof.packetHash
    || reference.proof.inspectedReceiptProofHash !== subject.proof.proofHash) throw new Error("CORRELATED_CALENDAR_REFERENCE_CHANGED");
  const request = { ...personalCalendarDraftSchema.parse(proof.proof.draft), accountVersion: pins.accountVersion, requestId: reference.requestId };
  const requestHash = sha(JSON.stringify(request)); // Exact existing six-field producer order, no JSONB/sorted replacement.
  const expected = { workspaceId: input.actor.workspaceId, userId: input.actor.userId, receiptId: reference.receiptId,
    clarificationId: pins.clarificationId, originalSourceOperationId: pins.originalSourceOperationId, replySourceOperationId: pins.replySourceOperationId,
    modelChildOperationId: pins.modelChildOperationId, modelGatewayOperationId: pins.modelGatewayOperationId, reviewActionId: pins.reviewActionId,
    calendarRequestId: reference.requestId, calendarRequestHash: requestHash, connectorAccountId: pins.connectorAccountId, accountVersion: pins.accountVersion,
    packetHash: reference.packetHash, reviewVersion: version, proof: proof.proof, proofHash: proof.proofHash, authorityRef: pins.authorityRef,
    pilotExpiresAt: pins.pilotExpiresAt, preparationExpiresAt: new Date(expectedExpiry).toISOString() };
  const prior = await tx.$queryRawUnsafe<unknown[]>(`SELECT ${columns} FROM "PersonalSmsCorrelatedCalendarReview" WHERE "receiptId"=$1 FOR SHARE`, reference.receiptId); live();
  if (prior.length > 1) throw new Error("CORRELATED_CALENDAR_REVIEW_CONFLICT");
  const replay = prior.length === 1;
  let stored: z.infer<typeof recordSchema>;
  if (replay) stored = recordSchema.parse(prior[0]);
  else {
    const occupied = await tx.personalAssistantOperation.findUnique({ where: { idempotencyKey: `personal-calendar:${input.actor.workspaceId}:${reference.requestId}` } }); live();
    if (occupied) throw new Error("CORRELATED_CALENDAR_ORPHAN_OR_REQUEST_CONFLICT");
    const prepared = await preparePersonalCalendarInTransaction(tx, { ...input.actor, requestId: reference.requestId, draft: proof.proof.draft },
      { kind: "personal_sms_temporal_receipt", receiptId: reference.receiptId }); live();
    if (prepared.requestHash !== requestHash || prepared.status !== "pending") throw new Error("CORRELATED_CALENDAR_PREPARATION_CHANGED");
    const rows = await tx.$queryRawUnsafe<unknown[]>(`INSERT INTO "PersonalSmsCorrelatedCalendarReview"
      (id,"workspaceId","userId","receiptId","clarificationId","originalSourceOperationId","replySourceOperationId","modelChildOperationId",
      "modelGatewayOperationId","reviewActionId","calendarOperationId","calendarRequestId","calendarRequestHash","connectorAccountId","accountVersion",
      "packetHash","reviewVersion",proof,"proofHash","authorityRef","pilotExpiresAt","preparationExpiresAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,
        ($21::timestamptz AT TIME ZONE 'UTC'),($22::timestamptz AT TIME ZONE 'UTC')) RETURNING ${columns}`,
    randomUUID(), expected.workspaceId, expected.userId, expected.receiptId, expected.clarificationId, expected.originalSourceOperationId,
    expected.replySourceOperationId, expected.modelChildOperationId, expected.modelGatewayOperationId, expected.reviewActionId,
    prepared.operationId, expected.calendarRequestId, expected.calendarRequestHash, expected.connectorAccountId, expected.accountVersion,
    expected.packetHash, expected.reviewVersion, canonicalJson(expected.proof), expected.proofHash, expected.authorityRef,
    new Date(expected.pilotExpiresAt), new Date(expected.preparationExpiresAt)); live();
    if (rows.length !== 1) throw new Error("CORRELATED_CALENDAR_REVIEW_INSERT_REQUIRED");
    stored = recordSchema.parse(rows[0]);
  }
  const { id: reviewId, calendarOperationId, createdAt, ...recorded } = stored;
  inspectCorrelatedCalendarReferenceProof(recorded.proof, recorded.proofHash);
  if (canonicalJson({ ...recorded, pilotExpiresAt: recorded.pilotExpiresAt.toISOString(), preparationExpiresAt: recorded.preparationExpiresAt.toISOString() }) !== canonicalJson(expected)
    || !Number.isFinite(createdAt.getTime()) || createdAt.getTime() >= expectedExpiry
    || (!replay && createdAt.getTime() < inspectedAt)) throw new Error("CORRELATED_CALENDAR_STORED_REVIEW_CHANGED");
  const operation = await tx.personalAssistantOperation.findUnique({ where: { id: calendarOperationId } }); live();
  if (!operation || operation.workspaceId !== input.actor.workspaceId || operation.createdByUserId !== input.actor.userId
    || operation.connectorAccountId !== expected.connectorAccountId || operation.correlatedTemporalReceiptId !== reference.receiptId
    || operation.kind !== "calendar_write" || operation.idempotencyKey !== `personal-calendar:${input.actor.workspaceId}:${reference.requestId}`
    || operation.requestHash !== requestHash || canonicalJson(operation.request) !== canonicalJson(request)
    || operation.sourcePersonalOperationId !== null || operation.modelGatewayOperationId !== null
    || operation.budgetId !== null || operation.reservedCadMicros !== null) throw new Error("CORRELATED_CALENDAR_STORED_OPERATION_CHANGED");
  if (!replay && (operation.status !== "pending" || operation.attempts !== 0 || operation.leaseUntil !== null || operation.result !== null
    || operation.externalTransportPerformed !== false)) throw new Error("CORRELATED_CALENDAR_PREPARATION_CHANGED");
  const finalNow = await temporalRegistryClock(tx); live();
  if (finalNow.getTime() < inspectedAt || createdAt > finalNow || finalNow.getTime() >= expectedExpiry) throw new Error("CORRELATED_CALENDAR_EXPIRED_OR_CLOCK_CHANGED");
  return freeze({ status: replay ? "CORRELATED_CALENDAR_REVIEW_REPLAYED" as const : "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT" as const,
    reviewId, receiptId: reference.receiptId, operationId: operation.id, requestHash, operationStatus: operation.status,
    draft: proof.proof.draft, replay, committed: false as const, executionAuthorized: false as const, approvalAvailable: false as const,
    preparationProviderCalls: 0 as const, newBudgetReservations: 0 as const });
}

/** Only this wrapper reports known commit. Lost commit acknowledgment throws;
 * it never retries, changes the request UUID or claims a fresh preparation. */
export async function prepareCorrelatedPersonalCalendarReview(raw: Input, env: ConnectorEnvironment = process.env,
  context: TemporalRegistryContext = { deadlineAt: Date.now() + 5000 }) {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  const input = inputSchema.parse(raw), c = contextSnapshot(context);
  requireLive(env, c);
  const provisional = await prisma.$transaction(tx => prepareCorrelatedPersonalCalendarReviewInTransaction(tx, input, env, c),
    { isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
  requireLive(env, c);
  if (provisional.status === "DISABLED") return provisional;
  return freeze({ ...provisional, committed: true as const });
}
