import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), admission: vi.fn(), lower: vi.fn(), hook: vi.fn(), transaction: vi.fn(), model: vi.fn(), engine: vi.fn(), calendar: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.claim,
  $transaction: m.transaction, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: m.lower }));
vi.mock("@/server/personal-assistant/sms-correlated-calendar-preparation-hook", () => ({ prepareCorrelatedCalendarAfterCommittedSms: m.hook }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

function environment() { return { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-placeholder",
  TWILIO_AUTH_TOKEN: "synthetic-placeholder", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
  ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" }; }
function source() { return { id: "source", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "sms", kind: "personal_sms_inbound", status: "received", attempts: 0,
  requestHash: "b".repeat(64), createdAt: new Date("2026-09-10T14:00:00Z"), request: { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic",
    from: "+15005550001", to: "+15005550006", body: "14h", contentHash: "b".repeat(64), identityId: "identity" } }; }
const handled = () => ({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", sourceCompleted: true, committed: true,
  outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash: "a".repeat(64), acknowledgementOperationId: "ack",
  acknowledgmentPrepared: true, executionAuthorized: false, providerExecutionPerformed: false, automaticRetry: false });
const deps = () => ({ model: m.model, engine: m.engine, calendar: m.calendar });
const completed = { status: "COMPLETED_REPLY_PREPARED" };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T14:00:00Z"));
  m.find.mockResolvedValue(source()); m.admission.mockResolvedValue({ operationId: "source" }); m.claim.mockResolvedValue(1);
  m.lower.mockResolvedValue(handled()); m.hook.mockResolvedValue({ status: "COMMITTED", reviewId: "review", committed: true, actionable: false });
});
afterEach(() => { expect(m.transaction).not.toHaveBeenCalled(); expect(m.model).not.toHaveBeenCalled(); expect(m.engine).not.toHaveBeenCalled(); expect(m.calendar).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("real worker completion latch around the bounded postcommit helper", () => {
  it("accepted known commit invokes one exact helper without source/ACK rewrite or public metadata", async () => {
    const env = environment(), deadlineAt = Date.now() + 1500;
    expect(await processPersonalSms("source", env, { ...deps(), deadlineAt })).toEqual(completed);
    expect(m.hook).toHaveBeenCalledTimes(1); expect(m.claim).toHaveBeenCalledTimes(1);
    const lower = m.lower.mock.calls[0][0], input = m.hook.mock.calls[0][0];
    expect(input).toEqual({ enabledAtSourceStart: true, claim: lower.claim, sourceRequestHash: "b".repeat(64), result: handled(), deadlineAt, signal: lower.signal });
    expect(m.hook.mock.calls[0][1]).toBe(env); expect(input.claim).toBe(lower.claim); expect(Object.isFrozen(input.claim)).toBe(true);
    expect(m.lower.mock.invocationCallOrder[0]).toBeLessThan(m.hook.mock.invocationCallOrder[0]);
  });
  it.each(["COMMITTED", "OUTCOME_UNKNOWN", "UNAVAILABLE", "SKIPPED"])("helper %s is not a source failure or public draft outcome", async status => {
    m.hook.mockResolvedValue({ status, committed: status === "COMMITTED", reviewId: "private-review", expiredNotActionable: true, approvalAvailable: true });
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it("synchronous helper throw is protected by inner latch", async () => {
    m.hook.mockImplementation(() => { throw new Error("synthetic failure"); });
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it("asynchronous helper failure is protected by inner latch", async () => {
    m.hook.mockRejectedValue(new Error("synthetic commit unknown"));
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it.each(["resolve", "reject"])("outer deadline preserves known completion with late helper %s and no second cleanup", async mode => {
    let resolve!: (value: unknown) => void, reject!: (reason: unknown) => void;
    m.hook.mockImplementation(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
    const pending = processPersonalSms("source", environment(), { ...deps(), deadlineAt: Date.now() + 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toEqual(completed); expect(m.hook).toHaveBeenCalledTimes(1); expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.hook.mock.calls[0][0].signal.aborted).toBe(true);
    if (mode === "resolve") resolve({ status: "COMMITTED", committed: true, reviewId: "late", expiredNotActionable: true }); else reject(new Error("late reject"));
    await vi.advanceTimersByTimeAsync(0); expect(m.claim).toHaveBeenCalledTimes(1); expect(m.hook).toHaveBeenCalledTimes(1);
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED"])("entry OFF→ON %s cannot start preparation", async flag => {
    const env = { ...environment(), [flag]: "false" };
    m.find.mockImplementation(async () => { Object.assign(env, { [flag]: "true" }); return source(); });
    expect(await processPersonalSms("source", env, deps())).toEqual(completed); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED"])("ON→OFF %s after consumption preserves completion without helper", async flag => {
    const env = environment(); m.lower.mockImplementation(async () => { env[flag as keyof typeof env] = "false"; return handled(); });
    expect(await processPersonalSms("source", env, deps())).toEqual(completed); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it("REFUSED known commit latches completion but never prepares", async () => {
    m.lower.mockResolvedValue({ ...handled(), outcome: "REFUSED" });
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it("known consumption returned after wall deadline does not obtain a new allowance", async () => {
    m.lower.mockImplementation(async () => { vi.setSystemTime(Date.now() + 36_000); return handled(); });
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(1);
  });
  it("captured source hash is the same claim hash even if source object changes during admission", async () => {
    const row = source(); m.find.mockResolvedValue(row); m.admission.mockImplementation(async () => { row.requestHash = "c".repeat(64); return { operationId: "source" }; });
    expect(await processPersonalSms("source", environment(), deps())).toEqual(completed);
    expect(m.claim.mock.calls[0][5]).toBe("b".repeat(64)); expect(m.hook.mock.calls[0][0].sourceRequestHash).toBe("b".repeat(64));
  });
  it.each([false, undefined])("unacknowledged committed=%s never establishes latch", async committed => {
    m.lower.mockResolvedValue({ ...handled(), committed });
    expect(await processPersonalSms("source", environment(), deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(2); expect(m.claim.mock.calls[1][0]).toContain("status='uncertain'");
  });
  it("sourceCompleted false cannot become completion from a helper or a commit label", async () => {
    m.lower.mockResolvedValue({ ...handled(), sourceCompleted: false });
    expect(await processPersonalSms("source", environment(), deps())).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(2);
  });
  it("unknown consumption commit retains prior uncertainty path with zero hook calls", async () => {
    m.lower.mockRejectedValue(new Error("consumption acknowledgment lost"));
    expect(await processPersonalSms("source", environment(), deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(2);
  });
  it("deadline before consumption acknowledgment is still unknown, and late known return cannot start helper", async () => {
    let resolve!: (value: unknown) => void; m.lower.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = processPersonalSms("source", environment(), { ...deps(), deadlineAt: Date.now() + 1000 });
    await vi.advanceTimersByTimeAsync(1001); expect(await pending).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(m.claim).toHaveBeenCalledTimes(2);
    resolve(handled()); await vi.advanceTimersByTimeAsync(0); expect(m.hook).not.toHaveBeenCalled(); expect(m.claim).toHaveBeenCalledTimes(2);
  });
  it("redelivery already completed never consumes/prepares again", async () => {
    m.find.mockResolvedValue({ ...source(), status: "completed", attempts: 1 });
    expect(await processPersonalSms("source", environment(), deps())).toEqual({ status: "NOT_PENDING" });
    expect(m.claim).not.toHaveBeenCalled(); expect(m.lower).not.toHaveBeenCalled(); expect(m.hook).not.toHaveBeenCalled();
  });
});
