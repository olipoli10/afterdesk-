import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { correlatedCalendarApprovalViewSchema, correlatedCalendarApprovalCommandSchema, correlatedCalendarApprovalClaimSchema, correlatedCalendarApprovalStateSchema,
  fingerprintCorrelatedCalendarApprovalView as fingerprint, inspectCorrelatedCalendarApprovalCommand as inspectCommand,
  inspectCorrelatedCalendarApprovalClaim as inspectClaim, inspectCorrelatedCalendarApprovalState as inspectState,
  CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION as VIEW, CORRELATED_CALENDAR_APPROVAL_COMMAND_VERSION as COMMAND,
  CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION as CLAIM, CORRELATED_CALENDAR_APPROVAL_STATE_VERSION as STATE,
} from "@/server/personal-assistant/correlated-calendar-approval-contract";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const request = { title: "inspection 🛠️", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z",
    timezone: "America/Toronto", accountVersion: 1, requestId: personalCorrelatedCalendarRequestId("receipt") };
  const view = { version: VIEW, scope: { workspaceId: "workspace", userId: "owner" },
    review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: sha(JSON.stringify(request)), connectorAccountId: "google", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } };
  const viewFingerprint = fingerprint(view).fingerprint;
  const claim = { version: CLAIM, origin: { kind: "personal_sms_temporal_receipt", approvalId: "90edec1d-4bf4-4a87-a891-f953b526ef78", reviewId: "review", reviewFingerprint: viewFingerprint },
    userId: "owner", workspaceId: "workspace", operationId: "calendar-operation", expectedRequestHash: view.request.calendarRequestHash, request,
    authority: { accountId: "google", accountVersion: 1, credentialId: "credential", writeGrantId: "write-grant", writeGrantVersion: 1,
      memberId: "member", memberRole: "owner", memberUpdatedAt: "2026-09-10T13:00:00.000Z", workspaceUpdatedAt: "2026-09-10T13:00:00.000Z",
      accountScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] as string[], grantScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] as string[] },
    approvalToken: "41444abd-ddde-457c-aa36-f4451c8dc32e", approvedAt: "2026-09-10T14:00:00.000Z", approvalExpiresAt: "2026-09-10T14:05:00.000Z", leaseUntil: "2026-09-10T14:00:25.000Z" };
  const command = { version: COMMAND, workspaceId: "workspace", reviewId: "review", expectedRequestHash: view.request.calendarRequestHash, expectedReviewFingerprint: viewFingerprint };
  const pending = { version: STATE, origin: { ...claim.origin }, phase: "CLAIMED", approvedBy: "owner", approvedHash: claim.expectedRequestHash,
    approvalToken: claim.approvalToken, writeAuthority: structuredClone(claim.authority), dispatchStarted: false };
  const confirmed = { version: STATE, origin: { ...claim.origin }, phase: "CONFIRMED", receipt: { providerEventId: deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: request.requestId, idempotencyKey: request.requestId }), confirmed: true }, automaticRetry: false };
  const uncertain = { version: STATE, origin: { ...claim.origin }, phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason: "CLAIM_LEASE_EXPIRED" };
  return { view, claim, command, pending, confirmed, uncertain };
}
const deepFrozen = (value: unknown): boolean => !value || typeof value !== "object" || Object.isFrozen(value) && Object.values(value).every(deepFrozen);

