import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  cancelVoiceIntakeSession,
  finishVoiceIntakeSession,
  markVoiceIntakeSessionOutcome,
  registerVoiceIntakeSegment,
} from "@/server/model-gateway/voice/sessions";
import { reserveVoiceAiOperation } from "@/server/model-gateway/voice/operations";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

async function fixture() {
  const clientId = id("voice_client");
  const sessionId = id("voice_session");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "User" (id,name,email,role,"createdAt","updatedAt") VALUES ($1,'Voice client',$2,'CLIENT',now(),now())`,
    clientId, `${clientId}@example.invalid`
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "VoiceIntakeSession" (id,"clientId",status,"languageHint","consentVersion","consentedAt","maxDurationMs","maxSegmentDurationMs","maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expiresAt","createdAt","updatedAt") VALUES ($1,$2,'open','en','voice-disclosure-v1',now(),600000,45000,2000000,14,28000000,500000,now()+interval '24 hours',now(),now())`,
    sessionId, clientId
  );
  return { actor: { id: clientId, role: "CLIENT" } as const, sessionId };
}

describe("voice registration, finish and cancel concurrency", () => {
  it("converges concurrent identical registration and gives a conflicting ordinal one winner", async () => {
    const { actor, sessionId } = await fixture();
    const input = {
      actor, sessionId, ordinal: 0, mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000, audioBytes: new Uint8Array([1, 2, 3]),
    } as const;
    const identical = await Promise.all([registerVoiceIntakeSegment(input), registerVoiceIntakeSegment(input)]);
    expect(new Set(identical.map((item) => item.segmentId)).size).toBe(1);
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "VoiceIntakeSegment" WHERE "sessionId"=$1`, sessionId))
      .toHaveLength(1);

    await expect(registerVoiceIntakeSegment({ ...input, audioBytes: new Uint8Array([9]) }))
      .rejects.toThrow("voice_segment_conflict");
  });

  it("freezes a contiguous expected count and reserves one operation per segment", async () => {
    const { actor, sessionId } = await fixture();
    const registered = await registerVoiceIntakeSegment({
      actor, sessionId, ordinal: 0, mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000, audioBytes: new Uint8Array([1, 2, 3]),
    });
    await expect(finishVoiceIntakeSession({ actor, sessionId, expectedSegmentCount: 1 }))
      .resolves.toMatchObject({ status: "transcribing", expectedSegmentCount: 1 });
    await expect(finishVoiceIntakeSession({ actor, sessionId, expectedSegmentCount: 2 }))
      .rejects.toThrow("voice_segment_conflict");
    const [first, second] = await Promise.all([
      reserveVoiceAiOperation({ actor, sessionId, segmentId: registered.segmentId, audioFingerprint: registered.audioFingerprint }),
      reserveVoiceAiOperation({ actor, sessionId, segmentId: registered.segmentId, audioFingerprint: registered.audioFingerprint }),
    ]);
    expect(first).toEqual(second);
  });

  it("cancels by CAS, blocks late registration and never revives to ready", async () => {
    const { actor, sessionId } = await fixture();
    await expect(cancelVoiceIntakeSession({ actor, sessionId })).resolves.toMatchObject({ status: "cancelled" });
    await expect(cancelVoiceIntakeSession({ actor, sessionId })).resolves.toMatchObject({ status: "cancelled" });
    await expect(registerVoiceIntakeSegment({
      actor, sessionId, ordinal: 0, mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000, audioBytes: new Uint8Array([1]),
    })).rejects.toThrow("voice_session_closed");
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET status='ready' WHERE id=$1`, sessionId
    )).rejects.toThrow();
    await expect(finishVoiceIntakeSession({ actor, sessionId, expectedSegmentCount: 1 }))
      .rejects.toThrow("voice_session_closed");
  });

  it("closes a transcribing session into an explicit incomplete/uncertain outcome", async () => {
    const { actor, sessionId } = await fixture();
    await registerVoiceIntakeSegment({
      actor, sessionId, ordinal: 0, mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000, audioBytes: new Uint8Array([1]),
    });
    await finishVoiceIntakeSession({ actor, sessionId, expectedSegmentCount: 1 });
    await expect(markVoiceIntakeSessionOutcome({ actor, sessionId, outcome: "uncertain" }))
      .resolves.toEqual({ status: "uncertain", assemblyFingerprint: null });
    await expect(markVoiceIntakeSessionOutcome({
      actor, sessionId, outcome: "ready", assemblyFingerprint: `sha256:${"a".repeat(64)}`,
    })).rejects.toThrow("voice_session_closed");
  });
});
