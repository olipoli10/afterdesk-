import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { GOOGLE_CALENDAR_READ_SCOPE, GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { loadCorrelatedPersonalReceiptSubject } from "@/server/model-gateway/personal-intent/correlated-receipt-subject";
import { loadCorrelatedPersonalCalendarReviewInTransaction } from "@/server/model-gateway/personal-intent/correlated-calendar-projection";
import { fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalClaim, inspectCorrelatedCalendarApprovalState,
  correlatedCalendarApprovalClaimSchema, correlatedCalendarApprovalStateSchema, CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, type CorrelatedCalendarApprovalClaim } from "./correlated-calendar-approval-contract";
import { temporalActorSchema, temporalRegistryTransaction, temporalRegistryClock, temporalRequireLive, type TemporalRegistryDB, type TemporalRegistryContext } from "./sms-temporal-clarification-authority";
import { requireGooglePilot, type ConnectorEnvironment } from "./google-client";

const id = z.string().min(1).max(191), hex = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.object({ enabled: z.literal(true), actor: temporalActorSchema, reviewId: id }).strict();
export type CorrelatedCalendarApprovalGateInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
const epoch = z.date().transform(date => date.toISOString());
const scopes = z.array(z.string().min(1).max(300)).max(30).refine(values => new Set(values).size === values.length);
const authoritySchema = z.object({ accountId: id, accountVersion: z.number().int().positive(), credentialId: id,
  writeGrantId: id, writeGrantVersion: z.number().int().positive(), memberId: id, memberRole: z.literal("owner"),
  memberUpdatedAt: epoch, workspaceUpdatedAt: epoch, accountScopes: scopes, grantScopes: scopes,
  readGrantId: id, readGrantVersion: z.number().int().positive(), readGrantScopes: scopes }).strict();
const rowSchema = z.object({ reviewId: id, receiptId: id, workspaceId: id, userId: id, calendarOperationId: id,
  connectorAccountId: id, accountVersion: z.number().int().positive(), calendarRequestId: z.string().uuid(), calendarRequestHash: hex,
  packetHash: hex, proofHash: hex, reviewVersion: z.literal("personal-sms-correlated-calendar-review-v1"),
  preparationExpiresAt: epoch, pilotExpiresAt: epoch, createdAt: epoch, reviewCommitted: z.literal(true), operationCommitted: z.literal(true),
  operationWorkspaceId: id, operationUserId: id, operationAccountId: id, kind: z.literal("calendar_write"),
  status: z.enum(["pending", "processing", "completed", "uncertain", "refused"]), attempts: z.number().int().nonnegative(),
  request: z.unknown(), requestHash: hex, idempotencyKey: z.string(), correlatedTemporalReceiptId: id,
  leaseUntil: epoch.nullable(), result: z.unknown(), externalTransportPerformed: z.boolean(),
  sourcePersonalOperationId: z.null(), modelGatewayOperationId: z.null(), budgetId: z.null(), reservedCadMicros: z.null() }).strict();
const approvalSchema = z.object({ id: z.string().uuid(), reviewId: id, calendarOperationId: id, workspaceId: id, userId: id,
  approvalToken: z.string().uuid(), fingerprintVersion: z.literal(CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION), reviewFingerprint: hex,
  approvedAt: epoch, approvalExpiresAt: epoch, leaseUntil: epoch, writeAuthority: z.unknown(), approvalCommitted: z.literal(true) }).strict();
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
function refused(): never { throw new Error("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED"); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function contextSnapshot(context: TemporalRegistryContext) {
  if (!Number.isFinite(context.deadlineAt)) refused();
  const wallNow = Date.now(), remaining = Math.min(5000, context.deadlineAt - wallNow);
  if (remaining <= 0) refused();
  return Object.freeze({ deadlineAt: wallNow + remaining, monotoneDeadline: performance.now() + remaining, signal: context.signal });
}
function live(env: ConnectorEnvironment, context: ReturnType<typeof contextSnapshot>) {
  temporalRequireLive(context, env);
  if (performance.now() >= context.monotoneDeadline || !enabled(env) || env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED !== "true"
    || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") refused();
  requireGooglePilot(env); // Configuration gate only; no token loading or decryption.
}

async function inspect(tx: TemporalRegistryDB, raw: CorrelatedCalendarApprovalGateInput, env: ConnectorEnvironment,
  context: TemporalRegistryContext, suppliedClaim?: CorrelatedCalendarApprovalClaim, expectedPhase?: "CLAIMED" | "DISPATCH_CLAIMED") {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  const input = inputSchema.parse(raw), c = contextSnapshot(context);
  const claim = suppliedClaim === undefined ? undefined : correlatedCalendarApprovalClaimSchema.parse(suppliedClaim);
  if ("$transaction" in tx) refused();
  live(env, c); await temporalRegistryTransaction(tx, c, env); live(env, c);
  const discoveries = await tx.$queryRawUnsafe<unknown[]>(`SELECT "receiptId" FROM "PersonalSmsCorrelatedCalendarReview"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3`, input.reviewId, input.actor.workspaceId, input.actor.userId); live(env, c);
  if (discoveries.length !== 1) refused();
  const discovered = z.object({ receiptId: id }).strict().parse(discoveries[0]);
  // Canonical namespace/question/source/OWNER/WRITE locks precede every calendar lock.
  const loaded = await loadCorrelatedPersonalReceiptSubject(tx, { enabled: true, actor: input.actor,
    subject: { kind: "personal_sms_temporal_receipt", receiptId: discovered.receiptId } }, env, c); live(env, c);
  if (loaded.status !== "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED") refused();
  const subject = structuredClone(loaded);
  if (subject.actor.userId !== input.actor.userId || subject.actor.workspaceId !== input.actor.workspaceId || subject.subject.receiptId !== discovered.receiptId) refused();
  const authorities = await tx.$queryRawUnsafe<unknown[]>(`SELECT a.id AS "accountId",a."stateVersion" AS "accountVersion",c.id AS "credentialId",
    wg.id AS "writeGrantId",wg."stateVersion" AS "writeGrantVersion",m.id AS "memberId",m.role AS "memberRole",
    (m."updatedAt" AT TIME ZONE 'UTC') AS "memberUpdatedAt",(w."updatedAt" AT TIME ZONE 'UTC') AS "workspaceUpdatedAt",
    a."grantedScopes" AS "accountScopes",wg."grantedScopes" AS "grantScopes",rg.id AS "readGrantId",rg."stateVersion" AS "readGrantVersion",rg."grantedScopes" AS "readGrantScopes"
    FROM "ConstructionWorkspace" w JOIN "ConstructionWorkspaceMember" m ON m."workspaceId"=w.id AND m."userId"=$2
    JOIN "ConstructionConnectorAccount" a ON a."workspaceId"=w.id AND a.id=$3 AND a."createdByUserId"=$2
    JOIN "ConstructionConnectorCredential" c ON c.id=a."credentialRef" AND c."connectorAccountId"=a.id AND c."workspaceId"=w.id
    JOIN "ConstructionConnectorGrant" wg ON wg."connectorAccountId"=a.id AND wg.capability='calendar_write'
    JOIN "ConstructionConnectorGrant" rg ON rg."connectorAccountId"=a.id AND rg.capability='calendar_read'
    WHERE w.id=$1 AND w."ownerUserId"=$2 AND w.status='active' AND m.status='active' AND m.role='owner'
      AND a.provider='google_calendar' AND a.status='connected' AND a."revokedAt" IS NULL AND c."revokedAt" IS NULL
      AND wg.status='active' AND wg."revokedAt" IS NULL AND rg.status='active' AND rg."revokedAt" IS NULL
      AND $4=ANY(a."grantedScopes") AND $4=ANY(wg."grantedScopes")
      AND ($5=ANY(a."grantedScopes") OR $4=ANY(a."grantedScopes"))
      AND ($5=ANY(rg."grantedScopes") OR $4=ANY(rg."grantedScopes"))
    FOR SHARE OF w,m,a,c,wg,rg`, input.actor.workspaceId, input.actor.userId, subject.preparationContext.connectorAccountId,
  GOOGLE_CALENDAR_WRITE_SCOPE, GOOGLE_CALENDAR_READ_SCOPE); live(env, c);
  if (authorities.length !== 1) refused();
  const current = authoritySchema.parse(authorities[0]);
  if (current.accountId !== subject.preparationContext.connectorAccountId || current.accountVersion !== subject.preparationContext.accountVersion
    || !current.accountScopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE) || !current.grantScopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE)
    || !current.readGrantScopes.some(scope => scope === GOOGLE_CALENDAR_READ_SCOPE || scope === GOOGLE_CALENDAR_WRITE_SCOPE)) refused();
  const { readGrantId, readGrantVersion, readGrantScopes, ...authority } = current;
  // The unchanged reader repeats the canonical inspection in this same namespace,
  // with the ORIGINAL capped deadline; no nested transaction or renewed budget.
  const projected = await loadCorrelatedPersonalCalendarReviewInTransaction(tx, input, env, c); live(env, c);
  if (projected.status !== "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED") refused();
  const item = structuredClone(projected.review);
  const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT r.id AS "reviewId",r."receiptId",r."workspaceId",r."userId",r."calendarOperationId",
    r."connectorAccountId",r."accountVersion",r."calendarRequestId",r."calendarRequestHash",r."packetHash",r."proofHash",r."reviewVersion",
    sms_correlated_approval_pre_snapshot(r.xmin) AS "reviewCommitted",sms_correlated_approval_pre_snapshot(o.xmin) AS "operationCommitted",
    (r."preparationExpiresAt" AT TIME ZONE 'UTC') AS "preparationExpiresAt",(r."pilotExpiresAt" AT TIME ZONE 'UTC') AS "pilotExpiresAt",(r."createdAt" AT TIME ZONE 'UTC') AS "createdAt",
    o."workspaceId" AS "operationWorkspaceId",o."createdByUserId" AS "operationUserId",o."connectorAccountId" AS "operationAccountId",o.kind,o.status,o.attempts,
    o.request,o."requestHash",o."idempotencyKey",o."correlatedTemporalReceiptId",(o."leaseUntil" AT TIME ZONE 'UTC') AS "leaseUntil",o.result,o."externalTransportPerformed",
    o."sourcePersonalOperationId",o."modelGatewayOperationId",o."budgetId",o."reservedCadMicros"
    FROM "PersonalSmsCorrelatedCalendarReview" r JOIN "PersonalAssistantOperation" o ON o.id=r."calendarOperationId"
    WHERE r.id=$1 AND r."workspaceId"=$2 AND r."userId"=$3
    ${claim ? "FOR UPDATE OF o FOR SHARE OF r" : "FOR SHARE OF o,r"}`, input.reviewId, input.actor.workspaceId, input.actor.userId); live(env, c);
  if (rows.length !== 1) refused();
  const row = rowSchema.parse(rows[0]);
  // z.unknown retains an alias. The bounded A parser copies the processing state
  // before the next await; a mutable driver/test object cannot change its phase.
  const recordedState = claim ? correlatedCalendarApprovalStateSchema.parse(row.result) : z.null().parse(row.result);
  const request = { ...subject.reference.proof.draft, accountVersion: current.accountVersion, requestId: subject.reference.requestId };
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  if (row.reviewId !== input.reviewId || row.receiptId !== discovered.receiptId || row.workspaceId !== input.actor.workspaceId || row.userId !== input.actor.userId
    || row.operationWorkspaceId !== row.workspaceId || row.operationUserId !== row.userId || row.operationAccountId !== current.accountId
    || row.connectorAccountId !== current.accountId || row.accountVersion !== current.accountVersion || row.calendarRequestId !== request.requestId
    || row.calendarRequestHash !== requestHash || row.requestHash !== requestHash || canonicalJson(row.request) !== canonicalJson(request)
    || row.packetHash !== subject.reference.packetHash || row.proofHash !== subject.reference.proofHash || row.correlatedTemporalReceiptId !== row.receiptId
    || row.idempotencyKey !== `personal-calendar:${row.workspaceId}:${request.requestId}`
    || item.reviewId !== row.reviewId || item.currentStatus !== row.status || item.preparedAt !== row.createdAt || item.preparationExpiresAt !== row.preparationExpiresAt
    || canonicalJson(item.evidence.draft) !== canonicalJson(subject.reference.proof.draft)) refused();
  const resolution = subject.proof.resolution;
  const expectedEvidence = { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
    sources: resolution.sources.map((source, index) => ({ role: index === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY",
      operationId: source.operationId, requestHash: source.requestHash, text: source.body, receivedAt: source.receivedAt })),
    citations: resolution.citations, anchorReceivedAt: resolution.anchorReceivedAt, clarifiedSlot: resolution.evidence.slot, draft: subject.reference.proof.draft };
  if (canonicalJson(item.evidence) !== canonicalJson(expectedEvidence)) refused();
  const expiry = Math.min(Date.parse(subject.preparationContext.questionExpiresAt), Date.parse(subject.preparationContext.pilotExpiresAt));
  if (![expiry, Date.parse(subject.inspectedAt), Date.parse(item.inspectedAt)].every(Number.isFinite)) refused();
  if (row.preparationExpiresAt !== new Date(expiry).toISOString() || row.pilotExpiresAt !== subject.preparationContext.pilotExpiresAt) refused();
  const descriptor = fingerprintCorrelatedCalendarApprovalView({ version: CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION,
    scope: input.actor, review: { reviewId: row.reviewId, receiptId: row.receiptId, reviewVersion: row.reviewVersion, packetHash: row.packetHash, proofHash: row.proofHash },
    request: { calendarRequestId: row.calendarRequestId, calendarRequestHash: row.calendarRequestHash, connectorAccountId: row.connectorAccountId, accountVersion: row.accountVersion },
    presentation: { itemVersion: item.version, evidenceVersion: item.evidence.version, titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  // Global discovery by either unique binding: never trust only a reverse scoped relation.
  const approvals = await tx.$queryRawUnsafe<unknown[]>(`SELECT id,"reviewId","calendarOperationId","workspaceId","userId","approvalToken","fingerprintVersion","reviewFingerprint",
    sms_correlated_approval_pre_snapshot(xmin) AS "approvalCommitted",
    ("approvedAt" AT TIME ZONE 'UTC') AS "approvedAt",("approvalExpiresAt" AT TIME ZONE 'UTC') AS "approvalExpiresAt",("leaseUntil" AT TIME ZONE 'UTC') AS "leaseUntil","writeAuthority"
    FROM "PersonalSmsCorrelatedCalendarApproval" WHERE "reviewId"=$1 OR "calendarOperationId"=$2 FOR SHARE`, row.reviewId, row.calendarOperationId); live(env, c);
  if (!claim) {
    if (approvals.length !== 0 || row.status !== "pending" || row.attempts !== 0 || row.leaseUntil !== null || row.result !== null || row.externalTransportPerformed) refused();
  } else {
    if (approvals.length !== 1 || row.status !== "processing" || row.attempts !== 1 || row.leaseUntil !== claim.leaseUntil || row.externalTransportPerformed) refused();
    const approval = approvalSchema.parse(approvals[0]);
    inspectCorrelatedCalendarApprovalClaim(claim, descriptor.view);
    if (claim.operationId !== row.calendarOperationId || approval.id !== claim.origin.approvalId || approval.reviewId !== row.reviewId
      || approval.calendarOperationId !== row.calendarOperationId || approval.workspaceId !== row.workspaceId || approval.userId !== row.userId
      || approval.reviewFingerprint !== descriptor.fingerprint || approval.approvalToken !== claim.approvalToken
      || approval.approvedAt !== claim.approvedAt || approval.approvalExpiresAt !== claim.approvalExpiresAt || approval.leaseUntil !== claim.leaseUntil
      || approval.approvalExpiresAt !== row.preparationExpiresAt || canonicalJson(approval.writeAuthority) !== canonicalJson(claim.authority)
      || canonicalJson(authority) !== canonicalJson(claim.authority)) refused();
    if (inspectCorrelatedCalendarApprovalState(recordedState, claim, descriptor.view).state.phase !== expectedPhase) refused();
  }
  const finalNow = (await temporalRegistryClock(tx)).getTime(); live(env, c);
  if (!Number.isFinite(expiry) || finalNow < Date.parse(subject.inspectedAt) || finalNow < Date.parse(item.inspectedAt)
    || finalNow < Date.parse(row.createdAt) || finalNow < Date.parse(authority.memberUpdatedAt) || finalNow < Date.parse(authority.workspaceUpdatedAt)
    || finalNow >= expiry || (claim && (finalNow < Date.parse(claim.approvedAt) || finalNow >= Date.parse(claim.leaseUntil)))) refused();
  return freeze({ status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED" as const, committed: false as const,
    executionAuthorized: false as const, persistencePerformed: false as const, providerCallPerformed: false as const,
    actor: input.actor, operationId: row.calendarOperationId, view: descriptor.view, fingerprint: descriptor.fingerprint,
    request, authority, readPrerequisite: { readGrantId, readGrantVersion, readGrantScopes }, review: item,
    inspectedAt: new Date(finalNow).toISOString(), approvalExpiresAt: row.preparationExpiresAt,
    ...(claim ? { claim, expectedPhase } : {}) });
}

/** Read-only offer inspection. A parsed descriptor is not approval or a human tap. */
export async function inspectCorrelatedCalendarApprovalOfferInTransaction(tx: TemporalRegistryDB, input: CorrelatedCalendarApprovalGateInput,
  env: ConnectorEnvironment, context: TemporalRegistryContext) { return inspect(tx, input, env, context); }

/** Current effect gate only. Caller must separately own the appropriate exact CAS;
 * this function neither claims dispatch nor invokes the calendar client. */
export async function lockCorrelatedCalendarApprovalWriteInTransaction(tx: TemporalRegistryDB, rawClaim: CorrelatedCalendarApprovalClaim,
  env: ConnectorEnvironment, context: TemporalRegistryContext, phase: "CLAIMED" | "DISPATCH_CLAIMED") {
  if (!enabled(env)) return disabled();
  const claim = correlatedCalendarApprovalClaimSchema.parse(rawClaim);
  const expected = z.enum(["CLAIMED", "DISPATCH_CLAIMED"]).parse(phase);
  return inspect(tx, { enabled: true, actor: { userId: claim.userId, workspaceId: claim.workspaceId }, reviewId: claim.origin.reviewId }, env, context, claim, expected);
}
