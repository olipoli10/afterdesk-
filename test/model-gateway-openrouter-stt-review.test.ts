import { describe, expect, it, vi } from "vitest";
import { createOpenRouterSttCandidateAdapter, normalizeOpenRouterSttCandidateResponse as normalize,
  prepareOpenRouterSttCandidateRequest } from "@/server/model-gateway/voice/adapters/openrouter-candidate";
import type { VoiceAdapterEnvelope } from "@/server/model-gateway/voice/adapters/contract";
import { buildVoiceSegmentProjection } from "@/server/model-gateway/voice/projection";
import { buildVoiceGatewayRequest } from "@/server/model-gateway/privacy";
import { resolveGatewayFallback, resolveGatewayPolicy, type GatewayPolicySnapshot, type GatewayRouteSnapshot } from "@/server/model-gateway/policy";

const hash = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
const now = new Date("2026-09-10T12:00:00Z");
const projection = buildVoiceSegmentProjection({ sessionId: "review-session", segmentId: "review-segment", ordinal: 0,
  languageHint: "fr", mediaFormat: "m4a", mimeType: "audio/mp4", durationMs: 2000, audioBytes: new Uint8Array([1, 2, 3, 4]) });
function envelope(): VoiceAdapterEnvelope {
  return { operationId: "review-operation", attemptId: "review-attempt", tenantId: "synthetic-tenant", sessionId: projection.sessionId,
    segmentId: projection.segmentId, adapterKey: "openrouter-stt-candidate", billingProvider: "openrouter", intermediary: "openrouter",
    endpointKey: "/api/v1/audio/transcriptions", modelKey: "synthetic/transcriber", projection, outputContractHash: hash("a"), requestEvidenceRef: hash("b"),
    abortSignal: new AbortController().signal };
}
const request = buildVoiceGatewayRequest({ logicalOperationKey: "synthetic-stt-review", tenantId: "synthetic-tenant", policyKey: "review-policy",
  dataClass: "personal_data", privacyRequirement: "zero_retention", maxTotalCostMicros: 1000n, projection, createdAt: now });
function certifiedRoute(key: string, candidate: boolean): GatewayRouteSnapshot {
  const binding = { adapterKey: candidate ? "openrouter-stt-candidate" as const : "voice-synthetic-direct" as const,
    billingProvider: candidate ? "openrouter" : "synthetic", intermediary: candidate ? "openrouter" : null,
    endpointKey: candidate ? "/api/v1/audio/transcriptions" : "audio/transcriptions", modelKey: "synthetic/transcriber",
    operationTypes: ["intake_voice_transcription"], allowedDataClasses: ["personal_data"], privacyPosture: "zero_retention",
    residency: ["CA"], pathKind: candidate ? "intermediary" : "direct_provider" };
  return { id: key, routeKey: key, version: 1, status: "published", ...binding, maxInputTokens: 100000, maxOutputTokens: 20000, canonicalHash: hash("c"),
    privacyEvidence: { ...binding, certificationOwner: "synthetic-reviewer-not-a-real-certificate", effectiveAt: "2026-09-01T00:00:00Z",
      expiresAt: "2026-10-01T00:00:00Z", tenancyMode: "route_isolated" } };
}
function policy(routes: GatewayRouteSnapshot[]): GatewayPolicySnapshot {
  return { id: "policy", policyKey: request.policyKey, status: "published", operationType: "intake_voice_transcription",
    routeOrder: routes.map(route => ({ routeKey: route.routeKey, version: route.version })), fallbackRules: [], maxAttempts: 2,
    maxTotalCostMicros: 1000n, requiredPrivacyPosture: "zero_retention", canonicalHash: hash("d") };
}

