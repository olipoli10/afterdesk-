import "server-only";
import { canonicalFingerprint } from "../../evidence";
import { normalizeGatewayProviderError } from "@/lib/ai-work-engine/provider-error";
import { VOICE_LIMITS } from "../types";
import type { VoiceAdapterResult, VoiceAdapterUsage } from "./contract";

export const voiceNotDispatched = (
  errorClass: "malformed_request" | "timeout" | "authentication"
): VoiceAdapterResult => Object.freeze({
  dispatchKnowledge: "not_dispatched",
  providerRequestRef: null,
  transcriptText: null,
  usage: null,
  errorClass,
  httpStatus: null,
  responseEvidenceRef: null,
});

export function voiceTransportFailure(error: unknown, requestRef: string): VoiceAdapterResult {
  const normalized = normalizeGatewayProviderError(error);
  if (normalized.httpStatus !== null) {
    return Object.freeze({
      dispatchKnowledge: "response_received",
      providerRequestRef: requestRef,
      transcriptText: null,
      usage: null,
      errorClass: normalized.errorClass,
      httpStatus: normalized.httpStatus,
      responseEvidenceRef: canonicalFingerprint({ requestRef, ...normalized }),
    });
  }
  return Object.freeze({
    dispatchKnowledge: "dispatched_unknown",
    providerRequestRef: requestRef,
    transcriptText: null,
    usage: null,
    errorClass: "unknown_dispatched_outcome",
    httpStatus: null,
    responseEvidenceRef: null,
  });
}

export function voiceResponse(input: {
  requestRef: string;
  transcriptText: unknown;
  usage: VoiceAdapterUsage;
  httpStatus?: number;
}): VoiceAdapterResult {
  if (typeof input.transcriptText !== "string" || input.transcriptText.length < 1 ||
      input.transcriptText.length > VOICE_LIMITS.maxTranscriptCharsPerSegment) {
    return Object.freeze({
      dispatchKnowledge: "response_received",
      providerRequestRef: input.requestRef,
      transcriptText: null,
      usage: null,
      errorClass: "malformed_request",
      httpStatus: input.httpStatus ?? 200,
      responseEvidenceRef: canonicalFingerprint({ requestRef: input.requestRef, contract: "invalid_text" }),
    });
  }
  const finite = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);
  const integer = (value: number | null) => value === null || (Number.isSafeInteger(value) && value >= 0);
  if (!finite(input.usage.audioSeconds) || !integer(input.usage.inputTokens) ||
      !integer(input.usage.outputTokens) ||
      (input.usage.measuredCostMicros !== null && input.usage.measuredCostMicros < 0n)) {
    return Object.freeze({
      dispatchKnowledge: "response_received",
      providerRequestRef: input.requestRef,
      transcriptText: null,
      usage: null,
      errorClass: "malformed_request",
      httpStatus: input.httpStatus ?? 200,
      responseEvidenceRef: canonicalFingerprint({ requestRef: input.requestRef, contract: "invalid_usage" }),
    });
  }
  return Object.freeze({
    dispatchKnowledge: "response_received",
    providerRequestRef: input.requestRef,
    transcriptText: input.transcriptText,
    usage: Object.freeze(input.usage),
    errorClass: null,
    httpStatus: input.httpStatus ?? 200,
    responseEvidenceRef: canonicalFingerprint({
      requestRef: input.requestRef,
      contract: "voice-transcript-v1",
      characterCount: input.transcriptText.length,
      audioSeconds: input.usage.audioSeconds,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      measuredCostMicros: input.usage.measuredCostMicros,
    }),
  });
}
