import type { Prisma } from "@prisma-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), consume: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-store", () => ({ consumeSmsTemporalClarificationInTransaction: mock.consume }));
import { temporalConversationNamespace, temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { inspectSmsTemporalReplyReservationInTransaction as inspect, processSmsTemporalReply as processReply } from "@/server/personal-assistant/sms-temporal-reply-worker";

const actor = { workspaceId: "workspace", userId: "owner" }, ownerNumber = "+15145550100", endveraNumber = "+15145550101";
const accountSid = "AC" + "a".repeat(32), namespace = temporalConversationNamespace(ownerNumber, endveraNumber);
const env = () => ({ ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true",
  ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "true", TWILIO_ACCOUNT_SID: accountSid, TWILIO_PHONE_NUMBER: endveraNumber });
const context = () => ({ claim: { ...actor, operationId: "reply-source", attempt: 1 as const, leaseUntil: "2026-09-10T14:00:35.000Z" }, deadlineAt: Date.now() + 30_000 });
function source(body = "14h") {
  const wire = { accountSid, messageSid: "SM" + "b".repeat(32), from: ownerNumber, to: endveraNumber, body }, requestHash = temporalSha(JSON.stringify(wire));
  return { id: "reply-source", request: { schemaVersion: 1, ...wire, contentHash: requestHash, identityId: "identity" }, requestHash,
    idempotencyKey: `personal-sms:${temporalSha(`${wire.accountSid}:${wire.messageSid}`)}`, createdAt: new Date("2026-09-10T14:00:00.000Z"), result: { prior: "retained by consumer" }, connectorAccountId: "sms" };
}
function expectation() { return { id: "temporal:question", kind: "TEMPORAL_CLARIFICATION", clarificationId: "question", confirmationId: null,
  questionId: "question", questionNamespace: namespace, ...actor, identityId: "identity", phase: "WAITING", expired: false }; }
let row: ReturnType<typeof source>, expectations: unknown[];
const tx = { $queryRawUnsafe: mock.query, personalAssistantOperation: { create: mock.create } } as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T14:00:01.000Z")); row = source(); expectations = [expectation()];
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes('FROM "PersonalAssistantOperation"')) return [row];
    if (sql.includes('FROM "PersonalSmsConversationExpectation"')) return expectations;
    return [];
  });
  mock.consume.mockResolvedValue({ status: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash: "d".repeat(64), reply: "Ta précision est conservée. Aucun rendez-vous n’est créé.", executionAuthorized: false, committed: false });
  mock.create.mockResolvedValue({ id: "ack" }); mock.transaction.mockImplementation(work => work(tx));
});
afterEach(() => vi.useRealTimers());

