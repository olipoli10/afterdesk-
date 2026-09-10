import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput, inspectPersonalIntentCandidate } from "@/server/model-gateway/personal-intent/contract";
import { temporalConversationNamespace, type TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
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

beforeEach(() => { vi.clearAllMocks(); fixture(); });


/** Reviewer-authored boundary tests, using the author's canonical-candidate fixture
 * and explicit mocked persistence readers; not native DB/worker proof. */
describe("independent temporal question lower boundaries", () => {
  it("parsed caller actor/lease/ids remain pinned across the proof await", async () => {
    const f = fixture(), mutable = structuredClone(args), { tx } = database();
    mocks.proof.mockImplementationOnce(async () => {
      mutable.actor.userId = "other"; mutable.sourceClaim.operationId = "other-source";
      mutable.sourceClaim.leaseUntil = "2099-01-01T00:00:00Z"; mutable.modelChildOperationId = "other-child";
      return f.proof;
    });
    expect(await inspect(tx, mutable, env, context())).toMatchObject({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED", sourceOperationId: "source", modelChildOperationId: "child" });
    expect(mocks.current).toHaveBeenCalledWith(tx, args.actor, "source", "child", env, args.sourceClaim);
  });
  it("current workspace timezone cannot silently replace the original anchor context", async () => {
    const f = fixture(); f.current.binding.timezone = "Asia/Tokyo";
    await expect(inspect(database().tx, args, env, context())).rejects.toThrow("SOURCE_CHANGED");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("abort during namespace acquisition stops before the proof reader", async () => {
    const controller = new AbortController();
    mocks.namespace.mockImplementationOnce(async () => { controller.abort(); return temporalConversationNamespace(to, from); });
    await expect(inspect(database().tx, args, env, { ...context(), signal: controller.signal })).rejects.toThrow("DEADLINE");
    expect(mocks.proof).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("post-question revocation of current authority prevents attachment", async () => {
    const { tx } = database();
    expect(await inspect(tx, args, env, context())).toMatchObject({ status: "ELIGIBLE_QUESTION_NOT_AUTHORIZED" });
    mocks.current.mockRejectedValueOnce(new Error("SYNTHETIC_CURRENT_GRANT_REVOKED"));
    await expect(attach(tx, { ...args, questionOutboundOperationId: "already-inserted" }, env, context())).rejects.toThrow("CURRENT_GRANT_REVOKED");
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("post-question OFF throws without parsing or querying, rather than returning a committable disabled result", async () => {
    const { tx, query } = database();
    await expect(attach(tx, null as never, {}, context())).rejects.toThrow("PREPARATION_DISABLED");
    expect(query).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("a disabled store result cannot count as attached", async () => {
    mocks.prepare.mockResolvedValueOnce({ status: "DISABLED", executionAuthorized: false });
    await expect(attach(database().tx, { ...args, questionOutboundOperationId: "already-inserted" }, env, context())).rejects.toThrow("STORE_RESULT_CHANGED");
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
  it("a switch withdrawal during store await forces rollback rather than returning its provisional result", async () => {
    const mutable = { ...env };
    mocks.prepare.mockImplementationOnce(async () => {
      mutable.ENDVERA_SMS_TEMPORAL_QUESTION_PREPARATION_ENABLED = "false";
      return { status: "PREPARED_FOR_SOURCE_COMMIT", committed: false };
    });
    await expect(attach(database().tx, { ...args, questionOutboundOperationId: "already-inserted" }, mutable, context())).rejects.toThrow("PREPARATION_DISABLED");
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
});
