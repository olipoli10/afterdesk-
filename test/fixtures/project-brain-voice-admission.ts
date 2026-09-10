import type { GatewayPolicySnapshot, GatewayRouteSnapshot } from "@/server/model-gateway/policy";
import { digest } from "./project-brain-voice";
const now = new Date("2026-09-10T12:00:00.000Z");
const hash = (c: string) => `sha256:${c.repeat(64)}`;
export function projectBrainVoiceAdmissionFixture() {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const policy: GatewayPolicySnapshot = { id: "policy-a", policyKey: "intake-voice-transcription-v1", status: "published", operationType: "intake_voice_transcription",
    routeOrder: [{ routeKey: "route-a", version: 1 }], fallbackRules: [], maxAttempts: 1, maxTotalCostMicros: 100_000n,
    requiredPrivacyPosture: "zero_retention", canonicalHash: hash("a") };
  const route: GatewayRouteSnapshot = { id: "route-a", routeKey: "route-a", version: 1, status: "published", pathKind: "direct_provider",
    adapterKey: "voice-synthetic-direct", billingProvider: "synthetic", intermediary: null, endpointKey: "audio/transcriptions", modelKey: "synthetic-stt-v1",
    operationTypes: ["intake_voice_transcription"], allowedDataClasses: ["personal_data"], privacyPosture: "zero_retention", residency: ["CA"],
    maxInputTokens: 2_000_000, maxOutputTokens: 20_000, canonicalHash: hash("b"), privacyEvidence: {
      adapterKey: "voice-synthetic-direct", allowedDataClasses: ["personal_data"], billingProvider: "synthetic", certificationOwner: "SYNTHETIC_TEST_ONLY",
      effectiveAt: "2026-09-10T00:00:00.000Z", endpointKey: "audio/transcriptions", expiresAt: "2026-09-11T00:00:00.000Z", intermediary: null,
      modelKey: "synthetic-stt-v1", operationTypes: ["intake_voice_transcription"], pathKind: "direct_provider", privacyPosture: "zero_retention", residency: ["CA"], tenancyMode: "route_isolated",
    } };
  const segment = { segmentId: "segment-a", ordinal: 0, status: "registered", durationMs: 1_000, byteCount: bytes.byteLength, audioFingerprint: `sha256:${digest(bytes)}` };
  const inspected = { projection: { sessionId: "session-a", sessionStatus: "finishing", projectId: "project-a", intakeId: "intake-a", sourceId: "source-a",
    sourceBindingHash: "c".repeat(64), segmentManifestHash: "d".repeat(64), languageHint: "fr", expiresAt: "2026-09-10T13:00:00.000Z",
    sessionCostBoundMicros: "500000", segments: [segment] }, manifest: { segments: [{ mediaFormat: "wav", mimeType: "audio/wav" }] }, databaseNow: now.toISOString() };
  const input = { actor: { kind: "PROJECT_BRAIN_OWNER" as const, id: "owner-a", workspaceId: "workspace-a" }, sessionId: "session-a", segmentId: "segment-a",
    audioBytes: bytes, policyId: "policy-a", dataClass: "personal_data" as const, privacyRequirement: "zero_retention" as const,
    maxSegmentCostMicros: 100_000n, deadline: new Date(now.getTime() + 55_000) };
  const options = { enabled: true, environment: "local", voiceEnabled: true, env: { NODE_ENV: "test" as const, ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS: "1000000" } };
  return { bytes, policy, route, inspected, input, options };
}
