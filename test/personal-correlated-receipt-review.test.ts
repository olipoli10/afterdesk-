import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ lock: vi.fn(), current: vi.fn(), query: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-proof", () => ({ temporalRegistryLockProof: m.lock, temporalRegistryCurrentProof: m.current }));
import { loadCorrelatedPersonalReceiptSubject as load } from "@/server/model-gateway/personal-intent/correlated-receipt-subject";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { temporalConversationNamespace, temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { correlatedReceiptFixture as fixture } from "./fixtures/personal-correlated-receipt.fixture";
const actor = { workspaceId: "workspace", userId: "owner" };
const input = () => ({ enabled: true, actor: { ...actor }, subject: { kind: "personal_sms_temporal_receipt" as const, receiptId: "receipt" } });
const env = () => ({ ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" });
const tx = { $queryRawUnsafe: m.query } as unknown as Prisma.TransactionClient;
let f: ReturnType<typeof fixture>, q: Record<string, unknown>, receipt: Record<string, unknown>, sources: Record<string, unknown>[], ledger: Record<string, unknown>;
const run = () => load(tx, input(), env(), { deadlineAt: Date.now() + 5000 });
function sourceRow(source: ReturnType<typeof fixture>["durable"]["answer"]["source"], result: unknown) {
  const { accountSid, messageSid, from, to, body, identityId } = source;
  return { id: source.operationId, ...{ workspaceId: source.workspaceId, createdByUserId: source.userId }, connectorAccountId: "sms", kind: "personal_sms_inbound",
    status: "completed", attempts: 1, leaseUntil: null, request: { schemaVersion: 1, accountSid, messageSid, from, to, body, identityId, contentHash: source.requestHash },
    requestHash: source.requestHash, idempotencyKey: `personal-sms:${temporalSha(`${accountSid}:${messageSid}`)}`, createdAt: new Date(source.receivedAt), result };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:02:00Z")); f = fixture();
  const p = f.durable.waiting.prepared;
  q = { id: p.clarificationId, phase: "CONSUMED", consumedReplyId: "receipt", waiting: f.durable.waiting, sourceOperationId: p.source.operationId,
    acceptedAt: new Date(f.durable.waiting.questionReceipt.acceptedAt), acceptedProviderSid: f.durable.waiting.questionReceipt.acceptedProviderSid,
    expiresAt: new Date(p.expiresAt), namespace: temporalConversationNamespace(p.binding.ownerNumber, p.binding.endveraNumber) };
  receipt = { ...f.durable.receipt, clarificationId: p.clarificationId, ...actor, sourceOperationId: f.durable.answer.source.operationId,
    providerSid: f.durable.answer.source.messageSid, requestHash: f.durable.answer.source.requestHash, packet: f.packet, packetHash: f.packetHash,
    receivedAt: new Date(f.durable.receipt.receivedAt), createdAt: new Date(f.durable.receipt.createdAt) };
  sources = [sourceRow(f.durable.original.source, { personalModelReview: "synthetic original review" }), sourceRow(f.durable.answer.source,
    { source: "TEMPORAL_CLARIFICATION", temporalClarificationReceiptId: "receipt", packetHash: f.packetHash, executionAuthorized: false, externalTransportPerformed: false, automaticRetry: false })];
  ledger = { id: `temporal:${p.clarificationId}`, namespace: q.namespace, kind: "TEMPORAL_CLARIFICATION", clarificationId: p.clarificationId, confirmationId: null, active: false };
  m.lock.mockResolvedValue(q); m.current.mockResolvedValue({ binding: f.durable.currentBinding, source: f.durable.original.source, now: new Date(Date.now()) });
  m.query.mockImplementation(async (sql: string) => sql.includes("transaction_isolation") ? [{ isolation: "serializable" }]
    : sql.startsWith('SELECT "clarificationId"') ? [{ clarificationId: p.clarificationId }]
      : sql.includes('FROM "PersonalSmsTemporalClarificationReply"') ? [receipt]
        : sql.includes('FROM "PersonalAssistantOperation"') ? sources
          : sql.includes('FROM "PersonalSmsConversationExpectation"') ? [ledger]
            : sql === "SELECT clock_timestamp() AS now" ? [{ now: new Date(Date.now()) }] : []);
});
afterEach(() => vi.useRealTimers());
describe("independent durable receipt loader (mocked current authority, no DB execution)", () => {
  it("rejects a final DB clock earlier than the accepted receipt already inspected", async () => {
    const original = m.query.getMockImplementation()!; let clockCount = 0;
    m.query.mockImplementation(async (sql: string) => sql === "SELECT clock_timestamp() AS now" && ++clockCount === 2
      ? [{ now: new Date("2026-09-11T04:00:00.000Z") }] : original(sql));
    await expect(run().then(() => true)).rejects.toThrow("CLOCK_MOVED_BACKWARD");
  });
  it("first loader clock cannot precede the canonical current-authority DB clock", async () => {
    m.current.mockResolvedValue({ binding: f.durable.currentBinding, source: f.durable.original.source, now: new Date("2026-09-11T04:03:00.000Z") });
    await expect(run().then(() => true)).rejects.toThrow("CLOCK_MOVED_BACKWARD");
  });
  it("same DB instant is permitted and does not extend original expiry or historical lease", async () => {
    const result = await run(); expect(result).toMatchObject({ status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", inspectedAt: f.durable.now, committed: false, draft: null });
    if (result.status === "DISABLED") throw new Error("fixture");
    expect(result.proof.resolution.evidence.correlation.requiredAtomicTransition.replyLeaseUntil).toBe(f.durable.receipt.sourceClaim.leaseUntil);
    expect(q.expiresAt).toEqual(new Date(f.durable.waiting.prepared.expiresAt));
  });
  it("deadline mutation in caller context during discovery cannot extend its snapshot", async () => {
    const context = { deadlineAt: Date.now() + 1000 };
    m.current.mockImplementation(async () => { context.deadlineAt += 60000; vi.setSystemTime(Date.now() + 1000); return {}; });
    await expect(load(tx, input(), env(), context)).rejects.toThrow("DEADLINE_OR_DISABLED");
  });
  it("withdrawal after the final clock prevents returning a provisional proof", async () => {
    const flags = env(), original = m.query.getMockImplementation()!; let clockCount = 0;
    m.query.mockImplementation(async (sql: string) => { const result = await original(sql);
      if (sql === "SELECT clock_timestamp() AS now" && ++clockCount === 2) flags.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false"; return result;
    });
    await expect(load(tx, input(), flags, { deadlineAt: Date.now() + 5000 })).rejects.toThrow("DEADLINE_OR_DISABLED");
  });
  it("cannot adopt an answer recorded under the original source id", async () => {
    receipt.sourceOperationId = f.durable.original.source.operationId; await expect(run()).rejects.toThrow("TWO_COMPLETED_SOURCES_REQUIRED");
  });
  it("current receipt read tolerates no omitted permanent ledger and never recreates it", async () => {
    const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(async (sql: string) => sql.includes('FROM "PersonalSmsConversationExpectation"') ? [] : original(sql));
    await expect(run()).rejects.toThrow("LEDGER_CHANGED"); expect(m.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(true);
  });
  it("historic accepted receipt cannot borrow a different still-live source lease without changing its immutable packet", () => {
    const changed = structuredClone(f.durable); changed.receipt.sourceClaim.leaseUntil = "2026-09-11T04:07:00.000Z";
    expect(() => inspectCorrelatedPersonalReceiptProof(changed, { packet: f.packet, packetHash: f.packetHash })).toThrow("RESOLUTION_CHANGED");
  });
});