describe("autonomous OFF temporal reply reservation and consumption, no model/action route", () => {
  it.each(["CONFIRME ENDVERA AGENDA bois lac lune sable", "Ne CONFIRME ENDVERA AGENDA bois lac lune sable", "« confirme endvera agenda bois lac lune sable »"])("reserved calendar phrase wins even while temporal processing OFF: %s", async text => {
    row = source(text);
    expect(await processReply(context(), { ...env(), ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "false" })).toMatchObject({ status: "RESERVED_CALENDAR_CONFIRMATION", sourceCompleted: false });
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled(); expect(mock.query.mock.calls.some(([sql]) => sql.includes("Expectation"))).toBe(false);
  });
  it.each(["Qu’est-ce que j’ai demain?", "C'est quoi mon horaire aujourd'hui?"])("day read is independent and burns no pending attempt: %s", async text => {
    row = source(text); expect(await processReply(context(), env())).toMatchObject({ status: "INDEPENDENT_CALENDAR_DAY_READ", sourceCompleted: false });
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it("time-shaped pending reply is only a non-authorizing reservation before consume", async () => {
    const result = await inspect(tx, context(), env());
    expect(result).toMatchObject({ status: "TEMPORAL_REPLY_RESERVED_NOT_AUTHORIZED", clarificationId: "question", claim: context().claim, sourceCompleted: false, executionAuthorized: false });
    expect(Object.isFrozen(result)).toBe(true); expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
    const namespaceCall = mock.query.mock.calls.findIndex(([sql]) => sql.includes("pg_advisory_xact_lock")), ledgerCall = mock.query.mock.calls.findIndex(([sql]) => sql.includes("Expectation"));
    expect(namespaceCall).toBeGreaterThan(0); expect(namespaceCall).toBeLessThan(ledgerCall); expect(mock.query.mock.calls[namespaceCall][1]).toBe(namespace);
    expect(mock.query.mock.calls[ledgerCall][0]).not.toMatch(/FOR UPDATE|FOR SHARE/);
  });
  it.each(["14h", "3h", "24:00"])("only time-shaped %s may reach the closed consumer", async text => {
    row = source(text); expect(await processReply(context(), env())).toMatchObject({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", sourceCompleted: true, committed: true, executionAuthorized: false, automaticRetry: false });
    expect(mock.consume).toHaveBeenCalledTimes(1); expect(mock.create).toHaveBeenCalledTimes(1);
  });
  it("consumer rejection keeps exact acknowledgment and does not infer a calendar event", async () => {
    mock.consume.mockResolvedValue({ status: "REFUSED", receiptId: "refused-receipt", packetHash: "e".repeat(64), reply: "Précise une seule heure." });
    const result = await processReply(context(), env()); expect(result).toMatchObject({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: "REFUSED", receiptId: "refused-receipt" });
    expect(result).not.toHaveProperty("draft"); expect(result).not.toHaveProperty("startsAtUtc");
    expect(mock.create.mock.calls[0][0].data.request.text).toBe("Précise une seule heure.");
  });
  it("same transaction owns consume and exact source-bound ordinary acknowledgment without another CAS", async () => {
    const input = context(); await processReply(input, env());
    expect(mock.consume).toHaveBeenCalledWith(tx, { actor, clarificationId: "question", replySourceClaim: input.claim }, env(), expect.objectContaining({ deadlineAt: Date.now() + 5000 }));
    const data = mock.create.mock.calls[0][0].data, request = { to: ownerNumber, from: endveraNumber, text: "Ta précision est conservée. Aucun rendez-vous n’est créé.", sourceOperationId: "reply-source" };
    expect(data).toEqual({ workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "sms", kind: "sms_outbound", status: "pending", attempts: 0, idempotencyKey: "reply:reply-source", request, requestHash: temporalSha(JSON.stringify(request)) });
    expect(mock.query.mock.calls.map(([sql]) => sql).join("\n")).not.toMatch(/UPDATE |INSERT |DELETE /);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it.each(["Ajoute une tâche au chantier.", "14h puis appelle Marc", "demain à 14h"])("unrelated complete request %s does not consume an attempt or fall through", async text => {
    row = source(text); expect(await processReply(context(), env())).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_MESSAGE", attemptConsumed: false, sourceCompleted: false });
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED", "ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED"])("OFF %s retains registered context without model fallback", async flag => {
    expect(await processReply(context(), { ...env(), [flag]: "false" })).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "PROCESSING_OFF", attemptConsumed: false });
    expect(mock.query.mock.calls.some(([sql]) => sql.includes("Expectation"))).toBe(true); expect(mock.consume).not.toHaveBeenCalled();
  });
  it.each([["PREPARED", false, "NOT_YET_ASKED"], ["WAITING", true, "EXPIRED"]])("unasked or expired %s refuses without burning attempt", async (phase, expired, reason) => {
    expectations = [{ ...expectation(), phase, expired }]; expect(await processReply(context(), env())).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason }); expect(mock.consume).not.toHaveBeenCalled();
  });
  it.each(["workspaceId", "userId", "identityId"])("foreign/revised %s does not consume or disclose question", async field => {
    expectations = [{ ...expectation(), [field]: "other" }]; const result = await processReply(context(), env());
    expect(result).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_CONTEXT" }); expect(result).not.toHaveProperty("clarificationId"); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("no active context gives bare-hour fixed reply but preserves full unrelated request routing", async () => {
    expectations = []; expect(await processReply(context(), env())).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "NO_WAITING_QUESTION" });
    row = source("Ajoute une tâche au chantier."); expect(await processReply(context(), env())).toMatchObject({ status: "NOT_TEMPORAL_CONTEXT", sourceCompleted: false }); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("plain hour never approves an active calendar confirmation", async () => {
    expectations = [{ ...expectation(), id: "calendar:confirmation", kind: "CALENDAR_CONFIRMATION", clarificationId: null, confirmationId: "confirmation",
      questionId: null, questionNamespace: null, workspaceId: null, userId: null, identityId: null, phase: null, expired: null }];
    expect(await processReply(context(), env())).toMatchObject({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_CONTEXT" }); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("multiple or broken shared expectation is failure, not absence", async () => {
    expectations = [expectation(), expectation()]; await expect(processReply(context(), env())).rejects.toThrow("NOT_UNIQUE");
    expectations = [{ ...expectation(), phase: "CONSUMED" }]; await expect(processReply(context(), env())).rejects.toThrow("EXPECTATION_INVALID");
    expectations = [{ ...expectation(), questionNamespace: "foreign" }]; await expect(processReply(context(), env())).rejects.toThrow("EXPECTATION_INVALID");
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("DB discovery failure never calls consumer or constructs a fallback reply", async () => {
    const original = mock.query.getMockImplementation()!; mock.query.mockImplementation((sql, ...args) => { if (sql.includes("Expectation")) throw new Error("synthetic DB unavailable"); return original(sql, ...args); });
    await expect(processReply(context(), env())).rejects.toThrow("synthetic DB unavailable"); expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });
  it("missing claim, changed source hash and wrong current number fail closed", async () => {
    const original = mock.query.getMockImplementation()!;
    mock.query.mockImplementationOnce(original).mockImplementationOnce(original).mockResolvedValueOnce([]);
    await expect(processReply(context(), env())).rejects.toThrow("SOURCE_CLAIM_REQUIRED");
    row.requestHash = "f".repeat(64); await expect(processReply(context(), env())).rejects.toThrow(); row = source();
    await expect(processReply(context(), { ...env(), TWILIO_PHONE_NUMBER: "+15145550999" })).rejects.toThrow("SOURCE_CHANGED");
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it("requires original finite deadline, SMS worker and SERIALIZABLE", async () => {
    await expect(processReply({ ...context(), deadlineAt: NaN }, env())).rejects.toThrow("DEADLINE_INVALID");
    await expect(processReply({ ...context(), deadlineAt: Date.now() }, env())).rejects.toThrow("DEADLINE");
    await expect(processReply(context(), { ...env(), ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "false" })).rejects.toThrow("SMS_WORKER_DISABLED");
    mock.query.mockResolvedValueOnce([{ isolation: "read committed" }]); await expect(inspect(tx, context(), env())).rejects.toThrow("SERIALIZABLE_REQUIRED"); expect(mock.consume).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3, 4])("abort after reservation query %i prevents consumption", async boundary => {
    const controller = new AbortController(), original = mock.query.getMockImplementation()!; let n = 0;
    mock.query.mockImplementation(async (sql, ...args) => { const result = await original(sql, ...args); if (n++ === boundary) controller.abort(); return result; });
    await expect(processReply({ ...context(), signal: controller.signal }, env())).rejects.toThrow("DEADLINE_OR_ABORT"); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("OFF-to-ON while opening transaction cannot retroactively consume this source", async () => {
    const flags = { ...env(), ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "false" }; mock.transaction.mockImplementationOnce(work => { flags.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED = "true"; return work(tx); });
    await expect(processReply(context(), flags)).rejects.toThrow("PROCESSING_DISABLED"); expect(mock.consume).not.toHaveBeenCalled();
  });
  it("withdrawal after consumer-owned source CAS throws before acknowledgment", async () => {
    const flags = env(); mock.consume.mockImplementationOnce(async () => { flags.ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED = "false"; return { status: "CORRELATED_NOT_EXECUTED" }; });
    await expect(processReply(context(), flags)).rejects.toThrow("PROCESSING_DISABLED"); expect(mock.create).not.toHaveBeenCalled();
  });
  it("deadline during acknowledgment insert throws so all provisional writes roll back", async () => {
    mock.create.mockImplementationOnce(async () => { vi.advanceTimersByTime(6000); return { id: "ack" }; });
    await expect(processReply(context(), env())).rejects.toThrow("DEADLINE_OR_ABORT"); expect(mock.consume).toHaveBeenCalledTimes(1);
  });
  it("withdrawal during acknowledgment insert throws before callback return", async () => {
    const flags = env(); mock.create.mockImplementationOnce(async () => { flags.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "false"; return { id: "ack" }; });
    await expect(processReply(context(), flags)).rejects.toThrow("PROCESSING_DISABLED");
  });
  it("consumer failure, disabled receipt, acknowledgment failure or unknown commit is never retried", async () => {
    mock.consume.mockRejectedValueOnce(new Error("SYNTHETIC_CURRENT_GRANT_REVOKED")); await expect(processReply(context(), env())).rejects.toThrow("GRANT_REVOKED");
    mock.consume.mockResolvedValueOnce({ status: "DISABLED" }); await expect(processReply(context(), env())).rejects.toThrow("CONSUMER_DISABLED");
    mock.create.mockRejectedValueOnce(new Error("synthetic ack refused")); await expect(processReply(context(), env())).rejects.toThrow("ack refused");
    mock.transaction.mockImplementationOnce(async work => { await work(tx); throw new Error("synthetic commit unknown"); });
    await expect(processReply(context(), env())).rejects.toThrow("commit unknown"); expect(mock.transaction).toHaveBeenCalledTimes(4);
  });
  it("preserves the claimed actor/lease snapshot during await", async () => {
    const input = context(), original = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql, ...args) => { const result = await original(sql, ...args); input.claim.userId = "other"; input.claim.leaseUntil = "2099-01-01T00:00:00Z"; return result; });
    await processReply(input, env()); expect(mock.consume.mock.calls[0][1].replySourceClaim).toMatchObject({ userId: "owner", leaseUntil: "2026-09-10T14:00:35.000Z" });
  });
});
