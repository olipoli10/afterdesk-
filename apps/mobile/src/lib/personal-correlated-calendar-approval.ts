import { z } from "zod";
import { parsePersonalCorrelatedCalendarReview } from "./personal-correlated-calendar-review";

/** Do not normalize identifiers. TextEncoder must not collapse lone surrogates. */
export function correlatedApprovalUnicode(value: string) {
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n === 0 || n >= 0xdc00 && n <= 0xdfff) return false;
    if (n >= 0xd800 && n <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
  }
  return true;
}
export const correlatedApprovalId = z.string().min(1).max(191).refine(v => v.trim() === v && correlatedApprovalUnicode(v));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
/** Closed JSON input only, copied without reading getters or inherited fields. */
export function snapshotCorrelatedApprovalJson(raw: unknown): unknown {
  let nodes = 0, bytes = 0;
  const charge = (n: number) => { bytes += n; if (bytes > 131072) throw new Error("CORRELATED_APPROVAL_INVALID"); };
  const scalarBytes = (v: string | number | boolean | null) => new TextEncoder().encode(JSON.stringify(v)).length;
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 4096 || depth > 20) throw new Error("CORRELATED_APPROVAL_INVALID");
    if (v === null || typeof v === "boolean") { charge(scalarBytes(v)); return v; }
    if (typeof v === "number" && Number.isFinite(v)) { charge(scalarBytes(v)); return v; }
    if (typeof v === "string" && v.length <= 32768 && correlatedApprovalUnicode(v)) { charge(scalarBytes(v)); return v; }
    if (!v || typeof v !== "object" || Object.getOwnPropertySymbols(v).length) throw new Error("CORRELATED_APPROVAL_INVALID");
    const array = Array.isArray(v), descriptors = Object.getOwnPropertyDescriptors(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) throw new Error("CORRELATED_APPROVAL_INVALID");
    const keys = Object.keys(descriptors).filter(key => !(array && key === "length"));
    if (keys.length > 64 || array && (v.length > 64 || keys.length !== v.length)) throw new Error("CORRELATED_APPROVAL_INVALID");
    charge(2 + Math.max(0, keys.length - 1));
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const d = descriptors[key];
      if (key === "__proto__" || key.length > 191 || !correlatedApprovalUnicode(key) || !d.enumerable || !("value" in d)
        || array && (!/^\d+$/.test(key) || String(Number(key)) !== key || Number(key) >= v.length)) throw new Error("CORRELATED_APPROVAL_INVALID");
      if (!array) charge(scalarBytes(key) + 1);
      result[key] = copy(d.value, depth + 1);
    }
    return array ? Array.from({ length: (v as unknown[]).length }, (_, i) => result[String(i)]) : result;
  }
  const value = copy(raw, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 131072) throw new Error("CORRELATED_APPROVAL_INVALID");
  return value;
}
const offerSchema = z.object({ version: z.literal("personal-correlated-calendar-approval-offer-v1"), workspaceId: correlatedApprovalId,
  readOnly: z.literal(true), executionAuthorized: z.literal(false), explicitApprovalRequired: z.literal(true), review: z.unknown(),
  approvalOffer: z.object({ status: z.literal("ELIGIBLE_FOR_EXPLICIT_APPROVAL"), reviewId: correlatedApprovalId, expectedRequestHash: hash,
    expectedReviewFingerprint: hash, fingerprintVersion: z.literal("personal-correlated-calendar-approval-view-v1"), inspectedAt: utc,
    approvalExpiresAt: utc, executionAuthorized: z.literal(false) }).strict(),
}).strict();
export function parsePersonalCorrelatedCalendarApprovalOffer(raw: unknown, workspaceId: string, reviewId: string) {
  const value = offerSchema.parse(snapshotCorrelatedApprovalJson(raw)), review = parsePersonalCorrelatedCalendarReview(value.review), offer = value.approvalOffer;
  if (value.workspaceId !== workspaceId || review.reviewId !== reviewId || offer.reviewId !== reviewId || review.currentStatus !== "pending" || review.evidence.provenance !== "UNKNOWN"
    || review.preparationExpiresAt !== offer.approvalExpiresAt || Date.parse(review.inspectedAt) > Date.parse(offer.inspectedAt)
    || Date.parse(offer.inspectedAt) >= Date.parse(offer.approvalExpiresAt)) throw new Error("CORRELATED_APPROVAL_INVALID");
  return freeze({ ...value, review });
}
export type PersonalCorrelatedCalendarApprovalOffer = ReturnType<typeof parsePersonalCorrelatedCalendarApprovalOffer>;
export const personalCorrelatedCalendarApprovalCommandSchema = z.object({ version: z.literal("personal-correlated-calendar-approval-command-v1"),
  workspaceId: correlatedApprovalId, reviewId: correlatedApprovalId, expectedRequestHash: hash, expectedReviewFingerprint: hash }).strict();