describe("typed correlated calendar contracts — pure and never authority", () => {
  it("freezes exact version names, UUID8 and a minimal transitively bound view", () => {
    expect([VIEW, COMMAND, CLAIM, STATE]).toEqual(["personal-correlated-calendar-approval-view-v1", "personal-correlated-calendar-approval-command-v1", "personal-correlated-calendar-write-claim-v1", "personal-correlated-calendar-write-state-v1"]);
    const f = fixture(), actual = fingerprint(f.view);
    expect(actual.fingerprint).toBe(sha(canonicalJson(f.view))); expect(actual.view.request.calendarRequestId).toBe("a912443d-1e19-8185-ba4d-3cbfbb315066");
    expect(Object.keys(actual.view).sort()).toEqual(["presentation", "request", "review", "scope", "version"]);
    expect(deepFrozen(actual)).toBe(true); expect(canonicalJson(actual)).not.toMatch(/inspection|startsAt|receivedAt|inspectedAt|approvalExpiresAt/);
  });
  it("reordered JSONB-style keys give the same fingerprint with no normalization", () => {
    const f = fixture(), reordered = JSON.parse(canonicalJson(f.view)); expect(fingerprint(reordered)).toEqual(fingerprint(f.view));
    expect(inspectClaim(JSON.parse(canonicalJson(f.claim)), reordered).claim).toEqual(f.claim);
  });
  it("pins an independently assembled Node canonical vector for future SQL parity", () => {
    const f = fixture();
    expect(f.view.request.calendarRequestHash).toBe("e5f02375cecd18258c319498c254217335283b91aa5e1e238a843f65d57359a8");
    expect(fingerprint(f.view).fingerprint).toBe("22d5fee446023c13a6c03f23947a78c1b457007729f6050c9e5acae0d0d07f0d");
    expect(canonicalJson(f.view).startsWith('{"presentation":{"evidenceVersion":')).toBe(true);
  });
  it("all valid shapes remain explicitly unauthenticated and unconfirmed by this pure helper", () => {
    const f = fixture();
    for (const result of [fingerprint(f.view), inspectCommand(f.command, f.view), inspectClaim(f.claim, f.view), inspectState(f.pending, f.claim, f.view), inspectState(f.confirmed, f.claim, f.view), inspectState(f.uncertain, f.claim, f.view)]) {
      expect(result).toMatchObject({ executionAuthorized: false, authorityVerified: false, providerConfirmationVerified: false, persistencePerformed: false, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" });
      expect(deepFrozen(result)).toBe(true);
    }
  });
  it.each(["workspaceId", "userId"])("scope %s changes the view and refuses an old claim", key => {
    const f = fixture(), old = fingerprint(f.view).fingerprint; Object.assign(f.view.scope, { [key]: "other" });
    expect(fingerprint(f.view).fingerprint).not.toBe(old); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["reviewId", "packetHash", "proofHash"])("review %s changes its fingerprint", key => {
    const f = fixture(), old = fingerprint(f.view).fingerprint; Object.assign(f.view.review, { [key]: key.endsWith("Hash") ? "e".repeat(64) : "other" });
    expect(fingerprint(f.view).fingerprint).not.toBe(old); expect(() => inspectCommand(f.command, f.view)).toThrow();
  });
  it.each(["calendarRequestHash", "connectorAccountId", "accountVersion"])("request descriptor %s changes the fingerprint", key => {
    const f = fixture(), old = fingerprint(f.view).fingerprint; Object.assign(f.view.request, { [key]: key === "accountVersion" ? 2 : key.endsWith("Hash") ? "f".repeat(64) : "other" });
    expect(fingerprint(f.view).fingerprint).not.toBe(old); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it("receipt substitution requires its matching deterministic request UUID, not a v4 or another receipt's id", () => {
    const f = fixture(); f.view.review.receiptId = "other"; expect(() => fingerprint(f.view)).toThrow();
    f.view.request.calendarRequestId = personalCorrelatedCalendarRequestId("other"); expect(fingerprint(f.view).fingerprint).not.toBe(f.command.expectedReviewFingerprint);
  });
  it.each(["version", "itemVersion", "evidenceVersion", "titleNormalization", "provenance"])("unknown presentation/version %s is not forward-compatible authority", key => {
    const f = fixture(); if (key === "version") Object.assign(f.view, { version: "next" }); else Object.assign(f.view.presentation, { [key]: "next" });
    expect(() => fingerprint(f.view)).toThrow();
  });
  it.each(["userId", "operationId", "draft", "approved", "proof"])("command rejects extra %s", key => {
    const f = fixture(); expect(() => inspectCommand({ ...f.command, [key]: true }, f.view)).toThrow();
  });
  it.each(["workspaceId", "reviewId", "expectedRequestHash", "expectedReviewFingerprint"])("command mismatch %s refuses", key => {
    const f = fixture(); Object.assign(f.command, { [key]: key.startsWith("expected") ? "e".repeat(64) : "other" }); expect(() => inspectCommand(f.command, f.view)).toThrow();
  });
  it.each(["title", "startsAt", "endsAt", "timezone", "requestId", "accountVersion"])("claim exact six-field request changes %s are detected", key => {
    const f = fixture(); Object.assign(f.claim.request, { [key]: key === "accountVersion" ? 2 : key === "title" ? "other" : key === "timezone" ? "UTC" : key === "requestId" ? f.claim.approvalToken : "2026-09-12T18:00:00.000Z" });
    expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it("request hash is legacy wire order, never sorted descriptor order", () => {
    const f = fixture(); expect(f.claim.expectedRequestHash).not.toBe(sha(canonicalJson(f.claim.request)));
    f.claim.expectedRequestHash = sha(canonicalJson(f.claim.request)); f.view.request.calendarRequestHash = f.claim.expectedRequestHash;
    f.claim.origin.reviewFingerprint = fingerprint(f.view).fingerprint; expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["admin", "OWNER", "member"])("typed role %s never inherits generic admin authority", role => {
    const f = fixture(); f.claim.authority.memberRole = role; expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["accountScopes", "grantScopes"])("%s requires WRITE, not readonly or duplicate grants", key => {
    const f = fixture(); Object.assign(f.claim.authority, { [key]: ["https://www.googleapis.com/auth/calendar.events.readonly"] }); expect(() => inspectClaim(f.claim, f.view)).toThrow();
    Object.assign(f.claim.authority, { [key]: [GOOGLE_CALENDAR_WRITE_SCOPE, GOOGLE_CALENDAR_WRITE_SCOPE] }); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])("account revision %s refuses", value => {
    const f = fixture(); f.claim.authority.accountVersion = value; expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["2026-09-10T14:00:00.000Z", "2026-09-10T14:00:25.001Z", "2026-09-10T14:05:00.001Z"])("lease bound %s refuses", lease => {
    const f = fixture(); f.claim.leaseUntil = lease; expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["2026-09-10T13:59:59.999Z", "2026-10-10T01:18:26.001Z"])("approval expiry %s refuses", expiry => {
    const f = fixture(); f.claim.approvalExpiresAt = expiry; expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it("claim dates are historical serialized instants, not current-time authorization", () => {
    const f = fixture(), spy = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("no current clock allowed"); });
    try { expect(inspectClaim(f.claim, f.view).authorityVerified).toBe(false); } finally { spy.mockRestore(); }
  });
  it.each(["2026-02-30T14:00:00.000Z", "2026-09-10T10:00:00.000-04:00", "2026-09-10T14:00:00Z", new Date("2026-09-10T14:00:00Z")])("rejects noncanonical serialized date %#", value => {
    const f = fixture(); Object.assign(f.claim, { approvedAt: value }); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["memberUpdatedAt", "workspaceUpdatedAt"])("future authority epoch %s is inconsistent", key => {
    const f = fixture(); Object.assign(f.claim.authority, { [key]: "2026-09-10T14:00:00.001Z" }); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it("origin extra fields or a substituted origin are not accepted", () => {
    const f = fixture(); expect(() => inspectClaim({ ...f.claim, origin: { ...f.claim.origin, allowCorrelated: true } }, f.view)).toThrow();
    f.pending.origin.approvalId = f.claim.approvalToken; expect(() => inspectState(f.pending, f.claim, f.view)).toThrow();
  });
  it.each(["approvedBy", "approvedHash", "approvalToken"])("pending %s must match claim exactly", key => {
    const f = fixture(); Object.assign(f.pending, { [key]: key === "approvalToken" ? f.claim.origin.approvalId : key === "approvedHash" ? "e".repeat(64) : "other" });
    expect(() => inspectState(f.pending, f.claim, f.view)).toThrow();
  });
  it("pending write authority cannot be regranted under another id", () => {
    const f = fixture(); f.pending.writeAuthority.writeGrantId = "replacement"; expect(() => inspectState(f.pending, f.claim, f.view)).toThrow();
  });
  it("dispatch marker has one unambiguous serialized phase", () => {
    const f = fixture(); expect(() => inspectState({ ...f.pending, dispatchStarted: true }, f.claim, f.view)).toThrow();
    expect(inspectState({ ...f.pending, phase: "DISPATCH_CLAIMED", dispatchStarted: true }, f.claim, f.view).state.phase).toBe("DISPATCH_CLAIMED");
    expect(() => inspectState({ ...f.pending, phase: "DISPATCH_CLAIMED" }, f.claim, f.view)).toThrow();
  });
  it("confirmed event id must be deterministic for the original request, not any valid Google-looking id", () => {
    const f = fixture(); f.confirmed.receipt.providerEventId = "e" + "0".repeat(31); expect(() => inspectState(f.confirmed, f.claim, f.view)).toThrow();
  });
  it.each([false, "true", null])("confirmed marker %s cannot prove a receipt", confirmed => {
    const f = fixture(); Object.assign(f.confirmed.receipt, { confirmed }); expect(() => inspectState(f.confirmed, f.claim, f.view)).toThrow();
  });
  it.each(["priorClaimResult", "receipt", "approvalAvailable", "executionAuthorized", "retryAfter"])("uncertain rejects extra %s or nested fabricated receipt", key => {
    const f = fixture(); expect(() => inspectState({ ...f.uncertain, [key]: f.confirmed }, f.claim, f.view)).toThrow();
  });
  it.each(["automaticRetry", "writeConfirmed"])("uncertain true %s refuses", key => {
    const f = fixture(); expect(() => inspectState({ ...f.uncertain, [key]: true }, f.claim, f.view)).toThrow();
  });
  it("unknown reason and phase remain closed", () => {
    const f = fixture(); expect(() => inspectState({ ...f.uncertain, reason: "RETRY_SAFE" }, f.claim, f.view)).toThrow();
    expect(() => inspectState({ ...f.uncertain, phase: "RETRY" }, f.claim, f.view)).toThrow();
  });
  it("copies caller arrays and nested claim/state objects before publishing a frozen result", () => {
    const f = fixture(), actual = inspectState(f.pending, f.claim, f.view); f.pending.writeAuthority.accountScopes[0] = "mutated"; f.claim.origin.approvalId = f.claim.approvalToken;
    expect(actual.state.origin.approvalId).toBe("90edec1d-4bf4-4a87-a891-f953b526ef78");
    if (actual.state.phase !== "CLAIMED") throw new Error("wrong fixture phase"); expect(actual.state.writeAuthority.accountScopes).toEqual([GOOGLE_CALENDAR_WRITE_SCOPE]); expect(deepFrozen(actual)).toBe(true);
  });
  it.each(["\0", "\ud800", "\udc00"])("rejects PostgreSQL-incompatible string %# before hashing", bad => {
    const f = fixture(); f.view.scope.userId = bad; expect(() => fingerprint(f.view)).toThrow();
  });
  it("rejects enumerated/nonenumerated accessors without invoking their getter", () => {
    const f = fixture(), getter = vi.fn(() => "injected");
    for (const enumerable of [false, true]) { const raw = { ...f.view }; Object.defineProperty(raw, "hidden", { enumerable, get: getter }); expect(correlatedCalendarApprovalViewSchema.safeParse(raw).success).toBe(false); }
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(["hidden", "symbol", "cycle", "sparse", "customproto", "undefined"])("rejects non-JSON structure %s", kind => {
    const f = fixture(), raw = f.view as unknown as Record<string | symbol, unknown>;
    if (kind === "hidden") Object.defineProperty(raw, "hidden", { value: 1 });
    if (kind === "symbol") raw[Symbol("hidden")] = 1;
    if (kind === "cycle") raw.cycle = raw;
    if (kind === "sparse") raw.values = new Array(20_000);
    if (kind === "customproto") Object.setPrototypeOf(raw, { hidden: true });
    if (kind === "undefined") raw.extra = undefined;
    expect(correlatedCalendarApprovalViewSchema.safeParse(raw).success).toBe(false);
  });
  it("schema exports all enforce the same bounded JSON preflight", () => {
    for (const schema of [correlatedCalendarApprovalViewSchema, correlatedCalendarApprovalCommandSchema, correlatedCalendarApprovalClaimSchema, correlatedCalendarApprovalStateSchema]) {
      expect(schema.safeParse({ huge: "a".repeat(32769) }).success).toBe(false);
      expect(schema.safeParse({ a: "a".repeat(20_000), b: "b".repeat(20_000) }).success).toBe(false);
      expect(schema.safeParse(null).success).toBe(false);
    }
  });
  it("a self-consistent forged descriptor still receives no source/actor/provider authentication", () => {
    const f = fixture(); f.view.review.packetHash = "0".repeat(64); const hash = fingerprint(f.view).fingerprint;
    f.claim.origin.reviewFingerprint = hash; f.confirmed.origin.reviewFingerprint = hash;
    expect(inspectState(f.confirmed, f.claim, f.view)).toMatchObject({ authorityVerified: false, providerConfirmationVerified: false, executionAuthorized: false });
    // Only future DB mapping can bind operationId/approvalId to this receipt.
    f.claim.operationId = "invented-operation"; expect(inspectClaim(f.claim, f.view).authorityVerified).toBe(false);
  });
  it("module has no direct DB/caller/transport imports or query/clock calls", () => {
    const source = readFileSync("src/server/personal-assistant/correlated-calendar-approval-contract.ts", "utf8");
    expect(source).not.toMatch(/@\/lib\/db|calendar-actions|google-client|process\.env|Date\.now|\bfetch\(|\$transaction|\$query|\$execute/);
  });
});
