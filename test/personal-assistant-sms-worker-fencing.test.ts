import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn(), update: vi.fn(), execute: vi.fn(), transaction: vi.fn(), workspace: vi.fn(), admission: vi.fn(), engine: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  personalAssistantOperation: { findUnique: mocks.find, findMany: mocks.list, updateMany: mocks.update },
  constructionWorkspace: { findUniqueOrThrow: mocks.workspace }, $executeRawUnsafe: mocks.execute, $transaction: mocks.transaction,
} }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: mocks.admission }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: mocks.engine }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ readGoogleCalendar: vi.fn() }));
vi.mock("@/server/personal-assistant/outbox", () => ({ sendAutomaticPersonalReply: mocks.send }));
import { drainPersonalSms, processPersonalSms } from "@/server/personal-assistant/sms-worker";

const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
  TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z" };
const row = { id: "inbound", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", kind: "personal_sms_inbound", status: "received", attempts: 0, leaseUntil: null,
  requestHash: "synthetic-hash", createdAt: new Date("2026-09-10T03:00:00Z"),
  request: { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic", from: "+15005550001", to: "+15005550006", body: "Ajoute une note au chantier", contentHash: "synthetic-hash", identityId: "identity" } };
let committedReplies: unknown[];
let finish: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T03:00:00Z")); vi.resetAllMocks();
  committedReplies = []; finish = vi.fn().mockResolvedValue(1);
  mocks.find.mockResolvedValue(row); mocks.admission.mockResolvedValue({ operationId: row.id });
  mocks.execute.mockResolvedValue(1); mocks.update.mockResolvedValue({ count: 1 }); mocks.workspace.mockResolvedValue({ defaultTimezone: "America/Toronto" });
  mocks.engine.mockResolvedValue({ reply: "Note préparée.", intent: "UNSUPPORTED" });
  mocks.transaction.mockImplementation(async work => {
    const staged: unknown[] = [];
    const result = await work({ constructionCommunicationIdentity: { findFirst: async () => ({ id: "identity" }) },
      $executeRawUnsafe: finish, personalAssistantOperation: { create: async (value: unknown) => { staged.push(value); } } });
    committedReplies.push(...staged); return result;
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("personal SMS source deadline and exact ownership", () => {
  it("uses the model lane exclusively and commits source review with the reply", async () => {
    const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED" as const, executionAuthorized: false as const, externalTransportPerformed: false as const,
      accounting: "UNSETTLED" as const, automaticRetry: false as const, semanticIntentVerified: false as const, modelChildOperationId: "child",
      source: { operationId: row.id, text: row.request.body, receivedAt: row.createdAt.toISOString(), timezone: "America/Toronto" },
      actions: [{ actionId: "read", kind: "READ_CALENDAR", status: "READ_REVIEW_ONLY" as const }] };
    const finalizeReview = vi.fn(async () => review);
    const model = vi.fn(async () => ({ reply: "Pending", finalizeReview }));
    const result = await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" }, { model });
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED"); expect(mocks.engine).not.toHaveBeenCalled();
    expect(finalizeReview).toHaveBeenCalledTimes(1); expect(committedReplies).toHaveLength(1);
    expect(JSON.parse(finish.mock.calls[0][6])).toMatchObject({ source: "MODEL_REVIEW_ONLY", personalModelReview: review });
    expect(JSON.parse(finish.mock.calls[0][6]).reply).toContain("Google Agenda n’a pas été consulté");
  });
  it("does not fall back to legacy or create a reply when model interpretation is uncertain", async () => {
    const model = vi.fn().mockRejectedValue(new Error("synthetic unknown model outcome"));
    expect((await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" }, { model })).status).toBe("REVIEW_REQUIRED");
    expect(mocks.engine).not.toHaveBeenCalled(); expect(committedReplies).toHaveLength(0); expect(finish).not.toHaveBeenCalled();
  });
  it("does not silently switch on the model path merely because a test seam exists", async () => {
    const model = vi.fn();
    expect((await processPersonalSms(row.id, env, { model })).status).toBe("COMPLETED_REPLY_PREPARED");
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).toHaveBeenCalledTimes(1);
  });
  it("completes only its exact live source claim and prepares the reply in one transaction", async () => {
    expect(await processPersonalSms(row.id, env, { engine: mocks.engine })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(committedReplies).toHaveLength(1);
    expect(finish.mock.calls[0][0]).toContain('"leaseUntil">clock_timestamp()');
    for (const field of ['"workspaceId"', '"createdByUserId"', 'attempts=', '"leaseUntil"=', "status='processing'"]) expect(finish.mock.calls[0][0]).toContain(field);
    const context = mocks.engine.mock.calls[0][1];
    expect(context.claim).toMatchObject({ operationId: row.id, workspaceId: row.workspaceId, userId: row.createdByUserId, attempt: 1 });
    expect(Object.isFrozen(context.claim)).toBe(true);
    expect(context.signal.aborted).toBe(false);
  });
  it("a failed source claim never invokes the interpreter", async () => {
    mocks.execute.mockResolvedValueOnce(0);
    expect(await processPersonalSms(row.id, env)).toMatchObject({ status: "NOT_PENDING" });
    expect(mocks.engine).not.toHaveBeenCalled(); expect(committedReplies).toHaveLength(0);
  });
  it("rolls back reply preparation if cleanup or another writer already took the source", async () => {
    finish.mockResolvedValue(0);
    expect(await processPersonalSms(row.id, env)).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(committedReplies).toHaveLength(0);
  });
  it("returns by its deadline and never accepts a late legacy result as completed or canceled", async () => {
    let resolve!: (value: { reply: string }) => void;
    mocks.engine.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = processPersonalSms(row.id, env, { engine: mocks.engine });
    await vi.advanceTimersByTimeAsync(36_000);
    expect(await pending).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false, engineCancellationConfirmed: false });
    expect(mocks.engine.mock.calls[0][1].signal.aborted).toBe(true);
    resolve({ reply: "Réponse trop tardive" }); await vi.advanceTimersByTimeAsync(1);
    expect(committedReplies).toHaveLength(0); expect(finish).not.toHaveBeenCalled();
  });
  it("does not start an interpreter after a late acknowledgement of the source claim", async () => {
    let acknowledge!: (value: number) => void;
    mocks.execute.mockImplementationOnce(() => new Promise(done => { acknowledge = done; }));
    const pending = processPersonalSms(row.id, env); await vi.advanceTimersByTimeAsync(36_000);
    expect(await pending).toMatchObject({ status: "REVIEW_REQUIRED" });
    acknowledge(1); await vi.advanceTimersByTimeAsync(1);
    expect(mocks.engine).not.toHaveBeenCalled(); expect(committedReplies).toHaveLength(0);
    expect(mocks.execute.mock.calls.some(call => call[0].includes("status='uncertain'"))).toBe(true);
  });
  it("keeps cleanup bounded and does not report a database timeout as recorded uncertainty", async () => {
    mocks.engine.mockImplementation(() => new Promise(() => undefined));
    mocks.execute.mockResolvedValueOnce(1).mockImplementation(() => new Promise(() => undefined));
    const pending = processPersonalSms(row.id, env);
    await vi.advanceTimersByTimeAsync(38_000);
    expect(await pending).toMatchObject({ status: "REVIEW_REQUIRED", recorded: false, engineCancellationConfirmed: false });
    expect(committedReplies).toHaveLength(0);
  });
  it("does not prepare a reply when phone consent is revoked during interpretation", async () => {
    mocks.transaction.mockImplementation(async work => work({ constructionCommunicationIdentity: { findFirst: async () => null }, personalAssistantOperation: { create: vi.fn() }, $executeRawUnsafe: finish }));
    expect(await processPersonalSms(row.id, env)).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(finish).not.toHaveBeenCalled(); expect(committedReplies).toHaveLength(0);
  });
  it("does not reclaim a source whose attempt counter was already consumed", async () => {
    mocks.find.mockResolvedValue({ ...row, attempts: 1 });
    expect(await processPersonalSms(row.id, env)).toMatchObject({ status: "NOT_PENDING" });
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled();
  });
  it("shares a total budget across ten pending sources, not ten full processing deadlines", async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 10 }, () => ({ id: row.id })));
    mocks.engine.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ reply: "Synthétique" }), 20_000)));
    const pending = drainPersonalSms(env, 10); await vi.advanceTimersByTimeAsync(50_000);
    expect(await pending).toMatchObject({ disabled: false, processed: 2 });
    expect(mocks.engine).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000); expect(mocks.engine).toHaveBeenCalledTimes(3); expect(committedReplies).toHaveLength(2);
  });
  it("stops the automatic-reply loop at the same total budget without claiming an in-flight send was canceled", async () => {
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({ id: `reply-${index}` })));
    mocks.send.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({}), 20_000)));
    const pending = drainPersonalSms({ ...env, ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, 10);
    await vi.advanceTimersByTimeAsync(51_000); expect(await pending).toMatchObject({ disabled: false, processed: 0, deadlineReached: true });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000); expect(mocks.send).toHaveBeenCalledTimes(3);
  });
});
