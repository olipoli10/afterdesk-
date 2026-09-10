import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";

export const CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION = "personal-correlated-calendar-approval-view-v1";
export const CORRELATED_CALENDAR_APPROVAL_COMMAND_VERSION = "personal-correlated-calendar-approval-command-v1";
export const CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION = "personal-correlated-calendar-write-claim-v1";
export const CORRELATED_CALENDAR_APPROVAL_STATE_VERSION = "personal-correlated-calendar-write-state-v1";
export const CORRELATED_CALENDAR_APPROVAL_MAX_BYTES = 32768;
const pilotEnd = Date.parse("2026-10-10T01:18:26.000Z"), pilotStart = Date.parse("2026-09-10T01:18:26.000Z");
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const id = z.string().min(1).max(191).refine(value => value.trim() === value);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid().regex(/^[a-f0-9-]{36}$/);
const epoch = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const time = new Date(value); return Number.isFinite(time.getTime()) && time.toISOString() === value;
});
const revision = z.number().int().min(1).max(2147483647);
const scopes = z.array(z.string().min(1).max(300)).min(1).max(30).refine(values => new Set(values).size === values.length && values.includes(GOOGLE_CALENDAR_WRITE_SCOPE));
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** JSON boundary only. No getters/non-enumerable keys/sparse arrays, cycles,
 * unsupported prototypes, NUL or lone UTF16 surrogates. Not a JS Proxy sandbox. */
function snapshotJson(raw: unknown) {
  let nodes = 0, stringBytes = 0; const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 4096 || depth > 12) throw new Error("APPROVAL_CONTRACT_BOUND");
    if (typeof value === "string") {
      stringBytes += Buffer.byteLength(value, "utf8");
      if (value.length > CORRELATED_CALENDAR_APPROVAL_MAX_BYTES || value.includes("\0") || Buffer.from(value, "utf8").toString("utf8") !== value)
        throw new Error("APPROVAL_CONTRACT_STRING");
      if (stringBytes > CORRELATED_CALENDAR_APPROVAL_MAX_BYTES) throw new Error("APPROVAL_CONTRACT_BOUND");
      return;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
    if (!value || typeof value !== "object" || ancestors.has(value)) throw new Error("APPROVAL_CONTRACT_JSON");
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error("APPROVAL_CONTRACT_JSON");
    if (keys.length > (array ? 65 : 64) || array && (value.length > 64 || keys.length !== value.length + 1)) throw new Error("APPROVAL_CONTRACT_BOUND");
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== "string" || key === "__proto__" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")
        || array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw new Error("APPROVAL_CONTRACT_JSON");
      visit(key, depth + 1); visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  };
  visit(raw, 0);
  const serialized = canonicalJson(raw);
  if (Buffer.byteLength(serialized, "utf8") > CORRELATED_CALENDAR_APPROVAL_MAX_BYTES) throw new Error("APPROVAL_CONTRACT_BOUND");
  return { serialized, value: JSON.parse(serialized) as unknown };
}
function contract<T>(shape: z.ZodType<T>) {
  return z.unknown().transform((raw, context): T => {
    try {
      const copied = snapshotJson(raw), parsed = shape.parse(copied.value);
      if (canonicalJson(parsed) !== copied.serialized) throw new Error("APPROVAL_CONTRACT_NORMALIZATION");
      return freeze(parsed);
    } catch {
      context.addIssue({ code: "custom", message: "CORRELATED_CALENDAR_APPROVAL_CONTRACT_INVALID" });
      return z.NEVER;
    }
  });
}

const viewShape = z.object({ version: z.literal(CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION),
  scope: z.object({ workspaceId: id, userId: id }).strict(),
  review: z.object({ reviewId: id, receiptId: id, reviewVersion: z.literal("personal-sms-correlated-calendar-review-v1"), packetHash: hex, proofHash: hex }).strict(),
  request: z.object({ calendarRequestId: uuid, calendarRequestHash: hex, connectorAccountId: id, accountVersion: revision }).strict(),
  presentation: z.object({ itemVersion: z.literal("personal-correlated-calendar-review-v1"), evidenceVersion: z.literal("personal-correlated-calendar-local-preview-v1"),
    titleNormalization: z.literal("EXISTING_SCHEMA_TRIM_ONLY"), provenance: z.literal("UNKNOWN") }).strict(),
}).strict().refine(value => value.request.calendarRequestId === personalCorrelatedCalendarRequestId(value.review.receiptId));
export const correlatedCalendarApprovalViewSchema = contract(viewShape);
export const correlatedCalendarApprovalCommandSchema = contract(z.object({ version: z.literal(CORRELATED_CALENDAR_APPROVAL_COMMAND_VERSION),
  workspaceId: id, reviewId: id, expectedRequestHash: hex, expectedReviewFingerprint: hex }).strict());
