import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ tx: vi.fn(), query: vi.fn(), create: vi.fn(), consume: vi.fn(), reconcile: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.tx } }));
vi.mock("@/server/personal-assistant/calendar-sms-confirmation-store", () => ({
  consumeCalendarSmsConfirmationInTransaction: m.consume, reconcileCalendarSmsConfirmationInTransaction: m.reconcile,
}));
vi.mock("@/server/personal-assistant/calendar-actions", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/personal-assistant/calendar-actions")>(), executeClaimedPersonalCalendarWrite: m.execute,
}));
import { processCalendarConfirmationSms } from "@/server/personal-assistant/calendar-confirmation-worker";

const env = { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" };
const now = Date.parse("2026-09-10T07:00:00Z");
const source = { schemaVersion: 1, accountSid: `AC${"a".repeat(32)}`, messageSid: `SM${"b".repeat(32)}`, from: "+15005550001", to: "+15005550006",
  body: "CONFIRME ENDVERA AGENDA arbre lune rive sable", contentHash: "", identityId: "identity" };
function row(body = source.body) {
  const request = { ...source, body };
  const requestHash = createHash("sha256").update(JSON.stringify({ accountSid: request.accountSid, messageSid: request.messageSid, from: request.from, to: request.to, body })).digest("hex");
  request.contentHash = requestHash;
  return { request, requestHash, connectorAccountId: "sms-account" };
}
const claim = { operationId: "source", userId: "owner", workspaceId: "workspace", attempt: 1 as const, leaseUntil: new Date(now + 30000).toISOString() };
const receipt = { reply: "Confirmation exacte reçue. L’ajout à Google Agenda n’est pas encore confirmé." };
const calendarClaim = { syntheticCanonicalClaim: true };
const context = () => ({ claim, deadlineAt: now + 30000, signal: new AbortController().signal });
let committed: boolean;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.resetAllMocks(); committed = false;
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM "PersonalAssistantOperation"') ? [row()] : [{ id: "challenge" }]);
  m.create.mockResolvedValue({ id: "ack" });
  m.consume.mockResolvedValue({ status: "CONSUMED_NOT_EXECUTED", calendarClaim, receipt });
  m.reconcile.mockResolvedValue({ status: "COMPLETED", observedCalendarState: "completed", executionAuthorized: false });
  m.execute.mockResolvedValue({ untrustedResult: "not used as durable proof" });
  m.tx.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.query, personalAssistantOperation: { create: m.create } }); committed = true; return result; });
});
afterEach(() => vi.useRealTimers());

