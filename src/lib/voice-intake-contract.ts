import type { ClientPortalLang } from "@/lib/i18n/client-portal";

export const MAX_SEGMENT_DURATION_MS = 45_000;
export const SEGMENT_ROLLOVER_TRIGGER_MS = 44_500;
export const MAX_SEGMENT_BYTES = 2_000_000;
export const MAX_SESSION_SEGMENTS = 14;
export const MAX_SESSION_DURATION_MS = 600_000;
export const MAX_SESSION_BYTES = 28_000_000;

export const VOICE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];

export type VoiceReadinessFacts = {
  operationEnabled: boolean;
  publishedPolicyAvailable: boolean;
  eligibleRouteAvailable: boolean;
  configuredSpendCeiling: boolean;
  consentVersion: string;
  allowedLanguages: readonly ClientPortalLang[];
  allowedFormats: readonly VoiceMimeType[];
};

export type VoiceBrowserFacts = {
  secureContext: boolean;
  topLevel: boolean;
  hasMediaDevices: boolean;
  hasMediaRecorder: boolean;
  supportedMimeTypes: readonly string[];
};

export type VoiceAvailability =
  | {
      available: true;
      consentVersion: string;
      language: ClientPortalLang;
      mimeType: VoiceMimeType;
    }
  | {
      available: false;
      reason:
        | "server_not_ready"
        | "language_unsupported"
        | "format_unsupported"
        | "insecure_context"
        | "embedded_context"
        | "device_missing"
        | "recorder_unsupported";
    };

export type VoiceStableResultKind =
  | "ok"
  | "disabled"
  | "permission_denied"
  | "device_missing"
  | "unsupported"
  | "limit"
  | "conflict"
  | "incomplete"
  | "uncertain"
  | "unavailable"
  | "cancelled";

export type VoiceCreateResult =
  | { kind: "ok"; sessionId: string }
  | { kind: Exclude<VoiceStableResultKind, "ok"> };

export type VoiceCommandResult =
  | { kind: "ok" }
  | { kind: Exclude<VoiceStableResultKind, "ok">; dispatchState?: "dispatched_unknown" };

export type VoiceTranscriptResult =
  | { kind: "ok"; transcript: string }
  | {
      kind: Exclude<VoiceStableResultKind, "ok">;
      dispatchState?: "dispatched_unknown";
    };

function hasExactPositiveServerFacts(
  facts: Partial<VoiceReadinessFacts> | null | undefined,
): facts is VoiceReadinessFacts {
  return Boolean(
    facts &&
      facts.operationEnabled === true &&
      facts.publishedPolicyAvailable === true &&
      facts.eligibleRouteAvailable === true &&
      facts.configuredSpendCeiling === true &&
      typeof facts.consentVersion === "string" &&
      facts.consentVersion.trim().length > 0 &&
      Array.isArray(facts.allowedLanguages) &&
      facts.allowedLanguages.length > 0 &&
      Array.isArray(facts.allowedFormats) &&
      facts.allowedFormats.length > 0,
  );
}

export function evaluateVoiceReadiness(
  facts: Partial<VoiceReadinessFacts> | null | undefined,
  browser: VoiceBrowserFacts,
  language: string,
): VoiceAvailability {
  if (!hasExactPositiveServerFacts(facts)) {
    return { available: false, reason: "server_not_ready" };
  }
  if (!browser.secureContext) return { available: false, reason: "insecure_context" };
  if (!browser.topLevel) return { available: false, reason: "embedded_context" };
  if (!browser.hasMediaDevices) return { available: false, reason: "device_missing" };
  if (!browser.hasMediaRecorder) return { available: false, reason: "recorder_unsupported" };
  if (!facts.allowedLanguages.includes(language as ClientPortalLang)) {
    return { available: false, reason: "language_unsupported" };
  }

  const mimeType = facts.allowedFormats.find((format) =>
    browser.supportedMimeTypes.includes(format),
  );
  if (!mimeType) return { available: false, reason: "format_unsupported" };

  return {
    available: true,
    consentVersion: facts.consentVersion,
    language: language as ClientPortalLang,
    mimeType,
  };
}

export function validateVoiceSegment({
  durationMs,
  bytes,
}: {
  durationMs: number;
  bytes: number;
}): { ok: true } | { ok: false; reason: "duration_limit" | "byte_limit" } {
  if (durationMs > MAX_SEGMENT_DURATION_MS) return { ok: false, reason: "duration_limit" };
  if (bytes > MAX_SEGMENT_BYTES) return { ok: false, reason: "byte_limit" };
  return { ok: true };
}
