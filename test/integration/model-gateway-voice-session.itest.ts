import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  loadVoiceTranscriptSegment,
  persistVoiceTranscriptSegment,
  purgeExpiredVoiceIntakeContent,
} from "@/server/model-gateway/voice/transcripts";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const hash = (fill: string) => `sha256:${fill.repeat(64)}`;

async function createSessionFixture() {
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
  return { clientId, sessionId };
}

describe("voice session persistence boundaries", () => {
  it("pins client, consent, language and configured limits", async () => {
    const fixture = await createSessionFixture();
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET "clientId"=$2 WHERE id=$1`, fixture.sessionId, id("other")
    )).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET "languageHint"='fr' WHERE id=$1`, fixture.sessionId
    )).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET "maxSegments"=13 WHERE id=$1`, fixture.sessionId
    )).rejects.toThrow();
  });

  it("pins segment identity and allows only one ordinal", async () => {
    const { sessionId } = await createSessionFixture();
    const segmentId = id("voice_segment");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt") VALUES ($1,$2,0,'registered','webm','audio/webm',1000,100,$3,'en',now(),now())`,
      segmentId, sessionId, hash("a")
    );
    await expect(prisma.$executeRawUnsafe(
      `INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt") VALUES ($1,$2,0,'registered','webm','audio/webm',1000,100,$3,'en',now(),now())`,
      id("duplicate"), sessionId, hash("b")
    )).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSegment" SET "audioFingerprint"=$2 WHERE id=$1`, segmentId, hash("c")
    )).rejects.toThrow();
  });

  it("authorizes protected transcript reads and purges content before marking it purged", async () => {
    const { clientId, sessionId } = await createSessionFixture();
    const segmentId = id("voice_segment");
    const aiOperationId = id("voice_aiop");
    const policyId = id("voice_policy");
    const routeId = id("voice_route");
    const gatewayOperationId = id("voice_gateway");
    const decisionId = id("voice_decision");
    const holdId = id("voice_hold");
    const attemptId = id("voice_attempt");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VoiceIntakeSegment" (id,"sessionId",ordinal,status,"mediaFormat","mimeType","durationMs","byteCount","audioFingerprint","languageHint","createdAt","updatedAt") VALUES ($1,$2,0,'succeeded','webm','audio/webm',1000,100,$3,'en',now(),now())`,
      segmentId, sessionId, hash("a")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AiOperation" (id,"voiceIntakeSegmentId",purpose,"operationKey",status,attempts,"createdAt","updatedAt") VALUES ($1,$2,'intake_voice_transcription',$3,'succeeded',1,now(),now())`,
      aiOperationId, segmentId, id("voice_operation_key")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'intake_voice_transcription','published','[]'::jsonb,'[]'::jsonb,1,500000,'zero_retention',$3,'test',now(),now())`,
      policyId, id("voice_policy_key"), hash("b")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'published','direct_provider','voice-synthetic-direct','synthetic','audio/transcriptions','synthetic-stt',ARRAY['intake_voice_transcription'],ARRAY['personal_data'],'zero_retention',ARRAY['CA'],'{}'::jsonb,'{}'::jsonb,2000000,20000,$3,'test',now(),now())`,
      routeId, id("voice_route_key"), hash("c")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayOperation" (id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status,"finalAttemptId","createdAt","finishedAt") VALUES ($1,$2,$3,'intake_voice_transcription',$4,$5,'personal_data','zero_retention',$6,500000,'succeeded',$7,now(),now())`,
      gatewayOperationId, aiOperationId, clientId, hash("d"), hash("e"), policyId, attemptId
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayDecision" (id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint","decidedAt") VALUES ($1,$2,1,'route_authorized',$3,'eligible',$4,$5,$6,0,500000,$7,now())`,
      decisionId, gatewayOperationId, routeId, hash("f"), hash("1"), hash("2"), hash("3")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AccountProviderSpendHold" (id,provider,"periodKey","operationKey",attempt,"amountMicros",status,"createdAt","updatedAt") VALUES ($1,'synthetic','2026-08-20',$2,1,500000,'settled',now(),now())`,
      holdId, id("voice_operation_key_hold")
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","startedAt","finishedAt") VALUES ($1,$2,$3,'settled','settled','valid',now(),now())`,
      attemptId, decisionId, holdId
    );

    await expect(persistVoiceTranscriptSegment({
      actor: { id: "other-client", role: "CLIENT" }, segmentId, gatewayAttemptId: attemptId,
      text: "private words",
    })).rejects.toThrow("voice_session_not_owned");
    const stored = await persistVoiceTranscriptSegment({
      actor: { id: clientId, role: "CLIENT" }, segmentId, gatewayAttemptId: attemptId,
      text: "private words",
    });
    expect(stored.text).toBe("private words");
    await expect(loadVoiceTranscriptSegment({
      actor: { id: clientId, role: "CLIENT" }, segmentId,
    })).resolves.toMatchObject({ text: "private words" });

    await prisma.$executeRawUnsafe(
      `UPDATE "VoiceIntakeSession" SET status='cancelled',"cancelledAt"=now() WHERE id=$1`, sessionId
    );
    await expect(purgeExpiredVoiceIntakeContent()).resolves.toBe(1);
    await expect(purgeExpiredVoiceIntakeContent()).resolves.toBe(0);
    const [purged] = await prisma.$queryRawUnsafe<Array<{ text: string; purgedAt: Date | null }>>(
      `SELECT text,"purgedAt" FROM "VoiceTranscriptSegment" WHERE "segmentId"=$1`, segmentId
    );
    expect(purged.text).toBe("");
    expect(purged.purgedAt).toBeInstanceOf(Date);
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "VoiceTranscriptSegment" SET text='restored',"purgedAt"=NULL WHERE "segmentId"=$1`, segmentId
    )).rejects.toThrow();
  });
});
