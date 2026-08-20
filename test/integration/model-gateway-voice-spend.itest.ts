import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createVoiceSyntheticDirectAdapter } from "@/server/model-gateway/voice/adapters/synthetic-direct";
import { admitGatewayVoiceSegment, dispatchVoiceGatewayAttempt } from "@/server/model-gateway/voice/dispatch";
import { reserveVoiceAiOperation } from "@/server/model-gateway/voice/operations";
import { reserveAccountProviderSpend } from "@/server/account-spend";
import { createVoiceGatewayFixture } from "../support/model-gateway-voice-db";

describe("voice gateway reservation and outcome accounting", () => {
  it("refuses when existing exposure plus the new hold exceeds the session ceiling", async () => {
    const fixture = await createVoiceGatewayFixture({
      segmentCount: 2,
      sessionCeilingMicros: 100n,
    });
    const existingSegment = fixture.segments[1]!;
    const existingOperation = await reserveVoiceAiOperation({
      actor: fixture.actor,
      sessionId: fixture.sessionId,
      segmentId: existingSegment.segmentId,
      audioFingerprint: existingSegment.audioFingerprint,
    });
    const existingHold = await reserveAccountProviderSpend({
      provider: "synthetic",
      operationKey: existingOperation.operationKey,
      attempt: 1,
      worstCaseMicros: 80n,
    });
    expect(existingHold.ok).toBe(true);
    if (!existingHold.ok) throw new Error("TEST_EXISTING_HOLD_NOT_RESERVED");

    const admission = await admitGatewayVoiceSegment({
      actor: fixture.actor,
      sessionId: fixture.sessionId,
      segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes,
      policyId: fixture.policyId,
      dataClass: "personal_data",
      privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 30n,
    });

    expect(admission).toEqual({
      status: "refused",
      reasonClass: "insufficient_spend_headroom",
    });
    await expect(prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT hold.status FROM "AccountProviderSpendHold" hold JOIN "AiOperation" operation ON operation."operationKey"=hold."operationKey" WHERE operation."voiceIntakeSegmentId"=$1`,
      fixture.segment.segmentId
    )).resolves.toEqual([{ status: "released" }]);
    await expect(prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM "AccountProviderSpendHold" WHERE id=$1`,
      existingHold.holdId
    )).resolves.toEqual([{ status: "held" }]);
    await expect(prisma.$queryRawUnsafe<Array<{ attempts: bigint }>>(
      `SELECT count(*)::bigint attempts FROM "ModelGatewayAttempt" attempt JOIN "ModelGatewayDecision" decision ON decision.id=attempt."decisionId" JOIN "ModelGatewayOperation" gateway ON gateway.id=decision."gatewayOperationId" JOIN "AiOperation" operation ON operation.id=gateway."aiOperationId" WHERE operation."voiceIntakeSegmentId"=$1`,
      fixture.segment.segmentId
    )).resolves.toEqual([{ attempts: 0n }]);
  });

  it("persists decision and hold before one dispatch, then settles measured cost", async () => {
    const fixture = await createVoiceGatewayFixture();
    const admission = await admitGatewayVoiceSegment({
      actor: fixture.actor, sessionId: fixture.sessionId, segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes, policyId: fixture.policyId,
      dataClass: "personal_data", privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions", modelKey: "synthetic-stt-v1",
      transport: async () => {
        calls += 1;
        const [before] = await prisma.$queryRawUnsafe<Array<{ decisions: bigint; holds: bigint }>>(
          `SELECT (SELECT count(*) FROM "ModelGatewayDecision" WHERE id=$1)::bigint decisions,(SELECT count(*) FROM "AccountProviderSpendHold" WHERE id=$2 AND status='held')::bigint holds`,
          admission.decision.id, admission.attempt.accountSpendHoldId
        );
        expect(before).toEqual({ decisions: 1n, holds: 1n });
        return { transcriptText: "My finished workflow.", audioSeconds: 1, measuredCostMicros: 25n };
      },
    });
    await expect(dispatchVoiceGatewayAttempt({
      admission, actor: fixture.actor, adapter,
      rollout: { environment: "local", voiceEnabled: true },
      abortSignal: new AbortController().signal,
    })).resolves.toMatchObject({ status: "succeeded", text: "My finished workflow." });
    expect(calls).toBe(1);
    await expect(prisma.$queryRawUnsafe<Array<{ status: string; settledMicros: bigint | null }>>(
      `SELECT status,"settledMicros" FROM "AccountProviderSpendHold" WHERE id=$1`,
      admission.attempt.accountSpendHoldId
    )).resolves.toEqual([{ status: "settled", settledMicros: 25n }]);
  });

  it("retains an ambiguous hold and makes no hidden retry", async () => {
    const fixture = await createVoiceGatewayFixture();
    const admission = await admitGatewayVoiceSegment({
      actor: fixture.actor, sessionId: fixture.sessionId, segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes, policyId: fixture.policyId,
      dataClass: "personal_data", privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions", modelKey: "synthetic-stt-v1",
      transport: async () => { calls += 1; throw new Error("timed out after dispatch"); },
    });
    await expect(dispatchVoiceGatewayAttempt({
      admission, actor: fixture.actor, adapter,
      rollout: { environment: "local", voiceEnabled: true },
      abortSignal: new AbortController().signal,
    })).resolves.toEqual({ status: "uncertain", errorClass: "unknown_dispatched_outcome" });
    expect(calls).toBe(1);
    await expect(prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM "AccountProviderSpendHold" WHERE id=$1`, admission.attempt.accountSpendHoldId
    )).resolves.toEqual([{ status: "held" }]);
  });

  it("releases a conclusively non-dispatched hold when voice rollout is disabled", async () => {
    const fixture = await createVoiceGatewayFixture();
    const admission = await admitGatewayVoiceSegment({
      actor: fixture.actor, sessionId: fixture.sessionId, segmentId: fixture.segment.segmentId,
      audioBytes: fixture.audioBytes, policyId: fixture.policyId,
      dataClass: "personal_data", privacyRequirement: "zero_retention",
      maxSegmentCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    let calls = 0;
    const adapter = createVoiceSyntheticDirectAdapter({
      endpointKey: "audio/transcriptions", modelKey: "synthetic-stt-v1",
      transport: async () => { calls += 1; return { transcriptText: "must not run" }; },
    });
    await expect(dispatchVoiceGatewayAttempt({
      admission, actor: fixture.actor, adapter, rollout: {},
      abortSignal: new AbortController().signal,
    })).resolves.toEqual({ status: "refused", reasonClass: "voice_disabled" });
    expect(calls).toBe(0);
    await expect(prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM "AccountProviderSpendHold" WHERE id=$1`, admission.attempt.accountSpendHoldId
    )).resolves.toEqual([{ status: "released" }]);
  });
});
