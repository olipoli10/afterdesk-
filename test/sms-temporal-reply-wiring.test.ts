import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), execute: vi.fn(), transaction: vi.fn(), admission: vi.fn(), lower: vi.fn(),
  create: vi.fn(), finish: vi.fn(), identity: vi.fn(), googleAuthority: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.execute,
  $transaction: m.transaction, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: m.lower }));
vi.mock("@/server/personal-assistant/google-connection", async original => ({
  ...await original<typeof import("@/server/personal-assistant/google-connection")>(), requireGoogleReadAuthority: m.googleAuthority }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
  TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" };
function inbound(body = "14h") { return { id: "inbound", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", kind: "personal_sms_inbound", status: "received", attempts: 0,
  requestHash: "synthetic-hash", createdAt: new Date("2026-09-10T13:00:00Z"), request: { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic",
    from: "+15005550001", to: "+15005550006", body, contentHash: "synthetic-hash", identityId: "identity" } }; }
const handled = () => ({ status: "TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", sourceCompleted: true, committed: true,
  outcome: "CORRELATED_NOT_EXECUTED", receiptId: "receipt", packetHash: "a".repeat(64), acknowledgementOperationId: "ack",
  acknowledgmentPrepared: true, executionAuthorized: false, providerExecutionPerformed: false, automaticRetry: false });
const noContext = () => ({ status: "NOT_TEMPORAL_CONTEXT", sourceCompleted: false, executionAuthorized: false, committed: true });
type WorkerDependencies = NonNullable<Parameters<typeof processPersonalSms>[2]>;
const model = vi.fn<NonNullable<WorkerDependencies["model"]>>(), answer = vi.fn<NonNullable<WorkerDependencies["answer"]>>(),
  engine = vi.fn<NonNullable<WorkerDependencies["engine"]>>(), calendar = vi.fn<NonNullable<WorkerDependencies["calendar"]>>();
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T13:00:00Z"));
  m.find.mockResolvedValue(inbound()); m.admission.mockResolvedValue({ operationId: "inbound" }); m.execute.mockResolvedValue(1);
  m.lower.mockResolvedValue(handled()); m.create.mockResolvedValue({ id: "ordinary-ack" }); m.finish.mockResolvedValue(1); m.identity.mockResolvedValue({ id: "identity" });
  m.transaction.mockImplementation(work => work({ constructionCommunicationIdentity: { findFirst: m.identity }, personalAssistantOperation: { create: m.create }, $executeRawUnsafe: m.finish }));
  model.mockResolvedValue({ reply: "Résultat modèle non exécuté." }); answer.mockResolvedValue({ reply: "Réponse générale." });
  engine.mockResolvedValue({ reply: "Résultat local." });
  // Current Google authority is separately mocked; this test observes that its
  // actual worker call remains mandatory, not that this synthetic token passes it.
  calendar.mockResolvedValue({ result: { complete: true, source: "GOOGLE_CALENDAR", events: [] }, authority: { synthetic: true } } as unknown as Awaited<ReturnType<NonNullable<WorkerDependencies["calendar"]>>>);
});
afterEach(() => vi.useRealTimers());
const deps = () => ({ model, answer, engine, calendar, intentContinuation: async () => false });

