import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";

// Only local object bytes are simulated. Source admission, database provenance,
// resolver, consent, session insertion and deferred constraints are real.
const storage = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/lib/storage-local", () => ({
  LOCAL_OBJECT_SCAN_MAX_ENTRIES: 256,
  putLocalObject: async (key: string, bytes: Buffer) => { storage.set(key, Buffer.from(bytes)); },
  readLocalObject: async (key: string) => { const bytes = storage.get(key); if (!bytes) throw new Error("SYNTHETIC_OBJECT_MISSING"); return Buffer.from(bytes); },
  deleteLocalObject: async (key: string) => { storage.delete(key); },
  scanLocalObjects: async () => ({ entries: [], scannedEntries: 0, cycleComplete: true }),
}));
import { prisma } from "@/lib/db";
import { createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { admitProjectBrainSource, processProjectBrainIntakeCommand } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { createProjectBrainVoiceSession } from "@/server/model-gateway/voice/project-brain-sessions";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { admitGatewayVoiceSegment, dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
import { claimAiOperation, failAiOperation, recordSupersededUsage, succeedAiOperation } from "@/server/ai-operations";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import { createVoiceIntakeSession, finishVoiceIntakeSession, registerVoiceIntakeSegment } from "@/server/model-gateway/voice/sessions";

requirePersonalDisposableDatabase();
afterAll(async () => { storage.clear(); await prisma.$disconnect(); });

// Existing repository synthetic AAC/M4A fixture (R36V integration suite), not user media.
const audio = Buffer.from("AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAs5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAgAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACHXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAgAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAIAAAAQAAAEAAAAAAZVtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFAbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEEc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAD6AAAAA+gWAgIAFFYhW5QAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAFHN0c3oAAAAAAAAABAAAAAIAAAAUc3RjbwAAAAAAAAABAAAC+gAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAABBtZGF0ARggBwEYIAc=", "base64");

async function fixture() {
  requirePersonalDisposableDatabase();
  const user = await prisma.user.create({ data: { email: `voice-pb-${randomUUID()}@example.invalid`, name: "Synthetic PB owner", emailVerified: true, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic PB audio" });
  const project = await createConstructionProject({ userId: user.id, workspaceId, code: `PB-${randomUUID()}`, name: "Synthetic chantier" });
  const intake = await processProjectBrainIntakeCommand({ userId: user.id, command: {
    schemaVersion: 1, action: "CREATE_PROJECT_BRAIN_INTAKE", commandId: randomUUID(), workspaceId, projectId: project.id,
  } });
  const admitted = await admitProjectBrainSource({ userId: user.id, bytes: audio, command: {
    schemaVersion: 1, action: "ADMIT_PROJECT_BRAIN_SOURCE", commandId: randomUUID(), workspaceId, projectId: project.id,
    intakeId: intake.intakeId, expectedStateVersion: intake.stateVersion, kind: "VOICE_NOTE", fileName: "synthetic.m4a", mimeType: "audio/m4a", sizeBytes: audio.length, durationMs: 256,
  } });
  const source = await prisma.constructionProjectBrainSource.findFirstOrThrow({ where: { intakeId: intake.intakeId }, include: { file: true } });
  const sourceBytes = storage.get(source.file.storageKey)!;
  const now = Date.now();
  const input = {
    source: { actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId, sourceId: source.id, expectedIntakeStateVersion: admitted.stateVersion },
    commandId: randomUUID(),
    consent: { schemaVersion: 1, purpose: "PROJECT_BRAIN_VOICE_LOCAL_SYNTHETIC", accepted: true, externalProcessingAllowed: false,
      version: "SYNTHETIC_CONSENT_NOT_PROVIDER_PERMISSION-v1", actorUserId: user.id, workspaceId, projectId: project.id, intakeId: intake.intakeId,
      sourceId: source.id, sourceContentHash: source.contentHash, acceptedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60 * 60_000).toISOString(),
      languageHint: "fr", maxTotalCostMicros: "1000000", retentionHours: 24 },
    segmentation: { transformer: { id: "synthetic-identity-fixture", version: "1", encodingProfile: "existing-small-fixture", mode: "SYNTHETIC_LOCAL" },
      segments: [{ ordinal: 0, startMs: 0, endMs: source.durationMs!, durationMs: source.durationMs!, mediaFormat: "m4a", mimeType: source.mimeType,
        bytes: sourceBytes, contentHash: source.contentHash }] },
  };
  return { user, workspaceId, project, intake, source, input };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await createProjectBrainVoiceSession(f.input, { enabled: true });
  if (result.status !== "PREPARED_LOCAL_NOT_AUTHORIZED") throw new Error(`UNEXPECTED_${result.status}`);
  return result;
}
// The small synthetic source fixture above is intentionally copied from the
// separately-owned persistence suite; importing that test file would register its tests.

async function gatewayFixture() {
  const f = await fixture(), session = await prepare(f);
  const segment = await prisma.voiceIntakeSegment.findFirstOrThrow({ where: { sessionId: session.sessionId } });
  const policyId = `pb-policy-${randomUUID()}`, routeId = `pb-route-${randomUUID()}`, routeKey = `pb-route-${randomUUID()}`;
  const privacy = { adapterKey: "voice-synthetic-direct", allowedDataClasses: ["personal_data"], billingProvider: "synthetic",
    certificationOwner: "LOCAL_TEST_FIXTURE_NOT_CERTIFICATION", effectiveAt: new Date(Date.now() - 60_000).toISOString(),
    endpointKey: "audio/transcriptions", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), intermediary: null,
    modelKey: "synthetic-stt-v1", operationTypes: ["intake_voice_transcription"], pathKind: "direct_provider", privacyPosture: "zero_retention", residency: ["CA"], tenancyMode: "route_isolated" };
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('pb-gateway-fixture-policy-version'))");
    const [version] = await tx.$queryRawUnsafe<Array<{ next: number }>>(`SELECT coalesce(max(version),0)+1 AS next FROM "ModelGatewayPolicyVersion" WHERE "policyKey"='intake-voice-transcription-v1'`);
    await tx.$executeRawUnsafe(`INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt")
      VALUES ($1,$2,1,'published','direct_provider','voice-synthetic-direct','synthetic','audio/transcriptions','synthetic-stt-v1',ARRAY['intake_voice_transcription'],ARRAY['personal_data'],'zero_retention',ARRAY['CA'],'{}'::jsonb,$3::jsonb,2000000,20000,$4,'LOCAL_SYNTHETIC_FIXTURE',(clock_timestamp() AT TIME ZONE 'UTC'),(clock_timestamp() AT TIME ZONE 'UTC'))`,
      routeId, routeKey, JSON.stringify(privacy), canonicalFingerprint({ routeId, privacy }));
    await tx.$executeRawUnsafe(`INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt")
      VALUES ($1,'intake-voice-transcription-v1',$2,'intake_voice_transcription','published',$3::jsonb,'[]'::jsonb,1,100000,'zero_retention',$4,'LOCAL_SYNTHETIC_FIXTURE',(clock_timestamp() AT TIME ZONE 'UTC'),(clock_timestamp() AT TIME ZONE 'UTC'))`,
      policyId, version.next, JSON.stringify([{ routeKey, version: 1 }]), canonicalFingerprint({ policyId, routeId }));
  });
  const input = { actor: { kind: "PROJECT_BRAIN_OWNER" as const, id: f.user.id, workspaceId: f.workspaceId }, sessionId: session.sessionId, segmentId: segment.id,
    audioBytes: f.input.segmentation.segments[0].bytes, policyId, dataClass: "personal_data" as const, privacyRequirement: "zero_retention" as const,
    maxSegmentCostMicros: 100_000n, deadline: new Date(Date.now() + 55_000) };
  const options = { enabled: true, environment: "local", voiceEnabled: true,
    env: { NODE_ENV: "test" as const, ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "1000000000" } };
  return { ...f, session, segment, input, options };
}
async function admitted(f: Awaited<ReturnType<typeof gatewayFixture>>) {
  const result = await admitGatewayVoiceSegment(f.input, f.options);
  if (result.status !== "prepared_synthetic_not_dispatched") throw new Error(`ADMISSION_${result.status}${"reasonClass" in result ? `_${result.reasonClass}` : ""}`);
  return result;
}
async function rows(f: Awaited<ReturnType<typeof gatewayFixture>>) {
  const ai = await prisma.aiOperation.findUniqueOrThrow({ where: { voiceIntakeSegmentId: f.segment.id } });
  const operation = await prisma.modelGatewayOperation.findUniqueOrThrow({ where: { aiOperationId: ai.id } });
  const attempts = await prisma.modelGatewayAttempt.findMany({ where: { decision: { gatewayOperationId: operation.id } }, include: { accountSpendHold: true } });
  const transcripts = await prisma.voiceTranscriptSegment.findMany({ where: { segmentId: f.segment.id } });
  const segment = await prisma.voiceIntakeSegment.findUniqueOrThrow({ where: { id: f.segment.id } });
  return { ai, operation, attempts, transcripts, segment };
}