const originShape = z.object({ kind: z.literal("personal_sms_temporal_receipt"), approvalId: uuid, reviewId: id, reviewFingerprint: hex }).strict();
const authorityShape = z.object({ accountId: id, accountVersion: revision, credentialId: id, writeGrantId: id, writeGrantVersion: revision,
  memberId: id, memberRole: z.literal("owner"), memberUpdatedAt: epoch, workspaceUpdatedAt: epoch,
  accountScopes: scopes, grantScopes: scopes }).strict();
const requestShape = z.object({ title: z.string().min(1).max(240).refine(value => value.trim() === value), startsAt: epoch, endsAt: epoch,
  timezone: z.string().min(1).max(80).refine(value => { try { new Intl.DateTimeFormat("en-CA", { timeZone: value }); return true; } catch { return false; } }),
  accountVersion: revision, requestId: uuid }).strict().refine(value => value.startsAt < value.endsAt);
const claimShape = z.object({ version: z.literal(CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION), origin: originShape,
  userId: id, workspaceId: id, operationId: id, expectedRequestHash: hex, request: requestShape, authority: authorityShape,
  approvalToken: uuid, approvedAt: epoch, approvalExpiresAt: epoch, leaseUntil: epoch }).strict().superRefine((value, context) => {
  const approved = Date.parse(value.approvedAt), lease = Date.parse(value.leaseUntil), expiry = Date.parse(value.approvalExpiresAt);
  if (approved < pilotStart || expiry > pilotEnd || approved >= lease || lease > expiry || lease - approved > 25000
    || Date.parse(value.authority.memberUpdatedAt) > approved || Date.parse(value.authority.workspaceUpdatedAt) > approved
    || value.request.accountVersion !== value.authority.accountVersion) context.addIssue({ code: "custom", message: "APPROVAL_CLAIM_BINDING_INVALID" });
});
export const correlatedCalendarApprovalClaimSchema = contract(claimShape);
const pendingFields = { version: z.literal(CORRELATED_CALENDAR_APPROVAL_STATE_VERSION), origin: originShape,
  approvedBy: id, approvedHash: hex, approvalToken: uuid, writeAuthority: authorityShape };
const stateShape = z.discriminatedUnion("phase", [
  z.object({ ...pendingFields, phase: z.literal("CLAIMED"), dispatchStarted: z.literal(false) }).strict(),
  z.object({ ...pendingFields, phase: z.literal("DISPATCH_CLAIMED"), dispatchStarted: z.literal(true) }).strict(),
  z.object({ version: z.literal(CORRELATED_CALENDAR_APPROVAL_STATE_VERSION), origin: originShape, phase: z.literal("CONFIRMED"),
    receipt: z.object({ providerEventId: z.string().regex(/^e[a-f0-9]{31}$/), confirmed: z.literal(true) }).strict(), automaticRetry: z.literal(false) }).strict(),
  z.object({ version: z.literal(CORRELATED_CALENDAR_APPROVAL_STATE_VERSION), origin: originShape, phase: z.literal("UNCERTAIN"),
    writeConfirmed: z.literal(false), reviewRequired: z.literal(true), automaticRetry: z.literal(false),
    reason: z.enum(["WRITE_OUTCOME_UNKNOWN", "CLAIM_LEASE_EXPIRED", "CLAIM_COMMIT_OUTCOME_UNKNOWN", "DISPATCH_COMMIT_OUTCOME_UNKNOWN", "TERMINAL_COMMIT_OUTCOME_UNKNOWN"]) }).strict(),
]);
export const correlatedCalendarApprovalStateSchema = contract(stateShape);
export type CorrelatedCalendarApprovalView = z.infer<typeof correlatedCalendarApprovalViewSchema>;
export type CorrelatedCalendarApprovalCommand = z.infer<typeof correlatedCalendarApprovalCommandSchema>;
export type CorrelatedCalendarApprovalClaim = z.infer<typeof correlatedCalendarApprovalClaimSchema>;
export type CorrelatedCalendarApprovalState = z.infer<typeof correlatedCalendarApprovalStateSchema>;
const unverified = Object.freeze({ executionAuthorized: false as const, authorityVerified: false as const,
  providerConfirmationVerified: false as const, persistencePerformed: false as const,
  sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const });
