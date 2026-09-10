import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { reserveAndClaimProjectBrainVoiceOperationInTransaction, voiceOperationKey } from "@/server/model-gateway/voice/operations";
const input = () => ({ actorUserId: "synthetic-owner", workspaceId: "synthetic-workspace", sessionId: "synthetic-session", segmentId: "synthetic-segment",
  audioFingerprint: `sha256:${"a".repeat(64)}`, now: new Date("2026-09-10T12:00:00Z"), leaseUntil: new Date("2026-09-10T12:00:30Z") });
function fixture() {
  const query = vi.fn().mockResolvedValue([]), execute = vi.fn().mockResolvedValue(1);
  return { query, execute, tx: { $queryRawUnsafe: query, $executeRawUnsafe: execute } as unknown as Prisma.TransactionClient };
}
describe("single-use PB claim in the existing Voice/AiOperation ledger", () => {
  it("binds exact owner+workspace+segment and claims only the newly created reserved0 row", async () => {
    const f = fixture(), value = input();
    const result = await reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, value);
    expect(result).toMatchObject({ status: "claimed", claim: { operationKey: voiceOperationKey(value), attempt: 1 } });
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.query.mock.calls[0].slice(1)).toEqual([value.segmentId, value.actorUserId, value.workspaceId, value.sessionId]);
    expect(f.execute.mock.calls[0][0]).toContain("v.\"subjectKind\"='project_brain_voice'");
    expect(f.execute.mock.calls[1][0]).toContain("status='reserved' AND attempts=0");
    expect(f.execute.mock.calls[1][0]).not.toContain("OR status");
    expect(f.execute.mock.calls[1][3]).toBeInstanceOf(Date); expect(f.execute.mock.calls[1][4]).toBeInstanceOf(Date);
    expect(f.execute.mock.calls[1][0]).toContain("($4::timestamptz AT TIME ZONE 'UTC')");
  });
  it.each(["reserved", "running", "failed", "abandoned", "succeeded"])("returns existing %s without reclaiming even under a new command", async status => {
    const f = fixture(), value = input(); f.query.mockResolvedValue([{ id: "old", operationKey: voiceOperationKey(value), status }]);
    expect(await reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, value)).toEqual({ status: "existing", operationId: "old", operationStatus: status });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects conflicting historical key before write", async () => {
    const f = fixture(); f.query.mockResolvedValue([{ id: "old", operationKey: "different", status: "reserved" }]);
    await expect(reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, input())).rejects.toThrow("voice_segment_conflict");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(["2026-09-10T12:00:00Z", "2026-09-10T12:01:00.001Z", "invalid"])("refuses nonpositive/unbounded/invalid deadline %s before DB", async value => {
    const f = fixture(); await expect(reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, { ...input(), leaseUntil: new Date(value) })).rejects.toThrow("DEADLINE_REFUSED");
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each([0, 1])("propagates insert/CAS loss for caller transaction rollback (step%s)", async failedStep => {
    const f = fixture(); if (failedStep === 0) f.execute.mockResolvedValueOnce(0); else f.execute.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, input())).rejects.toThrow("CLAIM_REFUSED");
    expect(f.execute).toHaveBeenCalledTimes(failedStep + 1);
  });
  it("copies caller fields and dates before first await", async () => {
    const f = fixture(), value = input(); const result = reserveAndClaimProjectBrainVoiceOperationInTransaction(f.tx, value);
    value.actorUserId = "changed"; value.now.setFullYear(2000); value.leaseUntil.setFullYear(2000);
    await result;
    expect(f.execute.mock.calls[0][6]).toBe("synthetic-owner");
    expect(f.execute.mock.calls[0][4].toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });
});