describe("native PB existing-gateway synthetic admission/dispatch (no provider)", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("real gateway transaction lifecycle and instant round-trip under %s", async timezone => {
    const f = await gatewayFixture(); const sourceBefore = await prisma.constructionProjectBrainSource.findUniqueOrThrow({ where: { id: f.source.id } });
    const nativeTransaction = prisma.$transaction.bind(prisma), observed: string[] = [];
    // Same real-Prisma transaction wrapper used in the outbox native suite.
    // Only SET LOCAL changes; no database method/result is simulated or ALTERed.
    const wrapped = vi.spyOn(prisma, "$transaction").mockImplementation((async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) =>
      nativeTransaction(async tx => {
        await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
        const [setting] = await tx.$queryRawUnsafe<Array<{ timezone: string }>>(`SELECT current_setting('TimeZone') AS timezone`); observed.push(setting.timezone);
        return work(tx);
      }, options)) as typeof prisma.$transaction);
    try {
      const before = Date.now(), a = await admitted(f);
      const prepared = await rows(f);
      expect(prepared.ai).toMatchObject({ status: "running", attempts: 1, taskId: null, personalAssistantOperationId: null });
      expect(prepared.attempts).toHaveLength(1); expect(prepared.attempts[0]).toMatchObject({ status: "prepared", dispatchState: "not_dispatched", accountSpendHold: { status: "held", amountMicros: 100_000n } });
      expect(prepared.ai.leaseExpiresAt?.toISOString()).toBe(a.deadline);
      const result = await dispatchVoiceGatewayAttempt({ admission: a, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal });
      expect(result).toMatchObject({ status: "synthetic_succeeded", executionAuthorized: false, externalTransportPerformed: false, transcriptionQualityVerified: false });
      const stored = await rows(f);
      expect(stored.ai).toMatchObject({ status: "succeeded", attempts: 1, resultKind: "VoiceTranscriptSegment", lockedBy: null });
      expect(stored.operation).toMatchObject({ status: "succeeded", tenantId: `construction-workspace:${f.workspaceId}`, finalAttemptId: a.attempt.id });
      expect(stored.attempts[0]).toMatchObject({ status: "settled", dispatchState: "settled", resultContractStatus: "valid", accountSpendHold: { status: "settled", settledMicros: 0n } });
      expect(stored.transcripts).toHaveLength(1); expect(stored.transcripts[0].text).toContain("SYNTHETIC_LOCAL — no speech was transcribed");
      expect(stored.transcripts[0].textFingerprint).toBe(canonicalFingerprint(stored.transcripts[0].text));
      expect(stored.transcripts[0].measuredCostMicros).toBe(0n);
      for (const instant of [stored.ai.finishedAt!, stored.attempts[0].dispatchedAt!, stored.attempts[0].finishedAt!, stored.transcripts[0].createdAt]) {
        expect(instant.getTime()).toBeGreaterThanOrEqual(before); expect(instant.getTime()).toBeLessThanOrEqual(Date.now());
      }
      expect(observed.length).toBeGreaterThanOrEqual(4); expect(observed.every(value => value === timezone)).toBe(true);
      expect(await prisma.constructionProjectBrainSource.findUnique({ where: { id: f.source.id } })).toEqual(sourceBefore);
      expect(await prisma.fileAccessLog.count({ where: { fileId: f.source.fileId, action: "download" } })).toBe(0);
    } finally { wrapped.mockRestore(); }
  });
  it("two concurrent admissions leave exactly one claim/hold and cannot reset source budget", async () => {
    const f = await gatewayFixture();
    const outcomes = await Promise.allSettled([admitGatewayVoiceSegment(f.input, f.options), admitGatewayVoiceSegment(f.input, f.options)]);
    expect(outcomes.filter(r => r.status === "fulfilled" && r.value.status === "prepared_synthetic_not_dispatched")).toHaveLength(1);
    const stored = await rows(f); expect(stored.ai.attempts).toBe(1); expect(stored.attempts).toHaveLength(1);
    expect(await admitGatewayVoiceSegment(f.input, f.options)).toMatchObject({ status: "busy" });
    expect(await prisma.voiceIntakeSession.count({ where: { projectBrainSourceId: f.source.id } })).toBe(1);
  });
  it("two concurrent dispatchers can persist only one synthetic result and replay never retries", async () => {
    const f = await gatewayFixture(), a = await admitted(f);
    const input = { admission: a, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal, syntheticScenario: "DELAYED_SUCCESS" as const };
    const outcomes = await Promise.allSettled([dispatchVoiceGatewayAttempt(input), dispatchVoiceGatewayAttempt(input)]);
    expect(outcomes.filter(r => r.status === "fulfilled" && r.value.status === "synthetic_succeeded")).toHaveLength(1);
    const before = await rows(f); expect(before.transcripts).toHaveLength(1); expect(before.ai.attempts).toBe(1);
    expect(await dispatchVoiceGatewayAttempt(input)).not.toMatchObject({ status: "synthetic_succeeded" });
    expect(await rows(f)).toEqual(before);
  });
  it("current cap withdrawal before dispatch leaves prepared exposure untouched", async () => {
    const f = await gatewayFixture(), a = await admitted(f), before = await rows(f);
    f.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = "";
    expect(await dispatchVoiceGatewayAttempt({ admission: a, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal })).toMatchObject({ status: "refused" });
    expect(await rows(f)).toEqual(before);
  });
  it("revoked owner cannot dispatch and durable source/holds survive", async () => {
    const f = await gatewayFixture(), a = await admitted(f), before = await rows(f);
    await prisma.constructionWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: f.workspaceId, userId: f.user.id } }, data: { status: "revoked" } });
    await expect(dispatchVoiceGatewayAttempt({ admission: a, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal })).rejects.toThrow("VOICE_PB_READ_REFUSED");
    expect(await rows(f)).toEqual(before);
  });
  it("closed UNKNOWN scenario retains full hold with one terminal nonretryable operation", async () => {
    const f = await gatewayFixture(), a = await admitted(f);
    const input = { admission: a, actor: f.input.actor, rollout: f.options, abortSignal: new AbortController().signal, syntheticScenario: "UNKNOWN" as const };
    expect(await dispatchVoiceGatewayAttempt(input)).toMatchObject({ status: "uncertain", executionAuthorized: false, externalTransportPerformed: false, exposureRetained: true });
    const stored = await rows(f);
    expect(stored.ai).toMatchObject({ status: "abandoned", attempts: 1 }); expect(stored.segment.status).toBe("uncertain"); expect(stored.transcripts).toHaveLength(0);
    expect(stored.attempts[0]).toMatchObject({ status: "uncertain", dispatchState: "unaccounted", accountSpendHold: { status: "held", amountMicros: 100_000n } });
    await dispatchVoiceGatewayAttempt(input); expect(await rows(f)).toEqual(stored);
  });
  it("wrong actor/policy and no explicit synthetic cap cannot create an AI operation", async () => {
    const f = await gatewayFixture();
    await expect(admitGatewayVoiceSegment({ ...f.input, actor: { ...f.input.actor, id: `wrong-${randomUUID()}` } }, f.options)).rejects.toThrow("VOICE_PB_READ_REFUSED");
    expect(await admitGatewayVoiceSegment({ ...f.input, policyId: "absent-policy" }, f.options)).toMatchObject({ status: "refused" });
    f.options.env.ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS = "";
    expect(await admitGatewayVoiceSegment(f.input, f.options)).toMatchObject({ status: "refused" });
    expect(await prisma.aiOperation.count({ where: { voiceIntakeSegmentId: f.segment.id } })).toBe(0);
  });
  it("generic Task/CLIENT claim, success, failure and usage paths cannot touch the persisted PB claim", async () => {
    const f = await gatewayFixture(), a = await admitted(f);
    // Make the generic runner's ordinary running/expired-lease branch eligible.
    // A future lease returning null would not prove the PB subject exclusion.
    await prisma.aiOperation.update({ where: { id: a.claim.operationId }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } });
    const before = await rows(f);
    const usage = { model: "synthetic", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0, stopReason: null };
    const writeResult = vi.fn();
    expect(await claimAiOperation(a.claim.operationKey)).toBeNull();
    await expect(succeedAiOperation({ claim: a.claim, taskId: "negative-test-no-task", purpose: "classification", usage, writeResult })).rejects.toThrow();
    await expect(failAiOperation({ claim: a.claim, taskId: "negative-test-no-task", purpose: "classification", usage, error: "synthetic refusal" })).rejects.toThrow("VOICE_PB_LEGACY_USAGE_REFUSED");
    await expect(recordSupersededUsage(a.claim, "negative-test-no-task", "classification", usage)).rejects.toThrow("VOICE_PB_LEGACY_USAGE_REFUSED");
    expect(writeResult).not.toHaveBeenCalled();
    expect(await rows(f)).toEqual(before);
  });
  it("forged legacy label cannot release the PB hold through the rollout-off cleanup", async () => {
    const f = await gatewayFixture(), a = await admitted(f), before = await rows(f);
    const forged = { ...a, status: "authorized", request: { ...a.request, subject: { kind: "voice_intake_segment", sessionId: f.session.sessionId, segmentId: f.segment.id } } };
    const adapter = { key: "voice-synthetic-direct", dispatch: vi.fn() };
    const result = await dispatchVoiceGatewayAttempt({ admission: forged as never, actor: { role: "CLIENT", id: f.user.id }, adapter: adapter as never,
      abortSignal: new AbortController().signal, rollout: { environment: "local", voiceEnabled: false } });
    expect(result).toMatchObject({ status: "superseded" }); expect(adapter.dispatch).not.toHaveBeenCalled(); expect(await rows(f)).toEqual(before);
  });
  it("a real owned CLIENT session cannot be substituted for the PB operation during positive acquisition", async () => {
    const f = await gatewayFixture(), a = await admitted(f), before = await rows(f);
    const actor = { role: "CLIENT" as const, id: f.user.id };
    const legacy = await createVoiceIntakeSession({ actor, languageHint: "fr", consentAccepted: true, consentVersion: "LOCAL_LEGACY_TEST_ONLY", maxTotalCostMicros: 100_000n });
    const segment = await registerVoiceIntakeSegment({ actor, sessionId: legacy.id, ordinal: 0, mediaFormat: "m4a", mimeType: "audio/mp4",
      durationMs: f.segment.durationMs, audioBytes: f.input.audioBytes });
    await finishVoiceIntakeSession({ actor, sessionId: legacy.id, expectedSegmentCount: 1 });
    const forged = { ...a, status: "authorized", request: { ...a.request, subject: { kind: "voice_intake_segment", sessionId: legacy.id, segmentId: segment.segmentId } },
      projection: { ...a.projection, sessionId: legacy.id, segmentId: segment.segmentId } };
    const adapter = { key: "voice-synthetic-direct", dispatch: vi.fn(async () => { throw new Error("MUST_NOT_INVOKE"); }) };
    expect(await dispatchVoiceGatewayAttempt({ admission: forged as never, actor, adapter: adapter as never,
      abortSignal: new AbortController().signal, rollout: { environment: "local", voiceEnabled: true } })).toMatchObject({ status: "superseded" });
    expect(adapter.dispatch).not.toHaveBeenCalled(); expect(await rows(f)).toEqual(before);
    expect(await prisma.aiOperation.count({ where: { voiceIntakeSegmentId: segment.segmentId } })).toBe(0);
  });
});
