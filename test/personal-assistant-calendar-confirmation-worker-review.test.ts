import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), checked: vi.fn(), consume: vi.fn(), reconcile: vi.fn(), execute: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
vi.mock("@/server/personal-assistant/calendar-confirmation-authority", () => ({ checkedCalendarConfirmationSource: mock.checked }));
vi.mock("@/server/personal-assistant/calendar-sms-confirmation-store", () => ({ consumeCalendarSmsConfirmationInTransaction: mock.consume, reconcileCalendarSmsConfirmationInTransaction: mock.reconcile }));
vi.mock("@/server/personal-assistant/calendar-actions", () => ({ executeClaimedPersonalCalendarWrite: mock.execute }));
import { processCalendarConfirmationSms } from "@/server/personal-assistant/calendar-confirmation-worker";

function fixture() {
  const env = { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" };
  const controller = new AbortController();
  const context = { claim: { operationId: "source", userId: "owner", workspaceId: "workspace", attempt: 1 as const, leaseUntil: new Date(60000).toISOString() }, signal: controller.signal, deadlineAt: 30000 };
  const source = { body: "CONFIRME ENDVERA AGENDA bleu lac lune pin", from: "+15005550001", to: "+15005550006", identityId: "identity" };
  const calendarClaim = Object.freeze({ operationId: "calendar", synthetic: true });
  const state = { inTransaction: false, committed: 0 };
  const tx = { $queryRawUnsafe: mock.query, personalAssistantOperation: { create: mock.create } };
  mock.query.mockImplementation(async sql => sql.includes('SELECT request') ? [{ request: { synthetic: true }, requestHash: "source-hash", connectorAccountId: "sms-account" }] : [{ id: "challenge" }]);
  mock.checked.mockReturnValue(source);
  mock.consume.mockResolvedValue({ status: "CONSUMED_NOT_EXECUTED", calendarClaim, receipt: { reply: "Confirmation exacte reçue. L’ajout Google n’est pas encore confirmé." } });
  mock.create.mockResolvedValue({ id: "reply" });
  mock.reconcile.mockResolvedValue({ status: "COMPLETED", observedCalendarState: "completed" });
  mock.transaction.mockImplementation(async work => {
    state.inTransaction = true;
    try { const result = await work(tx); state.committed++; return result; }
    finally { state.inTransaction = false; }
  });
  mock.execute.mockImplementation(async () => { expect(state.inTransaction).toBe(false); expect(state.committed).toBe(1); return { arbitrary: "not used as a success receipt" }; });
  return { env, context, source, calendarClaim, controller, state, tx };
}
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(Date, "now").mockReturnValue(1000); });
afterEach(() => vi.restoreAllMocks());

describe("independent confirmation worker boundary review", () => {
  it("is OFF before DB access and does not require provider setup", async () => {
    const f = fixture(); f.env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED = "false";
    expect(await processCalendarConfirmationSms(f.context, f.env)).toEqual({ status: "DISABLED" });
    expect(mock.transaction).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("commits consume and exact acknowledgement before invoking the single executor", async () => {
    const f = fixture();
    const result = await processCalendarConfirmationSms(f.context, f.env);
    expect(mock.execute).toHaveBeenCalledExactlyOnceWith(f.calendarClaim, f.env, undefined, f.context);
    expect(mock.create.mock.calls[0][0].data).toMatchObject({ idempotencyKey: "reply:source", kind: "sms_outbound", status: "pending",
      request: { to: f.source.from, from: f.source.to, sourceOperationId: "source", text: "Confirmation exacte reçue. L’ajout Google n’est pas encore confirmé." } });
    expect(result).toMatchObject({ status: "CONFIRMATION_HANDLED", executionReturned: true, observedCalendarState: "completed", automaticRetry: false });
  });
  it("does not execute after acknowledgement insertion rejects inside the consumption transaction", async () => {
    const f = fixture(); mock.create.mockRejectedValue(new Error("synthetic ack insertion failed"));
    await expect(processCalendarConfirmationSms(f.context, f.env)).rejects.toThrow("synthetic ack insertion failed");
    expect(f.state.committed).toBe(0); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("does not execute after uncertain transaction commit acknowledgement", async () => {
    const f = fixture(); mock.transaction.mockImplementation(async work => { await work(f.tx); throw new Error("synthetic commit acknowledgement lost"); });
    await expect(processCalendarConfirmationSms(f.context, f.env)).rejects.toThrow("synthetic commit acknowledgement lost");
    expect(mock.execute).not.toHaveBeenCalled(); expect(mock.reconcile).not.toHaveBeenCalled();
  });
  it("does not execute if the final ack await consumes the original deadline", async () => {
    const f = fixture(); mock.create.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(f.context.deadlineAt); return {}; });
    await expect(processCalendarConfirmationSms(f.context, f.env)).rejects.toThrow("CONFIRMATION_WORKER_DEADLINE");
    expect(f.state.committed).toBe(0); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("keeps execution failure nonretrying and uses only later durable reconciliation", async () => {
    const f = fixture(); mock.execute.mockRejectedValue(new Error("synthetic uncertain write"));
    mock.reconcile.mockResolvedValue({ status: "UNCERTAIN", observedCalendarState: "uncertain" });
    expect(await processCalendarConfirmationSms(f.context, f.env)).toMatchObject({ status: "CONFIRMATION_HANDLED", executionReturned: false, observedCalendarState: "uncertain", automaticRetry: false });
    expect(mock.execute).toHaveBeenCalledTimes(1); expect(mock.consume).toHaveBeenCalledTimes(1); expect(mock.create).toHaveBeenCalledTimes(1);
  });
  it("does not expose executor-supplied success if durable reconciliation is unavailable", async () => {
    const f = fixture(); mock.execute.mockResolvedValue({ observedCalendarState: "completed", calendarWriteConfirmed: true });
    mock.reconcile.mockRejectedValue(new Error("synthetic reconciliation failure"));
    expect(await processCalendarConfirmationSms(f.context, f.env)).toMatchObject({ executionReturned: true, observedCalendarState: null, automaticRetry: false });
  });
  it("acknowledges a mismatched phrase without any calendar executor", async () => {
    const f = fixture(); mock.consume.mockResolvedValue({ status: "REFUSED", executionAuthorized: false });
    expect(await processCalendarConfirmationSms(f.context, f.env)).toMatchObject({ status: "REFUSED" });
    expect(mock.create).toHaveBeenCalledTimes(1); expect(mock.execute).not.toHaveBeenCalled(); expect(mock.reconcile).not.toHaveBeenCalled();
  });
  it("returns no-unique reserved state without claiming an acknowledgement or running an effect", async () => {
    const f = fixture(); mock.query.mockImplementation(async sql => sql.includes('SELECT request') ? [{ request: {}, requestHash: "source-hash", connectorAccountId: "sms-account" }] : []);
    expect(await processCalendarConfirmationSms(f.context, f.env)).toEqual({ status: "NO_UNIQUE_PENDING_CONFIRMATION" });
    expect(mock.consume).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
  });
});