function changed(): never { throw new Error("CORRELATED_CALENDAR_APPROVAL_BINDING_CHANGED"); }

/** Hashes a closed content descriptor, not authenticated sources or a human tap.
 * The future DB loader must reconstruct this descriptor from actual immutable rows. */
export function fingerprintCorrelatedCalendarApprovalView(raw: unknown) {
  const view = correlatedCalendarApprovalViewSchema.parse(raw);
  return freeze({ status: "APPROVAL_VIEW_SHAPE_ONLY" as const, view, fingerprint: sha(canonicalJson(view)), ...unverified });
}
export function inspectCorrelatedCalendarApprovalCommand(raw: unknown, rawView: unknown) {
  const command = correlatedCalendarApprovalCommandSchema.parse(raw), inspected = fingerprintCorrelatedCalendarApprovalView(rawView);
  if (command.workspaceId !== inspected.view.scope.workspaceId || command.reviewId !== inspected.view.review.reviewId
    || command.expectedRequestHash !== inspected.view.request.calendarRequestHash || command.expectedReviewFingerprint !== inspected.fingerprint) changed();
  return freeze({ status: "APPROVAL_COMMAND_BOUND_NOT_AUTHORIZED" as const, command, fingerprint: inspected.fingerprint, ...unverified });
}
/** Canonical six-field calendar wire order, NOT the sorted descriptor serializer. */
function requestHash(request: z.infer<typeof requestShape>) {
  return sha(JSON.stringify({ title: request.title, startsAt: request.startsAt, endsAt: request.endsAt, timezone: request.timezone,
    accountVersion: request.accountVersion, requestId: request.requestId }));
}
export function inspectCorrelatedCalendarApprovalClaim(raw: unknown, rawView: unknown) {
  const claim = correlatedCalendarApprovalClaimSchema.parse(raw), inspected = fingerprintCorrelatedCalendarApprovalView(rawView), view = inspected.view;
  if (claim.userId !== view.scope.userId || claim.workspaceId !== view.scope.workspaceId || claim.origin.reviewId !== view.review.reviewId
    || claim.origin.reviewFingerprint !== inspected.fingerprint || claim.request.requestId !== view.request.calendarRequestId
    || claim.expectedRequestHash !== view.request.calendarRequestHash || requestHash(claim.request) !== claim.expectedRequestHash
    || claim.authority.accountId !== view.request.connectorAccountId || claim.authority.accountVersion !== view.request.accountVersion) changed();
  return freeze({ status: "APPROVAL_CLAIM_BOUND_NOT_AUTHORIZED" as const, claim, fingerprint: inspected.fingerprint, ...unverified });
}
export function inspectCorrelatedCalendarApprovalState(raw: unknown, rawClaim: unknown, rawView: unknown) {
  const state = correlatedCalendarApprovalStateSchema.parse(raw), { claim, fingerprint } = inspectCorrelatedCalendarApprovalClaim(rawClaim, rawView);
  if (canonicalJson(state.origin) !== canonicalJson(claim.origin)) changed();
  if (state.phase === "CLAIMED" || state.phase === "DISPATCH_CLAIMED") {
    if (state.approvedBy !== claim.userId || state.approvedHash !== claim.expectedRequestHash || state.approvalToken !== claim.approvalToken
      || canonicalJson(state.writeAuthority) !== canonicalJson(claim.authority)) changed();
  } else if (state.phase === "CONFIRMED" && state.receipt.providerEventId !== deterministicGoogleEventId({ workspaceId: claim.workspaceId,
    calendarItemId: claim.request.requestId, idempotencyKey: claim.request.requestId })) changed();
  // Even a perfectly shaped CONFIRMED input does not prove any provider call.
  return freeze({ status: "APPROVAL_STATE_BOUND_NOT_AUTHORIZED" as const, state, fingerprint, ...unverified });
}
