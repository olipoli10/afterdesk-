import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { finishVoiceIntakeSession, registerVoiceIntakeSegment } from "@/server/model-gateway/voice/sessions";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const uniqueHash = () => `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;
let fixtureSequence = 0;

export async function createVoiceGatewayFixture(options: Readonly<{
  segmentCount?: number;
  sessionCeilingMicros?: bigint;
}> = {}) {
  const segmentCount = options.segmentCount ?? 1;
  const sessionCeilingMicros = options.sessionCeilingMicros ?? 500_000n;
  if (!Number.isInteger(segmentCount) || segmentCount < 1 || segmentCount > 14) {
    throw new Error("INVALID_VOICE_TEST_SEGMENT_COUNT");
  }
  const clientId = id("voice_client");
  const otherClientId = id("voice_other");
  const sessionId = id("voice_session");
  const policyId = id("voice_policy");
  const routeId = id("voice_route");
  const routeKey = id("voice_route_key");
  const policyVersion = ++fixtureSequence;
  const actor = { id: clientId, role: "CLIENT" } as const;
  for (const value of [clientId, otherClientId]) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id,name,email,role,"createdAt","updatedAt") VALUES ($1,'Voice client',$2,'CLIENT',now(),now())`,
      value, `${value}@example.invalid`
    );
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO "VoiceIntakeSession" (id,"clientId",status,"languageHint","consentVersion","consentedAt","maxDurationMs","maxSegmentDurationMs","maxSegmentBytes","maxSegments","maxTotalBytes","maxTotalCostMicros","expiresAt","createdAt","updatedAt") VALUES ($1,$2,'open','en','voice-disclosure-v1',now(),600000,45000,2000000,14,28000000,$3,now()+interval '24 hours',now(),now())`,
    sessionId, clientId, sessionCeilingMicros
  );
  const audioBytes = new Uint8Array([1, 2, 3, 4]);
  const segments = [];
  for (let ordinal = 0; ordinal < segmentCount; ordinal += 1) {
    segments.push(await registerVoiceIntakeSegment({
      actor, sessionId, ordinal, mediaFormat: "webm", mimeType: "audio/webm",
      durationMs: 1_000,
      audioBytes: ordinal === 0 ? audioBytes : new Uint8Array([ordinal + 1, 2, 3, 4]),
    }));
  }
  await finishVoiceIntakeSession({ actor, sessionId, expectedSegmentCount: segmentCount });
  const privacyEvidence = {
    adapterKey: "voice-synthetic-direct", allowedDataClasses: ["personal_data"],
    billingProvider: "synthetic", certificationOwner: "voice-test-reviewer",
    effectiveAt: "2026-08-20T00:00:00.000Z", endpointKey: "audio/transcriptions",
    expiresAt: "2027-08-20T00:00:00.000Z", intermediary: null,
    modelKey: "synthetic-stt-v1", operationTypes: ["intake_voice_transcription"],
    pathKind: "direct_provider", privacyPosture: "zero_retention", residency: ["CA"],
    tenancyMode: "route_isolated",
  };
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'published','direct_provider','voice-synthetic-direct','synthetic','audio/transcriptions','synthetic-stt-v1',ARRAY['intake_voice_transcription'],ARRAY['personal_data'],'zero_retention',ARRAY['CA'],'{}'::jsonb,$3::jsonb,2000000,20000,$4,'test',now(),now())`,
    routeId, routeKey, JSON.stringify(privacyEvidence), uniqueHash()
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,'intake-voice-transcription-v1',$2,'intake_voice_transcription','published',$3::jsonb,'[]'::jsonb,1,100000,'zero_retention',$4,'test',now(),now())`,
    policyId, policyVersion, JSON.stringify([{ routeKey, version: 1 }]), uniqueHash()
  );
  return { actor, otherClientId, sessionId, segment: segments[0]!, segments, audioBytes, policyId };
}
