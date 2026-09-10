import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ lock: vi.fn(), current: vi.fn(), query: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-proof", () => ({ temporalRegistryLockProof: m.lock, temporalRegistryCurrentProof: m.current }));
import { loadCorrelatedPersonalReceiptSubject as load } from "@/server/model-gateway/personal-intent/correlated-receipt-subject";
import { temporalConversationNamespace, temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { correlatedReceiptFixture as fixture } from "./fixtures/personal-correlated-receipt.fixture";

const input = () => ({ enabled: true, actor: { workspaceId: "workspace", userId: "owner" }, subject: { kind: "personal_sms_temporal_receipt" as const, receiptId: "receipt" } });
const env = () => ({ ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" });
const context = () => ({ deadlineAt: Date.now() + 30_000 });
const tx = { $queryRawUnsafe: m.query } as unknown as Prisma.TransactionClient;
type Fixture = ReturnType<typeof fixture>;
let f: Fixture, q: Record<string, unknown>, receipt: Record<string, unknown>, sources: Array<Record<string, unknown>>, ledger: Record<string, unknown>;
function dbSource(source: Fixture["durable"]["answer"]["source"], result: unknown) {
  const { accountSid, messageSid, from, to, body, identityId } = source;
  return { id: source.operationId, workspaceId: source.workspaceId, createdByUserId: source.userId, connectorAccountId: "sms", kind: "personal_sms_inbound",
    status: "completed", attempts: 1, leaseUntil: null, request: { schemaVersion: 1, accountSid, messageSid, from, to, body, identityId, contentHash: source.requestHash },
    requestHash: source.requestHash, idempotencyKey: `personal-sms:${temporalSha(`${accountSid}:${messageSid}`)}`, createdAt: new Date(source.receivedAt), result };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:02:00Z")); f = fixture();
  const p = f.durable.waiting.prepared;
  q = { id: p.clarificationId, phase: "CONSUMED", consumedReplyId: "receipt", waiting: f.durable.waiting, sourceOperationId: p.source.operationId,
    acceptedAt: new Date(f.durable.waiting.questionReceipt.acceptedAt), acceptedProviderSid: f.durable.waiting.questionReceipt.acceptedProviderSid,
    expiresAt: new Date(p.expiresAt), namespace: temporalConversationNamespace(p.binding.ownerNumber, p.binding.endveraNumber) };
  receipt = { ...f.durable.receipt, clarificationId: p.clarificationId, workspaceId: p.binding.workspaceId, userId: p.binding.userId,
    sourceOperationId: f.durable.answer.source.operationId, providerSid: f.durable.answer.source.messageSid, requestHash: f.durable.answer.source.requestHash,
    packet: f.packet, packetHash: f.packetHash, receivedAt: new Date(f.durable.receipt.receivedAt), createdAt: new Date(f.durable.receipt.createdAt) };
  sources = [dbSource(f.durable.original.source, { personalModelReview: "synthetic immutable original" }), dbSource(f.durable.answer.source,
    { source: "TEMPORAL_CLARIFICATION", temporalClarificationReceiptId: "receipt", packetHash: f.packetHash, executionAuthorized: false, externalTransportPerformed: false, automaticRetry: false })];
  ledger = { id: `temporal:${p.clarificationId}`, namespace: q.namespace, kind: "TEMPORAL_CLARIFICATION", clarificationId: p.clarificationId, confirmationId: null, active: false };
  m.lock.mockImplementation(async () => q); m.current.mockResolvedValue({ binding: f.durable.currentBinding, source: f.durable.original.source, now: new Date(Date.now()) });
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.startsWith('SELECT "clarificationId"')) return [{ clarificationId: p.clarificationId }];
    if (sql.includes('FROM "PersonalSmsTemporalClarificationReply"')) return [receipt];
    if (sql.includes('FROM "PersonalAssistantOperation"')) return sources;
    if (sql.includes('FROM "PersonalSmsConversationExpectation"')) return [ledger];
    if (sql.includes("SELECT clock_timestamp() AS now")) return [{ now: new Date(Date.now()) }];
    return [];
  });
});
afterEach(() => vi.useRealTimers());
describe("OFF read-only durable correlated receipt gateway subject", () => {
  it("uses actual completed sources and current proof without a draft or new live claim", async () => {
    const result = await load(tx, input(), env(), context());
    expect(result).toMatchObject({ status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", executionAuthorized: false, persistencePerformed: false,
      providerExecutionPerformed: false, committed: false, draft: null, subject: input().subject, actor: input().actor });
    expect(m.current).toHaveBeenCalledTimes(1); expect(m.lock).toHaveBeenCalledTimes(1);
    expect(m.query.mock.calls.map(([sql]) => sql).join("\n")).not.toMatch(/INSERT|UPDATE|DELETE|status='processing'/);
    expect(m.query.mock.calls.find(([sql]) => sql.includes('FROM "PersonalAssistantOperation"'))?.[0]).toContain("AT TIME ZONE 'UTC'");
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([undefined, false])("stays OFF for enabled=%s and reads nothing", async enabled => {
    expect(await load(tx, { ...input(), enabled }, env(), context())).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(m.query).not.toHaveBeenCalled(); expect(m.lock).not.toHaveBeenCalled();
  });
  it("rejects missing scoped discovery before locking another owner", async () => {
    const old = m.query.getMockImplementation()!; m.query.mockImplementation((sql, ...args) => sql.startsWith('SELECT "clarificationId"') ? [] : old(sql, ...args));
    await expect(load(tx, input(), env(), context())).rejects.toThrow("OWNER_REQUIRED"); expect(m.lock).not.toHaveBeenCalled();
  });
  it.each(["id", "workspaceId", "userId", "clarificationId"])("receipt %s must agree after its scoped locked read", async field => {
    receipt[field] = "foreign"; await expect(load(tx, input(), env(), context())).rejects.toThrow("SCOPE_CHANGED");
  });
  it.each(["WAITING", "EXPIRED", "REFUSED"])("never turns current %s into CONSUMED", async phase => {
    q.phase = phase; await expect(load(tx, input(), env(), context())).rejects.toThrow(); expect(m.current).not.toHaveBeenCalled();
  });
  it("requires exact consumed id and inactive permanent ledger without requiring no other active question", async () => {
    q.consumedReplyId = "other"; await expect(load(tx, input(), env(), context())).rejects.toThrow("CONSUMED_BINDING_REQUIRED"); q.consumedReplyId = "receipt";
    ledger.active = true; await expect(load(tx, input(), env(), context())).rejects.toThrow("LEDGER_CHANGED");
  });
  it.each(["status", "attempts", "leaseUntil", "workspaceId", "createdByUserId", "connectorAccountId"])("completed answer %s cannot drift", async field => {
    sources[1][field] = field === "attempts" ? 2 : "other"; await expect(load(tx, input(), env(), context())).rejects.toThrow();
  });
  it("receipt/source result hash must match exact current source evidence", async () => {
    sources[1].result = { ...(sources[1].result as Record<string, unknown>), packetHash: "0".repeat(64) };
    await expect(load(tx, input(), env(), context())).rejects.toThrow("SOURCE_RESULT_CHANGED");
  });
  it.each(["CURRENT_BINDING_REQUIRED", "MODEL_AUTHORITY_CHANGED", "MODEL_EVIDENCE_CHANGED"])("propagates canonical %s refusal without alternate proof", async reason => {
    m.current.mockRejectedValue(new Error(reason)); await expect(load(tx, input(), env(), context())).rejects.toThrow(reason);
  });
  it("refuses expiry and historical acceptance mismatch", async () => {
    q.expiresAt = new Date(Date.now()); await expect(load(tx, input(), env(), context())).rejects.toThrow("EXPIRED_OR_ACCEPTANCE_CHANGED");
    q.expiresAt = new Date(f.durable.waiting.prepared.expiresAt); q.acceptedProviderSid = "SM" + "f".repeat(32);
    await expect(load(tx, input(), env(), context())).rejects.toThrow("EXPIRED_OR_ACCEPTANCE_CHANGED");
  });
  it.each(["ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("withdrawal %s after current proof refuses", async flag => {
    const flags: Record<string, string> = env(); m.current.mockImplementationOnce(async () => { flags[flag] = "disabled"; return { binding: f.durable.currentBinding, source: f.durable.original.source, now: new Date(Date.now()) }; });
    await expect(load(tx, input(), flags, context())).rejects.toThrow();
  });
  it("rechecks expiry at the last database clock after calculation", async () => {
    const old = m.query.getMockImplementation()!; let clocks = 0;
    m.query.mockImplementation((sql, ...args) => sql.includes("SELECT clock_timestamp() AS now") && ++clocks === 2 ? [{ now: new Date(f.durable.waiting.prepared.expiresAt) }] : old(sql, ...args));
    await expect(load(tx, input(), env(), context())).rejects.toThrow("CORRELATED_RECEIPT_EXPIRED");
  });
  it.each([undefined, new Date(NaN)])("requires a finite Date from the canonical current proof (%s)", async now => {
    m.current.mockResolvedValueOnce({ binding: f.durable.currentBinding, source: f.durable.original.source, now });
    await expect(load(tx, input(), env(), context())).rejects.toThrow("CURRENT_CLOCK_REQUIRED");
  });
  it("captures current proof time privately before another awaited read can mutate its Date", async () => {
    const timestamp = new Date("2026-09-11T04:03:00Z"), old = m.query.getMockImplementation()!;
    m.current.mockResolvedValueOnce({ binding: f.durable.currentBinding, source: f.durable.original.source, now: timestamp });
    m.query.mockImplementation((sql, ...args) => { if (sql.includes('FROM "PersonalAssistantOperation"')) timestamp.setTime(Date.parse("2026-09-11T04:00:00Z")); return old(sql, ...args); });
    await expect(load(tx, input(), env(), context())).rejects.toThrow("CLOCK_MOVED_BACKWARD");
  });
  it("original caller deadline and abort are checked through the current-proof await", async () => {
    const c = new AbortController(); m.current.mockImplementationOnce(async () => { c.abort(); return {}; });
    await expect(load(tx, input(), env(), { ...context(), signal: c.signal })).rejects.toThrow("DEADLINE_OR_DISABLED");
    await expect(load(tx, input(), env(), { deadlineAt: NaN })).rejects.toThrow("DEADLINE_INVALID");
  });
  it("rejects non-SERIALIZABLE transactions before discovery", async () => {
    m.query.mockResolvedValueOnce([{ isolation: "read committed" }]); await expect(load(tx, input(), env(), context())).rejects.toThrow("SERIALIZABLE_REQUIRED");
    expect(m.lock).not.toHaveBeenCalled();
  });
  it("does not expose a caller-mutable source snapshot after awaiting current checks", async () => {
    const before = q.expiresAt;
    m.current.mockImplementationOnce(async () => { q.expiresAt = new Date(0); return { binding: f.durable.currentBinding, source: f.durable.original.source, now: new Date(Date.now()) }; });
    expect(await load(tx, input(), env(), context())).toMatchObject({ status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED" });
    expect(q.expiresAt).not.toBe(before);
  });
});