describe("independent OpenRouter STT review — no provider or database", () => {
  it.each([false, true])("never invokes even injected transport with zdrRequired=%s", async zdrRequired => {
    const transport = vi.fn(async () => ({ text: "Must never be reached", usage: { seconds: 2, cost: 1 } }));
    const adapter = createOpenRouterSttCandidateAdapter({ endpointKey: "/api/v1/audio/transcriptions", modelKey: "synthetic/transcriber",
      providerEndpointSlug: "pinned-synthetic", zdrRequired, transport });
    for (let i = 0; i < 3; i++) {
      expect(await adapter.dispatch(envelope())).toMatchObject({ dispatchKnowledge: "not_dispatched", usage: null, providerRequestRef: null });
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("abort is classified without giving the injected transport control", async () => {
    const controller = new AbortController(); controller.abort(); const transport = vi.fn();
    const adapter = createOpenRouterSttCandidateAdapter({ endpointKey: "/api/v1/audio/transcriptions", modelKey: "synthetic/transcriber",
      providerEndpointSlug: "synthetic", zdrRequired: true, transport });
    expect(await adapter.dispatch({ ...envelope(), abortSignal: controller.signal })).toMatchObject({ dispatchKnowledge: "not_dispatched", errorClass: "timeout" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("cannot authorize the candidate as the initial route despite exact synthetic certificate fields", () => {
    const candidate = certifiedRoute("candidate", true);
    expect(resolveGatewayPolicy({ request, policy: policy([candidate]), routes: [candidate], now })).toEqual({ disposition: "refused", reasonClass: "ineligible_route" });
  });
  it("cannot authorize the candidate as an explicitly declared fallback", () => {
    const direct = certifiedRoute("direct", false), candidate = certifiedRoute("candidate", true);
    const fallback = { ...policy([direct, candidate]), fallbackRules: [{ from: { routeKey: "direct", version: 1 },
      errorClass: "timeout" as const, to: { routeKey: "candidate", version: 1 } }] };
    expect(resolveGatewayPolicy({ request, policy: fallback, routes: [direct, candidate], now })).toMatchObject({ disposition: "route_authorized", route: { routeKey: "direct" } });
    expect(resolveGatewayFallback({ request, policy: fallback, routes: [direct, candidate], priorRoute: direct,
      errorClass: "timeout", priorAttempt: 1, remainingCostMicros: 500n, now })).toEqual({ disposition: "refused", reasonClass: "ineligible_route" });
  });
  it("preserves selection of a separately eligible direct synthetic route", () => {
    const candidate = certifiedRoute("candidate", true), direct = certifiedRoute("direct", false);
    expect(resolveGatewayPolicy({ request, policy: policy([candidate, direct]), routes: [candidate, direct], now }))
      .toMatchObject({ disposition: "route_authorized", route: { routeKey: "direct" } });
  });
  it("prepares only exact local JSON audio fields, without unsupported privacy/routing promises", () => {
    const wire = prepareOpenRouterSttCandidateRequest(envelope());
    expect(wire).toEqual({ model: "synthetic/transcriber", input_audio: { data: "AQIDBA==", format: "m4a" }, language: "fr", temperature: 0 });
    expect(Object.isFrozen(wire)).toBe(true); expect(Object.isFrozen(wire.input_audio)).toBe(true);
    expect(wire).not.toHaveProperty("provider"); expect(wire).not.toHaveProperty("zdr");
  });
  it("wire preparation refuses mismatched audio evidence", () => {
    expect(() => prepareOpenRouterSttCandidateRequest({ ...envelope(), projection: { ...projection, audioFingerprint: hash("f") } })).toThrow();
  });
  it("reads documented seconds and header generation ID, never the old audio_seconds or body id", () => {
    const parsed = normalize({ requestRef: "fallback-ref", generationId: "gen-synthetic", body: { id: "untrusted-body-id", text: "Pose la poutre.",
      usage: { seconds: 2.5, audio_seconds: 999, input_tokens: 4, output_tokens: 5, cost: 0.0000001 } } });
    expect(parsed.result).toMatchObject({ providerRequestRef: "gen-synthetic", transcriptText: "Pose la poutre.", errorClass: null,
      usage: { audioSeconds: 2.5, inputTokens: 4, outputTokens: 5, measuredCostMicros: null } });
    expect(parsed.reportedCostUpperBoundUsdMicros).toBe(1n);
  });
  it.each([undefined, null, {}])("absent/unknown usage remains unknown, never inferred zero (%s)", usage => {
    const parsed = normalize({ requestRef: "synthetic-ref", body: { text: "Bonjour.", usage } });
    expect(parsed.result.usage).toEqual({ audioSeconds: null, inputTokens: null, outputTokens: null, measuredCostMicros: null });
    expect(parsed.reportedCostUpperBoundUsdMicros).toBeNull();
  });
  it("a reported zero remains only reported; it cannot settle cost", () => {
    const parsed = normalize({ requestRef: "synthetic-ref", body: { text: "Bonjour.", usage: { cost: 0, seconds: 0 } } });
    expect(parsed.reportedCostUpperBoundUsdMicros).toBe(0n);
    expect(parsed.result.usage?.measuredCostMicros).toBeNull();
  });
  it.each([-1, NaN, Infinity, "0", true, {}, Number.MAX_VALUE])("invalid reported cost %s refuses successful normalization", cost => {
    const parsed = normalize({ requestRef: "synthetic-ref", body: { text: "Bonjour.", usage: { cost } } });
    expect(parsed.result.errorClass).not.toBeNull(); expect(parsed.result.transcriptText).toBeNull();
    expect(parsed.reportedCostUpperBoundUsdMicros).toBeNull();
  });
  it.each([199, 300, 500, NaN, 200.5])("non-success status %s cannot yield accepted transcript or reported cost", httpStatus => {
    const parsed = normalize({ requestRef: "synthetic-ref", httpStatus, body: { text: "Bonjour.", usage: { cost: 1 } } });
    expect(parsed.result.errorClass).not.toBeNull(); expect(parsed.reportedCostUpperBoundUsdMicros).toBeNull();
  });
  it.each([{ seconds: -1 }, { seconds: "2" }, { input_tokens: 0.5 }, { output_tokens: Number.MAX_SAFE_INTEGER + 1 }, []])("malformed usage is not a valid transcript receipt (%j)", usage => {
    const parsed = normalize({ requestRef: "synthetic-ref", body: { text: "Bonjour.", usage } });
    expect(parsed.result.errorClass).not.toBeNull(); expect(parsed.result.usage).toBeNull();
  });
});
