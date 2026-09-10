import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subject: vi.fn(), item: vi.fn(), tokens: vi.fn(), effect: vi.fn() }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: m.subject }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-projection", () => ({ loadCorrelatedPersonalCalendarReviewInTransaction: m.item }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: m.tokens }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.effect } }));
import { inspectCorrelatedCalendarApprovalOfferInTransaction as offer, lockCorrelatedCalendarApprovalWriteInTransaction as writeGate } from "@/server/personal-assistant/correlated-calendar-approval-gate";
import { correlatedCalendarApprovalClaimSchema, CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION, CORRELATED_CALENDAR_APPROVAL_STATE_VERSION,
  CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { GOOGLE_CALENDAR_READ_SCOPE as READ, GOOGLE_CALENDAR_WRITE_SCOPE as WRITE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

const now = "2026-09-11T04:02:00.000Z", expires = "2026-09-11T04:08:00.000Z", pilot = "2026-10-10T01:18:26.000Z";
function fixture() {
  const f = correlatedReceiptFixture(), packet = { packet: f.packet, packetHash: f.packetHash };
  const reference = buildCorrelatedCalendarReferenceProof(f.durable, packet), proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet);
  const actor = { workspaceId: "workspace", userId: "owner" }, input = { enabled: true as const, actor, reviewId: "review" };
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", actor: { ...actor }, subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" },
    reference, proof, preparationContext: { connectorAccountId: "calendar", accountVersion: 1, questionExpiresAt: expires, pilotExpiresAt: pilot }, inspectedAt: now };
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId }, requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const row = { reviewId: "review", receiptId: "receipt", ...actor, calendarOperationId: "operation", connectorAccountId: "calendar", accountVersion: 1,
    calendarRequestId: request.requestId, calendarRequestHash: requestHash, packetHash: reference.packetHash, proofHash: reference.proofHash,
    reviewVersion: "personal-sms-correlated-calendar-review-v1", preparationExpiresAt: new Date(expires), pilotExpiresAt: new Date(pilot), createdAt: new Date(now),
    reviewCommitted: true, operationCommitted: true, operationWorkspaceId: "workspace", operationUserId: "owner", operationAccountId: "calendar",
    kind: "calendar_write", status: "pending", attempts: 0, request, requestHash, idempotencyKey: `personal-calendar:workspace:${request.requestId}`,
    correlatedTemporalReceiptId: "receipt", leaseUntil: null as Date | null, result: null as unknown, externalTransportPerformed: false,
    sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null };
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
    memberUpdatedAt: new Date("2026-09-10T02:00:00.000Z"), workspaceUpdatedAt: new Date("2026-09-10T02:00:00.000Z"), accountScopes: [WRITE] as string[], grantScopes: [WRITE] as string[],
    readGrantId: "read", readGrantVersion: 1, readGrantScopes: [READ] as string[] };
  const resolution = proof.resolution;
  const review = { version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: now, preparedAt: now, preparationExpiresAt: expires,
    currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
    evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
      sources: resolution.sources.map((source, index) => ({ role: index === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY", operationId: source.operationId, requestHash: source.requestHash, text: source.body, receivedAt: source.receivedAt })),
      citations: structuredClone(resolution.citations), anchorReceivedAt: resolution.anchorReceivedAt, clarifiedSlot: resolution.evidence.slot, draft: reference.proof.draft } };
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const order: string[] = [], state = { discovery: [{ receiptId: "receipt" }] as unknown[], authorities: [authority] as unknown[], rows: [row] as unknown[], approvals: [] as unknown[],
    clock: new Date(now), isolation: "serializable", hook: async (_stage: string) => { void _stage; } };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts"
      : sql.startsWith('SELECT "receiptId"') ? "discovery" : sql.startsWith("SELECT a.id") ? "authority"
      : sql.startsWith("SELECT r.id") ? "row" : sql.startsWith("SELECT id,") ? "approval" : "clock";
    order.push(stage); await state.hook(stage);
    expect(sql).toMatch(/^SELECT /); expect(sql).not.toMatch(/\b(?:INSERT|DELETE|TRUNCATE)\b/);
    if (stage === "isolation") return [{ isolation: state.isolation }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") { expect(args).toEqual(["review", "workspace", "owner"]); expect(sql).not.toMatch(/FOR (SHARE|UPDATE)/); return state.discovery; }
    if (stage === "authority") { expect(args).toEqual(["workspace", "owner", "calendar", WRITE, READ]); return state.authorities; }
    if (stage === "row") return state.rows;
    if (stage === "approval") return state.approvals;
    return [{ now: state.clock }];
  });
  m.subject.mockImplementation(async (_tx, _input, _env, c) => { order.push("subject"); expect(c.deadlineAt).toBeLessThanOrEqual(context.deadlineAt); await state.hook("subject"); return subject; });
  m.item.mockImplementation(async (_tx, _input, _env, c) => { order.push("item"); expect(c.deadlineAt).toBeLessThanOrEqual(context.deadlineAt); await state.hook("item"); return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review }; });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: m.effect, personalAssistantOperation: { updateMany: m.effect, create: m.effect } } as unknown as TemporalRegistryDB;
  const context = { deadlineAt: Date.now() + 5000, signal: undefined as AbortSignal | undefined };
  const run = () => offer(tx, input, env, context);
  async function claimed(phase: "CLAIMED" | "DISPATCH_CLAIMED" = "CLAIMED") {
    const initial = await run(); if (initial.status === "DISABLED") throw new Error("disabled");
    const claim = correlatedCalendarApprovalClaimSchema.parse({ version: CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION,
      origin: { kind: "personal_sms_temporal_receipt", approvalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reviewId: "review", reviewFingerprint: initial.fingerprint },
      userId: "owner", workspaceId: "workspace", operationId: "operation", expectedRequestHash: requestHash, request, authority: initial.authority,
      approvalToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", approvedAt: now, approvalExpiresAt: expires, leaseUntil: "2026-09-11T04:02:20.000Z" });
    Object.assign(row, { status: "processing", attempts: 1, leaseUntil: new Date(claim.leaseUntil), result: { version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION,
      origin: claim.origin, approvedBy: claim.userId, approvedHash: claim.expectedRequestHash, approvalToken: claim.approvalToken, writeAuthority: claim.authority, phase, dispatchStarted: phase === "DISPATCH_CLAIMED" } });
    review.currentStatus = "processing";
    const approval = { id: claim.origin.approvalId, reviewId: "review", calendarOperationId: "operation", workspaceId: "workspace", userId: "owner",
      approvalToken: claim.approvalToken, fingerprintVersion: CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, reviewFingerprint: initial.fingerprint,
      approvedAt: new Date(now), approvalExpiresAt: new Date(expires), leaseUntil: new Date(claim.leaseUntil), writeAuthority: claim.authority, approvalCommitted: true };
    state.approvals = [approval]; order.length = 0;
    return { claim, approval, run: () => writeGate(tx, claim, env, context, phase) };
  }
  return { run, claimed, tx, input, state, row, authority, review, subject, context, env, query, order };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { expect(m.tokens).not.toHaveBeenCalled(); expect(m.effect).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("C2a read-only gate — synthetic SQL mocks, real pure receipt/contracts", () => {
  it("inspects complete offer, original deadline, READ+WRITE before calendar and no authority or mutation", async () => {
    const h = fixture(), result = await h.run();
    expect(h.order).toEqual(["isolation", "timeouts", "discovery", "subject", "authority", "item", "row", "approval", "clock"]);
    expect(result).toMatchObject({ status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, persistencePerformed: false,
      providerCallPerformed: false, review: h.review, readPrerequisite: { readGrantId: "read" }, authority: { memberRole: "owner" } });
    if (result.status === "DISABLED") throw new Error("disabled");
    expect(Object.isFrozen(result.review.evidence.sources[0])).toBe(true); expect(Object.isFrozen(result.authority.accountScopes)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/synthetic|ciphertext|accessToken|refreshToken/);
  });
  it.each([undefined, "false", "TRUE", "1"])("exact approval flag %s refuses before query", async value => { const h = fixture(); if (value === undefined) delete h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED; else h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED = value;
    expect(await h.run()).toHaveProperty("status", "DISABLED"); expect(h.query).not.toHaveBeenCalled(); });
  it("requires explicit opt-in and caller transaction", async () => { const h = fixture(); h.input.enabled = false as true; expect(await h.run()).toHaveProperty("status", "DISABLED");
    h.input.enabled = true; await expect(offer({ ...h.tx, $transaction: m.effect } as unknown as TemporalRegistryDB, h.input, h.env, h.context)).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled(); });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_GOOGLE_OAUTH_ENABLED", "ENDVERA_EXTERNAL_TRANSPORT_ENABLED"])("requires %s before discovery", async key => {
    const h = fixture(); h.env[key] = "false"; await expect(h.run()).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled(); });
  it.each([0, NaN, Infinity])("rejects invalid absolute deadline %s", async value => { const h = fixture(); h.context.deadlineAt = value; await expect(h.run()).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled(); });
  it("aborted request and wrong isolation never discover", async () => { const h = fixture(); const c = new AbortController(); c.abort(); h.context.signal = c.signal; await expect(h.run()).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled();
    h.context.signal = undefined; h.state.isolation = "read committed"; await expect(h.run()).rejects.toThrow("SERIALIZABLE"); expect(h.order).toEqual(["isolation"]); });
  it.each(["discovery", "authorities", "rows"] as const)("missing/duplicate %s fails closed", async key => { const h = fixture(), original = h.state[key][0]; h.state[key] = []; await expect(h.run()).rejects.toThrow(); h.state[key] = [original, original]; await expect(h.run()).rejects.toThrow(); });
  it.each(["admin", "member"])("refuses %s membership", async role => { const h = fixture(); h.authority.memberRole = role; await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("item"); });
  it.each(["accountScopes", "grantScopes", "readGrantScopes"] as const)("missing required scope in %s cannot borrow another grant", async key => { const h = fixture(); h.authority[key] = ["openid"]; await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("item"); });
  it("full calendar READ grant is accepted in addition to explicit readonly", async () => { const h = fixture(); h.authority.readGrantScopes = [WRITE]; await expect(h.run()).resolves.toHaveProperty("fingerprint"); });
  it.each(["accountId", "accountVersion"])("refuses authority subject mismatch %s", async key => { const h = fixture(); Object.assign(h.authority, { [key]: key === "accountVersion" ? 2 : "foreign" }); await expect(h.run()).rejects.toThrow(); });
  it.each(["reviewCommitted", "operationCommitted"])("requires pre-snapshot committed %s", async key => { const h = fixture(); Object.assign(h.row, { [key]: false }); await expect(h.run()).rejects.toThrow(); });
  it.each(["status", "attempts", "leaseUntil", "result", "externalTransportPerformed"])("offer refuses previous effect state %s", async key => { const h = fixture(); const values = { status: "processing", attempts: 1, leaseUntil: new Date(now), result: {}, externalTransportPerformed: true }; Object.assign(h.row, { [key]: values[key as keyof typeof values] }); await expect(h.run()).rejects.toThrow(); });
  it("global approval presence blocks offer even if foreign", async () => { const h = fixture(); h.state.approvals = [{ workspaceId: "foreign" }]; await expect(h.run()).rejects.toThrow(); });
  it.each(["operationWorkspaceId", "operationUserId", "operationAccountId", "requestHash", "packetHash", "proofHash", "calendarRequestId", "correlatedTemporalReceiptId", "idempotencyKey"])("refuses immutable operation/review %s drift", async key => {
    const h = fixture(); Object.assign(h.row, { [key]: key.endsWith("Hash") ? "a".repeat(64) : "foreign" }); await expect(h.run()).rejects.toThrow(); });
  it.each(["sourcePersonalOperationId", "modelGatewayOperationId", "budgetId", "reservedCadMicros"])("rejects mixed origin %s", async key => { const h = fixture(); Object.assign(h.row, { [key]: "unexpected" }); await expect(h.run()).rejects.toThrow(); });
  it.each(["sources", "citations", "anchor", "slot"])("compares complete shown evidence: %s", async field => { const h = fixture();
    if (field === "sources") h.review.evidence.sources[1].text += " changed";
    if (field === "citations") h.review.evidence.citations.answer.quote += " changed";
    if (field === "anchor") h.review.evidence.anchorReceivedAt = now;
    if (field === "slot") h.review.evidence.clarifiedSlot = "END";
    await expect(h.run()).rejects.toThrow(); });
  it.each(["subject", "authority", "item", "row", "approval", "clock"])("rechecks OFF after %s await", async stage => { const h = fixture(); h.state.hook = async current => { if (current === stage) h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED = "false"; }; await expect(h.run()).rejects.toThrow(); });
  it("does not renew a short original deadline", async () => { const h = fixture(); h.context.deadlineAt = Date.now() + 100; h.state.hook = async stage => { if (stage === "subject") vi.setSystemTime(Date.now() + 101); }; await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("authority"); });
  it.each([100, 5000])("wall-clock rollback cannot extend original monotone budget %sms", async budget => {
    let elapsed = 1000; const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    try { const h = fixture(); h.context.deadlineAt = Date.now() + budget;
      h.state.hook = async stage => { if (stage === "clock") { elapsed += budget + 1; vi.setSystemTime(Date.now() - 3600000); } };
      await expect(h.run()).rejects.toThrow();
    } finally { clock.mockRestore(); }
  });
  it.each([expires, "2026-09-11T04:01:59.999Z"])("rejects expired/backward final DB clock %s", async value => { const h = fixture(); h.state.clock = new Date(value); await expect(h.run()).rejects.toThrow(); });
  it("copies input/authority/item before subsequent awaits", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "authority") h.input.actor.userId = "mutated"; if (stage === "clock") { h.authority.memberUpdatedAt.setTime(0); h.review.evidence.sources[0].text = "mutated"; } };
    const result = await h.run(); expect(result).toMatchObject({ actor: { userId: "owner" }, authority: { memberUpdatedAt: "2026-09-10T02:00:00.000Z" } });
    if (result.status === "DISABLED") throw new Error("disabled"); expect(result.review.evidence.sources[0].text).not.toBe("mutated"); });
  it.each(["CLAIMED", "DISPATCH_CLAIMED"] as const)("reloads exact durable %s claim without mutation", async phase => { const h = fixture(), claimed = await h.claimed(phase); const result = await claimed.run();
    expect(result).toMatchObject({ claim: claimed.claim, expectedPhase: phase, executionAuthorized: false });
    expect(h.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE OF o FOR SHARE OF r"))).toBe(true); });
  it.each(["id", "approvalToken", "reviewFingerprint", "workspaceId", "calendarOperationId", "leaseUntil", "approvalCommitted"])("rejects altered approval %s", async key => { const h = fixture(), claimed = await h.claimed();
    Object.assign(claimed.approval, { [key]: key === "approvalCommitted" ? false : key === "leaseUntil" ? new Date(now) : "foreign" }); await expect(claimed.run()).rejects.toThrow(); });
  it("rejects changed current authority and wrong expected phase", async () => { const h = fixture(), claimed = await h.claimed(); h.authority.credentialId = "changed"; await expect(claimed.run()).rejects.toThrow();
    h.authority.credentialId = "credential"; await expect(writeGate(h.tx, claimed.claim, h.env, h.context, "DISPATCH_CLAIMED")).rejects.toThrow(); });
  it("requires unexpired exact lease at final clock", async () => { const h = fixture(), claimed = await h.claimed(); h.state.clock = new Date(claimed.claim.leaseUntil); await expect(claimed.run()).rejects.toThrow(); });
  it("does not adopt result phase changed in memory during approval lookup", async () => {
    const h = fixture(), claimed = await h.claimed();
    const state = h.row.result as { phase: string; dispatchStarted: boolean };
    Object.assign(state, { phase: "DISPATCH_CLAIMED", dispatchStarted: true });
    h.state.hook = async stage => { if (stage === "approval") Object.assign(state, { phase: "CLAIMED", dispatchStarted: false }); };
    await expect(claimed.run()).rejects.toThrow();
  });
  it("raw SQL names, global lookup and metadata-only columns are explicit", () => { const source = readFileSync("src/server/personal-assistant/correlated-calendar-approval-gate.ts", "utf8");
    expect(source).toContain('WHERE "reviewId"=$1 OR "calendarOperationId"=$2 FOR SHARE');
    expect(source).toContain('w."ownerUserId"=$2'); expect(source).toContain("rg.capability='calendar_read'"); expect(source).toContain("wg.capability='calendar_write'");
    expect(source).toContain("sms_correlated_approval_pre_snapshot(o.xmin)");
    expect(source).not.toMatch(/SELECT \*|\$executeRaw|\bINSERT INTO|\.updateMany\(|\.create\(|googleTokensForOwner|insertEvent\(|\bdecrypt\(|ciphertext|accessToken|refreshToken|from ["'][^"']*calendar-actions/);
  });
  it("loads the real gate and both reader graphs without module preloader mocks; OFF performs no query", async () => {
    vi.doUnmock("@/server/model-gateway/personal-intent/correlated-receipt-subject");
    vi.doUnmock("@/server/model-gateway/personal-intent/correlated-calendar-projection");
    vi.doUnmock("@/server/personal-assistant/google-connection"); vi.doUnmock("@/lib/db"); vi.resetModules();
    const real = await import("@/server/personal-assistant/correlated-calendar-approval-gate");
    const query = vi.fn(() => { throw new Error("UNEXPECTED_QUERY"); });
    expect(await real.inspectCorrelatedCalendarApprovalOfferInTransaction({ $queryRawUnsafe: query } as unknown as TemporalRegistryDB,
      { enabled: true, actor: { userId: "owner", workspaceId: "workspace" }, reviewId: "review" }, {}, { deadlineAt: Date.now() + 5000 })).toHaveProperty("status", "DISABLED");
    expect(query).not.toHaveBeenCalled(); expect(real.lockCorrelatedCalendarApprovalWriteInTransaction).toBeTypeOf("function");
  });
});
