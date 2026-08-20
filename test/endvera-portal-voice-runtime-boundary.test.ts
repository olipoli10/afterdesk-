import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mapVoiceRuntimeError,
  resolveVoiceRuntimeReadiness,
  validatePortalVoiceSegmentEnvelope,
  type PortalVoiceRuntimeConfig,
} from "@/server/voice-intake-runtime-boundary";

const CERTIFIED_LOCAL_CONFIG: PortalVoiceRuntimeConfig = {
  rolloutEnabled: true,
  operationEnabled: true,
  publishedPolicyAvailable: true,
  eligibleRouteAvailable: true,
  configuredSpendCeiling: true,
  providerAdopted: true,
  realProviderCertified: true,
  consentVersion: "voice-consent-v1",
  allowedLanguages: ["en", "fr", "es", "tl"],
  allowedFormats: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"],
  maxTotalCostMicros: 100_000n,
};

describe("Endvera portal real voice runtime boundary", () => {
  it("keeps the production-shaped boundary fail-closed unless every adoption fact is explicit", () => {
    expect(resolveVoiceRuntimeReadiness(CERTIFIED_LOCAL_CONFIG)).toEqual({
      operationEnabled: true,
      publishedPolicyAvailable: true,
      eligibleRouteAvailable: true,
      configuredSpendCeiling: true,
      consentVersion: "voice-consent-v1",
      allowedLanguages: ["en", "fr", "es", "tl"],
      allowedFormats: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"],
    });

    for (const field of [
      "rolloutEnabled",
      "operationEnabled",
      "publishedPolicyAvailable",
      "eligibleRouteAvailable",
      "configuredSpendCeiling",
      "providerAdopted",
      "realProviderCertified",
    ] as const) {
      expect(
        resolveVoiceRuntimeReadiness({ ...CERTIFIED_LOCAL_CONFIG, [field]: false }),
      ).toEqual({
        operationEnabled: false,
        publishedPolicyAvailable: false,
        eligibleRouteAvailable: false,
        configuredSpendCeiling: false,
        consentVersion: "",
        allowedLanguages: [],
        allowedFormats: [],
      });
    }
  });

  it("maps internal refusals to the closed portal vocabulary without provider detail", () => {
    expect(mapVoiceRuntimeError(new Error("voice_segment_too_large"))).toEqual({ kind: "limit" });
    expect(mapVoiceRuntimeError(new Error("voice_segment_conflict"))).toEqual({ kind: "conflict" });
    expect(mapVoiceRuntimeError(new Error("voice_transcript_incomplete"))).toEqual({ kind: "incomplete" });
    expect(mapVoiceRuntimeError(new Error("provider_server_failure"))).toEqual({ kind: "unavailable" });
  });

  it("derives the authoritative byte count from the actual audio envelope", () => {
    const exact = {
      format: "audio/webm" as const,
      mimeType: "audio/webm" as const,
      bytes: 4,
      audio: new Uint8Array([1, 2, 3, 4]).buffer,
    };
    expect(validatePortalVoiceSegmentEnvelope(exact)).toBe(true);
    expect(validatePortalVoiceSegmentEnvelope({ ...exact, bytes: 3 })).toBe(false);
    expect(
      validatePortalVoiceSegmentEnvelope({
        ...exact,
        format: "audio/ogg;codecs=opus",
      }),
    ).toBe(false);
  });

  it("authenticates every server action and delegates to the reconciled runtime seam", () => {
    const action = readFileSync("src/server/actions/voice-intake.ts", "utf8");
    expect(action).toContain('import { requireRole } from "@/lib/authz"');
    expect(action.match(/await requireRole\("CLIENT"\)/g)).toHaveLength(6);
    for (const call of [
      "getVoiceRuntimeReadiness",
      "createPortalVoiceSession",
      "registerPortalVoiceSegment",
      "finishPortalVoiceSession",
      "assemblePortalVoiceTranscript",
      "cancelPortalVoiceSession",
    ]) {
      expect(action).toContain(call);
    }
  });

  it("contains no provider transport, secret lookup or A2 auto-send path", () => {
    const boundary = readFileSync("src/server/voice-intake-runtime-boundary.ts", "utf8");
    const action = readFileSync("src/server/actions/voice-intake.ts", "utf8");
    for (const source of [boundary, action]) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/process\.env/);
      expect(source).not.toMatch(/OPENROUTER|API_KEY|sendIntakeTurn|Send to A2/i);
    }
  });

  it("accepts one bounded 2 MB segment while the browser microphone policy stays closed", () => {
    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(nextConfig).toContain('bodySizeLimit: "3mb"');
    expect(nextConfig).toContain('value: "camera=(), microphone=(), geolocation=(), payment=()"');
  });
});
