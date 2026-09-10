import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), find: vi.fn(), unique: vi.fn(), usage: vi.fn(), tx: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { aiOperation: { updateMany: mocks.update, findUnique: mocks.find, findUniqueOrThrow: mocks.unique },
  aiUsage: { create: mocks.usage }, $transaction: mocks.tx } }));
import { claimAiOperation, failAiOperation, recordSupersededUsage, succeedAiOperation } from "@/server/ai-operations";
const claim = { operationId: "synthetic-pb-ai", operationKey: "voice-intake:synthetic", lockedBy: "synthetic-owner-token", attempt: 1 };
const usage = { model: "synthetic", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0, stopReason: null };
const filter = { OR: [{ voiceIntakeSegmentId: null }, { voiceIntakeSegment: { is: { session: { is: { subjectKind: "voice_intake" } } } } }] };
beforeEach(() => {
  vi.resetAllMocks(); mocks.update.mockResolvedValue({ count: 0 });
  mocks.tx.mockImplementation(async callback => callback({ aiOperation: { updateMany: mocks.update }, aiUsage: { create: mocks.usage } }));
  mocks.find.mockResolvedValue({ purpose: "intake_voice_transcription", personalAssistantOperationId: null, voiceIntakeSegmentId: "synthetic-segment",
    voiceIntakeSegment: { session: { subjectKind: "project_brain_voice" } } });
});
describe("PB is excluded from all generic retry/Task accounting entry points", () => {
  it("claim CAS embeds a closed DB relation filter without changing the legacy status branches", async () => {
    expect(await claimAiOperation(claim.operationKey)).toBeNull();
    const where = mocks.update.mock.calls[0][0].where;
    expect(where.AND).toEqual([filter]); expect(where.purpose).toEqual({ not: "personal_intent_candidate_v1" });
    expect(where.OR.map((branch: { status: string }) => branch.status)).toEqual(["reserved", "failed", "running"]);
    expect(mocks.unique).not.toHaveBeenCalled();
  });
  it("generic success never invokes the business write when PB fence excludes the row", async () => {
    const writeResult = vi.fn();
    await expect(succeedAiOperation({ claim, taskId: "fake-task", purpose: "classification", usage, writeResult })).rejects.toThrow("reclaimed");
    expect(mocks.update.mock.calls[0][0].where.AND).toEqual([filter]);
    expect(writeResult).not.toHaveBeenCalled(); expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("generic failure cannot fall through to a false Task/Anthropic usage row", async () => {
    await expect(failAiOperation({ claim, taskId: "fake-task", purpose: "classification", usage, error: "synthetic" })).rejects.toThrow("VOICE_PB_LEGACY_USAGE_REFUSED");
    expect(mocks.update.mock.calls[0][0].where.AND).toEqual([filter]); expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.find.mock.calls[0][0].select.voiceIntakeSegment).toEqual({ select: { session: { select: { subjectKind: true } } } });
  });
  it.each(["project_brain_voice", "unknown", undefined])("superseded accounting rejects nonlegacy voice subject %s despite lying caller purpose", async subjectKind => {
    mocks.find.mockResolvedValue({ purpose: "classification", personalAssistantOperationId: null, voiceIntakeSegmentId: "segment",
      voiceIntakeSegment: { session: { subjectKind } } });
    await expect(recordSupersededUsage(claim, "fake-task", "classification", usage)).rejects.toThrow("VOICE_PB_LEGACY_USAGE_REFUSED");
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("missing relation for a non-null voice FK is refused", async () => {
    mocks.find.mockResolvedValue({ purpose: "classification", voiceIntakeSegmentId: "segment", voiceIntakeSegment: null });
    await expect(recordSupersededUsage(claim, "fake-task", "classification", usage)).rejects.toThrow("VOICE_PB_LEGACY_USAGE_REFUSED");
  });
  it.each([null, "voice_intake"])("preserves legacy accounting for Task/no-voice or CLIENT voice (%s)", async subjectKind => {
    mocks.find.mockResolvedValue({ purpose: "classification", personalAssistantOperationId: null, voiceIntakeSegmentId: subjectKind ? "segment" : null,
      voiceIntakeSegment: subjectKind ? { session: { subjectKind } } : null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await recordSupersededUsage(claim, "legacy-task", "classification", usage);
      expect(mocks.usage).toHaveBeenCalledTimes(1); expect(mocks.usage.mock.calls[0][0].data).toMatchObject({ taskId: "legacy-task", provider: "anthropic" });
    } finally { warn.mockRestore(); }
  });
  it("personal exclusion is still enforced first", async () => {
    mocks.find.mockResolvedValue({ purpose: "personal_intent_candidate_v1", personalAssistantOperationId: "personal" });
    await expect(recordSupersededUsage(claim, "fake-task", "classification", usage)).rejects.toThrow("PERSONAL_AI_LEGACY_USAGE_REFUSED");
  });
});
