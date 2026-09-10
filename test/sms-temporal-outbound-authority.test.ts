import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
const mocks = vi.hoisted(() => ({ lock: vi.fn(), current: vi.fn(), question: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-proof", () => ({ temporalRegistryLockProof: mocks.lock, temporalRegistryCurrentProof: mocks.current }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification", () => ({ smsTemporalClarificationQuestionRequest: mocks.question }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { inspectTemporalOutboundSourceInTransaction as inspect } from "@/server/personal-assistant/sms-temporal-outbound-authority";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";

function fixture() {
  const env = { ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true" };
  const row = { id: "question", workspaceId: "workspace", createdByUserId: "owner", kind: "sms_outbound", idempotencyKey: "reply:source", requestHash: "hash" };
  const request = { to: "+15005550001", from: "+15005550006", sourceOperationId: "source", text: "Quelle heure exacte?" };
  const stored = { id: "clarification", namespace: "pair", phase: "PREPARED", questionOutboundOperationId: row.id, sourceOperationId: "source",
    questionRequestHash: "hash", prepared: { synthetic: true }, preparedHash: "prepared-hash", bindingHash: "binding-hash", expiresAt: new Date(Date.now() + 60000) };
  const state = { attachments: [{ id: stored.id, workspaceId: row.workspaceId, userId: row.createdByUserId }], active: [{ id: "temporal:clarification" }], order: [] as string[] };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM "PersonalSmsTemporalClarification"')) { state.order.push("discover"); return state.attachments; }
    if (sql.includes("transaction_isolation")) return [{ isolation: "serializable" }];
    if (sql.includes("set_config")) return [];
    if (sql.includes("PersonalSmsConversationExpectation")) { state.order.push("active"); return state.active; }
    if (sql.includes("clock_timestamp")) return [{ now: new Date() }];
    throw new Error("UNEXPECTED_TEST_QUERY");
  });
  const tx = { $queryRawUnsafe: query } as unknown as Prisma.TransactionClient;
  mocks.lock.mockImplementation(async () => { state.order.push("namespace-and-registry"); return stored; });
  mocks.current.mockImplementation(async () => { state.order.push("current-authority"); return {}; });
  mocks.question.mockReturnValue(request);
  const context = { deadlineAt: Date.now() + 30000, signal: new AbortController().signal };
  return { env, row, request, stored, state, query, tx, context, run: () => inspect(tx, row, request, env, context) };
}
beforeEach(() => vi.resetAllMocks());
describe("temporal restriction on an existing ordinary outbound", () => {
  it("discovers absence while OFF without acquiring registry locks", async () => {
    const f = fixture(); f.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED = "false"; f.state.attachments = [];
    expect(await f.run()).toBeNull(); expect(f.query).toHaveBeenCalledTimes(1); expect(mocks.lock).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED"] as const)("attached + %s OFF never becomes an ordinary fallback", async key => {
    const f = fixture(); f.env[key] = "false";
    await expect(f.run()).rejects.toThrow("BRIDGE_DISABLED"); expect(mocks.lock).not.toHaveBeenCalled();
  });
  it.each(["workspaceId", "userId"] as const)("rejects a foreign attachment's %s", async key => {
    const f = fixture(); f.state.attachments[0][key] = "another";
    await expect(f.run()).rejects.toThrow("ATTACHMENT_CHANGED"); expect(mocks.lock).not.toHaveBeenCalled();
  });
  it("pins complete proof and exact original context; no sending authority", async () => {
    const f = fixture(), proof = await f.run();
    expect(proof).toMatchObject({ clarificationId: "clarification", namespace: "pair", preparedHash: "prepared-hash", bindingHash: "binding-hash",
      questionRequestHash: "hash", sourceOperationId: "source", expiresAt: f.stored.expiresAt.toISOString(), executionAuthorized: false });
    const { fingerprint, ...body } = proof!; expect(fingerprint).toBe(canonicalFingerprint(body)); expect(Object.isFrozen(proof)).toBe(true);
    expect(f.state.order).toEqual(["discover", "namespace-and-registry", "current-authority", "active"]);
    expect(mocks.lock).toHaveBeenCalledWith(f.tx, { userId: "owner", workspaceId: "workspace" }, "clarification", f.context, f.env);
  });
  it.each(["phase", "questionOutboundOperationId", "sourceOperationId", "questionRequestHash"] as const)("rejects changed %s before current-authority inspection", async key => {
    const f = fixture(); f.stored[key] = "changed";
    await expect(f.run()).rejects.toThrow("QUESTION_CHANGED"); expect(mocks.current).not.toHaveBeenCalled();
  });
  it("rejects changed full text even when the caller presents an old hash", async () => {
    const f = fixture(); mocks.question.mockReturnValue({ ...f.request, text: "other question" });
    await expect(f.run()).rejects.toThrow("QUESTION_CHANGED");
  });
  it("rejects a lost shared active slot", async () => {
    const f = fixture(); f.state.active = [];
    await expect(f.run()).rejects.toThrow("EXPECTATION_CHANGED");
  });
  it("propagates revoked authority with no ordinary fallback", async () => {
    const f = fixture(); mocks.current.mockRejectedValue(new Error("REVOKED"));
    await expect(f.run()).rejects.toThrow("REVOKED");
  });
  it("rechecks bridge flag after authority latency", async () => {
    const f = fixture(); mocks.current.mockImplementation(async () => { f.env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "false"; });
    await expect(f.run()).rejects.toThrow("BRIDGE_DISABLED");
  });
  it("refuses TTL expiration under the current DB clock", async () => {
    const f = fixture(); f.stored.expiresAt = new Date(Date.now() - 1);
    await expect(f.run()).rejects.toThrow("EXPIRED");
  });
  it("refuses a stale original deadline before any query", async () => {
    const f = fixture(); f.context.deadlineAt = Date.now() - 1;
    await expect(f.run()).rejects.toThrow("DEADLINE"); expect(f.query).not.toHaveBeenCalled();
  });
});
