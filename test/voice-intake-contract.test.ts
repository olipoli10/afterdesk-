import { describe, expect, it } from "vitest";
import {
  MAX_SEGMENT_BYTES,
  MAX_SEGMENT_DURATION_MS,
  MAX_SESSION_BYTES,
  MAX_SESSION_DURATION_MS,
  MAX_SESSION_SEGMENTS,
  SEGMENT_ROLLOVER_TRIGGER_MS,
  evaluateVoiceReadiness,
  validateVoiceSegment,
  type VoiceReadinessFacts,
} from "@/lib/voice-intake-contract";

const READY: VoiceReadinessFacts = {
  operationEnabled: true,
  publishedPolicyAvailable: true,
  eligibleRouteAvailable: true,
  configuredSpendCeiling: true,
  consentVersion: "voice-consent-v1",
  allowedLanguages: ["en", "fr", "es", "tl"],
  allowedFormats: ["audio/webm;codecs=opus", "audio/mp4"],
};

const BROWSER = {
  secureContext: true,
  topLevel: true,
  hasMediaDevices: true,
  hasMediaRecorder: true,
  supportedMimeTypes: ["audio/webm;codecs=opus"],
};

describe("voice intake readiness contract", () => {
  it("enables only when every server and browser fact is positive", () => {
    expect(evaluateVoiceReadiness(READY, BROWSER, "fr")).toEqual({
      available: true,
      consentVersion: "voice-consent-v1",
      language: "fr",
      mimeType: "audio/webm;codecs=opus",
    });
  });

  it.each([
    "operationEnabled",
    "publishedPolicyAvailable",
    "eligibleRouteAvailable",
    "configuredSpendCeiling",
    "consentVersion",
    "allowedLanguages",
    "allowedFormats",
  ] as const)("fails closed when %s is absent", (field) => {
    const facts = { ...READY } as Partial<VoiceReadinessFacts>;
    delete facts[field];
    expect(evaluateVoiceReadiness(facts, BROWSER, "fr")).toEqual({
      available: false,
      reason: "server_not_ready",
    });
  });

  it("rejects negative, contradictory, unsupported-language and unsupported-format facts", () => {
    expect(evaluateVoiceReadiness({ ...READY, operationEnabled: false }, BROWSER, "fr").available).toBe(false);
    expect(evaluateVoiceReadiness({ ...READY, allowedLanguages: [] }, BROWSER, "fr").available).toBe(false);
    expect(evaluateVoiceReadiness(READY, BROWSER, "de").available).toBe(false);
    expect(
      evaluateVoiceReadiness(READY, { ...BROWSER, supportedMimeTypes: ["audio/ogg"] }, "fr"),
    ).toEqual({ available: false, reason: "format_unsupported" });
  });

  it.each([
    [{ ...BROWSER, secureContext: false }, "insecure_context"],
    [{ ...BROWSER, topLevel: false }, "embedded_context"],
    [{ ...BROWSER, hasMediaDevices: false }, "device_missing"],
    [{ ...BROWSER, hasMediaRecorder: false }, "recorder_unsupported"],
  ] as const)("fails closed for browser capability %s", (browser, reason) => {
    expect(evaluateVoiceReadiness(READY, browser, "en")).toEqual({ available: false, reason });
  });
});

describe("independent voice segment bounds", () => {
  it("freezes the contract limits exactly", () => {
    expect(MAX_SEGMENT_DURATION_MS).toBe(45_000);
    expect(MAX_SEGMENT_BYTES).toBe(2_000_000);
    expect(MAX_SESSION_SEGMENTS).toBe(14);
    expect(MAX_SESSION_DURATION_MS).toBe(600_000);
    expect(MAX_SESSION_BYTES).toBe(28_000_000);
    expect(SEGMENT_ROLLOVER_TRIGGER_MS).toBe(44_500);
    expect(SEGMENT_ROLLOVER_TRIGGER_MS).toBeLessThan(MAX_SEGMENT_DURATION_MS);
  });

  it("checks duration and bytes independently", () => {
    expect(validateVoiceSegment({ durationMs: 45_000, bytes: 2_000_000 })).toEqual({ ok: true });
    expect(validateVoiceSegment({ durationMs: 45_001, bytes: 1 })).toEqual({
      ok: false,
      reason: "duration_limit",
    });
    expect(validateVoiceSegment({ durationMs: 1, bytes: 2_000_001 })).toEqual({
      ok: false,
      reason: "byte_limit",
    });
  });
});
