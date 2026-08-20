import { describe, expect, it } from "vitest";
import { buildVoiceGatewayRequest } from "@/server/model-gateway/privacy";
import { resolveGatewayPolicy, type GatewayPolicySnapshot, type GatewayRouteSnapshot } from "@/server/model-gateway/policy";
import { buildVoiceSegmentProjection } from "@/server/model-gateway/voice/projection";

const hash = (char: string) => `sha256:${char.repeat(64)}`;
const projection = buildVoiceSegmentProjection({
  sessionId: "session-1", segmentId: "segment-1", ordinal: 0,
  languageHint: "fr", mediaFormat: "webm", mimeType: "audio/webm",
  durationMs: 1_000, audioBytes: new Uint8Array([1, 2, 3]),
});
const request = buildVoiceGatewayRequest({
  logicalOperationKey: "voice-intake:session-1:segment-1:fingerprint",
  tenantId: "client-1",
  policyKey: "intake-voice-transcription-v1",
  dataClass: "personal_data",
  privacyRequirement: "zero_retention",
  maxTotalCostMicros: 100_000n,
  projection,
  createdAt: new Date("2026-08-20T12:00:00.000Z"),
});
const policy: GatewayPolicySnapshot = {
  id: "voice-policy-1", policyKey: "intake-voice-transcription-v1", status: "published",
  operationType: "intake_voice_transcription", routeOrder: [{ routeKey: "voice-route", version: 1 }],
  fallbackRules: [], maxAttempts: 1, maxTotalCostMicros: 100_000n,
  requiredPrivacyPosture: "zero_retention", canonicalHash: hash("a"),
};
const route: GatewayRouteSnapshot = {
  id: "voice-route-1", routeKey: "voice-route", version: 1, status: "published",
  pathKind: "direct_provider", adapterKey: "voice-synthetic-direct", billingProvider: "synthetic",
  intermediary: null, endpointKey: "audio/transcriptions", modelKey: "synthetic-stt-v1",
  operationTypes: ["intake_voice_transcription"], allowedDataClasses: ["personal_data"],
  privacyPosture: "zero_retention", residency: ["CA"], maxInputTokens: 2_000_000,
  maxOutputTokens: 20_000, canonicalHash: hash("b"),
  privacyEvidence: {
    adapterKey: "voice-synthetic-direct", allowedDataClasses: ["personal_data"],
    billingProvider: "synthetic", certificationOwner: "test-reviewer",
    effectiveAt: "2026-08-20T00:00:00.000Z", endpointKey: "audio/transcriptions",
    expiresAt: "2026-08-21T00:00:00.000Z", intermediary: null,
    modelKey: "synthetic-stt-v1", operationTypes: ["intake_voice_transcription"],
    pathKind: "direct_provider", privacyPosture: "zero_retention", residency: ["CA"],
    tenancyMode: "route_isolated",
  },
};

describe("voice gateway exact policy", () => {
  it("authorizes only the separately published exact voice route", () => {
    expect(resolveGatewayPolicy({ request, policy, routes: [route], now: new Date("2026-08-20T12:00:00Z") }))
      .toMatchObject({ disposition: "route_authorized", route: { id: "voice-route-1" } });
    expect(request.subject).toEqual({ kind: "voice_intake_segment", sessionId: "session-1", segmentId: "segment-1" });
    expect(request.contentRef).toMatchObject({ kind: "voice_intake_input", id: "segment-1" });
  });

  it.each([
    ["operation", { operationTypes: ["classification"] }],
    ["data class", { allowedDataClasses: ["business_confidential"] }],
    ["privacy", { privacyPosture: "no_training" }],
    ["adapter evidence", { privacyEvidence: { ...route.privacyEvidence, adapterKey: "other" } }],
  ])("refuses changed %s facts", (_name, change) => {
    expect(resolveGatewayPolicy({
      request, policy, routes: [{ ...route, ...change } as GatewayRouteSnapshot],
      now: new Date("2026-08-20T12:00:00Z"),
    })).toMatchObject({ disposition: "refused" });
  });
});
