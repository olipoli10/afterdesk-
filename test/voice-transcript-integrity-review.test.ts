import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRawUnsafe: db.query, $executeRawUnsafe: db.execute, $transaction: db.transaction } }));
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { assembleVoiceTranscriptDraft as assemble } from "@/server/model-gateway/voice/assembly";
import { loadVoiceTranscriptSegment as load, persistVoiceTranscriptSegment as persist } from "@/server/model-gateway/voice/transcripts";

const now = new Date("2026-09-10T12:00:00.000Z"), expiry = new Date("2026-09-11T11:00:00.000Z");
const actor = { id: "synthetic-client", role: "CLIENT" };
const segment = (ordinal: number, text: string) => ({ ordinal, text, textFingerprint: canonicalFingerprint(text),
  audioFingerprint: `sha256:${String(ordinal).padStart(64, "a")}`, status: "succeeded", purgedAt: null });
const row = (text: string) => ({ segmentId: "synthetic-segment", ordinal: 0, text, textFingerprint: canonicalFingerprint(text),
  purgedAt: null, clientId: actor.id, expiresAt: expiry });
beforeEach(() => { vi.resetAllMocks(); db.transaction.mockImplementation(callback => callback({ $queryRawUnsafe: db.query, $executeRawUnsafe: db.execute })); });

describe("independent transcript integrity counter-review", () => {
  it("rejects changed words under the old text fingerprint before a draft is assembled", () => {
    const original = segment(0, "Ajoute une visite");
    expect(() => assemble({ sessionId: "s", expectedSegmentCount: 1, segments: [{ ...original, text: "Annule une visite" }] })).toThrow("voice_transcript_unavailable");
  });
  it.each(["", "SHA256:" + "a".repeat(64), "sha256:bad"])("refuses malformed audio fingerprint %s", audioFingerprint => {
    expect(() => assemble({ sessionId: "s", expectedSegmentCount: 1, segments: [{ ...segment(0, "valide"), audioFingerprint }] })).toThrow("voice_transcript_unavailable");
  });
  it("retains exact canonical string hashing, whitespace and Unicode rather than normalizing evidence", () => {
    const result = assemble({ sessionId: "s", expectedSegmentCount: 2, segments: [segment(1, "déjà\n"), segment(0, "📅  Québec ")] });
    expect(result.text).toBe("📅  Québec déjà\n");
    expect(result.orderedEvidence.map(v => v.textFingerprint)).toEqual([canonicalFingerprint("📅  Québec "), canonicalFingerprint("déjà\n")]);
    expect(Object.isFrozen(result.orderedEvidence[0])).toBe(true);
  });
  it("changing text with its correct new hash changes the assembly fingerprint", () => {
    const make = (text: string) => assemble({ sessionId: "s", expectedSegmentCount: 1, segments: [segment(0, text)] });
    expect(make("visite").assemblyFingerprint).not.toBe(make("autre visite").assemblyFingerprint);
  });
  it("load refuses corrupted text even when owner, expiry and stored fingerprint look valid", async () => {
    db.query.mockResolvedValue([{ ...row("texte exact"), text: "texte changé" }]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).rejects.toThrow("voice_transcript_unavailable");
    expect(db.execute).not.toHaveBeenCalled(); expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each(["", "x".repeat(20_001)])("load refuses empty or excessive self-consistently hashed text (case %#)", async text => {
    db.query.mockResolvedValue([row(text)]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).rejects.toThrow("voice_transcript_unavailable");
  });
  it("load preserves exact maximum-length content with a matching fingerprint", async () => {
    const exact = "x".repeat(20_000); db.query.mockResolvedValue([row(exact)]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).resolves.toMatchObject({ status: "succeeded", text: exact, textFingerprint: canonicalFingerprint(exact) });
  });
  it("hash validity cannot bypass ownership, expiry or purge", async () => {
    db.query.mockResolvedValue([{ ...row("exact"), clientId: "another-client" }]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).rejects.toThrow("voice_session_not_owned");
    db.query.mockResolvedValue([{ ...row("exact"), expiresAt: now }]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).rejects.toThrow("voice_session_expired");
    db.query.mockResolvedValue([{ ...row("exact"), purgedAt: now }]);
    await expect(load({ actor, segmentId: "synthetic-segment", now })).rejects.toThrow("voice_transcript_unavailable");
  });
  it("persist never submits a text/fingerprint mismatch after caller mutation during authorization", async () => {
    const input = { actor, segmentId: "synthetic-segment", gatewayAttemptId: "synthetic-attempt", text: "texte original", now };
    let inserted: ReturnType<typeof row> | undefined;
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('a."resultContractStatus"')) {
        input.text = "texte modifié";
        return [{ segmentId: input.segmentId, ordinal: 0, clientId: actor.id, sessionExpiresAt: expiry, segmentStatus: "succeeded",
          attemptStatus: "settled", resultContractStatus: "valid", finalAttemptId: input.gatewayAttemptId }];
      }
      return inserted ? [inserted] : [];
    });
    db.execute.mockImplementation(async (_sql: string, _id: string, segmentId: string, _attempt: string, text: string, textFingerprint: `sha256:${string}`) => {
      inserted = { ...row(text), segmentId, textFingerprint }; return 1;
    });
    await persist(input).catch(() => undefined);
    if (inserted) expect(inserted.textFingerprint).toBe(canonicalFingerprint(inserted.text));
    else expect(db.execute).not.toHaveBeenCalled();
  });
  it("persist preserves legitimate IDs, actor, time and cost primitives across the authorization await", async () => {
    const input = { actor: { ...actor }, segmentId: "original-segment", gatewayAttemptId: "original-attempt", text: "mots exacts",
      reportedAudioSeconds: 2.5, measuredCostMicros: 12n, now: new Date(now.getTime()) };
    let inserted: ReturnType<typeof row> | undefined;
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('a."resultContractStatus"')) {
        input.actor.id = "another-client"; input.segmentId = "another-segment"; input.gatewayAttemptId = "another-attempt";
        input.text = "autre texte"; input.reportedAudioSeconds = 99; input.measuredCostMicros = 999n; input.now.setUTCFullYear(2040);
        return [{ segmentId: "original-segment", ordinal: 0, clientId: actor.id, sessionExpiresAt: expiry, segmentStatus: "succeeded",
          attemptStatus: "settled", resultContractStatus: "valid", finalAttemptId: "original-attempt" }];
      }
      return inserted ? [inserted] : [];
    });
    db.execute.mockImplementation(async (_sql: string, _id: string, segmentId: string, _attempt: string, text: string, textFingerprint: `sha256:${string}`) => {
      inserted = { ...row(text), segmentId, textFingerprint }; return 1;
    });
    await expect(persist(input)).resolves.toMatchObject({ status: "succeeded", segmentId: "original-segment", text: "mots exacts", textFingerprint: canonicalFingerprint("mots exacts") });
    expect(db.query.mock.calls[0].slice(1)).toEqual(["original-segment", "original-attempt"]);
    expect(db.query.mock.calls[1].slice(1)).toEqual(["original-segment"]);
    const submitted = db.execute.mock.calls[0];
    expect(submitted.slice(2, 9)).toEqual(["original-segment", "original-attempt", "mots exacts", canonicalFingerprint("mots exacts"), 11, 2.5, 12n]);
    expect(submitted[10]).toEqual(now);
  });
});
