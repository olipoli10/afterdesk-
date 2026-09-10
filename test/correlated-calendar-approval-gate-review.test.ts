import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ subject: vi.fn(), item: vi.fn(), effect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.effect } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: mocks.subject }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-projection", () => ({ loadCorrelatedPersonalCalendarReviewInTransaction: mocks.item }));
import { inspectCorrelatedCalendarApprovalOfferInTransaction as inspect } from "@/server/personal-assistant/correlated-calendar-approval-gate";
import { lockCorrelatedCalendarApprovalWriteInTransaction as writeGate } from "@/server/personal-assistant/correlated-calendar-approval-gate";
import { correlatedCalendarApprovalClaimSchema } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { GOOGLE_CALENDAR_READ_SCOPE as READ, GOOGLE_CALENDAR_WRITE_SCOPE as WRITE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

const now = "2026-09-11T04:02:00.000Z", expiry = "2026-09-11T04:08:00.000Z", pilot = "2026-10-10T01:18:26.000Z";
// Independent fixture: real closed two-source proof builders, mocked durable
// readers and database boundary. It is not authentication or PostgreSQL evidence.
function fixture() {
  const f = correlatedReceiptFixture(), packet = { packet: f.packet, packetHash: f.packetHash };
  const proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet), reference = buildCorrelatedCalendarReferenceProof(f.durable, packet);
  const actor = { workspaceId: "workspace", userId: "owner" }, input = { enabled: true, actor, reviewId: "review" };
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", actor, subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" },
    reference, proof, inspectedAt: now, preparationContext: { connectorAccountId: "calendar", accountVersion: 1, questionExpiresAt: expiry, pilotExpiresAt: pilot } };
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId }, hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const row = { reviewId: "review", receiptId: "receipt", ...actor, calendarOperationId: "operation", connectorAccountId: "calendar", accountVersion: 1,
    calendarRequestId: reference.requestId, calendarRequestHash: hash, packetHash: reference.packetHash, proofHash: reference.proofHash,
    reviewVersion: "personal-sms-correlated-calendar-review-v1", preparationExpiresAt: new Date(expiry), pilotExpiresAt: new Date(pilot), createdAt: new Date(now),
    reviewCommitted: true, operationCommitted: true, operationWorkspaceId: "workspace", operationUserId: "owner", operationAccountId: "calendar", kind: "calendar_write",
    status: "pending", attempts: 0, request, requestHash: hash, idempotencyKey: `personal-calendar:workspace:${reference.requestId}`, correlatedTemporalReceiptId: "receipt",
    leaseUntil: null, result: null, externalTransportPerformed: false, sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null };
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1,
    memberId: "member", memberRole: "owner", memberUpdatedAt: new Date(now), workspaceUpdatedAt: new Date(now), accountScopes: [WRITE], grantScopes: [WRITE],
    readGrantId: "read", readGrantVersion: 1, readGrantScopes: [READ] };
  const r = proof.resolution;
  const review = { version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: now, preparedAt: now, preparationExpiresAt: expiry,
    currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
    evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
      sources: r.sources.map((s, i) => ({ role: i === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY", operationId: s.operationId, requestHash: s.requestHash, text: s.body, receivedAt: s.receivedAt })),
      citations: structuredClone(r.citations), anchorReceivedAt: r.anchorReceivedAt, clarifiedSlot: r.evidence.slot, draft: reference.proof.draft } };
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "SYNTHETIC", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "SYNTHETIC", GOOGLE_CLIENT_SECRET: "SYNTHETIC",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const context = { deadlineAt: Date.now() + 5000, signal: undefined as AbortSignal | undefined };
  const state = { hook: async (_stage: string) => { void _stage; }, approvals: [] as unknown[], clock: new Date(now) };
  const query = vi.fn(async (sql: string) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts"
      : sql.startsWith('SELECT "receiptId"') ? "discovery" : sql.startsWith("SELECT a.id") ? "authority" : sql.startsWith("SELECT r.id") ? "row" : sql.startsWith("SELECT id,") ? "approval" : "clock";
    await state.hook(stage);
    if (stage === "isolation") return [{ isolation: "serializable" }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") return [{ receiptId: "receipt" }];
    if (stage === "authority") return [authority];
    if (stage === "row") return [row];
    if (stage === "approval") return state.approvals;
    return [{ now: state.clock }];
  });
  mocks.subject.mockResolvedValue(subject); mocks.item.mockResolvedValue({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: mocks.effect } as unknown as TemporalRegistryDB;
  return { state, row, authority, review, context, env, query, tx, run: () => inspect(tx, input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { expect(mocks.effect).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("C2a independent gate counter-tests — SQL mocks, no native/provider", () => {
  it("positive keeps both exact Unicode texts and immutable read-only output", async () => {
    const h = fixture(), result = await h.run();
    expect(result).toMatchObject({ status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, review: h.review });
    if (result.status === "DISABLED") throw new Error("UNEXPECTED_DISABLED");
    expect(Object.isFrozen(result.review.evidence.citations.answer)).toBe(true);
    expect(result.review.approvalAvailable).toBe(false);
  });
  it.each([
    ["ENDVERA_EXTERNAL_AUTHORITY_REF", "OTHER_NONEMPTY_AUTHORITY"],
    ["ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "2026-10-11T01:18:26Z"],
  ])("refuses late canonical configuration change %s after the final DB await", async (key, value) => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "clock") h.env[key] = value; };
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED");
  });
  it("does not borrow a WRITE scope as a missing READ grant", async () => {
    const h = fixture(); Object.assign(h.authority, { readGrantId: "", readGrantScopes: [] });
    await expect(h.run()).rejects.toThrow(); expect(mocks.item).not.toHaveBeenCalled();
  });
  it.each(["reviewCommitted", "operationCommitted"])("truthy uncommitted marker %s is not true", async key => {
    const h = fixture(); Object.assign(h.row, { [key]: "true" }); await expect(h.run()).rejects.toThrow();
  });
  it("a globally discovered foreign approval blocks the offer without interpreting its JSON", async () => {
    const h = fixture(); h.state.approvals = [{ reviewId: "foreign", calendarOperationId: "operation", result: { phase: "CONFIRMED" } }];
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED");
    expect(h.query.mock.calls.some(([sql]) => sql.includes('WHERE "reviewId"=$1 OR "calendarOperationId"=$2'))).toBe(true);
  });
  it("rejects two individually plausible source texts exchanged without changing draft", async () => {
    const h = fixture(), [a,b] = h.review.evidence.sources; [a.text,b.text] = [b.text,a.text];
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED");
  });
  it("an abort during the last DB clock never returns a provisional offer", async () => {
    const h = fixture(), c = new AbortController(); h.context.signal = c.signal;
    h.state.hook = async stage => { if (stage === "clock") { h.context.signal = undefined; c.abort(); } };
    await expect(h.run()).rejects.toThrow("TEMPORAL_REGISTRY_DEADLINE_OR_DISABLED");
  });
  it("final clock must not move behind already inspected data", async () => {
    const h = fixture(); h.state.clock = new Date(Date.parse(now) - 1);
    await expect(h.run()).rejects.toThrow("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED");
  });
  it("a valid claim state is captured before mutation of its raw row during approval lookup", async () => {
    const h = fixture(), offered = await h.run();
    if (offered.status === "DISABLED") throw new Error("UNEXPECTED_DISABLED");
    const claim = correlatedCalendarApprovalClaimSchema.parse({ version: "personal-correlated-calendar-write-claim-v1",
      origin: { kind: "personal_sms_temporal_receipt", approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reviewId: "review", reviewFingerprint: offered.fingerprint },
      ...offered.actor, operationId: offered.operationId, expectedRequestHash: h.row.requestHash, request: offered.request, authority: offered.authority,
      approvalToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", approvedAt: now, approvalExpiresAt: expiry, leaseUntil: "2026-09-11T04:02:20.000Z" });
    const recorded = { version: "personal-correlated-calendar-write-state-v1", origin: claim.origin, phase: "CLAIMED", dispatchStarted: false,
      approvedBy: claim.userId, approvedHash: claim.expectedRequestHash, approvalToken: claim.approvalToken, writeAuthority: claim.authority };
    Object.assign(h.row, { status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil), result: recorded }); h.review.currentStatus = "processing";
    h.state.approvals = [{ id: claim.origin.approvalId, reviewId: "review", calendarOperationId: claim.operationId, ...offered.actor,
      approvalToken: claim.approvalToken, fingerprintVersion: "personal-correlated-calendar-approval-view-v1", reviewFingerprint: offered.fingerprint,
      approvedAt: new Date(now), approvalExpiresAt: new Date(expiry), leaseUntil: new Date(claim.leaseUntil), writeAuthority: claim.authority, approvalCommitted: true }];
    h.state.hook = async stage => { if (stage === "approval") { recorded.phase = "DISPATCH_CLAIMED"; recorded.dispatchStarted = true; } };
    await expect(writeGate(h.tx, claim, h.env, h.context, "CLAIMED")).resolves.toMatchObject({ expectedPhase: "CLAIMED", executionAuthorized: false });
  });
});
