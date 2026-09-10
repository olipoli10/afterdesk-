import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), consume: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-store", () => ({ consumeSmsTemporalClarificationInTransaction: mock.consume }));
import { temporalConversationNamespace, temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { processSmsTemporalReply as processReply } from "@/server/personal-assistant/sms-temporal-reply-worker";

const actor = { workspaceId: "workspace", userId: "owner" }, ownerNumber = "+15145550100", endveraNumber = "+15145550101";
const accountSid = "AC" + "a".repeat(32), namespace = temporalConversationNamespace(ownerNumber, endveraNumber);
const flags = () => ({ ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true",
  ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "true", TWILIO_ACCOUNT_SID: accountSid, TWILIO_PHONE_NUMBER: endveraNumber });
const input = () => ({ claim: { ...actor, operationId: "reply-source", attempt: 1 as const, leaseUntil: "2026-09-10T14:00:35.000Z" }, deadlineAt: Date.now() + 30000 });
function source(body = "14h") {
  const wire = { accountSid, messageSid: "SM" + "b".repeat(32), from: ownerNumber, to: endveraNumber, body }, requestHash = temporalSha(JSON.stringify(wire));
  return { id: "reply-source", request: { schemaVersion: 1, ...wire, contentHash: requestHash, identityId: "identity" }, requestHash,
    idempotencyKey: `personal-sms:${temporalSha(`${wire.accountSid}:${wire.messageSid}`)}`, createdAt: new Date("2026-09-10T14:00:00.000Z"), result: null, connectorAccountId: "sms" };
}
const temporal = () => ({ id: "temporal:question", kind: "TEMPORAL_CLARIFICATION", clarificationId: "question", confirmationId: null,
  questionId: "question", questionNamespace: namespace, ...actor, identityId: "identity", phase: "WAITING", expired: false });
const calendar = () => ({ id: "calendar:confirmation", kind: "CALENDAR_CONFIRMATION", clarificationId: null, confirmationId: "confirmation",
  questionId: null, questionNamespace: null, workspaceId: null, userId: null, identityId: null, phase: null, expired: null });
let row: ReturnType<typeof source>, contexts: unknown[], staged: string[], committed: string[];
const tx = { $queryRawUnsafe: mock.query, personalAssistantOperation: { create: mock.create } };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-09-10T14:00:01.000Z");
  row = source(); contexts = [temporal()]; staged = []; committed = [];
  mock.query.mockImplementation(async (sql: string) => sql.includes("transaction_isolation") ? [{ isolation: "serializable" }]
    : sql.includes('FROM "PersonalAssistantOperation"') ? [row] : sql.includes('FROM "PersonalSmsConversationExpectation"') ? contexts : []);
  mock.consume.mockImplementation(async () => { staged.push("receipt", "source-completed", "question-consumed"); return {
    status: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash: "d".repeat(64), reply: "Précision enregistrée; aucun rendez-vous créé.", executionAuthorized: false, committed: false }; });
  mock.create.mockImplementation(async () => { staged.push("ack"); return { id: "ack" }; });
  mock.transaction.mockImplementation(async work => { try { const result = await work(tx); committed = [...staged]; return result; } catch (error) { staged = []; throw error; } });
});
afterEach(() => vi.useRealTimers());

describe("independent incoming temporal lower transaction review", () => {
  it("an active calendar expectation cannot disappear into model fallback for a complete nonliteral command", async () => {
    row = source("Ajoute une tâche au chantier."); contexts = [calendar()];
    expect(await processReply(input(), flags())).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_CONTEXT", sourceCompleted: false, attemptConsumed: false });
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it.each(["Qu’est-ce que j’ai demain?", "CONFIRME ENDVERA AGENDA bois lac lune sable"])("calendar context preserves the dedicated bypass for %s without consumption", async body => {
    row = source(body); contexts = [calendar()];
    const result = await processReply(input(), flags());
    expect(result.status).toBe(body.startsWith("CONFIRME") ? "RESERVED_CALENDAR_CONFIRMATION" : "INDEPENDENT_CALENDAR_DAY_READ");
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });
  it("acknowledgment rejection rolls back already staged receipt/source/question changes", async () => {
    mock.create.mockRejectedValueOnce(new Error("synthetic ack insert refused"));
    await expect(processReply(input(), flags())).rejects.toThrow("ack insert refused");
    expect(mock.consume).toHaveBeenCalledTimes(1); expect(staged).toEqual([]); expect(committed).toEqual([]); expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it("flag withdrawal after ack insertion rolls back the whole provisional result", async () => {
    const env = flags(); mock.create.mockImplementationOnce(async () => { staged.push("ack"); env.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED = "false"; return { id: "ack" }; });
    await expect(processReply(input(), env)).rejects.toThrow("PROCESSING_DISABLED");
    expect(staged).toEqual([]); expect(committed).toEqual([]);
  });
  it("unknown commit acknowledgement propagates without retry or a handled result", async () => {
    mock.transaction.mockImplementationOnce(async work => { await work(tx); committed = [...staged]; throw new Error("synthetic commit acknowledgement lost"); });
    await expect(processReply(input(), flags())).rejects.toThrow("acknowledgement lost");
    expect(committed).toEqual(["receipt", "source-completed", "question-consumed", "ack"]);
    expect(mock.transaction).toHaveBeenCalledTimes(1); expect(mock.consume).toHaveBeenCalledTimes(1);
  });
  it("preserves exact Unicode acknowledgment text and its self-only source-bound hash", async () => {
    const reply = "Précision « 14 h » conservée.\nAucun rendez-vous créé — ni envoyé à Google. 🛠️";
    mock.consume.mockResolvedValueOnce({ status: "REFUSED", receiptId: "receipt", packetHash: "e".repeat(64), reply });
    expect(await processReply(input(), flags())).toMatchObject({ outcome: "REFUSED", sourceCompleted: true, executionAuthorized: false });
    const data = mock.create.mock.calls[0][0].data;
    expect(data.request).toEqual({ to: ownerNumber, from: endveraNumber, text: reply, sourceOperationId: "reply-source" });
    expect(data.requestHash).toBe(temporalSha(JSON.stringify(data.request)));
  });
});
