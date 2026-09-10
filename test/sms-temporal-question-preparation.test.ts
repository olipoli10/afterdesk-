import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput, inspectPersonalIntentCandidate } from "@/server/model-gateway/personal-intent/contract";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
import { formatPersonalModelReviewMessage } from "@/server/personal-assistant/model-review-message";
import { temporalConversationNamespace, temporalSha, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { inspectSmsTemporalQuestionPreparationInTransaction as inspect, attachSmsTemporalQuestionInTransaction as attach } from "@/server/personal-assistant/sms-temporal-question-preparation";

const mocks = vi.hoisted(() => ({ proof: vi.fn(), current: vi.fn(), namespace: vi.fn(), prepare: vi.fn() }));
vi.mock("@/server/model-gateway/personal-intent/review-proof", () => ({ loadStoredPersonalIntentReviewProof: mocks.proof }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-store", () => ({ prepareSmsTemporalClarificationInTransaction: mocks.prepare }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-authority", async importOriginal => ({
  ...await importOriginal<object>(), temporalCurrentBinding: mocks.current, temporalLockSourceNamespace: mocks.namespace,
}));

const anchor = "2026-09-11T03:58:00.000Z", to = "+15145550100", from = "+15145550101";
const actor = { workspaceId: "workspace", userId: "owner" };
const args = { actor, sourceClaim: { ...actor, operationId: "source", attempt: 1 as const, leaseUntil: "2026-09-11T03:58:35.000Z" }, modelChildOperationId: "child" };
const env = { ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "true" };
const context = () => ({ deadlineAt: Date.now() + 30_000 });
function fixture(options: { start?: string; end?: string; prefix?: string; clarify?: boolean; multiple?: boolean; dependencies?: boolean } = {}) {
  const start = options.start ?? "demain à 2h", end = options.end ?? "15h";
  const body = `${options.prefix ?? "Ajoute"} inspection ${start}, fin ${end}.`;
  const input = createPersonalIntentInput("source", body);
  const span = (quote: string) => ({ quote, start: body.indexOf(quote), end: body.indexOf(quote) + quote.length });
  const action = options.clarify ? { id: "event", kind: "CLARIFY", dependsOn: [], reason: "MISSING_END_TIME" }
    : { id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("inspection"), starts: span(start), ends: span(end) };
  const proposal = { schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [action] };
  const inspected = structuredClone(inspectPersonalIntentCandidate(JSON.stringify(proposal), input));
  // These mutations represent loader-approved shape boundaries, not candidates
  // that bypass the production canonical inspector.
  if (options.multiple) inspected.proposal.actions.push({ ...action, id: "other" } as typeof inspected.proposal.actions[number]);
  if (options.dependencies) inspected.proposal.actions[0].dependsOn.push("other");
  const proof = { status: "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED", inspected,
    source: { input, receivedAt: anchor, timezone: "America/Toronto" }, row: { resultEvidenceRef: "sha256:" + "a".repeat(64), sourceRequest: { from: to, to: from } } };
  const current = { source: { operationId: "source", body, from: to, to: from, requestHash: "b".repeat(64), receivedAt: anchor },
    binding: { ...actor, ownerNumber: to, endveraNumber: from, timezone: "America/Toronto" } };
  mocks.proof.mockResolvedValue(proof); mocks.current.mockResolvedValue(current);
  mocks.namespace.mockResolvedValue(temporalConversationNamespace(to, from));
  return { proof, current, input, proposal };
}
function database(isolation = "serializable") {
  const query = vi.fn(async (sql: string) => sql.includes("transaction_isolation") ? [{ isolation }] : []);
  return { tx: { $queryRawUnsafe: query } as unknown as TemporalRegistryDB, query };
}
const deeplyFrozen = (v: unknown): boolean => !v || typeof v !== "object" || Object.isFrozen(v) && Object.values(v).every(deeplyFrozen);
beforeEach(() => { vi.clearAllMocks(); fixture(); });

describe("OFF local temporal question preparation, no worker or external effect", () => {
  it.each([{}, { ...env, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "false" }, { ...env, ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED: "TRUE" }])("OFF before parsing or database", async disabled => {
    const { tx, query } = database();
    expect(await inspect(tx, null as never, disabled, context())).toMatchObject({ status: "DISABLED", executionAuthorized: false });
    await expect(attach(tx, null as never, disabled, context())).rejects.toThrow("PREPARATION_DISABLED");
    expect(query).not.toHaveBeenCalled(); expect(mocks.proof).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each([["demain à 2h", "15h", "START"], ["demain à 14h", "3h", "END"]])("inspects exactly one %s / %s slot", async (start, end, slot) => {
    const f = fixture({ start, end }), { tx } = database();
    const result = await inspect(tx, args, env, context());
    expect(result).toMatchObject({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED", slot, anchorReceivedAt: anchor, registryPrepared: false,
      temporalResolutionPerformed: false, executionAuthorized: false, providerExecutionPerformed: false, preview: null });
    if (result.status !== "ELIGIBLE_QUESTION_NOT_AUTHORIZED") throw new Error("eligibility expected");
    const temporal = resolvePersonalCalendarTemporal(f.input, JSON.stringify(f.proposal), "event", { receivedAt: anchor, timezone: "America/Toronto" });
    if (temporal.status !== "CLARIFY") throw new Error("question expected");
    expect(result.wireText).toBe(formatPersonalModelReviewMessage({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "CLARIFY", question: temporal.question }] }));
    expect(result.request).toEqual({ to, from, text: result.wireText, sourceOperationId: "source" });
    expect(result.requestHash).toBe(temporalSha(JSON.stringify(result.request))); expect(deeplyFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("startsAtUtc"); expect(result).not.toHaveProperty("draft"); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.namespace.mock.invocationCallOrder[0]).toBeLessThan(mocks.proof.mock.invocationCallOrder[0]);
  });
  it.each(["Ne rajoute plus", "Don't add", "Si tu peux ajoute", "Ajoute puis appelle Marc pour"])("refuses unsafe context %s", async prefix => {
    fixture({ prefix }); expect(await inspect(database().tx, args, env, context())).toMatchObject({ status: "REFORMULATION_REQUIRED", reason: "UNSAFE_SOURCE_CONTEXT" });
    expect(mocks.current).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each([{ clarify: true }, { multiple: true }, { dependencies: true }])("does not ask a bare hour for an incomplete template %j", async options => {
    fixture(options); expect(await inspect(database().tx, args, env, context())).toMatchObject({ status: "REFORMULATION_REQUIRED", reason: "INCOMPLETE_ORIGINAL_TEMPLATE" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each([{ end: "3h" }, { start: "demain à 14h" }, { end: "après le dîner" }])("refuses non-unique/unsupported temporal source %j", async options => {
    fixture(options); expect(await inspect(database().tx, args, env, context())).toMatchObject({ status: "REFORMULATION_REQUIRED" }); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("requires SERIALIZABLE, live deadline, signal and exact actor before proof", async () => {
    await expect(inspect(database("read committed").tx, args, env, context())).rejects.toThrow("SERIALIZABLE");
    await expect(inspect(database().tx, args, env, { deadlineAt: Date.now() - 1 })).rejects.toThrow("DEADLINE");
    await expect(inspect(database().tx, args, env, { deadlineAt: NaN })).rejects.toThrow("DEADLINE");
    await expect(inspect(database().tx, args, env, { ...context(), signal: AbortSignal.abort() })).rejects.toThrow("DEADLINE");
    await expect(inspect(database().tx, { ...args, actor: { ...actor, userId: "other" } }, env, context())).rejects.toThrow("ACTOR_MISMATCH");
    expect(mocks.proof).not.toHaveBeenCalled();
  });
  it.each(["body", "receivedAt", "operationId", "from", "to"])("refuses changed source %s", async key => {
    const f = fixture(); Object.assign(f.current.source, { [key]: "changed" });
    await expect(inspect(database().tx, args, env, context())).rejects.toThrow("SOURCE_CHANGED");
  });
  it("refuses namespace change and flag revocation after awaits", async () => {
    mocks.namespace.mockResolvedValueOnce("wrong"); await expect(inspect(database().tx, args, env, context())).rejects.toThrow("SOURCE_CHANGED");
    const mutable = { ...env }; mocks.proof.mockImplementationOnce(async () => { mutable.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false"; return fixture().proof; });
    await expect(inspect(database().tx, args, mutable, context())).rejects.toThrow("DISABLED");
  });
  it("attaches only existing exact question through strict store, provisional source commit", async () => {
    const tx = database().tx, inspected = await inspect(tx, args, env, context());
    if (inspected.status !== "ELIGIBLE_QUESTION_NOT_AUTHORIZED") throw new Error("eligible required");
    const prepared = { status: "PREPARED_FOR_SOURCE_COMMIT", committed: false, executionAuthorized: false,
      requiredSourceReview: { status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "CLARIFY", question: inspected.question }] } };
    mocks.prepare.mockResolvedValueOnce(prepared);
    expect(await attach(tx, { ...args, questionOutboundOperationId: "question" }, env, context())).toBe(prepared);
    expect(mocks.prepare).toHaveBeenCalledWith(tx, { ...args, reviewActionId: "event", questionOutboundOperationId: "question" }, env, expect.any(Object));
    expect(mocks.proof).toHaveBeenCalledTimes(2);
  });
  it("attachment reinspection refuses changed template rather than leaving a superseded question", async () => {
    await inspect(database().tx, args, env, context()); fixture({ clarify: true });
    await expect(attach(database().tx, { ...args, questionOutboundOperationId: "question" }, env, context())).rejects.toThrow("ATTACH_REFUSED");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("switch revoked between eligibility and post-question attachment forces caller rollback", async () => {
    const mutable = { ...env }, { tx, query } = database();
    expect(await inspect(tx, args, mutable, context())).toMatchObject({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED" });
    mutable.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false";
    query.mockClear();
    await expect(attach(tx, { ...args, questionOutboundOperationId: "already-inserted" }, mutable, context())).rejects.toThrow("PREPARATION_DISABLED");
    expect(query).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("changed store question or post-store deadline throws for caller rollback", async () => {
    mocks.prepare.mockResolvedValueOnce({ status: "PREPARED_FOR_SOURCE_COMMIT", requiredSourceReview: { status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "CLARIFY", question: "changed" }] } });
    await expect(attach(database().tx, { ...args, questionOutboundOperationId: "q" }, env, context())).rejects.toThrow("STORE_RESULT_CHANGED");
    const controller = new AbortController(); mocks.prepare.mockImplementationOnce(async () => { controller.abort(); return {}; });
    await expect(attach(database().tx, { ...args, questionOutboundOperationId: "q" }, env, { ...context(), signal: controller.signal })).rejects.toThrow("DEADLINE");
  });
});
