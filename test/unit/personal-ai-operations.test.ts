import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { claimPersonalAiOperation, finishPersonalAiOperation, reservePersonalAiOperation } from "@/server/model-gateway/personal-ai-operations";
import { claimAiOperation, failAiOperation, recordSupersededUsage, succeedAiOperation } from "@/server/ai-operations";
const shared = vi.hoisted(() => ({ inspect: vi.fn(), update: vi.fn(), transaction: vi.fn(), find: vi.fn(), usage: vi.fn() }));
vi.mock("@/server/model-gateway/personal-subject", () => ({ inspectPersonalGatewaySubject: shared.inspect }));
vi.mock("@/lib/db", () => ({ prisma: { aiOperation: { updateMany: shared.update, findUnique: shared.find }, aiUsage: { create: shared.usage }, $transaction: shared.transaction } }));
const subject = { kind: "personal_assistant_operation", operationId: "synthetic-inbound", workspaceId: "synthetic-workspace" } as const;
const inspected = { subject, input: { requestFingerprint: `sha256:${"a".repeat(64)}` }, authorityFingerprint: "synthetic-authority" };
const key = `personal-intent:${subject.operationId}:${inspected.input.requestFingerprint}`;
const claim = { operationId: "synthetic-ai", operationKey: key, lockedBy: "synthetic-fence", attempt: 1 as const, subject, authorityFingerprint: inspected.authorityFingerprint };
function fixture() {
  const query = vi.fn(); const execute = vi.fn().mockResolvedValue(1);
  return { tx: { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient, query, execute };
}
beforeEach(() => { vi.clearAllMocks(); shared.inspect.mockResolvedValue(inspected); });
describe("single-use personal AiOperation primitives (synthetic transaction)", () => {
  it("reserves one explicit inbound subject without fake Task/client identifiers", async () => {
    const f = fixture(); f.query.mockResolvedValue([{ id: claim.operationId, operationKey: key, personalAssistantOperationId: subject.operationId }]);
    expect(await reservePersonalAiOperation(f.tx, subject)).toMatchObject({ operationId: claim.operationId, operationKey: key });
    expect(shared.inspect).toHaveBeenCalledWith(f.tx, subject);
    expect(f.execute.mock.calls[0][0]).toContain('ON CONFLICT ("personalAssistantOperationId") DO NOTHING');
    expect(f.execute.mock.calls[0].slice(2)).toEqual([subject.operationId, "personal_intent_candidate_v1", key]);
  });
  it("rejects changed source binding instead of reserving a second logical call", async () => {
    const f = fixture(); f.query.mockResolvedValue([{ id: claim.operationId, operationKey: "different", personalAssistantOperationId: subject.operationId }]);
    await expect(reservePersonalAiOperation(f.tx, subject)).rejects.toThrow("BINDING_CONFLICT");
  });
  it("claims only reserved attempt zero and never reclaims an expired/failed attempt", async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([{ id: claim.operationId }]).mockResolvedValueOnce([]);
    const actual = await claimPersonalAiOperation(f.tx, subject);
    expect(actual).toMatchObject({ operationId: claim.operationId, operationKey: key, attempt: 1, subject });
    expect(Object.isFrozen(actual)).toBe(true);
    expect(f.query.mock.calls[0][0]).toContain("status='reserved' AND attempts=0");
    expect(f.query.mock.calls[0][0]).not.toContain("OR status");
    expect(await claimPersonalAiOperation(f.tx, subject)).toBeNull();
  });
  it("refuses claim before writing when subject authority was revoked", async () => {
    shared.inspect.mockRejectedValue(new Error("REVOKED")); const f = fixture();
    await expect(claimPersonalAiOperation(f.tx, subject)).rejects.toThrow("REVOKED");
    expect(f.query).not.toHaveBeenCalled();
  });
  it("closes proposal inspection only behind the exact live fence and fresh authority", async () => {
    const f = fixture();
    expect(await finishPersonalAiOperation(f.tx, { claim, outcome: "PROPOSAL_INSPECTED", resultId: "proposal_1" })).toMatchObject({ executionAuthorized: false });
    const [sql, ...args] = f.execute.mock.calls[0];
    expect(sql).toContain('"lockedBy"=$3'); expect(sql).toContain('"personalAssistantOperationId"=$4');
    expect(sql).toContain('"leaseExpiresAt">now()'); expect(sql).toContain("AND status='running' AND attempts=1");
    expect(args.slice(0, 5)).toEqual([claim.operationId, key, claim.lockedBy, subject.operationId, "personal_intent_candidate_v1"]);
    expect(args[5]).toBe("succeeded");
  });
  it("does not accept a proposal after grant version changes", async () => {
    shared.inspect.mockResolvedValue({ ...inspected, authorityFingerprint: "changed" }); const f = fixture();
    await expect(finishPersonalAiOperation(f.tx, { claim, outcome: "PROPOSAL_INSPECTED", resultId: "proposal_1" })).rejects.toThrow("AUTHORITY_CHANGED");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["UNCERTAIN", "REFUSED"] as const)("records %s without needing revoked action grants", async outcome => {
    const f = fixture(); shared.inspect.mockRejectedValue(new Error("REVOKED"));
    expect(await finishPersonalAiOperation(f.tx, { claim, outcome, resultId: "evidence_1" })).toMatchObject({ executionAuthorized: false, status: outcome });
    expect(shared.inspect).not.toHaveBeenCalled();
    expect(f.execute.mock.calls[0][6]).toBe(outcome === "UNCERTAIN" ? "abandoned" : "failed");
  });
  it("refuses duplicate completion or an expired fence", async () => {
    const f = fixture(); f.execute.mockResolvedValue(0);
    await expect(finishPersonalAiOperation(f.tx, { claim, outcome: "UNCERTAIN", resultId: "evidence_1" })).rejects.toThrow("CLAIM_EXPIRED_OR_SUPERSEDED");
  });
  it("legacy claim and terminal helpers exclude personal purposes", async () => {
    shared.update.mockResolvedValue({ count: 0 });
    expect(await claimAiOperation(key)).toBeNull();
    expect(shared.update.mock.calls[0][0].where.purpose).toEqual({ not: "personal_intent_candidate_v1" });
    shared.transaction.mockImplementation(callback => callback({ aiOperation: { updateMany: shared.update } }));
    const writeResult = vi.fn();
    await expect(succeedAiOperation({ claim, taskId: "fake", purpose: "classification", usage: null, writeResult })).rejects.toThrow("reclaimed");
    expect(writeResult).not.toHaveBeenCalled();
    await failAiOperation({ claim, taskId: "fake", purpose: "classification", usage: null, error: "failed" });
    for (const call of shared.update.mock.calls) expect(call[0].where.purpose).toEqual({ not: "personal_intent_candidate_v1" });
  });
  it("legacy rejected completion cannot record non-null personal usage as Anthropic/Task billing", async () => {
    shared.update.mockResolvedValue({ count: 0 });
    shared.transaction.mockImplementation(callback => callback({ aiOperation: { updateMany: shared.update } }));
    shared.find.mockResolvedValue({ purpose: "personal_intent_candidate_v1", personalAssistantOperationId: subject.operationId });
    await expect(failAiOperation({ claim: { ...claim, operationKey: "caller-lied-about-key" }, taskId: "fabricated-task", purpose: "classification",
      usage: { model: "wrong-provider", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 1, stopReason: null }, error: "failure" })).rejects.toThrow("PERSONAL_AI_LEGACY_USAGE_REFUSED");
    expect(shared.find).toHaveBeenCalledWith({ where: { id: claim.operationId }, select: { purpose: true, personalAssistantOperationId: true } });
    expect(shared.usage).not.toHaveBeenCalled();
  });
  it("preserves genuine legacy superseded usage accounting after subject inspection", async () => {
    shared.find.mockResolvedValue({ purpose: "classification", personalAssistantOperationId: null });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await recordSupersededUsage({ ...claim, operationKey: "engine:synthetic-task:run:classification" }, "synthetic-task", "classification",
        { model: "synthetic-anthropic", inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 3, stopReason: null });
      expect(shared.usage).toHaveBeenCalledWith({ data: expect.objectContaining({ provider: "anthropic", taskId: "synthetic-task", purpose: "classification", costMicros: 3 }) });
    } finally { warning.mockRestore(); }
  });
});
