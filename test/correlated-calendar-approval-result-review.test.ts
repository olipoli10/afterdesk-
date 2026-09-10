import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: db.tx } }));
import { readCorrelatedCalendarApprovalResult as read } from "@/server/personal-assistant/correlated-calendar-approval-result";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { fingerprintCorrelatedCalendarApprovalView } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

const now = "2026-09-11T04:02:00.000Z", expiry = "2026-09-11T04:08:00.000Z", lease = "2026-09-11T04:02:20.000Z";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// Real pure historical proof/fingerprint, SQL results mocked. No evidence that
// these synthetic approval choices came from a human or any provider.
function fixture() {
  const f = correlatedReceiptFixture(), reference = buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
  const actor = { workspaceId: "workspace", userId: "owner" }, reviewId = "review-e\u0301-🛠️";
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId };
  const review = { id: reviewId, ...actor, receiptId: "receipt", clarificationId: "question", namespace: "b".repeat(64), calendarOperationId: "operation",
    calendarRequestId: request.requestId, calendarRequestHash: hash(JSON.stringify(request)), connectorAccountId: "calendar", accountVersion: 1,
    packetHash: reference.packetHash, proofHash: reference.proofHash, proof: reference.proof, reviewVersion: "personal-sms-correlated-calendar-review-v1",
    createdAt: new Date(now), preparationExpiresAt: new Date(expiry), pilotExpiresAt: new Date("2026-10-10T01:18:26.000Z") };
  const view = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: actor,
    review: { reviewId, receiptId: review.receiptId, reviewVersion: review.reviewVersion, packetHash: review.packetHash, proofHash: review.proofHash },
    request: { calendarRequestId: request.requestId, calendarRequestHash: review.calendarRequestHash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "old-credential", writeGrantId: "old-grant", writeGrantVersion: 1,
    memberId: "historical-member", memberRole: "owner", memberUpdatedAt: now, workspaceUpdatedAt: now,
    accountScopes: ["https://www.googleapis.com/auth/calendar.events"], grantScopes: ["https://www.googleapis.com/auth/calendar.events"] };
  const approval = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reviewId, calendarOperationId: "operation", ...actor,
    approvalToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fingerprintVersion: "personal-correlated-calendar-approval-view-v1", reviewFingerprint: view.fingerprint,
    approvedAt: new Date(now), approvalExpiresAt: new Date(expiry), leaseUntil: new Date(lease), writeAuthority: authority };
  const origin = { kind: "personal_sms_temporal_receipt", approvalId: approval.id, reviewId, reviewFingerprint: view.fingerprint };
  const state = { version: "personal-correlated-calendar-write-state-v1", origin, phase: "CONFIRMED", automaticRetry: false,
    receipt: { confirmed: true, providerEventId: deterministicGoogleEventId({ workspaceId: actor.workspaceId, calendarItemId: request.requestId, idempotencyKey: request.requestId }) } };
  const operation = { id: "operation", workspaceId: actor.workspaceId, createdByUserId: actor.userId, connectorAccountId: "calendar", kind: "calendar_write",
    status: "completed", attempts: 1, leaseUntil: null as Date | null, result: state as unknown, request, requestHash: review.calendarRequestHash,
    idempotencyKey: `personal-calendar:workspace:${request.requestId}`, correlatedTemporalReceiptId: "receipt", sourcePersonalOperationId: null,
    modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null, externalTransportPerformed: true,
    linkedReviewId: reviewId, linkedReceiptId: "receipt", linkedWorkspaceId: "workspace", linkedUserId: "owner" };
  const owner = { workspaceId: "workspace", ownerUserId: "owner", memberId: "current-member", memberUserId: "owner", memberRole: "owner",
    workspaceUpdatedAt: new Date("2027-01-01T00:00:00.000Z"), memberUpdatedAt: new Date("2027-01-01T00:00:00.000Z") };
  const runtime = { approvals: [approval] as unknown[], owners: [owner] as unknown[], clock: new Date("2027-01-01T00:00:01.000Z"), hook: async (_stage: string) => { void _stage; } };
  const env = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "false",
    ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "false", ENDVERA_GOOGLE_OAUTH_ENABLED: "DISABLED", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "EXPIRED_NOT_REQUIRED" };
  db.query.mockImplementation(async (sql: string) => {
    const stage = sql.includes("set_config") ? "setup" : sql.includes("pg_advisory") ? "namespace" : sql.includes('v.id AS "reviewId"') ? "discover"
      : sql.includes('FROM "ConstructionWorkspace"') ? "owner" : sql.includes('SELECT v.id,v.') ? "review"
      : sql.includes('FROM "PersonalAssistantOperation"') ? "operation" : sql.includes('FROM "PersonalSmsCorrelatedCalendarApproval"') ? "approval" : "clock";
    await runtime.hook(stage);
    if (stage === "setup" || stage === "namespace") return [];
    if (stage === "discover") return [{ reviewId, clarificationId: "question", namespace: review.namespace }];
    if (stage === "owner") return runtime.owners;
    if (stage === "review") return [review];
    if (stage === "operation") return [operation];
    if (stage === "approval") return runtime.approvals;
    return [{ now: runtime.clock }];
  });
  db.tx.mockImplementation(work => work({ $queryRawUnsafe: db.query }));
  const input = { enabled: true, actor, reviewId }, context = { deadlineAt: Date.now() + 5000, signal: undefined as AbortSignal | undefined };
  return { input, context, env, runtime, review, operation, approval, owner, state, run: () => read(input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:01.000Z")); });
afterEach(() => vi.restoreAllMocks());
const error = "CORRELATED_CALENDAR_APPROVAL_RESULT_UNAVAILABLE";

describe("C3 peer historical result — synthetic database boundary", () => {
  it("preserves NFD+surrogates in historical identity with only REVIEW, no expired evidence read", async () => {
    const h = fixture(), result = await h.run();
    expect(result).toMatchObject({ outcome: "CONFIRMED", reviewId: h.input.reviewId, providerStateVerified: false, confirmationBasis: "DURABLE_RECORDED_RESULT" });
    const sql = db.query.mock.calls.map(call => call[0]).join("\n");
    expect(sql).not.toMatch(/ConstructionConnector|ModelGateway|q\.prepared|q\.waiting|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
    expect(JSON.stringify(result)).not.toMatch(/inspection|source-a|source-b|credential|approvalToken|writeAuthority/);
  });
  it("an NFC-normalized operation lineage cannot silently replace the stored NFD review identity", async () => {
    const h = fixture(); h.operation.linkedReviewId = h.input.reviewId.normalize("NFC"); await expect(h.run()).rejects.toThrow(error);
  });
  it("new member metadata is allowed for the same owner but an admin is not the owner", async () => {
    const h = fixture(); await expect(h.run()).resolves.toHaveProperty("outcome", "CONFIRMED");
    h.owner.memberRole = "admin"; await expect(h.run()).rejects.toThrow(error);
  });
  it("globally orphaned approval is unavailable, not an unattempted draft", async () => {
    const h = fixture(); Object.assign(h.operation, { status: "pending", attempts: 0, result: null, externalTransportPerformed: false });
    h.runtime.approvals = [{ ...h.approval, reviewId: "foreign", workspaceId: "foreign" }];
    await expect(h.run()).rejects.toThrow(error);
  });
  it("captures the confirmed JSON before a later await mutates the returned database object", async () => {
    const h = fixture(), expected = structuredClone(h.state.receipt);
    h.runtime.hook = async stage => { if (stage === "approval") { h.state.receipt.providerEventId = `e${"0".repeat(31)}`; } };
    await expect(h.run()).resolves.toHaveProperty("receipt", expected);
  });
  it("late REVIEW withdrawal after a resolved callback cannot disclose a receipt", async () => {
    const h = fixture(); db.tx.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: db.query }); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false"; return result; });
    await expect(h.run()).rejects.toThrow(error); expect(db.tx).toHaveBeenCalledOnce();
  });
  it("lost transaction acknowledgement is opaque and never retries", async () => {
    const h = fixture(); db.tx.mockImplementation(async work => { await work({ $queryRawUnsafe: db.query }); throw new Error("PRIVATE_SQL_OR_CREDENTIAL_DETAILS"); });
    await expect(h.run()).rejects.toThrow(new Error(error)); expect(db.tx).toHaveBeenCalledOnce();
  });
  it("abort at commit is retained even when caller replaces its context signal", async () => {
    const h = fixture(), c = new AbortController(); h.context.signal = c.signal;
    db.tx.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: db.query }); h.context.signal = undefined; c.abort(); return result; });
    await expect(h.run()).rejects.toThrow(error);
  });
  it("a stored future approval instant cannot be published as a past observation", async () => {
    const h = fixture(); h.runtime.clock = new Date(Date.parse(now) - 1); h.owner.memberUpdatedAt = new Date(Date.parse(now) - 2); h.owner.workspaceUpdatedAt = new Date(Date.parse(now) - 2);
    await expect(h.run()).rejects.toThrow(error);
  });
  it("strict result output carries only a durable recorded receipt and no replay handle", async () => {
    const h = fixture(), result = await h.run();
    expect(Object.keys(result).sort()).toEqual(["version", "workspaceId", "reviewId", "observedAt", "readOnly", "approvalAvailable", "executionAuthorized", "automaticRetry", "providerStateVerified", "outcome", "approvedAt", "confirmationBasis", "receipt"].sort());
    expect(Object.isFrozen(result)).toBe(true);
    if (!("receipt" in result)) throw new Error("EXPECTED_RECEIPT"); expect(Object.isFrozen(result.receipt)).toBe(true);
    expect(h.review.proofHash).toBe(hash(canonicalJson(h.review.proof)));
  });
});