export type PersonalCorrelatedCalendarApprovalCommand = Readonly<z.infer<typeof personalCorrelatedCalendarApprovalCommandSchema>>;
export function personalCorrelatedCalendarApprovalCommand(offer: PersonalCorrelatedCalendarApprovalOffer): PersonalCorrelatedCalendarApprovalCommand {
  const snapshot = offerSchema.parse(snapshotCorrelatedApprovalJson(offer));
  const exact = parsePersonalCorrelatedCalendarApprovalOffer(snapshot, snapshot.workspaceId, snapshot.approvalOffer.reviewId);
  return freeze(personalCorrelatedCalendarApprovalCommandSchema.parse({ version: "personal-correlated-calendar-approval-command-v1", workspaceId: exact.workspaceId,
    reviewId: exact.review.reviewId, expectedRequestHash: exact.approvalOffer.expectedRequestHash, expectedReviewFingerprint: exact.approvalOffer.expectedReviewFingerprint }));
}
const receipt = z.object({ confirmed: z.literal(true), providerEventId: z.string().regex(/^e[a-f0-9]{31}$/) }).strict();
const common = { version: z.literal("personal-correlated-calendar-approval-result-v1"), workspaceId: correlatedApprovalId, reviewId: correlatedApprovalId,
  observedAt: utc, readOnly: z.literal(true), approvalAvailable: z.literal(false), executionAuthorized: z.literal(false), automaticRetry: z.literal(false), providerStateVerified: z.literal(false) };
const resultSchema = z.discriminatedUnion("outcome", [
  z.object({ ...common, outcome: z.literal("NOT_ATTEMPTED") }).strict(),
  z.object({ ...common, outcome: z.literal("PENDING_RESULT"), approvedAt: utc }).strict(),
  z.object({ ...common, outcome: z.literal("UNKNOWN"), approvedAt: utc, reason: z.enum(["WRITE_OUTCOME_UNKNOWN", "CLAIM_LEASE_EXPIRED", "CLAIM_COMMIT_OUTCOME_UNKNOWN", "DISPATCH_COMMIT_OUTCOME_UNKNOWN", "TERMINAL_COMMIT_OUTCOME_UNKNOWN"]) }).strict(),
  z.object({ ...common, outcome: z.literal("CONFIRMED"), approvedAt: utc, confirmationBasis: z.literal("DURABLE_RECORDED_RESULT"), receipt }).strict(),
]);
export function parsePersonalCorrelatedCalendarApprovalResult(raw: unknown, workspaceId: string, reviewId: string) {
  const value = resultSchema.parse(snapshotCorrelatedApprovalJson(raw));
  if (value.workspaceId !== workspaceId || value.reviewId !== reviewId) throw new Error("CORRELATED_APPROVAL_INVALID");
  return freeze(value);
}
export type PersonalCorrelatedCalendarApprovalResult = ReturnType<typeof parsePersonalCorrelatedCalendarApprovalResult>;
const responseCommon = { version: z.literal("personal-correlated-calendar-approval-response-v1"), workspaceId: correlatedApprovalId, reviewId: correlatedApprovalId,
  expectedRequestHash: hash, expectedReviewFingerprint: hash, automaticRetry: z.literal(false), executionAuthorized: z.literal(false), providerStateVerified: z.literal(false) };
const responseSchema = z.discriminatedUnion("status", [z.object({ ...responseCommon, status: z.literal("CONFIRMED"), receipt }).strict(),
  z.object({ ...responseCommon, status: z.literal("ALREADY_ATTEMPTED"), result: resultSchema }).strict()]);
export function parsePersonalCorrelatedCalendarApprovalResponse(raw: unknown, expected: PersonalCorrelatedCalendarApprovalCommand) {
  const command = personalCorrelatedCalendarApprovalCommandSchema.parse(snapshotCorrelatedApprovalJson(expected)), value = responseSchema.parse(snapshotCorrelatedApprovalJson(raw));
  if (value.workspaceId !== command.workspaceId || value.reviewId !== command.reviewId || value.expectedRequestHash !== command.expectedRequestHash
    || value.expectedReviewFingerprint !== command.expectedReviewFingerprint) throw new Error("CORRELATED_APPROVAL_INVALID");
  if (value.status === "ALREADY_ATTEMPTED") parsePersonalCorrelatedCalendarApprovalResult(value.result, command.workspaceId, command.reviewId);
  return freeze(value);
}
export type PersonalCorrelatedCalendarApprovalResponse = ReturnType<typeof parsePersonalCorrelatedCalendarApprovalResponse>;
