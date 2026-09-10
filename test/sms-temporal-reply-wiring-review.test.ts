import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), execute: vi.fn(), tx: vi.fn(), ingress: vi.fn(), lower: vi.fn(), identity: vi.fn(), create: vi.fn(), finish: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.execute,
  $transaction: m.tx, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.ingress }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: m.lower }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
const baseEnv = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
  TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" };
const row = { id: "inbound", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", kind: "personal_sms_inbound", status: "received", attempts: 0,
  requestHash: "synthetic-hash", createdAt: new Date("2026-09-10T13:00:00Z"), request: { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic",
    from: "+15005550001", to: "+15005550006", body: "14h", contentHash: "synthetic-hash", identityId: "identity" } };
let env: typeof baseEnv, committed: unknown[];
const model = vi.fn(async () => ({ reply: "Modèle non autorisé à agir." }));
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T13:00:00Z")); env = { ...baseEnv }; committed = [];
  m.find.mockResolvedValue(structuredClone(row)); m.ingress.mockResolvedValue({ operationId: row.id }); m.execute.mockResolvedValue(1);
  m.identity.mockResolvedValue({ id: "identity" }); m.create.mockResolvedValue({ id: "ack" }); m.finish.mockResolvedValue(1);
  model.mockResolvedValue({ reply: "Modèle non autorisé à agir." });
  m.tx.mockImplementation(async work => { const staged: unknown[] = [];
    const result = await work({ constructionCommunicationIdentity: { findFirst: m.identity }, $executeRawUnsafe: m.finish,
      personalAssistantOperation: { create: async (input: unknown) => { staged.push(input); return m.create(input); } } });
    committed.push(...staged); return result;
  });
});
afterEach(() => vi.useRealTimers());
const run = () => processPersonalSms(row.id, env, { model });
describe("independent incoming temporal wiring guards (mocked lower, no database)", () => {
  it.each([false, undefined, 1, "true"])("HANDLED does not accept non-exact sourceCompleted %s", async sourceCompleted => {
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", sourceCompleted, committed: true });
    expect(await run()).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(model).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });
  it.each([true, undefined, 0])("NOT_TEMPORAL_CONTEXT does not accept non-exact false %s", async sourceCompleted => {
    m.lower.mockResolvedValue({ status: "NOT_TEMPORAL_CONTEXT", sourceCompleted, committed: true });
    expect(await run()).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(model).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });
  it("malformed fixed reply cannot turn into permission to call the model", async () => {
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", sourceCompleted: false, committed: true });
    expect(await run()).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(model).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });
  it("fixed acknowledgment source CAS loss rolls back staged acknowledgment", async () => {
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", sourceCompleted: false, committed: true, reply: "Contexte indisponible." }); m.finish.mockResolvedValue(0);
    expect(await run()).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(m.create).toHaveBeenCalledOnce(); expect(committed).toEqual([]); expect(model).not.toHaveBeenCalled();
  });
  it("known handled completion survives server switch revocation without a second mutation", async () => {
    m.lower.mockImplementation(async () => { env.ENDVERA_PERSONAL_SMS_WORKER_ENABLED = "false"; return { status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", sourceCompleted: true, committed: true }; });
    expect(await run()).toEqual({ status: "COMPLETED_REPLY_PREPARED" }); expect(m.execute).toHaveBeenCalledOnce(); expect(m.tx).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled();
  });
  it("unknown lower commit plus a lost cleanup CAS never reports source completed or retries", async () => {
    m.lower.mockRejectedValue(new Error("synthetic commit acknowledgment missing")); m.execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await run()).toMatchObject({ status: "REVIEW_REQUIRED", recorded: false, automaticRetry: false }); expect(m.lower).toHaveBeenCalledOnce(); expect(m.execute).toHaveBeenCalledTimes(2); expect(model).not.toHaveBeenCalled();
  });
});
