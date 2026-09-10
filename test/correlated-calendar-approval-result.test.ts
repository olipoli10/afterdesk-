import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: db.transaction } }));
import { readCorrelatedCalendarApprovalResult as read, correlatedCalendarApprovalResultSchema } from "@/server/personal-assistant/correlated-calendar-approval-result";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { fingerprintCorrelatedCalendarApprovalView } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const actor = { workspaceId: "workspace", userId: "owner" };
const baseTime = Date.parse("2026-09-10T14:00:00.000Z");
const input = () => ({ enabled: true, actor: { ...actor }, reviewId: "review" });
const context = () => ({ deadlineAt: Date.now() + 5000 });
const env = () => ({ ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true" });
function fixture() {
  const draft = { title: "inspection 🛠️", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" };
  const request = { ...draft, accountVersion: 1, requestId: personalCorrelatedCalendarRequestId("receipt") };
  const proof = { version: "personal-sms-correlated-calendar-reference-v1", inspectedReceiptProofHash: "c".repeat(64),
    receiptProofVersion: PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION, draft, titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", executionAuthorized: false,
    semanticInterpretationVerified: false, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" };
  const review = { id: "review", ...actor, receiptId: "receipt", clarificationId: "question", namespace: "d".repeat(64), calendarOperationId: "operation",
    calendarRequestId: request.requestId, calendarRequestHash: sha(JSON.stringify(request)), connectorAccountId: "google", accountVersion: 1,
    packetHash: "a".repeat(64), proofHash: sha(canonicalJson(proof)), proof, reviewVersion: "personal-sms-correlated-calendar-review-v1",
    createdAt: new Date(baseTime - 1000), preparationExpiresAt: new Date(baseTime + 300000), pilotExpiresAt: new Date("2026-10-10T01:18:26.000Z") };
  const view = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: actor,
    review: { reviewId: review.id, receiptId: review.receiptId, reviewVersion: review.reviewVersion, packetHash: review.packetHash, proofHash: review.proofHash },
    request: { calendarRequestId: request.requestId, calendarRequestHash: review.calendarRequestHash, connectorAccountId: "google", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const authority = { accountId: "google", accountVersion: 1, credentialId: "credential", writeGrantId: "grant", writeGrantVersion: 1,
    memberId: "old-member", memberRole: "owner", memberUpdatedAt: new Date(baseTime - 2000).toISOString(), workspaceUpdatedAt: new Date(baseTime - 2000).toISOString(),
    accountScopes: ["https://www.googleapis.com/auth/calendar.events"], grantScopes: ["https://www.googleapis.com/auth/calendar.events"] };
  const approval = { id: "90edec1d-4bf4-4a87-a891-f953b526ef78", reviewId: "review", calendarOperationId: "operation", ...actor,
    approvalToken: "41444abd-ddde-457c-aa36-f4451c8dc32e", fingerprintVersion: "personal-correlated-calendar-approval-view-v1", reviewFingerprint: view.fingerprint,
    approvedAt: new Date(baseTime), approvalExpiresAt: new Date(baseTime + 300000), leaseUntil: new Date(baseTime + 25000), writeAuthority: authority };
  const origin = { kind: "personal_sms_temporal_receipt", approvalId: approval.id, reviewId: review.id, reviewFingerprint: view.fingerprint };
  const result = { version: "personal-correlated-calendar-write-state-v1", origin, phase: "CLAIMED", approvedBy: "owner", approvedHash: review.calendarRequestHash,
    approvalToken: approval.approvalToken, writeAuthority: authority, dispatchStarted: false };
  const op = { id: "operation", workspaceId: actor.workspaceId, createdByUserId: actor.userId, connectorAccountId: "google", kind: "calendar_write",
    status: "processing", attempts: 1, leaseUntil: new Date(baseTime + 25000) as Date | null, result: result as unknown, request, requestHash: review.calendarRequestHash,
    idempotencyKey: `personal-calendar:workspace:${request.requestId}`, correlatedTemporalReceiptId: "receipt", sourcePersonalOperationId: null, modelGatewayOperationId: null,
    budgetId: null, reservedCadMicros: null, externalTransportPerformed: false, linkedReviewId: "review", linkedReceiptId: "receipt", linkedWorkspaceId: "workspace", linkedUserId: "owner" };
  return { review, op, approval, approvals: [approval], origin, owner: { workspaceId: "workspace", ownerUserId: "owner", memberId: "current-member", memberUserId: "owner", memberRole: "owner",
    workspaceUpdatedAt: new Date(baseTime - 10), memberUpdatedAt: new Date(baseTime - 10) }, discovery: { reviewId: "review", clarificationId: "question", namespace: review.namespace }, now: new Date(baseTime + 1000) };
}
let f: ReturnType<typeof fixture>;
function confirmed() {
  f.op.status = "completed"; f.op.leaseUntil = null; f.op.externalTransportPerformed = true;
  f.op.result = { version: "personal-correlated-calendar-write-state-v1", origin: f.origin, phase: "CONFIRMED", automaticRetry: false,
    receipt: { confirmed: true, providerEventId: deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: f.op.request.requestId, idempotencyKey: f.op.request.requestId }) } };
}
function pending() { f.approvals = []; f.op.status = "pending"; f.op.attempts = 0; f.op.result = null; f.op.leaseUntil = null; }
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(baseTime + 1000); f = fixture();
  db.transaction.mockImplementation(work => work({ $queryRawUnsafe: db.query }));
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("set_config") || sql.includes("pg_advisory")) return [];
    if (sql.includes('v.id AS "reviewId"')) return [f.discovery];
    if (sql.includes('FROM "ConstructionWorkspace"')) return [f.owner];
    if (sql.includes('SELECT v.id,v."workspaceId"')) return [f.review];
    if (sql.includes('FROM "PersonalAssistantOperation"')) return [f.op];
    if (sql.includes('FROM "PersonalSmsCorrelatedCalendarApproval"')) return f.approvals;
    if (sql.includes("clock_timestamp() AS now")) return [{ now: f.now }];
    throw new Error("UNEXPECTED_TEST_QUERY");
  });
});
afterEach(() => vi.restoreAllMocks());
const refused = async () => expect(read(input(), env(), context())).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_RESULT_UNAVAILABLE");
describe("historical correlated approval result, read only", () => {
  it.each([undefined, false, "true"])("is OFF for input %s without DB", async enabled => {
    expect(await read({ ...input(), enabled } as Parameters<typeof read>[0], env(), context())).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each([undefined, "false", "TRUE"])("is OFF for REVIEW flag %s", async value => {
    expect(await read(input(), { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: value }, context())).toHaveProperty("status", "DISABLED"); expect(db.transaction).not.toHaveBeenCalled();
  });
  it("returns a strict frozen live pending result without claiming delivery", async () => {
    const result = await read(input(), env(), context());
    expect(result).toMatchObject({ outcome: "PENDING_RESULT", providerStateVerified: false, executionAuthorized: false, approvalAvailable: false });
    expect(Object.isFrozen(result)).toBe(true); expect(correlatedCalendarApprovalResultSchema.parse(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/approvalToken|credential|namespace|inspection|requestId|operationId|writeAuthority|dispatchStarted/);
  });
  it("returns NOT_ATTEMPTED only for exact untouched pending with no global approval", async () => {
    pending(); expect(await read(input(), env(), context())).toHaveProperty("outcome", "NOT_ATTEMPTED");
  });
  it.each(["CLAIMED", "DISPATCH_CLAIMED"])("expired %s is UNKNOWN without recovery writes", async phase => {
    Object.assign(f.op.result as object, { phase, dispatchStarted: phase === "DISPATCH_CLAIMED" }); f.now = new Date(baseTime + 25000);
    const before = structuredClone(f); expect(await read(input(), env(), context())).toMatchObject({ outcome: "UNKNOWN", reason: "CLAIM_LEASE_EXPIRED" }); expect(f).toEqual(before);
  });
  it("confirmed remains readable after pilot/TTL with only REVIEW enabled", async () => {
    confirmed(); f.now = new Date("2027-01-01T00:00:00.000Z"); const before = structuredClone(f);
    const result = await read(input(), env(), context()); expect(result).toMatchObject({ outcome: "CONFIRMED", confirmationBasis: "DURABLE_RECORDED_RESULT", providerStateVerified: false });
    expect(result).not.toHaveProperty("confirmedAt"); expect(f).toEqual(before);
  });
  it("reads uncertainty from exact union, preserving no-effect ambiguity", async () => {
    f.op.status = "uncertain"; f.op.leaseUntil = null; f.op.result = { version: "personal-correlated-calendar-write-state-v1", origin: f.origin,
      phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason: "WRITE_OUTCOME_UNKNOWN" };
    expect(await read(input(), env(), context())).toMatchObject({ outcome: "UNKNOWN", reason: "WRITE_OUTCOME_UNKNOWN" });
  });
  it("does not require historical member identity/epochs to remain current", async () => {
    confirmed(); f.owner.memberId = "replacement-current-membership"; f.owner.memberUpdatedAt = new Date(baseTime + 100); expect(await read(input(), env(), context())).toHaveProperty("outcome", "CONFIRMED");
  });
  it.each(["workspaceId", "ownerUserId", "memberUserId", "memberRole"])("refuses current owner mismatch %s", async key => { Object.assign(f.owner, { [key]: "other" }); await refused(); });
  it.each(["workspaceId", "userId", "receiptId", "namespace", "clarificationId", "calendarRequestHash", "proofHash"])("refuses review pin %s", async key => { Object.assign(f.review, { [key]: "other" }); await refused(); });
  it.each(["workspaceId", "createdByUserId", "linkedUserId", "linkedReviewId", "correlatedTemporalReceiptId", "requestHash", "idempotencyKey"])("refuses operation pin %s", async key => { Object.assign(f.op, { [key]: "other" }); await refused(); });
  it.each(["workspaceId", "userId", "reviewId", "calendarOperationId", "reviewFingerprint", "approvalToken"])("refuses approval pin %s", async key => { Object.assign(f.approval, { [key]: "other" }); await refused(); });
  it("does not hide an approval globally linked by operation only", async () => { pending(); f.approvals = [{ ...f.approval, reviewId: "foreign" }]; await refused(); });
  it("refuses duplicate global approval rows", async () => { f.approvals.push({ ...f.approval }); await refused(); });
  it("refuses a legacy terminal without approval", async () => { confirmed(); f.approvals = []; await refused(); });
  it("refuses an incorrectly deterministic confirmed event", async () => { confirmed(); Object.assign((f.op.result as { receipt: object }).receipt, { providerEventId: `e${"0".repeat(31)}` }); await refused(); });
  it.each(["attempts", "leaseUntil", "externalTransportPerformed"])("refuses confirmed operation mismatch %s", async key => { confirmed(); Object.assign(f.op, { [key]: key === "attempts" ? 0 : key === "leaseUntil" ? new Date(baseTime) : false }); await refused(); });
  it("refuses a lease changed independently of the immutable approval", async () => { f.op.leaseUntil = new Date(baseTime + 26000); await refused(); });
  it("refuses a NULL state rather than inventing UNKNOWN", async () => { f.op.result = null; await refused(); });
  it("refuses arbitrary extra state fields", async () => { Object.assign(f.op.result as object, { extra: true }); await refused(); });
  it("refuses wrong approval expiry", async () => { f.approval.approvalExpiresAt = new Date(baseTime + 400000); await refused(); });
  it("does not publish after an unknown transaction commit", async () => {
    db.transaction.mockImplementation(async work => { await work({ $queryRawUnsafe: db.query }); throw new Error("secret sql"); }); await refused();
  });
  it("sets native bounds before discovery and locks namespace before owner/calendar", async () => {
    await read(input(), env(), context()); const sql = db.query.mock.calls.map(x => String(x[0]));
    expect(sql[0]).toContain("set_config"); expect(sql[2]).toContain("pg_advisory_xact_lock(hashtextextended($1,0))::text");
    expect(sql[3]).toContain("FOR SHARE OF w,m"); expect(sql[5]).toContain("FOR SHARE OF o,v");
    expect(sql[6]).toContain('WHERE "reviewId"=$1 OR "calendarOperationId"=$2 FOR SHARE');
    expect(db.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(sql.join("\n")).not.toMatch(/SELECT \*|\bUPDATE\b|\bDELETE\b|\bINSERT\b|q\.prepared|packet\b|ConstructionConnector|authority_current/);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7])("refuses REVIEW disabled after query %s", async index => {
    const environment = env(), original = db.query.getMockImplementation()!; let n = 0;
    db.query.mockImplementation(async (...args) => { const value = await original(...args); if (n++ === index) environment.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false"; return value; });
    await expect(read(input(), environment, context())).rejects.toThrow("RESULT_UNAVAILABLE");
  });
  it("copies caller scope, context deadline and signal before awaits", async () => {
    const raw = input(), originalSignal = new AbortController(), c = { ...context(), signal: originalSignal.signal }, original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (...args) => { raw.actor.userId = "other"; c.deadlineAt = 0; c.signal = new AbortController().signal; return original(...args); });
    expect(await read(raw, env(), c)).toHaveProperty("outcome", "PENDING_RESULT"); expect(db.query.mock.calls[1][3]).toBe("owner");
  });
  it("retains original abort signal through final query", async () => {
    const ac = new AbortController(), original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (...args) => { const out = await original(...args); if (String(args[0]).includes("clock_timestamp() AS now")) ac.abort(); return out; });
    await expect(read(input(), env(), { ...context(), signal: ac.signal })).rejects.toThrow("RESULT_UNAVAILABLE");
  });
  it("copies result and Date rows before the final await", async () => {
    confirmed(); const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (...args) => { if (String(args[0]).includes("clock_timestamp() AS now")) { f.approval.approvedAt.setTime(0); (f.op.result as { receipt: { providerEventId: string } }).receipt.providerEventId = "wrong"; } return original(...args); });
    expect(await read(input(), env(), context())).toMatchObject({ outcome: "CONFIRMED", approvedAt: new Date(baseTime).toISOString() });
  });
  it("copies operation state before the approval lookup await", async () => {
    confirmed(); const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (...args) => { if (String(args[0]).includes('FROM "PersonalSmsCorrelatedCalendarApproval"')) {
      (f.op.result as { receipt: { providerEventId: string } }).receipt.providerEventId = "changed-after-read";
    } return original(...args); });
    expect(await read(input(), env(), context())).toHaveProperty("outcome", "CONFIRMED");
  });
  it("refuses a backwards DB clock, not a fabricated historical timestamp", async () => { f.now = new Date(baseTime - 10000); await refused(); });
  it("does not publish if deadline expires while transaction acknowledgment returns", async () => {
    db.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: db.query }); vi.mocked(Date.now).mockReturnValue(baseTime + 10000); return out; }); await refused();
  });
  it("does not publish if original signal aborts during transaction acknowledgment", async () => {
    const ac = new AbortController(); db.transaction.mockImplementation(async work => { const out = await work({ $queryRawUnsafe: db.query }); ac.abort(); return out; });
    await expect(read(input(), env(), { ...context(), signal: ac.signal })).rejects.toThrow("RESULT_UNAVAILABLE");
  });
  it.each(["discovery", "owner", "review", "operation"])("missing %s is opaque unavailable, not NOT_ATTEMPTED", async row => {
    const original = db.query.getMockImplementation()!;
    const needles = { discovery: 'v.id AS "reviewId"', owner: 'FROM "ConstructionWorkspace"', review: 'SELECT v.id,v."workspaceId"', operation: 'FROM "PersonalAssistantOperation"' };
    db.query.mockImplementation(async (...args) => String(args[0]).includes(needles[row as keyof typeof needles]) ? [] : original(...args)); await refused();
  });
  it("rejects an already expired or cancelled caller before DB", async () => {
    await expect(read(input(), env(), { deadlineAt: baseTime })).rejects.toThrow("RESULT_UNAVAILABLE");
    const ac = new AbortController(); ac.abort(); await expect(read(input(), env(), { ...context(), signal: ac.signal })).rejects.toThrow("RESULT_UNAVAILABLE"); expect(db.transaction).not.toHaveBeenCalled();
  });
  it("does not invoke active source or credential loaders", () => {
    const source = readFileSync("src/server/personal-assistant/correlated-calendar-approval-result.ts", "utf8");
    expect(source).not.toMatch(/loadCorrelatedPersonalReceiptSubject|googleTokensForOwner|executeClaimed|\.fetch\(|temporalLockSourceNamespace|ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED/);
  });
});