describe("reserved SMS confirmation worker", () => {
  it.each(Object.keys(env))("is OFF without exact flag %s", async key => {
    expect(await processCalendarConfirmationSms(context(), { ...env, [key]: "false" })).toEqual({ status: "DISABLED" });
    expect(m.tx).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
  });
  it("requires a finite live original deadline before reading storage", async () => {
    await expect(processCalendarConfirmationSms({ ...context(), deadlineAt: Infinity }, env)).rejects.toThrow("DEADLINE_INVALID");
    await expect(processCalendarConfirmationSms({ ...context(), deadlineAt: now }, env)).rejects.toThrow("DEADLINE");
    const controller = new AbortController(); controller.abort();
    await expect(processCalendarConfirmationSms({ ...context(), signal: controller.signal }, env)).rejects.toThrow("DEADLINE");
    expect(m.tx).not.toHaveBeenCalled();
  });
  it("reloads exact source scope and rejects a missing or modified claim", async () => {
    m.query.mockResolvedValue([]);
    await expect(processCalendarConfirmationSms(context(), env)).rejects.toThrow("SOURCE_CLAIM_REQUIRED");
    expect(m.query.mock.calls[0].slice(1)).toEqual(["source", "workspace", "owner", 1, new Date(claim.leaseUntil)]);
    expect(m.consume).not.toHaveBeenCalled();
  });
  it("rejects a modified source hash before finding any challenge", async () => {
    m.query.mockResolvedValue([{ ...row(), requestHash: "changed" }]);
    await expect(processCalendarConfirmationSms(context(), env)).rejects.toThrow("SOURCE_CHANGED");
    expect(m.query).toHaveBeenCalledTimes(1); expect(m.consume).not.toHaveBeenCalled();
  });
  it("does not consume ordinary or isolated yes messages", async () => {
    m.query.mockResolvedValue([row("oui")]);
    expect(await processCalendarConfirmationSms(context(), env)).toEqual({ status: "NOT_RESERVED" });
    expect(m.consume).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
  });
  it.each([{ candidates: [] }, { candidates: [{ id: "one" }, { id: "two" }] }])("never chooses a missing/ambiguous challenge", async ({ candidates }) => {
    m.query.mockResolvedValueOnce([row()]).mockResolvedValueOnce(candidates);
    expect(await processCalendarConfirmationSms(context(), env)).toEqual({ status: "NO_UNIQUE_PENDING_CONFIRMATION" });
    expect(m.consume).not.toHaveBeenCalled();
  });
  it("commits exact consumption plus acknowledgement before one existing executor call", async () => {
    m.execute.mockImplementation(async () => { expect(committed).toBe(true); expect(m.create).toHaveBeenCalledTimes(1); return { status: "unknown shape" }; });
    const result = await processCalendarConfirmationSms(context(), env);
    expect(m.consume.mock.calls[0][1]).toEqual({ actor: { userId: "owner", workspaceId: "workspace" }, challengeId: "challenge", confirmationSourceClaim: claim });
    expect(m.execute).toHaveBeenCalledExactlyOnceWith(calendarClaim, env, undefined, expect.objectContaining({ claim }));
    expect(result).toMatchObject({ status: "CONFIRMATION_HANDLED", observedCalendarState: "completed", automaticRetry: false });
    const { data } = m.create.mock.calls[0][0];
    expect(data).toMatchObject({ kind: "sms_outbound", status: "pending", connectorAccountId: "sms-account", idempotencyKey: "reply:source",
      request: { to: source.from, from: source.to, text: receipt.reply, sourceOperationId: "source" } });
    expect(data.request.text).not.toContain("CONFIRME ENDVERA AGENDA");
    expect(data.requestHash).toBe(createHash("sha256").update(JSON.stringify(data.request)).digest("hex"));
  });
  it("rolls back consumption if acknowledgement creation fails, with no effect", async () => {
    m.create.mockRejectedValue(new Error("synthetic ack conflict"));
    await expect(processCalendarConfirmationSms(context(), env)).rejects.toThrow("ack conflict");
    expect(committed).toBe(false); expect(m.execute).not.toHaveBeenCalled();
  });
  it("does not execute if commit acknowledgement is lost", async () => {
    m.tx.mockImplementation(async work => { await work({ $queryRawUnsafe: m.query, personalAssistantOperation: { create: m.create } }); throw new Error("synthetic commit uncertain"); });
    await expect(processCalendarConfirmationSms(context(), env)).rejects.toThrow("commit uncertain");
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("prepares refusal acknowledgement without an effect or reconciliation", async () => {
    m.consume.mockResolvedValue({ status: "REFUSED", executionAuthorized: false });
    expect(await processCalendarConfirmationSms(context(), env)).toMatchObject({ status: "REFUSED" });
    expect(m.create).toHaveBeenCalledTimes(1); expect(m.execute).not.toHaveBeenCalled(); expect(m.reconcile).not.toHaveBeenCalled();
  });
  it("does not dispatch after source commit when switch is revoked", async () => {
    const mutableEnv = { ...env };
    m.tx.mockImplementation(async work => { const result = await work({ $queryRawUnsafe: m.query, personalAssistantOperation: { create: m.create } }); mutableEnv.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED = "false"; return result; });
    expect(await processCalendarConfirmationSms(context(), mutableEnv)).toMatchObject({ status: "CONFIRMATION_HANDLED", executionReturned: false, observedCalendarState: null });
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("retains executor uncertainty without retry and uses only durable reconciliation", async () => {
    m.execute.mockRejectedValue(new Error("synthetic provider uncertainty"));
    m.reconcile.mockResolvedValue({ status: "UNCERTAIN", observedCalendarState: "uncertain" });
    expect(await processCalendarConfirmationSms(context(), env)).toMatchObject({ status: "CONFIRMATION_HANDLED", executionReturned: false, observedCalendarState: "uncertain" });
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it("never invents success from executor return when reconciliation fails", async () => {
    m.reconcile.mockRejectedValue(new Error("synthetic db unavailable"));
    expect(await processCalendarConfirmationSms(context(), env)).toMatchObject({ status: "CONFIRMATION_HANDLED", executionReturned: true, observedCalendarState: null });
    expect(m.create).toHaveBeenCalledTimes(1); expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it("rolls back if original time expires after consumption before commit", async () => {
    m.consume.mockImplementation(async () => { vi.setSystemTime(now + 30000); return { status: "CONSUMED_NOT_EXECUTED", calendarClaim, receipt }; });
    await expect(processCalendarConfirmationSms(context(), env)).rejects.toThrow("DEADLINE");
    expect(committed).toBe(false); expect(m.create).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
  });
});
