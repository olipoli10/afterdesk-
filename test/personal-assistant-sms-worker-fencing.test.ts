import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn(), update: vi.fn(), execute: vi.fn(), transaction: vi.fn(), workspace: vi.fn(), admission: vi.fn(), engine: vi.fn(), send: vi.fn(), calendar: vi.fn(), googleAuthority: vi.fn(), confirmation: vi.fn(), prepareConfirmation: vi.fn(), prepareBridge: vi.fn(), sendSummary: vi.fn(), maintenance: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  personalAssistantOperation: { findUnique: mocks.find, findMany: mocks.list, updateMany: mocks.update },
  constructionWorkspace: { findUniqueOrThrow: mocks.workspace }, $executeRawUnsafe: mocks.execute, $transaction: mocks.transaction,
} }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: mocks.admission }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: mocks.engine }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ readGoogleCalendarWithAuthority: mocks.calendar, requireGoogleReadAuthority: mocks.googleAuthority }));
vi.mock("@/server/personal-assistant/outbox", () => ({ sendAutomaticPersonalReply: mocks.send, sendAutomaticCalendarConfirmationSummary: mocks.sendSummary }));
vi.mock("@/server/personal-assistant/calendar-confirmation-worker", () => ({ processCalendarConfirmationSms: mocks.confirmation }));
vi.mock("@/server/personal-assistant/calendar-confirmation-preparation", () => ({ prepareCalendarConfirmationForReviewInTransaction: mocks.prepareConfirmation }));
vi.mock("@/server/personal-assistant/calendar-confirmation-bridge", () => ({ prepareCalendarConfirmationOutboundInTransaction: mocks.prepareBridge }));
vi.mock("@/server/personal-assistant/calendar-confirmation-maintenance", () => ({ maintainCalendarSmsConfirmations: mocks.maintenance }));
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
  mocks.googleAuthority.mockResolvedValue({});
  mocks.transaction.mockImplementation(async work => {
    const staged: unknown[] = [];
    const result = await work({ constructionCommunicationIdentity: { findFirst: async () => ({ id: "identity" }) },
      $executeRawUnsafe: finish, personalAssistantOperation: { create: async (value: unknown) => { staged.push(value); } } });
    committedReplies.push(...staged); return result;
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("personal SMS source deadline and exact ownership", () => {
  const maintenanceEnv = { ...env, ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED: "true" };
  it("runs only scoped bookkeeping after verified claim and before interpretation", async () => {
    mocks.maintenance.mockImplementation(async () => { expect(mocks.execute).toHaveBeenCalledTimes(1); expect(mocks.engine).not.toHaveBeenCalled(); });
    await processPersonalSms(row.id, maintenanceEnv);
    expect(mocks.maintenance).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ actor: { userId: "owner", workspaceId: "workspace" }, batchSize: 25,
      deadlineAt: Date.parse("2026-09-10T03:00:35Z") }), maintenanceEnv);
  });
  it("can keep independent work after bookkeeping failure, without opening an effect route", async () => {
    mocks.maintenance.mockRejectedValue(new Error("synthetic locked bookkeeping"));
    expect(await processPersonalSms(row.id, maintenanceEnv)).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(mocks.engine).toHaveBeenCalledTimes(1); expect(mocks.confirmation).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not interpret if bookkeeping has consumed the original deadline", async () => {
    mocks.maintenance.mockImplementation(async () => { vi.setSystemTime(new Date("2026-09-10T03:00:35Z")); throw new Error("synthetic timeout"); });
    expect(await processPersonalSms(row.id, maintenanceEnv)).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(mocks.engine).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
  });
  const confirmationEnv = { ...env, ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" };
  const singleReview = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", source: { operationId: row.id }, modelChildOperationId: "model-child",
    actions: [{ actionId: "action", kind: "PREPARE_CALENDAR_EVENT", status: "PREPARED_UNSENT", operationId: "calendar", requestHash: "synthetic-calendar-hash" }] };
  it("prepares dedicated bridge only after exact original source final CAS, never in ordinary reply text", async () => {
    const model = vi.fn(async () => ({ reply: "Proposition.", finalizeReview: async () => singleReview }));
    mocks.prepareConfirmation.mockResolvedValue({ status: "PREPARED_FOR_SOURCE_COMMIT", challengeId: "challenge" });
    mocks.prepareBridge.mockImplementation(async () => { expect(finish).toHaveBeenCalledTimes(1); return { status: "PREPARED_UNSENT" }; });
    expect(await processPersonalSms(row.id, { ...confirmationEnv, ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, { model: model as never })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(mocks.prepareBridge.mock.calls[0][1]).toEqual({ actor: { userId: "owner", workspaceId: "workspace" }, challengeId: "challenge" });
    const result = JSON.parse(finish.mock.calls[0][6]); expect(result.personalModelReview).toEqual(singleReview);
    expect(result.reply).not.toContain("CONFIRME ENDVERA AGENDA"); expect(result.reply).toContain("aucun ajout Google");
  });
  it("rolls back ordinary acknowledgement when dedicated bridge preparation fails", async () => {
    const model = vi.fn(async () => ({ reply: "Proposition.", finalizeReview: async () => singleReview }));
    mocks.prepareConfirmation.mockResolvedValue({ status: "PREPARED_FOR_SOURCE_COMMIT", challengeId: "challenge" });
    mocks.prepareBridge.mockRejectedValue(new Error("synthetic revoked send grant"));
    expect(await processPersonalSms(row.id, { ...confirmationEnv, ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, { model: model as never })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(committedReplies).toEqual([]); expect(mocks.sendSummary).not.toHaveBeenCalled();
  });
  it("keeps app review when another challenge is active", async () => {
    const model = vi.fn(async () => ({ reply: "Proposition.", finalizeReview: async () => singleReview }));
    mocks.prepareConfirmation.mockResolvedValue({ status: "APP_REVIEW_ONLY", reason: "EXISTING_CONFIRMATION_NOT_REPLACED" });
    expect(await processPersonalSms(row.id, { ...confirmationEnv, ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, { model: model as never })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(mocks.prepareBridge).not.toHaveBeenCalled();
    expect(JSON.parse(finish.mock.calls[0][6]).reply).toContain("avant d’approuver dans l’app");
  });
  it("routes queued summary through dedicated sender inside the original batch deadline", async () => {
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "summary", idempotencyKey: "calendar-confirmation:challenge" }]);
    const deadlineAt = Date.now() + 4000;
    expect(await drainPersonalSms({ ...confirmationEnv, ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, 1, { deadlineAt })).toMatchObject({ processed: 0 });
    expect(mocks.sendSummary).toHaveBeenCalledExactlyOnceWith("summary", expect.anything(), undefined, expect.objectContaining({ deadlineAt }));
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.list.mock.calls[1][0].take).toBe(1);
  });
  it("does not select summary branch while store flag is off", async () => {
    mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await drainPersonalSms({ ...confirmationEnv, ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "false", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" }, 1);
    expect(mocks.list.mock.calls[1][0].where.idempotencyKey).toEqual({ startsWith: "reply:" }); expect(mocks.sendSummary).not.toHaveBeenCalled();
  });
  it.each(["CONFIRMATION_HANDLED", "REFUSED"])("uses guarded confirmation %s without another final CAS or interpretation", async status => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "CONFIRME ENDVERA AGENDA arbre lune rive sable" } });
    mocks.confirmation.mockResolvedValue({ status }); const model = vi.fn();
    expect(await processPersonalSms(row.id, confirmationEnv, { model })).toEqual({ status: "COMPLETED_REPLY_PREPARED" });
    expect(mocks.confirmation).toHaveBeenCalledTimes(1); expect(mocks.transaction).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
  });
  it("finalizes missing challenge as refusal without model fallback", async () => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "CONFIRME ENDVERA AGENDA inconnu" } });
    mocks.confirmation.mockResolvedValue({ status: "NO_UNIQUE_PENDING_CONFIRMATION" }); const model = vi.fn();
    expect(await processPersonalSms(row.id, confirmationEnv, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled(); expect(finish).toHaveBeenCalledTimes(1);
    expect(JSON.parse(finish.mock.calls[0][6]).reply).toContain("Aucune confirmation valide");
  });
  it("retains confirmation exception as uncertain without legacy/model replay", async () => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "CONFIRME ENDVERA AGENDA arbre lune rive sable" } });
    mocks.confirmation.mockRejectedValue(new Error("synthetic commit uncertainty")); const model = vi.fn();
    expect(await processPersonalSms(row.id, confirmationEnv, { model })).toMatchObject({ status: "REVIEW_REQUIRED", automaticRetry: false });
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["true", "false"])("never interprets reserved calendar confirmation with model=%s", async flag => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "CONFIRME ENDVERA AGENDA ancien code" } });
    const model = vi.fn();
    expect(await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: flag }, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled(); expect(mocks.calendar).not.toHaveBeenCalled();
    const result = JSON.parse(finish.mock.calls[0][6]);
    expect(result).toMatchObject({ source: "CLARIFICATION", replyDelivery: "PREPARED_UNSENT" });
    expect(result.reply).toContain("Aucun ajout Google");
  });
  const googleAuthority = { schemaVersion: 1, userId: "owner", workspaceId: "workspace", accountId: "google", accountVersion: 2, credentialId: "credential", readGrantId: "grant", readGrantVersion: 1 };
  const googleRead = { result: { events: [], timeZone: "America/Toronto", complete: true, source: "GOOGLE_CALENDAR" }, authority: googleAuthority };
  it.each(["true", "false"])("reads an exact day with model=%s without a model or legacy interpreter", async flag => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "Qu’est-ce que j’ai demain?" } });
    mocks.calendar.mockResolvedValue(googleRead); const model = vi.fn();
    expect(await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: flag }, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(mocks.calendar).toHaveBeenCalledTimes(1); expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled();
    expect(mocks.calendar.mock.calls[0].slice(0, 4)).toEqual(["owner", "workspace", "2026-09-10T04:00:00.000Z", "2026-09-11T04:00:00.000Z"]);
    expect(mocks.googleAuthority).toHaveBeenCalledTimes(1);
    const result = JSON.parse(finish.mock.calls[0][6]);
    expect(result).toMatchObject({ source: "GOOGLE_CALENDAR", googleReadAuthority: googleAuthority, replyDelivery: "PREPARED_UNSENT" });
    expect(result.reply).toContain("aucun rendez-vous");
  });
  it.each(["Qu’est-ce que j’ai demain et annule tout", "Ne regarde pas mon calendrier demain", "Si Marc vient, montre mon horaire demain"])("never routes a mixed/negative/conditional request directly: %s", async body => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body } });
    const model = vi.fn(async () => ({ reply: "Précise ta demande." }));
    await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" }, { model });
    expect(model).toHaveBeenCalledTimes(1); expect(mocks.calendar).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled();
  });
  it.each(["disconnected", "incomplete", "revoked-before-commit"])("does not invent an empty calendar or use model fallback when %s", async failure => {
    mocks.find.mockResolvedValue({ ...row, request: { ...row.request, body: "Mon agenda demain" } });
    mocks.calendar.mockResolvedValue(googleRead);
    if (failure === "disconnected") mocks.calendar.mockRejectedValue(new Error("GOOGLE_NOT_CONNECTED"));
    if (failure === "incomplete") mocks.calendar.mockResolvedValue({ ...googleRead, result: { ...googleRead.result, complete: false } });
    if (failure === "revoked-before-commit") mocks.googleAuthority.mockRejectedValue(new Error("GOOGLE_READ_ACCESS_REFUSED"));
    const model = vi.fn();
    expect(await processPersonalSms(row.id, { ...env, ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" }, { model })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(model).not.toHaveBeenCalled(); expect(mocks.engine).not.toHaveBeenCalled(); expect(committedReplies).toHaveLength(0); expect(finish).not.toHaveBeenCalled();
  });
  it("bounds the entire drain by a shorter caller deadline", async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 10 }, () => ({ id: row.id })));
    mocks.engine.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ reply: "Synthétique" }), 20_000)));
    const pending = drainPersonalSms(env, 10, { deadlineAt: Date.now() + 5_000 });
    await vi.advanceTimersByTimeAsync(6_000); expect(await pending).toMatchObject({ deadlineReached: true, processed: 0 });
    expect(mocks.engine).toHaveBeenCalledTimes(1); expect(committedReplies).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(30_000); expect(committedReplies).toHaveLength(0);
  });
  it("rejects nonfinite batch deadlines before doing work", async () => {
    await expect(drainPersonalSms(env, 1, { deadlineAt: NaN })).rejects.toThrow("SMS_WORKER_DEADLINE_INVALID");
    expect(mocks.list).not.toHaveBeenCalled();
  });
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
