import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { voiceFixture } from "./fixtures/project-brain-voice";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), execute: vi.fn(), resolve: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/construction-operating-assistant-r36v/project-brain-intake", () => ({ readProjectBrainSourceBytesInternally: vi.fn() }));
vi.mock("@/server/model-gateway/voice/project-brain-subject", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/model-gateway/voice/project-brain-subject")>();
  return { ...actual, resolveProjectBrainVoiceSource: mocks.resolve, inspectProjectBrainVoiceSourceInTransaction: mocks.inspect };
});
import { createProjectBrainVoiceSession, projectBrainVoiceLocalConsentSchema } from "@/server/model-gateway/voice/project-brain-sessions";
import { assertVoiceSessionAccess } from "@/server/model-gateway/voice/sessions";

const tx = { $queryRawUnsafe: mocks.query, $executeRawUnsafe: mocks.execute };
const now = new Date("2026-09-10T12:00:01.000Z");
function fixture() {
  const f = voiceFixture();
  return { source: f.request, commandId: randomUUID(), segmentation: { transformer: f.manifest.transformer, segments: f.manifest.segments },
    consent: { schemaVersion: 1 as const, purpose: "PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC" as const, accepted: true as const, externalProcessingAllowed: false as const,
      version: "synthetic-reviewed-v1", actorUserId: f.request.actorUserId, workspaceId: f.request.workspaceId, projectId: f.request.projectId,
      intakeId: f.request.intakeId, sourceId: f.request.sourceId, sourceContentHash: f.source.contentHash,
      acceptedAt: "2026-09-10T12:00:00.000Z", expiresAt: "2026-09-10T13:00:00.000Z", languageHint: "fr" as const,
      maxTotalCostMicros: "1000000", retentionHours: 24 as const } };
}
beforeEach(() => {
  vi.resetAllMocks(); const f = voiceFixture();
  mocks.transaction.mockImplementation(async callback => callback(tx));
  mocks.resolve.mockResolvedValue({ status: "RESOLVED_LOCAL_NOT_AUTHORIZED", executionAuthorized: false, subject: f.subject, subjectFingerprint: sha256Canonical(f.subject), bytes: f.bytes });
  mocks.inspect.mockResolvedValue(f.subject); mocks.execute.mockResolvedValue(1);
  mocks.query.mockImplementation(async (query: string) => query.includes("clock_timestamp") ? [{ now }]
    : query.includes("FOR SHARE") ? [{ id: f.source.id }] : []);
});
const run = (input = fixture()) => createProjectBrainVoiceSession(input, { enabled: true });
describe("OFF atomic synthetic Project Brain voice session preparation", () => {
  it("OFF creates no consent, reads or writes", async () => {
    expect(await createProjectBrainVoiceSession(fixture())).toEqual({ status: "DISABLED", executionAuthorized: false });
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("creates one finishing session and exact ordered registered segments in one transaction", async () => {
    const result = await run();
    expect(result.status).toBe("PREPARED_LOCAL_NOT_AUTHORIZED");
    expect(result).toMatchObject({ executionAuthorized: false, externalTransportPerformed: false, spendReserved: false, sessionStatus: "finishing" });
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    const session = mocks.execute.mock.calls[0];
    expect(session[0]).toContain("NULL,'project_brain_voice'"); expect(session[0]).not.toContain('INSERT INTO "AiOperation"');
    const binding = JSON.parse(session[8]); expect(binding.consent.accepted).toBe(true); expect(binding.subject.actorUserId).toBe("owner-a");
    expect(session[9]).toBe(sha256Canonical(binding)); expect(session[14]).toBeInstanceOf(Date); expect(session[24]).toBeInstanceOf(Date); expect(session[25]).toBeInstanceOf(Date);
    expect(mocks.execute.mock.calls[1][3]).toBe(0); expect(mocks.execute.mock.calls[2][3]).toBe(1);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", timeout: 5000, maxWait: 2000 });
  });
  it.each([undefined, null, {}, { accepted: false }])("does not infer consent from an uploaded source (%j)", async consent => {
    await expect(run({ ...fixture(), consent } as never)).rejects.toThrow(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it.each(["actorUserId", "workspaceId", "projectId", "intakeId", "sourceId"] as const)("rejects different consent %s", async key => {
    const input = fixture(); input.consent[key] = "wrong"; await expect(run(input)).rejects.toThrow("VOICE_PB_CONSENT_SUBJECT_REFUSED"); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it("rejects consent for another source hash", async () => {
    const input = fixture(); input.consent.sourceContentHash = "0".repeat(64); await expect(run(input)).rejects.toThrow("VOICE_PB_CONSENT_SOURCE_CHANGED"); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.1", "9223372036854775808"])("rejects invalid explicit session bound %s", async value => {
    const input = fixture(); input.consent.maxTotalCostMicros = value; await expect(run(input)).rejects.toThrow(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it.each([
    ["acceptedAt", "2026-09-10T12:01:00.000Z"], ["acceptedAt", "2026-09-10T11:00:00.000Z"],
    ["expiresAt", "2026-09-10T11:59:00.000Z"], ["expiresAt", "2026-09-11T12:00:01.000Z"],
  ] as const)("refuses %s %s at DB clock", async (key, value) => {
    const input = fixture(); input.consent[key] = value; await expect(run(input)).rejects.toThrow("VOICE_PB_CONSENT_TIME_REFUSED"); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rechecks exact subject inside the locked insertion transaction", async () => {
    mocks.inspect.mockResolvedValue({ ...voiceFixture().subject, memberRevision: "2026-09-10T12:00:00.001Z" });
    await expect(run()).rejects.toThrow("VOICE_PB_CURRENT_AUTHORITY_CHANGED"); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("refuses lost joined authority before snapshot reload", async () => {
    mocks.query.mockResolvedValue([]); await expect(run()).rejects.toThrow("VOICE_PB_CURRENT_AUTHORITY_REFUSED"); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("does not retry a transaction failure or create a second ledger", async () => {
    mocks.execute.mockRejectedValue(new Error("serialization or commit failure"));
    await expect(run()).rejects.toThrow("serialization or commit failure"); expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("exact replay returns unchanged state without TTL renewal even after consent freshness expires", async () => {
    const input = fixture(); const first = await run(input);
    if (first.status === "DISABLED") throw new Error("unexpected");
    mocks.execute.mockClear();
    mocks.query.mockImplementation(async (query: string) => query.includes("clock_timestamp") ? [{ now: new Date("2026-09-11T12:00:01.000Z") }]
      : query.includes("FOR SHARE") ? [{ id: "source-a" }]
        : query.includes('FROM "VoiceIntakeSession"') ? [{ id: first.sessionId, sourceBindingHash: first.sourceBindingHash,
          segmentManifestHash: first.segmentManifestHash, status: "uncertain", requestCommandId: input.commandId }] : []);
    expect(await run(input)).toMatchObject({ status: "REPLAYED_LOCAL_NOT_AUTHORIZED", sessionId: first.sessionId, sessionStatus: "uncertain", spendReserved: false });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("new command for the same source cannot reset the session budget", async () => {
    mocks.query.mockImplementation(async (query: string) => query.includes("clock_timestamp") ? [{ now }]
      : query.includes("FOR SHARE") ? [{ id: "source-a" }]
        : query.includes('FROM "VoiceIntakeSession"') ? [{ requestCommandId: randomUUID() }] : []);
    await expect(run()).rejects.toThrow("VOICE_PB_SESSION_IDEMPOTENCY_CONFLICT"); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("normalizes consent timestamp offsets without changing the instant", () => {
    const value = fixture().consent; value.acceptedAt = "2026-09-10T08:00:00.000-04:00";
    expect(projectBrainVoiceLocalConsentSchema.parse(value).acceptedAt).toBe("2026-09-10T12:00:00.000Z");
  });
  it("legacy CLIENT authority still rejects a null-client Project Brain session", () => {
    expect(() => assertVoiceSessionAccess({ id: "pb", clientId: null, status: "finishing", consentVersion: "v1", consentedAt: now,
      expiresAt: new Date(now.getTime() + 60_000) } as never, { id: "owner-a", role: "CLIENT" }, now, ["finishing"])).toThrow("voice_session_not_owned");
  });
});
