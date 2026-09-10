import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), claim: vi.fn(), tx: vi.fn(), admission: vi.fn(), namespace: vi.fn(), guard: vi.fn(), inspect: vi.fn(), attach: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { personalAssistantOperation: { findUnique: m.find }, $executeRawUnsafe: m.claim,
  $transaction: m.tx, constructionWorkspace: { findUniqueOrThrow: async () => ({ defaultTimezone: "America/Toronto" }) } } }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: m.admission }));
vi.mock("@/server/personal-assistant/sms-temporal-reply-worker", () => ({ processSmsTemporalReply: async () => ({ status: "NOT_TEMPORAL_CONTEXT", sourceCompleted: false, executionAuthorized: false, committed: true }) }));
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

/** Reviewer-authored worker race oracles reuse the explicit staged fake transaction.
 * No actual registry/DB/provider behavior is inferred from this scaffold. */
describe("independent temporal worker final transaction boundaries", () => {
  it("a preparation switch revoked during the awaited final source CAS must roll back its question", async () => {
    finish.mockImplementation(async () => {
      order.push("finish"); env.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false"; return 1;
    });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(order).toContain("attach"); expect(order).toContain("finish"); expect(committed).toEqual([]);
  });
  it("deadline expiry during final source CAS cannot leave a newly committed question", async () => {
    finish.mockImplementation(async () => {
      order.push("finish"); vi.setSystemTime(m.inspect.mock.calls[0][3].deadlineAt); return 1;
    });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(order).toContain("finish"); expect(committed).toEqual([]);
  });
  it("canonical whole-review equality tolerates key order but not missing fields", async () => {
    m.attach.mockImplementationOnce(async () => {
      order.push("attach");
      return { status: "PREPARED_FOR_SOURCE_COMMIT", requiredSourceReview: Object.fromEntries(Object.entries(review).reverse()) };
    });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(committed).toHaveLength(1);
  });
  it("the actual SELF_CALL kind stays outside calendar question preparation", async () => {
    review.actions[0].kind = "PREPARE_SELF_CALL";
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.attach).not.toHaveBeenCalled();
  });
  it("a model reply without canonical finalizer cannot gain correlated question authority", async () => {
    const rawModel = async () => ({ reply: "Proposition locale." });
    expect(await processPersonalSms(row.id, env, { model: rawModel })).toMatchObject({ status: "COMPLETED_REPLY_PREPARED" });
    expect(m.namespace).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled(); expect(m.attach).not.toHaveBeenCalled();
  });
  it("DISABLED after insertion is a rollback, not a prepared registry", async () => {
    m.attach.mockResolvedValueOnce({ status: "DISABLED", executionAuthorized: false });
    expect(await processPersonalSms(row.id, env, { model })).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(order).toContain("question"); expect(finish).not.toHaveBeenCalled(); expect(committed).toEqual([]);
  });
});
