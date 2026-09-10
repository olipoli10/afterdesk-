import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { inspectCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalClaim, inspectCorrelatedCalendarApprovalState, correlatedCalendarApprovalStateSchema,
  CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION } from "./correlated-calendar-approval-contract";
import { personalCalendarDraftSchema } from "./calendar-draft-contract";
import { temporalRegistryClock, type TemporalRegistryContext } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

const id = z.string().min(1).max(191).refine(value => value.trim() === value);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const date = z.date().transform(value => value.toISOString());
const actorSchema = z.object({ workspaceId: id, userId: id }).strict();
const inputSchema = z.object({ enabled: z.literal(true), actor: actorSchema, reviewId: id }).strict();
export type CorrelatedCalendarApprovalResultInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const common = { version: z.literal("personal-correlated-calendar-approval-result-v1"), workspaceId: id, reviewId: id, observedAt: instant,
  readOnly: z.literal(true), approvalAvailable: z.literal(false), executionAuthorized: z.literal(false), automaticRetry: z.literal(false), providerStateVerified: z.literal(false) };
const reasons = z.enum(["WRITE_OUTCOME_UNKNOWN", "CLAIM_LEASE_EXPIRED", "CLAIM_COMMIT_OUTCOME_UNKNOWN", "DISPATCH_COMMIT_OUTCOME_UNKNOWN", "TERMINAL_COMMIT_OUTCOME_UNKNOWN"]);
export const correlatedCalendarApprovalResultSchema = z.discriminatedUnion("outcome", [
  z.object({ ...common, outcome: z.literal("NOT_ATTEMPTED") }).strict(),
  z.object({ ...common, outcome: z.literal("PENDING_RESULT"), approvedAt: instant }).strict(),
  z.object({ ...common, outcome: z.literal("UNKNOWN"), approvedAt: instant, reason: reasons }).strict(),
  z.object({ ...common, outcome: z.literal("CONFIRMED"), approvedAt: instant, confirmationBasis: z.literal("DURABLE_RECORDED_RESULT"),
    receipt: z.object({ confirmed: z.literal(true), providerEventId: z.string().regex(/^e[a-f0-9]{31}$/) }).strict() }).strict(),
]);
export type CorrelatedCalendarApprovalResult = z.infer<typeof correlatedCalendarApprovalResultSchema>;
const discoverySchema = z.object({ reviewId: id, clarificationId: id, namespace: hash }).strict();
const ownerSchema = z.object({ workspaceId: id, ownerUserId: id, memberId: id, memberUserId: id, memberRole: z.literal("owner"),
  workspaceUpdatedAt: date, memberUpdatedAt: date }).strict();
const reviewSchema = z.object({ id, workspaceId: id, userId: id, receiptId: id, clarificationId: id, namespace: hash,
  calendarOperationId: id, calendarRequestId: z.string().uuid(), calendarRequestHash: hash, connectorAccountId: id,
  accountVersion: z.number().int().positive(), packetHash: hash, proofHash: hash, proof: z.unknown(),
  reviewVersion: z.literal("personal-sms-correlated-calendar-review-v1"), createdAt: date, preparationExpiresAt: date, pilotExpiresAt: date }).strict();
const operationSchema = z.object({ id, workspaceId: id, createdByUserId: id, connectorAccountId: id, kind: z.literal("calendar_write"),
  status: z.enum(["pending", "processing", "completed", "uncertain", "refused"]), attempts: z.number().int(), leaseUntil: date.nullable(),
  result: z.unknown(), request: z.unknown(), requestHash: hash, idempotencyKey: z.string(), correlatedTemporalReceiptId: id,
  sourcePersonalOperationId: z.null(), modelGatewayOperationId: z.null(), budgetId: z.null(), reservedCadMicros: z.null(),
  externalTransportPerformed: z.boolean(), linkedReviewId: id, linkedReceiptId: id, linkedWorkspaceId: id, linkedUserId: id }).strict();