describe("actual SMS worker temporal reply integration with synthetic lower", () => {
  it("known handled source returns without another completion CAS, acknowledgment or interpreter", async () => {
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.lower).toHaveBeenCalledTimes(1); expect(m.execute).toHaveBeenCalledTimes(1); expect(m.transaction).not.toHaveBeenCalled();
    expect(m.finish).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(calendar).not.toHaveBeenCalled();
  });
  it("known committed lower completion is not rewritten uncertain merely because its return crosses the source deadline", async () => {
    m.lower.mockImplementationOnce(async () => { vi.setSystemTime(Date.now() + 36_000); return handled(); });
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.execute).toHaveBeenCalledTimes(1); expect(model).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("fixed response is finalized exactly and read-only committed does not mean source completed", async () => {
    const reply = "Une précision d’heure est en attente. Aucun rendez-vous créé.";
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "OTHER_MESSAGE", reply, sourceCompleted: false, committed: true, attemptConsumed: false, executionAuthorized: false });
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(m.identity).toHaveBeenCalledTimes(1); expect(m.finish).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0][0].data.request).toEqual({ to: "+15005550001", from: "+15005550006", text: reply, sourceOperationId: "inbound" });
    expect(JSON.parse(m.finish.mock.calls[0][6])).toMatchObject({ source: "CLARIFICATION", reply, replyDelivery: "PREPARED_UNSENT" });
  });
  it("fixed response still requires current identity before any acknowledgment", async () => {
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reply: "Contexte indisponible.", sourceCompleted: false, committed: true });
    m.identity.mockResolvedValue(null);
    expect(await processPersonalSms("inbound", env, deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(m.create).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled();
  });
  it("only NOT_TEMPORAL_CONTEXT permits the standalone answer branch", async () => {
    m.lower.mockResolvedValue(noContext());
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(answer).toHaveBeenCalledTimes(1); expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(m.finish).toHaveBeenCalledTimes(1);
    expect(m.lower.mock.invocationCallOrder[0]).toBeLessThan(answer.mock.invocationCallOrder[0]);
  });
  it("NOT_TEMPORAL_CONTEXT retains the standalone answer branch with the intent model OFF", async () => {
    m.lower.mockResolvedValue(noContext());
    expect(await processPersonalSms("inbound", { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false" }, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(answer).toHaveBeenCalledTimes(1); expect(engine).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled();
  });
  it("processing switches OFF do not skip protected-context discovery", async () => {
    m.lower.mockResolvedValue({ status: "TEMPORAL_REPLY_FIXED_RESPONSE", reason: "PROCESSING_OFF", reply: "Contexte indisponible.", sourceCompleted: false, committed: true });
    await processPersonalSms("inbound", { ...env, ENDVERA_SMS_TEMPORAL_REPLY_WORKER_ENABLED: "false", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "false" }, deps());
    expect(m.lower).toHaveBeenCalledTimes(1); expect(model).not.toHaveBeenCalled();
  });
  it("reserved calendar vocabulary bypasses temporal lower even while its worker is OFF", async () => {
    m.find.mockResolvedValue(inbound("CONFIRME ENDVERA AGENDA bois lac lune sable"));
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.lower).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled(); expect(calendar).not.toHaveBeenCalled();
  });
  it("closed day read bypasses temporal lower and preserves Google disclosure check", async () => {
    m.find.mockResolvedValue(inbound("Qu’est-ce que j’ai demain?"));
    expect(await processPersonalSms("inbound", env, deps())).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.lower).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled(); expect(calendar).toHaveBeenCalledTimes(1); expect(m.googleAuthority).toHaveBeenCalledTimes(1);
  });
  it.each(["RESERVED_CALENDAR_CONFIRMATION", "INDEPENDENT_CALENDAR_DAY_READ", "UNKNOWN"])("unexpected lower %s cannot reinterpret an already classified source", async status => {
    m.lower.mockResolvedValue({ status, sourceCompleted: false, committed: true });
    expect(await processPersonalSms("inbound", env, deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(calendar).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it.each([
    ["TEMPORAL_REPLY_HANDLED_NOT_EXECUTED", false], ["TEMPORAL_REPLY_FIXED_RESPONSE", true], ["NOT_TEMPORAL_CONTEXT", true],
  ])("contradictory %s/sourceCompleted=%s is never treated as a successful routing result", async (status, sourceCompleted) => {
    m.lower.mockResolvedValue({ status, sourceCompleted, committed: true, reply: "Synthetic contradiction." });
    expect(await processPersonalSms("inbound", env, deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("lower throw or unknown commit never falls through or retries", async () => {
    m.lower.mockRejectedValue(new Error("synthetic commit unknown"));
    expect(await processPersonalSms("inbound", env, deps())).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(m.lower).toHaveBeenCalledTimes(1); expect(m.execute).toHaveBeenCalledTimes(2); expect(m.execute.mock.calls[1][0]).toContain("status='uncertain'");
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
  it("passes the immutable exact source lease and original shorter deadline with an AbortSignal", async () => {
    const deadlineAt = Date.now() + 12_000; await processPersonalSms("inbound", env, { ...deps(), deadlineAt });
    const input = m.lower.mock.calls[0][0];
    expect(input.claim).toEqual({ operationId: "inbound", workspaceId: "workspace", userId: "owner", attempt: 1, leaseUntil: new Date(deadlineAt).toISOString() });
    expect(input.deadlineAt).toBe(deadlineAt); expect(input.signal).toBeInstanceOf(AbortSignal); expect(input.signal.aborted).toBe(false);
    expect(Object.isFrozen(input)).toBe(true); expect(Object.isFrozen(input.claim)).toBe(true);
    expect(m.execute.mock.calls[0][4]).toEqual(new Date(deadlineAt));
  });
  it("uncooperative lower is deadline bounded and observes aborted signal without model fallback", async () => {
    m.lower.mockImplementationOnce(() => new Promise(() => undefined));
    const work = processPersonalSms("inbound", env, { ...deps(), deadlineAt: Date.now() + 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await work).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(m.lower.mock.calls[0][0].signal.aborted).toBe(true); expect(model).not.toHaveBeenCalled(); expect(m.create).not.toHaveBeenCalled();
  });
});
