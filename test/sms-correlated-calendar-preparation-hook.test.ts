import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), prepare: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-review", () => ({ prepareCorrelatedPersonalCalendarReviewInTransaction: mock.prepare }));
import { temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { prepareCorrelatedCalendarAfterCommittedSms as run } from "@/server/personal-assistant/sms-correlated-calendar-preparation-hook";

const actor = { userId: "owner", workspaceId: "workspace" };
const accountSid = "AC" + "a".repeat(32), messageSid = "SM" + "b".repeat(32);
const wire = { accountSid, messageSid, from: "+15145550100", to: "+15145550101", body: "14h" };
const sourceRequestHash = temporalSha(JSON.stringify(wire)), packetHash = "d".repeat(64);
const claim = { ...actor, operationId: "source", attempt: 1 as const, leaseUntil: "2026-09-10T14:00:35.000Z" };
const known = { status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash,
  acknowledgementOperationId: "ack", sourceCompleted: true, acknowledgmentPrepared: true, executionAuthorized: false,
  providerExecutionPerformed: false, automaticRetry: false, committed: true };
const acceptedReply = "Ta précision est conservée avec ta demande originale dans ENDVERA. Aucun rendez-vous n’est créé ni envoyé à Google.";
function fixture() {
  const ackRequest = { to: wire.from, from: wire.to, text: acceptedReply, sourceOperationId: "source" };
  return { receiptId: "receipt", receiptWorkspaceId: actor.workspaceId, receiptUserId: actor.userId, receiptSourceId: "source",
    receiptRequestHash: sourceRequestHash, receiptPacketHash: packetHash, receiptProviderSid: messageSid, outcome: "ACCEPTED", sourceClaim: { ...claim },
    sourceId: "source", sourceWorkspaceId: actor.workspaceId, sourceUserId: actor.userId, sourceKind: "personal_sms_inbound", sourceStatus: "completed",
    sourceAttempts: 1, sourceLease: null, sourceRequest: { schemaVersion: 1, ...wire, contentHash: sourceRequestHash, identityId: "identity" },
    sourceRequestHash, sourceIdempotencyKey: `personal-sms:${temporalSha(`${accountSid}:${messageSid}`)}`, sourceCreatedAt: new Date("2026-09-10T14:00:00.000Z"),
    sourceResult: { source: "TEMPORAL_CLARIFICATION", reply: acceptedReply, temporalClarificationReceiptId: "receipt", packetHash,
      executionAuthorized: false, externalTransportPerformed: false, automaticRetry: false, priorClaimResult: { attempts: "history" } }, sourceAccountId: "sms",
    ackId: "ack", ackWorkspaceId: actor.workspaceId, ackUserId: actor.userId, ackKind: "sms_outbound", ackAccountId: "sms",
    ackIdempotencyKey: "reply:source", ackRequest, ackRequestHash: temporalSha(JSON.stringify(ackRequest)) };
}
const environment = () => ({ ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" });
const input = () => ({ enabledAtSourceStart: true, claim: { ...claim }, sourceRequestHash, result: { ...known }, deadlineAt: Date.now() + 20_000 });
const provisional = () => ({ status: "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT", reviewId: "review", receiptId: "receipt", replay: false,
  committed: false, executionAuthorized: false, approvalAvailable: false, preparationProviderCalls: 0, newBudgetReservations: 0 });
let row: ReturnType<typeof fixture>;
const tx = { $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.write, personalAssistantOperation: { update: mock.write, create: mock.write } };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T14:00:01.000Z")); row = fixture();
  mock.transaction.mockImplementation(work => work(tx)); mock.prepare.mockResolvedValue(provisional());
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("set_config")) return [];
    if (sql.includes('FROM "PersonalSmsTemporalClarificationReply"')) return [row];
    throw new Error("unexpected query");
  });
});
afterEach(() => { expect(mock.write).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("accepted committed SMS → bounded separate local preparation", () => {
  it("runs one actual producer seam in same new transaction, namespace first then final shared binding", async () => {
    const controller = new AbortController(), result = await run({ ...input(), signal: controller.signal }, environment());
    expect(result).toEqual({ status: "COMMITTED", committed: true, reviewId: "review", replay: false, expiredNotActionable: false,
      sourceStateChanged: false, acknowledgementChanged: false, executionAuthorized: false, approvalAvailable: false, providerExecutionPerformed: false, automaticRetry: false,
      actionable: false, freshnessVerified: false });
    expect(Object.isFrozen(result)).toBe(true); expect(result).not.toHaveProperty("draft"); expect(result).not.toHaveProperty("operationId");
    expect(mock.transaction).toHaveBeenCalledTimes(1); expect(mock.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
    expect(mock.prepare).toHaveBeenCalledExactlyOnceWith(tx, { enabled: true, actor, subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" } }, environment(), { deadlineAt: Date.now() + 5000, signal: controller.signal });
    const calls = mock.query.mock.calls, bindingCalls = calls.filter(([sql]) => sql.includes('FROM "PersonalSmsTemporalClarificationReply"'));
    expect(calls[0][0]).toContain("transaction_isolation"); expect(calls[1][0]).toContain("set_config");
    expect(bindingCalls).toHaveLength(2); expect(bindingCalls[0][0]).not.toMatch(/FOR SHARE|FOR UPDATE/); expect(bindingCalls[1][0]).toContain("FOR SHARE OF r,s,a");
    expect(mock.query.mock.invocationCallOrder[2]).toBeLessThan(mock.prepare.mock.invocationCallOrder[0]);
    expect(mock.query.mock.invocationCallOrder[3]).toBeGreaterThan(mock.prepare.mock.invocationCallOrder[0]);
    expect(bindingCalls[0].slice(1)).toEqual(["receipt", "workspace", "owner", "source", "ack"]);
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("OFF or wrong pilot %s means no DB", async key => {
    expect(await run(input(), { ...environment(), [key]: "false" })).toMatchObject({ status: "SKIPPED" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("entry OFF cannot be enabled retrospectively", async () => {
    expect(await run({ ...input(), enabledAtSourceStart: false }, environment())).toMatchObject({ status: "SKIPPED" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("known REFUSED never prepares", async () => {
    expect(await run({ ...input(), result: { ...known, outcome: "REFUSED" } }, environment())).toMatchObject({ status: "SKIPPED" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it.each(["committed", "sourceCompleted", "acknowledgmentPrepared"])("false %s is not a known completion", async key => {
    expect(await run({ ...input(), result: { ...known, [key]: false } }, environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it.each(["executionAuthorized", "providerExecutionPerformed", "automaticRetry"])("true %s result refuses before DB", async key => {
    expect(await run({ ...input(), result: { ...known, [key]: true } }, environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1])("invalid/exhausted deadline %s does not touch DB", async deadlineAt => {
    expect(await run({ ...input(), deadlineAt }, environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("pre-abort avoids DB", async () => {
    const controller = new AbortController(); controller.abort(); expect(await run({ ...input(), signal: controller.signal }, environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("original 250ms budget and copied claim survive mutation during lookup", async () => {
    const raw = input(); raw.deadlineAt = Date.now() + 250; const query = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (...args) => { raw.claim.userId = "intruder"; raw.result.receiptId = "foreign"; raw.deadlineAt += 50_000; return query(...args); });
    expect(await run(raw, environment())).toMatchObject({ status: "COMMITTED" });
    expect(mock.transaction.mock.calls[0][1].timeout).toBe(250); expect(mock.prepare.mock.calls[0][1].actor).toEqual(actor);
    expect(mock.prepare.mock.calls[0][1].subject.receiptId).toBe("receipt"); expect(mock.prepare.mock.calls[0][3].deadlineAt).toBe(Date.now() + 250);
  });
  it("old source lease is a historical pin, not required live or refreshed", async () => {
    row.sourceClaim.leaseUntil = "2026-09-10T13:59:00.000Z";
    expect(await run({ ...input(), claim: { ...claim, leaseUntil: row.sourceClaim.leaseUntil } }, environment())).toMatchObject({ status: "COMMITTED" });
  });
  it("equivalent claim timezone is normalized, not a changed claim", async () => {
    expect(await run({ ...input(), claim: { ...claim, leaseUntil: "2026-09-10T10:00:35-04:00" } }, environment())).toMatchObject({ status: "COMMITTED" });
  });
  it.each(["receiptId", "receiptWorkspaceId", "receiptUserId", "receiptSourceId", "sourceWorkspaceId", "sourceUserId", "sourceId", "ackWorkspaceId", "ackUserId", "ackId", "ackAccountId", "sourceAccountId", "receiptProviderSid", "ackIdempotencyKey"])("wrong durable %s blocks producer", async field => {
    Object.assign(row, { [field]: "other" }); expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it.each(["receiptRequestHash", "sourceRequestHash", "receiptPacketHash", "ackRequestHash"])("wrong hash %s blocks producer", async field => {
    Object.assign(row, { [field]: "f".repeat(64) }); expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it.each([{ sourceStatus: "processing" }, { sourceAttempts: 2 }, { sourceLease: new Date() }, { outcome: "REFUSED" }, { sourceKind: "calendar_write" }, { ackKind: "calendar_write" }])("refuses wrong completion or kind %j", async patch => {
    Object.assign(row, patch); expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("wrong source result receipt and false-authority contradictions refuse", async () => {
    row.sourceResult.temporalClarificationReceiptId = "other"; expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" });
    row = fixture(); row.sourceResult.executionAuthorized = true; expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("changed ACK text with a freshly matching hash still refuses the source-bound exact text", async () => {
    row.ackRequest.text = "Le rendez-vous est créé."; row.ackRequestHash = temporalSha(JSON.stringify(row.ackRequest));
    expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("JSONB key order preserves ACK wire hash and strict request shape", async () => {
    row.ackRequest = { sourceOperationId: "source", text: acceptedReply, from: wire.to, to: wire.from };
    expect(await run(input(), environment())).toMatchObject({ status: "COMMITTED" });
  });
  it("missing/duplicate binding rows refuse without prepare", async () => {
    const query = mock.query.getMockImplementation()!;
    for (const rows of [[], [row, row]]) { mock.query.mockImplementation((sql, ...args) => sql.includes('FROM "PersonalSmsTemporalClarificationReply"') ? rows : query(sql, ...args));
      expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" }); }
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("nonserializable caller setup stops before discovery", async () => {
    mock.query.mockResolvedValueOnce([{ isolation: "read committed" }]); expect(await run(input(), environment())).toMatchObject({ status: "UNAVAILABLE" });
    expect(mock.query).toHaveBeenCalledTimes(1); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("switch OFF during prelookup stops without preparing", async () => {
    const env = environment(), query = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => { const result = await query(sql, ...args); if (sql.includes('FROM "PersonalSmsTemporalClarificationReply"')) env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false"; return result; });
    expect(await run(input(), env)).toMatchObject({ status: "UNAVAILABLE" }); expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("producer rejection is conservatively unknown, never a generic claimed rollback/retry", async () => {
    mock.prepare.mockRejectedValue(new Error("synthetic secret must not escape")); const result = await run(input(), environment());
    expect(result).toMatchObject({ status: "OUTCOME_UNKNOWN", automaticRetry: false }); expect(JSON.stringify(result)).not.toContain("secret"); expect(mock.prepare).toHaveBeenCalledTimes(1);
  });
  it("lost transaction acknowledgment after successful body is unknown without retry", async () => {
    mock.transaction.mockImplementation(async work => { await work(tx); throw new Error("commit acknowledgment lost"); });
    expect(await run(input(), environment())).toMatchObject({ status: "OUTCOME_UNKNOWN" }); expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it("postlookup mutation refuses publication and throws inside transaction", async () => {
    mock.prepare.mockImplementation(async () => { row.ackRequest.text = "changed"; return provisional(); });
    expect(await run(input(), environment())).toMatchObject({ status: "OUTCOME_UNKNOWN" });
  });
  it.each([{ committed: true }, { receiptId: "other" }, { replay: true }, { executionAuthorized: true }, { status: "DISABLED" }])("invalid producer result %j cannot be claimed committed", async patch => {
    mock.prepare.mockResolvedValue({ ...provisional(), ...patch }); expect(await run(input(), environment())).toMatchObject({ status: "OUTCOME_UNKNOWN" });
  });
  it("exact existing preparation is a replay, not a new action", async () => {
    mock.prepare.mockResolvedValue({ ...provisional(), status: "CORRELATED_CALENDAR_REVIEW_REPLAYED", replay: true });
    expect(await run(input(), environment())).toMatchObject({ status: "COMMITTED", replay: true, executionAuthorized: false });
  });
  it.each(["deadline", "abort", "flag"])("acknowledged commit after %s retains fact but marks not actionable", async condition => {
    const env = environment(), controller = new AbortController();
    mock.transaction.mockImplementation(async work => { const result = await work(tx);
      if (condition === "deadline") vi.advanceTimersByTime(5001); else if (condition === "abort") controller.abort(); else env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false";
      return result; });
    expect(await run({ ...input(), signal: controller.signal }, env)).toMatchObject({ status: "COMMITTED", committed: true, expiredNotActionable: true, executionAuthorized: false });
  });
  it("SQL uses actual Prisma physical reply table and existing receipt fields, no writes or ACK state assumptions", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8"), source = readFileSync("src/server/personal-assistant/sms-correlated-calendar-preparation-hook.ts", "utf8");
    const model = schema.match(/model PersonalSmsTemporalClarificationReply \{([\s\S]*?)\n\}/)![1];
    for (const column of ["sourceOperationId", "requestHash", "packetHash", "providerSid", "sourceClaim", "outcome", "workspaceId", "userId"]) expect(model).toMatch(new RegExp(`\\b${column}\\s`));
    expect(source).toContain('FROM "PersonalSmsTemporalClarificationReply" r'); expect(source).not.toContain('"PersonalSmsTemporalClarificationReceipt"');
    expect(source).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\b/); expect(source).not.toMatch(/a\.status|a\.attempts/);
  });
});
