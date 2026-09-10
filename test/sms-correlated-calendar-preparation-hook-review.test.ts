import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-review", () => ({ prepareCorrelatedPersonalCalendarReviewInTransaction: m.prepare }));
import { prepareCorrelatedCalendarAfterCommittedSms } from "@/server/personal-assistant/sms-correlated-calendar-preparation-hook";
import { temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";

function fixture() {
  const actor = { userId: "review-owner", workspaceId: "review-workspace" };
  const wire = { accountSid: `AC${"a".repeat(32)}`, messageSid: `SM${"b".repeat(32)}`, from: "+15145550100", to: "+15145550101", body: "14h" };
  const hash = temporalSha(JSON.stringify(wire)), packetHash = "d".repeat(64);
  const claim = { ...actor, operationId: "answer", attempt: 1 as const, leaseUntil: "2026-09-11T03:59:59.000Z" };
  const result = { status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash,
    acknowledgementOperationId: "ack", sourceCompleted: true, acknowledgmentPrepared: true, committed: true,
    executionAuthorized: false, providerExecutionPerformed: false, automaticRetry: false };
  const ackRequest = { to: wire.from, from: wire.to, text: "Précision enregistrée, aucun ajout Google.", sourceOperationId: claim.operationId };
  const row = { receiptId: "receipt", receiptWorkspaceId: actor.workspaceId, receiptUserId: actor.userId, receiptSourceId: claim.operationId,
    receiptRequestHash: hash, receiptPacketHash: packetHash, receiptProviderSid: wire.messageSid, outcome: "ACCEPTED", sourceClaim: { ...claim },
    sourceId: claim.operationId, sourceWorkspaceId: actor.workspaceId, sourceUserId: actor.userId, sourceKind: "personal_sms_inbound", sourceStatus: "completed",
    sourceAttempts: 1, sourceLease: null, sourceRequest: { schemaVersion: 1, ...wire, contentHash: hash, identityId: "identity" },
    sourceRequestHash: hash, sourceIdempotencyKey: `personal-sms:${temporalSha(`${wire.accountSid}:${wire.messageSid}`)}`,
    sourceCreatedAt: new Date("2026-09-11T03:59:00.000Z"), sourceResult: { source: "TEMPORAL_CLARIFICATION", reply: ackRequest.text,
      temporalClarificationReceiptId: "receipt", packetHash, executionAuthorized: false, externalTransportPerformed: false, automaticRetry: false },
    sourceAccountId: "sms", ackId: "ack", ackWorkspaceId: actor.workspaceId, ackUserId: actor.userId, ackKind: "sms_outbound", ackAccountId: "sms",
    ackIdempotencyKey: `reply:${claim.operationId}`, ackRequest, ackRequestHash: temporalSha(JSON.stringify(ackRequest)) };
  const abort = new AbortController();
  const input = { enabledAtSourceStart: true, claim, sourceRequestHash: hash, result, signal: abort.signal, deadlineAt: Date.now() + 4000 };
  const env = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const state = { duplicateFinal: false, beforeProducer: async () => undefined as unknown };
  const queries: string[] = [];
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    queries.push(sql); expect(sql).toMatch(/^SELECT /);
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("set_config")) return [];
    expect(args).toEqual(["receipt", actor.workspaceId, actor.userId, "answer", "ack"]);
    return state.duplicateFinal && sql.includes("FOR SHARE") ? [row, row] : [row];
  });
  const write = vi.fn(() => { throw new Error("UNEXPECTED_SOURCE_OR_ACK_WRITE"); }), tx = { $queryRawUnsafe: query, $executeRawUnsafe: write };
  const produced = { status: "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT", reviewId: "review", receiptId: "receipt", replay: false,
    committed: false, executionAuthorized: false, approvalAvailable: false, preparationProviderCalls: 0, newBudgetReservations: 0 };
  m.transaction.mockImplementation(async work => work(tx));
  m.prepare.mockImplementation(async () => { await state.beforeProducer(); return produced; });
  return { input, env, row, abort, queries, tx, write, state, produced, run: () => prepareCorrelatedCalendarAfterCommittedSms(input, env) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:00:00.000Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("independent standalone post-commit hook boundaries — mocked SQL/producer", () => {
  it("keeps initial read unlocked, producer inside the same new tx, and exact locked read last", async () => {
    const h = fixture(); const result = await h.run(); expect(result).toMatchObject({ status: "COMMITTED", executionAuthorized: false, automaticRetry: false });
    expect(h.queries[2]).not.toContain("FOR SHARE"); expect(h.queries[3]).toContain("FOR SHARE OF r,s,a");
    expect(m.prepare.mock.calls[0][0]).toBe(h.tx); expect(m.transaction).toHaveBeenCalledTimes(1); expect(h.write).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/sourceClaim|leaseUntil|draft|requestHash/);
  });
  it("replacement of caller signal cannot cancel the original abort protection", async () => {
    const h = fixture(); h.state.beforeProducer = async () => { h.input.signal = new AbortController().signal; h.abort.abort(); };
    expect(await h.run()).toMatchObject({ status: "OUTCOME_UNKNOWN", automaticRetry: false });
    expect(m.prepare).toHaveBeenCalledTimes(1); expect(h.queries).toHaveLength(3); expect(h.write).not.toHaveBeenCalled();
  });
  it("mutated historical source time is detected in the second binding", async () => {
    const h = fixture(); h.state.beforeProducer = async () => { h.row.sourceCreatedAt.setTime(h.row.sourceCreatedAt.getTime() + 1); };
    expect(await h.run()).toMatchObject({ status: "OUTCOME_UNKNOWN" }); expect(h.write).not.toHaveBeenCalled();
  });
  it("a duplicate final binding cannot publish a producer success", async () => {
    const h = fixture(); h.state.duplicateFinal = true;
    const result = await h.run(); expect(result).toMatchObject({ status: "OUTCOME_UNKNOWN" }); expect(result).not.toHaveProperty("reviewId");
    expect(m.prepare).toHaveBeenCalledTimes(1); expect(m.transaction).toHaveBeenCalledTimes(1);
  });
  it.each(["preparationProviderCalls", "newBudgetReservations"])("unexpected positive %s contradicts the allowed preparation", async key => {
    const h = fixture(); Object.assign(h.produced, { [key]: 1 });
    expect(await h.run()).toMatchObject({ status: "OUTCOME_UNKNOWN", executionAuthorized: false }); expect(h.write).not.toHaveBeenCalled();
  });
  it("a changed historical claim after the producer never gets a refreshed lease", async () => {
    const h = fixture(); h.state.beforeProducer = async () => { h.row.sourceClaim.leaseUntil = "2026-09-11T04:10:00.000Z"; };
    expect(await h.run()).toMatchObject({ status: "OUTCOME_UNKNOWN" }); expect(h.input.claim.leaseUntil).toBe("2026-09-11T03:59:59.000Z");
    expect(h.write).not.toHaveBeenCalled();
  });
});
