import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), write: vi.fn(), temporal: vi.fn(), admission: vi.fn(), model: vi.fn(), engine: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.write,
  $transaction: m.transaction, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: m.temporal }));
vi.mock("@/server/personal-assistant/model-worker", () => ({ processPersonalModelSms: m.model, personalModelReviewReply: vi.fn() }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: m.engine }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

const now = "2026-09-11T04:02:00.000Z";
const env = { NODE_ENV: "test" as const, ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority",
  ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-key", TWILIO_AUTH_TOKEN: "synthetic-token",
  TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://synthetic.invalid",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
const handled = () => ({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt",
  packetHash: "a".repeat(64), acknowledgementOperationId: "ack", sourceCompleted: true, acknowledgmentPrepared: true,
  executionAuthorized: false, providerExecutionPerformed: false, automaticRetry: false, committed: true });
let status: string;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); status = "received";
  m.find.mockImplementation(async () => ({ id: "inbound", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account",
    kind: "personal_sms_inbound", status, attempts: status === "received" ? 0 : 1, requestHash: "b".repeat(64),
    request: { schemaVersion: 1, accountSid: env.TWILIO_ACCOUNT_SID, messageSid: "synthetic-inbound", from: "+15005550001", to: env.TWILIO_PHONE_NUMBER,
      body: "14h", contentHash: "c".repeat(64), identityId: "identity" } }));
  m.admission.mockResolvedValue({ operationId: "inbound" });
  m.write.mockImplementation(async (sql: string) => {
    if (sql.includes("SET status='processing'")) { status = "processing"; return 1; }
    if (sql.includes("SET status='uncertain'")) { if (status === "completed") return 0; status = "uncertain"; return 1; }
    throw new Error("UNEXPECTED_SOURCE_WRITE");
  });
  m.temporal.mockImplementation(async () => { status = "completed"; return handled(); });
});
afterEach(() => {
  expect(m.model).not.toHaveBeenCalled(); expect(m.engine).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled(); vi.useRealTimers();
});

describe("current SMS completion boundary before any future post-commit hook", () => {
  it("acknowledged completion returns immediately without another source CAS", async () => {
    await expect(processPersonalSms("inbound", env)).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.write).toHaveBeenCalledTimes(1); expect(status).toBe("completed");
  });
  it("known helper result wins without a postcommit wall-clock check", async () => {
    const deadlineAt = Date.now() + 100;
    m.temporal.mockImplementation(async () => { status = "completed"; vi.setSystemTime(deadlineAt); return handled(); });
    await expect(processPersonalSms("inbound", env, { deadlineAt })).resolves.toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.write).toHaveBeenCalledTimes(1);
  });
  it("a lost consumption acknowledgement remains unknown to the worker, even when fake storage committed", async () => {
    m.temporal.mockImplementation(async () => { status = "completed"; throw new Error("CONSUMPTION_COMMIT_ACK_UNKNOWN"); });
    await expect(processPersonalSms("inbound", env)).resolves.toMatchObject({ status: "REVIEW_REQUIRED", recorded: false, automaticRetry: false });
    expect(status).toBe("completed"); expect(m.write).toHaveBeenCalledTimes(2);
    await expect(processPersonalSms("inbound", env)).resolves.toEqual({ status: "NOT_PENDING" }); expect(m.temporal).toHaveBeenCalledTimes(1);
  });
  it("an unreturned helper result cannot be inferred as known completion from a late success", async () => {
    let resolve!: (value: ReturnType<typeof handled>) => void;
    m.temporal.mockImplementation(() => { status = "completed"; return new Promise(yes => { resolve = yes; }); });
    const pending = processPersonalSms("inbound", env, { deadlineAt: Date.now() + 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ status: "REVIEW_REQUIRED", recorded: false, automaticRetry: false });
    resolve(handled()); await Promise.resolve(); await Promise.resolve();
    expect(status).toBe("completed"); expect(m.write).toHaveBeenCalledTimes(2); expect(m.temporal).toHaveBeenCalledTimes(1);
  });
});
