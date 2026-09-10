import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), tx: vi.fn(), admission: vi.fn(), namespace: vi.fn(), guard: vi.fn(), inspect: vi.fn(), attach: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.claim,
  $transaction: m.tx, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-authority", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/personal-assistant/sms-temporal-clarification-authority")>(),
  temporalRegistryTransaction: m.guard, temporalLockSourceNamespace: m.namespace }));
vi.mock("@/server/personal-assistant/sms-temporal-question-preparation", () => ({ inspectSmsTemporalQuestionPreparationInTransaction: m.inspect, attachSmsTemporalQuestionInTransaction: m.attach }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import type { PersonalModelSmsResult } from "@/server/personal-assistant/model-worker";
const initialEnv = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
  TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
  ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true" };
const row = { id: "inbound", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", kind: "personal_sms_inbound", status: "received", attempts: 0,
  requestHash: "synthetic-hash", createdAt: new Date("2026-09-10T13:00:00Z"), request: { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic",
    from: "+15005550001", to: "+15005550006", body: "Ajoute inspection demain à 2h, fin 15h.", contentHash: "synthetic-hash", identityId: "identity" } };
const baseReview = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false, accounting: "UNSETTLED", automaticRetry: false,
  semanticIntentVerified: false, modelChildOperationId: "existing-child", source: { operationId: row.id, text: row.request.body },
  actions: [{ actionId: "event", kind: "PREPARE_CALENDAR_EVENT", status: "CLARIFY", question: "Quelle heure au format 24 h?" }] };
let env: typeof initialEnv, order: string[], committed: unknown[], review: typeof baseReview;
let finish: ReturnType<typeof vi.fn>, finalize: ReturnType<typeof vi.fn>;
const wire = "Précise l’heure de début au format 24 heures. Aucune action exécutée.";
function model() { return Promise.resolve({ reply: "Une proposition doit être vérifiée.", finalizeReview: finalize } as PersonalModelSmsResult); }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T13:00:00Z")); env = { ...initialEnv }; review = structuredClone(baseReview); order = []; committed = [];
  m.find.mockResolvedValue(row); m.admission.mockResolvedValue({ operationId: row.id }); m.claim.mockResolvedValue(1);
  m.guard.mockImplementation(async () => { order.push("guard"); }); m.namespace.mockImplementation(async () => { order.push("namespace"); });
  finalize = vi.fn(async () => { order.push("review"); return review; });
  m.inspect.mockImplementation(async () => { order.push("inspect"); return { status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED", wireText: wire, modelChildOperationId: "existing-child" }; });
  m.attach.mockImplementation(async () => { order.push("attach"); return { status: "PREPARED_FOR_SOURCE_COMMIT", requiredSourceReview: review }; });
  finish = vi.fn(async () => { order.push("finish"); return 1; });
  m.tx.mockImplementation(async work => {
    const staged: unknown[] = [];
    const result = await work({ constructionCommunicationIdentity: { findFirst: async () => ({ id: "identity" }) }, $executeRawUnsafe: finish,
      personalAssistantOperation: { create: async (input: unknown) => { order.push("question"); staged.push(input); return { id: "question" }; } } });
    committed.push(...staged); return result;
  });
});
afterEach(() => vi.useRealTimers());
describe("OFF worker wiring of one exact temporal question, no provider", () => {
  it("keeps OFF behavior without namespace, inspection or attachment", async () => {
    env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false";
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.namespace).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled(); expect(m.attach).not.toHaveBeenCalled(); expect(committed).toHaveLength(1);
  });
  it("locks namespace before review and attaches the exact question before source CAS", async () => {
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(order).toEqual(["guard", "namespace", "review", "inspect", "question", "attach", "finish"]);
    expect(m.attach.mock.calls[0][1]).toMatchObject({ modelChildOperationId: "existing-child", questionOutboundOperationId: "question", actor: { userId: "owner", workspaceId: "workspace" } });
    expect(m.attach.mock.calls[0][3]).toEqual(m.inspect.mock.calls[0][3]);
    expect(committed).toEqual([expect.objectContaining({ data: expect.objectContaining({ status: "pending", request: { to: row.request.from, from: row.request.to, text: wire, sourceOperationId: row.id } }) })]);
    expect(JSON.parse(finish.mock.calls[0][6])).toMatchObject({ reply: wire, source: "MODEL_REVIEW_ONLY", personalModelReview: review, replyDelivery: "PREPARED_UNSENT" });
  });
  it("reformulates an ineligible calendar template without attaching a registry", async () => {
    m.inspect.mockResolvedValue({ status: "REFORMULATION_REQUIRED", reply: "Reformule le rendez-vous complet." });
    await processPersonalSms(row.id, env, { model });
    expect(m.attach).not.toHaveBeenCalled(); expect(JSON.parse(finish.mock.calls[0][6]).reply).toBe("Reformule le rendez-vous complet.");
  });
  it.each(["PREPARE_SELF_SMS", "PREPARE_SELF_VOICE", "READ_CALENDAR", "CLARIFY"])("does not recast a %s clarification as a calendar request", async kind => {
    review.actions[0].kind = kind; await processPersonalSms(row.id, env, { model });
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.attach).not.toHaveBeenCalled(); expect(committed).toHaveLength(1);
  });
  it("does not replace multiple actions or a prepared calendar draft", async () => {
    review.actions.push({ ...review.actions[0], actionId: "second" }); await processPersonalSms(row.id, env, { model }); expect(m.inspect).not.toHaveBeenCalled();
    review.actions.splice(1); review.actions[0].status = "PREPARED_UNSENT"; await processPersonalSms(row.id, env, { model }); expect(m.inspect).not.toHaveBeenCalled();
  });
  it("does not enable temporal inspection mid-closure without prior namespace ownership", async () => {
    env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false";
    finalize.mockImplementation(async () => { env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "true"; return review; });
    await processPersonalSms(row.id, env, { model }); expect(m.namespace).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled();
  });
  it("rolls back if preparation is revoked while finalizing review", async () => {
    finalize.mockImplementation(async () => { env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false"; return review; });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(committed).toEqual([]); expect(m.inspect).not.toHaveBeenCalled();
  });
  it.each(["refused", "changed-review", "revoked"])("rolls back the question when post-insertion attachment is %s", async failure => {
    m.attach.mockImplementation(async () => {
      if (failure === "refused") throw new Error("CURRENT_BINDING_REQUIRED");
      if (failure === "revoked") env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false";
      return { status: "PREPARED_FOR_SOURCE_COMMIT", requiredSourceReview: failure === "changed-review" ? { ...review, modelChildOperationId: "another-child" } : review };
    });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(order).toContain("question"); expect(committed).toEqual([]); expect(finish).not.toHaveBeenCalled();
  });
  it("source final CAS loss cannot commit its question", async () => {
    finish.mockResolvedValue(0); expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(m.attach).toHaveBeenCalledTimes(1); expect(committed).toEqual([]);
  });
  it("never truncates an eligible question into a different stored request", async () => {
    m.inspect.mockResolvedValue({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED", wireText: "x".repeat(1501), modelChildOperationId: "existing-child" });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" }); expect(order).not.toContain("question"); expect(committed).toEqual([]);
  });
});
