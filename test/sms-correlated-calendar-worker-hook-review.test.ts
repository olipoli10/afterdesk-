import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), write: vi.fn(), temporal: vi.fn(), admission: vi.fn(), hook: vi.fn(), model: vi.fn(), engine: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.write,
  $transaction: m.transaction, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: m.temporal }));
vi.mock("@/server/personal-assistant/sms-correlated-calendar-preparation-hook", () => ({ prepareCorrelatedCalendarAfterCommittedSms: m.hook }));
vi.mock("@/server/personal-assistant/model-worker", () => ({ processPersonalModelSms: m.model, personalModelReviewReply: vi.fn() }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: m.engine }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

const environment = () => ({ NODE_ENV: "test" as const, ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority",
  ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-key", TWILIO_AUTH_TOKEN: "synthetic-token",
  TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://synthetic.invalid",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
  ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" });
const handled = () => ({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt",
  packetHash: "a".repeat(64), acknowledgementOperationId: "ack", sourceCompleted: true, acknowledgmentPrepared: true,
  executionAuthorized: false, providerExecutionPerformed: false, automaticRetry: false, committed: true });
type Context = { claim: { operationId: string }; signal: AbortSignal; deadlineAt: number };
const states = new Map<string, string>();
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:02:00.000Z")); states.clear();
  m.find.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, workspaceId: "workspace", createdByUserId: "owner",
    connectorAccountId: "account", kind: "personal_sms_inbound", status: states.get(where.id) ?? "received", attempts: states.has(where.id) ? 1 : 0,
    requestHash: "b".repeat(64), request: { schemaVersion: 1, accountSid: "synthetic", messageSid: where.id, from: "+15005550001", to: "+15005550006",
      body: "14h", contentHash: "c".repeat(64), identityId: "identity" } }));
  m.admission.mockImplementation(async (input: { messageSid: string }) => ({ operationId: input.messageSid }));
  m.write.mockImplementation(async (sql: string, id: string) => {
    if (sql.includes("SET status='processing'")) { if (states.has(id)) return 0; states.set(id, "processing"); return 1; }
    if (sql.includes("SET status='uncertain'")) { if (states.get(id) !== "processing") return 0; states.set(id, "uncertain"); return 1; }
    throw new Error("UNEXPECTED_WRITE");
  });
  m.temporal.mockImplementation(async (input: Context) => { states.set(input.claim.operationId, "completed"); return handled(); });
  m.hook.mockResolvedValue({ status: "COMMITTED", reviewId: "private" });
});
afterEach(() => {
  expect(m.model).not.toHaveBeenCalled(); expect(m.engine).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled(); vi.useRealTimers();
});

describe("independent actual worker postcommit latch oracles (synthetic collaborators)", () => {
  it.each(["resolve", "reject"])("a duplicate during a hanging hook stays NOT_PENDING; late %s never rewrites the completed source", async mode => {
    let resolve!: (value: unknown) => void, reject!: (value: unknown) => void;
    m.hook.mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
    const pending = processPersonalSms("first", environment(), { deadlineAt: Date.now() + 100 });
    await vi.advanceTimersByTimeAsync(0);
    expect(states.get("first")).toBe("completed"); expect(m.hook).toHaveBeenCalledTimes(1);
    await expect(processPersonalSms("first", environment())).resolves.toEqual({ status: "NOT_PENDING" });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    const input = m.hook.mock.calls[0][0]; expect(input.signal.aborted).toBe(true);
    expect(input.signal).toBe(m.temporal.mock.calls[0][0].signal);
    expect(input.deadlineAt).toBe(m.temporal.mock.calls[0][0].deadlineAt);
    if (mode === "resolve") resolve({ status: "COMMITTED", reviewId: "late-private", executionAuthorized: true }); else reject(new Error("late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(m.write).toHaveBeenCalledTimes(1); expect(m.temporal).toHaveBeenCalledTimes(1); expect(states.get("first")).toBe("completed");
  });
  it("a known latch is per invocation, not shared with another source whose consumption is unknown", async () => {
    let finish!: (value: unknown) => void;
    m.hook.mockImplementation(() => new Promise(yes => { finish = yes; }));
    m.temporal.mockImplementation(async (input: Context) => {
      if (input.claim.operationId === "second") throw new Error("ACK_UNKNOWN");
      states.set(input.claim.operationId, "completed"); return handled();
    });
    const first = processPersonalSms("first", environment(), { deadlineAt: Date.now() + 100 });
    await vi.advanceTimersByTimeAsync(0);
    await expect(processPersonalSms("second", environment())).resolves.toMatchObject({ status: "REVIEW_REQUIRED", recorded: true, automaticRetry: false });
    expect(states.get("second")).toBe("uncertain"); expect(states.get("first")).toBe("completed");
    await vi.advanceTimersByTimeAsync(100); await expect(first).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    finish({ status: "OUTCOME_UNKNOWN" }); await vi.advanceTimersByTimeAsync(0);
    expect(m.hook).toHaveBeenCalledTimes(1); expect(m.write.mock.calls.filter(call => call[0].includes("SET status='uncertain'"))).toHaveLength(1);
  });
  it("abort-triggered hook rejection competes with the outer timer without causing cleanup", async () => {
    m.hook.mockImplementation((input: Context) => new Promise((_yes, no) => input.signal.addEventListener("abort", () => no(new Error("ABORT")), { once: true })));
    const pending = processPersonalSms("first", environment(), { deadlineAt: Date.now() + 100 });
    await vi.advanceTimersByTimeAsync(100); await expect(pending).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    await vi.advanceTimersByTimeAsync(0); expect(m.write).toHaveBeenCalledTimes(1); expect(states.get("first")).toBe("completed");
  });
  it("postcommit helper metadata is not inspected, even if an authority-looking property throws", async () => {
    const getter = vi.fn(() => { throw new Error("METADATA_MUST_NOT_BE_READ"); });
    m.hook.mockResolvedValue(Object.defineProperty({}, "executionAuthorized", { enumerable: true, get: getter }));
    await expect(processPersonalSms("first", environment())).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(getter).not.toHaveBeenCalled(); expect(m.write).toHaveBeenCalledTimes(1);
  });
  it("entry OFF stays OFF when consumption later turns it on, with no replay preparation", async () => {
    const env = environment(); env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false";
    m.temporal.mockImplementation(async () => { states.set("first", "completed"); env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "true"; return handled(); });
    await expect(processPersonalSms("first", env)).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    await expect(processPersonalSms("first", env)).resolves.toEqual({ status: "NOT_PENDING" });
    expect(m.hook).not.toHaveBeenCalled(); expect(m.write).toHaveBeenCalledTimes(1);
  });
});
