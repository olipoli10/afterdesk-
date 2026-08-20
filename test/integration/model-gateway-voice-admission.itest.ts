import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { admitGatewayVoiceSegment } from "@/server/model-gateway/voice/dispatch";
import { createVoiceGatewayFixture } from "../support/model-gateway-voice-db";

describe("voice gateway admission tenant binding", () => {
  it("refuses a cross-client subject before operation, hold, decision or dispatch", async () => {
    const fixture = await createVoiceGatewayFixture();
    await expect(admitGatewayVoiceSegment({
      actor: { id: fixture.otherClientId, role: "CLIENT" },
      sessionId: fixture.sessionId, segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes, policyId: fixture.policyId,
      dataClass: "personal_data", privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 100_000n,
    })).resolves.toEqual({ status: "refused", reasonClass: "voice_session_not_owned" });
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "ModelGatewayOperation" WHERE "operationType"='intake_voice_transcription'`)).toHaveLength(0);
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "AccountProviderSpendHold" WHERE provider='synthetic'`)).toHaveLength(0);
  });

  it("binds AiOperation through segment and session to the exact client", async () => {
    const fixture = await createVoiceGatewayFixture();
    const admission = await admitGatewayVoiceSegment({
      actor: fixture.actor, sessionId: fixture.sessionId, segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes, policyId: fixture.policyId,
      dataClass: "personal_data", privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 100_000n,
    });
    expect(admission).toMatchObject({
      status: "authorized",
      request: { operationType: "intake_voice_transcription" },
      route: { adapterKey: "voice-synthetic-direct" },
    });
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "ModelGatewayDecision" WHERE disposition='route_authorized'`)).toHaveLength(1);
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "ModelGatewayAttempt" WHERE status='prepared'`)).toHaveLength(1);
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM "AccountProviderSpendHold" WHERE status='held'`)).toHaveLength(1);
  });
});
