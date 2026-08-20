import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

describe("voice intake migration and historical meaning", () => {
  it("creates the three additive voice tables", async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'Voice%' ORDER BY table_name`
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "VoiceIntakeSegment",
      "VoiceIntakeSession",
      "VoiceTranscriptSegment",
    ]);
  });

  it("preserves historical non-voice operations with no task", async () => {
    const operationId = id("historical_aiop");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AiOperation" (id,purpose,"operationKey",status,attempts,"createdAt","updatedAt") VALUES ($1,'classification',$2,'reserved',0,now(),now())`,
      operationId,
      id("historical_key")
    );
    const [row] = await prisma.$queryRawUnsafe<
      { id: string; taskId: string | null; voiceIntakeSegmentId: string | null }[]
    >(
      `SELECT id,"taskId","voiceIntakeSegmentId" FROM "AiOperation" WHERE id=$1`,
      operationId
    );
    expect(row).toEqual({ id: operationId, taskId: null, voiceIntakeSegmentId: null });
  });

  it("requires a voice operation to bind one segment and no task", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "AiOperation" (id,purpose,"operationKey",status,attempts,"createdAt","updatedAt") VALUES ($1,'intake_voice_transcription',$2,'reserved',0,now(),now())`,
        id("bad_voice_aiop"),
        id("bad_voice_key")
      )
    ).rejects.toThrow();
  });
});
