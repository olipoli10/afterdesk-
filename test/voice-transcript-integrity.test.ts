import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $queryRawUnsafe: vi.fn(), $executeRawUnsafe: vi.fn(), $transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { assembleVoiceTranscriptDraft } from "@/server/model-gateway/voice/assembly";
import { loadVoiceTranscriptSegment } from "@/server/model-gateway/voice/transcripts";

const segment = (text: string) => ({ ordinal: 0, status: "succeeded", audioFingerprint: `sha256:${"a".repeat(64)}`,
  text, textFingerprint: canonicalFingerprint(text), purgedAt: null });
const reader = { actor: { id: "synthetic-client", role: "CLIENT" as const }, segmentId: "synthetic-segment",
  now: new Date("2026-09-10T12:00:00.000Z") };
const row = (text: string) => ({ ...segment(text), segmentId: reader.segmentId, clientId: reader.actor.id,
  expiresAt: new Date("2026-09-11T12:00:00.000Z") });
beforeEach(() => vi.clearAllMocks());

describe("exact protected transcript text integrity", () => {
  it("refuses altered assembly text with an unchanged valid fingerprint", () => {
    const original = segment("Le dosseret n'est pas terminé.");
    expect(() => assembleVoiceTranscriptDraft({ sessionId: "synthetic-session", expectedSegmentCount: 1,
      segments: [{ ...original, text: "Le dosseret est terminé." }] })).toThrow("voice_transcript_unavailable");
  });
  it("refuses altered protected read text with an unchanged valid fingerprint", async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ ...row("Aucun appel approuvé."), text: "Appel approuvé." }]);
    await expect(loadVoiceTranscriptSegment(reader)).rejects.toThrow("voice_transcript_unavailable");
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("retains the exact legitimate text and existing assembly fingerprint shape", async () => {
    const text = "  Québec — demain à 14 h.\nNe pas appeler Marc.  ";
    const source = segment(text);
    const assembled = assembleVoiceTranscriptDraft({ sessionId: "synthetic-session", expectedSegmentCount: 1, segments: [source] });
    expect(assembled.text).toBe(text);
    expect(assembled.assemblyFingerprint).toBe(canonicalFingerprint({ sessionId: "synthetic-session", orderedEvidence: assembled.orderedEvidence }));
    db.$queryRawUnsafe.mockResolvedValue([row(text)]);
    await expect(loadVoiceTranscriptSegment(reader)).resolves.toMatchObject({ text, textFingerprint: canonicalFingerprint(text) });
  });
});