const approvalSchema = z.object({ id: z.string().uuid(), reviewId: id, calendarOperationId: id, workspaceId: id, userId: id,
  approvalToken: z.string().uuid(), fingerprintVersion: z.literal(CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION), reviewFingerprint: hash,
  approvedAt: date, approvalExpiresAt: date, leaseUntil: date, writeAuthority: z.unknown() }).strict();
const requestSchema = personalCalendarDraftSchema.extend({ accountVersion: z.number().int().positive(), requestId: z.string().uuid() }).strict();
const on = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
function unavailable(): never { throw new Error("CORRELATED_CALENDAR_APPROVAL_RESULT_UNAVAILABLE"); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Historical metadata only. No fresh SMS proof, provider lookup or authority
 * restoration. Only a completed read transaction can publish a result. */
export async function readCorrelatedCalendarApprovalResult(raw: CorrelatedCalendarApprovalResultInput, env: ConnectorEnvironment = process.env,
  context: TemporalRegistryContext = { deadlineAt: Date.now() + 5000 }) {
  if (!on(env) || raw.enabled !== true) return disabled();
  try {
    const input = inputSchema.parse(raw), signal = context.signal, started = performance.now();
    if (!Number.isFinite(context.deadlineAt)) unavailable();
    const deadline = Math.min(context.deadlineAt, Date.now() + 5000);
    const lifetime = Math.min(5000, deadline - Date.now());
    const remaining = () => {
      const elapsed = performance.now() - started;
      if (!on(env) || signal?.aborted || !Number.isFinite(elapsed) || elapsed < 0) unavailable();
      const ms = Math.floor(Math.min(deadline - Date.now(), lifetime - elapsed));
      if (ms < 2) unavailable(); return ms;
    };
    const budget = remaining(), maxWait = Math.min(500, Math.max(1, Math.floor(budget / 4)));
    const result = await prisma.$transaction(async tx => {
      const ms = Math.min(2000, remaining() - 1);
      // Deliberately not temporalRegistryTransaction: historical reads require
      // REVIEW only, not STORE, execution switches or an unexpired pilot.
      await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", String(ms)); remaining();
      const found = await tx.$queryRawUnsafe<unknown[]>(`SELECT v.id AS "reviewId",v."clarificationId",q.namespace
        FROM "PersonalSmsCorrelatedCalendarReview" v JOIN "PersonalSmsTemporalClarification" q
          ON q.id=v."clarificationId" AND q."workspaceId"=v."workspaceId" AND q."userId"=v."userId"
        WHERE v.id=$1 AND v."workspaceId"=$2 AND v."userId"=$3`, input.reviewId, input.actor.workspaceId, input.actor.userId); remaining();
      if (found.length !== 1) unavailable();
      const discovery = discoverySchema.parse(found[0]);
      if (discovery.reviewId !== input.reviewId) unavailable();
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text", discovery.namespace); remaining();
      const owners = await tx.$queryRawUnsafe<unknown[]>(`SELECT w.id AS "workspaceId",w."ownerUserId",m.id AS "memberId",m."userId" AS "memberUserId",m.role AS "memberRole",
        (w."updatedAt" AT TIME ZONE 'UTC') AS "workspaceUpdatedAt",(m."updatedAt" AT TIME ZONE 'UTC') AS "memberUpdatedAt"
        FROM "ConstructionWorkspace" w JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id
        WHERE w.id=$1 AND w."ownerUserId"=$2 AND w.status='active' AND m."userId"=$2 AND m.status='active' AND m.role='owner'
        FOR SHARE OF w,m`, input.actor.workspaceId, input.actor.userId); remaining();
      if (owners.length !== 1) unavailable();
      const owner = ownerSchema.parse(owners[0]);
      if (owner.workspaceId !== input.actor.workspaceId || owner.ownerUserId !== input.actor.userId || owner.memberUserId !== input.actor.userId) unavailable();
      const reviews = await tx.$queryRawUnsafe<unknown[]>(`SELECT v.id,v."workspaceId",v."userId",v."receiptId",v."clarificationId",q.namespace,
        v."calendarOperationId",v."calendarRequestId",v."calendarRequestHash",v."connectorAccountId",v."accountVersion",v."packetHash",v."proofHash",v.proof,v."reviewVersion",
        (v."createdAt" AT TIME ZONE 'UTC') AS "createdAt",(v."preparationExpiresAt" AT TIME ZONE 'UTC') AS "preparationExpiresAt",(v."pilotExpiresAt" AT TIME ZONE 'UTC') AS "pilotExpiresAt"
        FROM "PersonalSmsCorrelatedCalendarReview" v JOIN "PersonalSmsTemporalClarification" q
          ON q.id=v."clarificationId" AND q."workspaceId"=v."workspaceId" AND q."userId"=v."userId"
        WHERE v.id=$1 AND v."workspaceId"=$2 AND v."userId"=$3 FOR SHARE OF v`, input.reviewId, input.actor.workspaceId, input.actor.userId); remaining();
      if (reviews.length !== 1) unavailable();
      const review = reviewSchema.parse(reviews[0]);
      if (review.id !== input.reviewId || review.workspaceId !== input.actor.workspaceId || review.userId !== input.actor.userId
        || review.clarificationId !== discovery.clarificationId || review.namespace !== discovery.namespace) unavailable();
      const proof = inspectCorrelatedCalendarReferenceProof(review.proof, review.proofHash).proof;
      const request = requestSchema.parse({ ...proof.draft, accountVersion: review.accountVersion, requestId: review.calendarRequestId });
      if (sha(JSON.stringify(request)) !== review.calendarRequestHash) unavailable();
      const view = fingerprintCorrelatedCalendarApprovalView({ version: CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, scope: input.actor,
        review: { reviewId: review.id, receiptId: review.receiptId, reviewVersion: review.reviewVersion, packetHash: review.packetHash, proofHash: review.proofHash },
        request: { calendarRequestId: review.calendarRequestId, calendarRequestHash: review.calendarRequestHash, connectorAccountId: review.connectorAccountId, accountVersion: review.accountVersion },
        presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
      const ops = await tx.$queryRawUnsafe<unknown[]>(`SELECT o.id,o."workspaceId",o."createdByUserId",o."connectorAccountId",o.kind,o.status,o.attempts,
        (o."leaseUntil" AT TIME ZONE 'UTC') AS "leaseUntil",o.result,o.request,o."requestHash",o."idempotencyKey",o."correlatedTemporalReceiptId",
        o."sourcePersonalOperationId",o."modelGatewayOperationId",o."budgetId",o."reservedCadMicros",o."externalTransportPerformed",
        v.id AS "linkedReviewId",v."receiptId" AS "linkedReceiptId",v."workspaceId" AS "linkedWorkspaceId",v."userId" AS "linkedUserId"
        FROM "PersonalAssistantOperation" o JOIN "PersonalSmsCorrelatedCalendarReview" v ON v."calendarOperationId"=o.id
        WHERE o.id=$1 FOR SHARE OF o,v`, review.calendarOperationId); remaining();
      if (ops.length !== 1) unavailable();
      const op = operationSchema.parse(ops[0]);
      const storedState = op.result === null ? null : correlatedCalendarApprovalStateSchema.parse(op.result);
      if (op.id !== review.calendarOperationId || op.workspaceId !== input.actor.workspaceId || op.createdByUserId !== input.actor.userId
        || op.connectorAccountId !== review.connectorAccountId || op.correlatedTemporalReceiptId !== review.receiptId
        || op.linkedReviewId !== review.id || op.linkedReceiptId !== review.receiptId || op.linkedWorkspaceId !== review.workspaceId || op.linkedUserId !== review.userId
        || op.requestHash !== review.calendarRequestHash || canonicalJson(op.request) !== canonicalJson(request)
        || op.idempotencyKey !== `personal-calendar:${review.workspaceId}:${review.calendarRequestId}`) unavailable();
      const approvals = await tx.$queryRawUnsafe<unknown[]>(`SELECT id,"reviewId","calendarOperationId","workspaceId","userId","approvalToken","fingerprintVersion","reviewFingerprint",
        ("approvedAt" AT TIME ZONE 'UTC') AS "approvedAt",("approvalExpiresAt" AT TIME ZONE 'UTC') AS "approvalExpiresAt",("leaseUntil" AT TIME ZONE 'UTC') AS "leaseUntil","writeAuthority"
        FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "reviewId"=$1 OR "calendarOperationId"=$2 FOR SHARE`, review.id, op.id); remaining();
      if (approvals.length > 1) unavailable();
      const approval = approvals.length ? approvalSchema.parse(approvals[0]) : null;
      let state: ReturnType<typeof inspectCorrelatedCalendarApprovalState>["state"] | null = null;
      if (approval) {
        if (approval.reviewId !== review.id || approval.calendarOperationId !== op.id || approval.workspaceId !== review.workspaceId || approval.userId !== review.userId
          || approval.reviewFingerprint !== view.fingerprint || Date.parse(approval.approvedAt) < Date.parse(review.createdAt)
          || Date.parse(approval.approvalExpiresAt) !== Math.min(Date.parse(review.preparationExpiresAt), Date.parse(review.pilotExpiresAt))) unavailable();
        const claim = inspectCorrelatedCalendarApprovalClaim({ version: CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION,
          origin: { kind: "personal_sms_temporal_receipt", approvalId: approval.id, reviewId: review.id, reviewFingerprint: approval.reviewFingerprint },
          ...input.actor, operationId: op.id, expectedRequestHash: op.requestHash, request, authority: approval.writeAuthority, approvalToken: approval.approvalToken,
          approvedAt: approval.approvedAt, approvalExpiresAt: approval.approvalExpiresAt, leaseUntil: approval.leaseUntil }, view.view).claim;
        state = inspectCorrelatedCalendarApprovalState(storedState, claim, view.view).state;
        if (op.attempts !== 1) unavailable();
        if (op.status === "processing") {
          if ((state.phase !== "CLAIMED" && state.phase !== "DISPATCH_CLAIMED") || op.leaseUntil !== approval.leaseUntil || op.externalTransportPerformed) unavailable();
        } else if (op.status === "completed") {
          if (state.phase !== "CONFIRMED" || op.leaseUntil !== null || !op.externalTransportPerformed) unavailable();
        } else if (op.status === "uncertain") {
          if (state.phase !== "UNCERTAIN" || op.leaseUntil !== null) unavailable();
        } else unavailable();
      } else if (op.status !== "pending" || op.attempts !== 0 || storedState !== null || op.leaseUntil !== null || op.externalTransportPerformed) unavailable();
      const now = (await temporalRegistryClock(tx)).toISOString(); remaining();
      if (Date.parse(review.createdAt) >= Math.min(Date.parse(review.preparationExpiresAt), Date.parse(review.pilotExpiresAt))
        || now < review.createdAt || now < owner.memberUpdatedAt || now < owner.workspaceUpdatedAt || approval && now < approval.approvedAt) unavailable();
      const base = { version: "personal-correlated-calendar-approval-result-v1", workspaceId: input.actor.workspaceId, reviewId: review.id, observedAt: now,
        readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false };
      const outcome = !approval || !state ? { outcome: "NOT_ATTEMPTED" }
        : state.phase === "CONFIRMED" ? { outcome: "CONFIRMED", approvedAt: approval.approvedAt, confirmationBasis: "DURABLE_RECORDED_RESULT", receipt: state.receipt }
        : state.phase === "UNCERTAIN" ? { outcome: "UNKNOWN", approvedAt: approval.approvedAt, reason: state.reason }
        : now >= approval.leaseUntil ? { outcome: "UNKNOWN", approvedAt: approval.approvedAt, reason: "CLAIM_LEASE_EXPIRED" }
        : { outcome: "PENDING_RESULT", approvedAt: approval.approvedAt };
      return freeze(correlatedCalendarApprovalResultSchema.parse({ ...base, ...outcome }));
    }, { isolationLevel: "Serializable", maxWait, timeout: budget - maxWait });
    remaining(); return result;
  } catch { return unavailable(); }
}
