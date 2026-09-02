import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  callTranscriptInboundEventSchema,
  type CallTranscriptInboundEvent,
} from "./contracts";

export function deriveCallTranscriptAdmission(input: CallTranscriptInboundEvent | unknown):
  | { admitted: true; verificationState: "UNVERIFIED" | "HUMAN_CONFIRMED" }
  | {
      admitted: false;
      reason:
        | "DISCLOSURE_NOT_PRESENTED"
        | "DISCLOSURE_NOT_ACKNOWLEDGED"
        | "TRANSCRIPTION_CONSENT_REQUIRED";
    } {
  const event = callTranscriptInboundEventSchema.parse(input);
  if (!event.disclosure.presented) return { admitted: false, reason: "DISCLOSURE_NOT_PRESENTED" };
  if (!event.disclosure.acknowledged) {
    return { admitted: false, reason: "DISCLOSURE_NOT_ACKNOWLEDGED" };
  }
  if (event.transcriptionConsent !== "GRANTED") {
    return { admitted: false, reason: "TRANSCRIPTION_CONSENT_REQUIRED" };
  }
  return {
    admitted: true,
    verificationState:
      event.transcriptProofLevel === "HUMAN_TRANSCRIBED" ? "HUMAN_CONFIRMED" : "UNVERIFIED",
  };
}

export function deriveOutboundCallPolicy(input: {
  purpose: "internal" | "service" | "commercial";
  disclosureVersion: string;
  identityVerified: boolean;
}):
  | { allowed: true; reason: "LOCAL_PREPARATION_ALLOWED" }
  | {
      allowed: false;
      reason:
        | "COMMERCIAL_AUTOMATED_CALL_PROHIBITED"
        | "VOICE_IDENTITY_REQUIRED"
        | "DISCLOSURE_VERSION_REQUIRED";
    } {
  if (input.purpose === "commercial") {
    return { allowed: false, reason: "COMMERCIAL_AUTOMATED_CALL_PROHIBITED" };
  }
  if (!input.identityVerified) return { allowed: false, reason: "VOICE_IDENTITY_REQUIRED" };
  if (!input.disclosureVersion.trim()) {
    return { allowed: false, reason: "DISCLOSURE_VERSION_REQUIRED" };
  }
  return { allowed: true, reason: "LOCAL_PREPARATION_ALLOWED" };
}

const CALL_LIFECYCLE_RANK = {
  RECEIVED: 10,
  PROCESSING: 15,
  CLARIFICATION_REQUIRED: 20,
  COMPLETED: 30,
  REFUSED: 30,
} as const;

export function nextCallLifecycle(
  current: keyof typeof CALL_LIFECYCLE_RANK,
  next: keyof typeof CALL_LIFECYCLE_RANK,
): { accepted: true; rank: number } | { accepted: false; reason: "CALL_LIFECYCLE_REGRESSION" } {
  if (CALL_LIFECYCLE_RANK[next] < CALL_LIFECYCLE_RANK[current]) {
    return { accepted: false, reason: "CALL_LIFECYCLE_REGRESSION" };
  }
  return { accepted: true, rank: CALL_LIFECYCLE_RANK[next] };
}

export function opaqueVoiceContactRef(input: { workspaceId: string; contactId: string }) {
  return `ref_${sha256Canonical({
    schemaVersion: 1,
    purpose: "voice-contact-r25",
    workspaceId: input.workspaceId,
    contactId: input.contactId,
  })}`;
}

export function callEventHash(event: CallTranscriptInboundEvent) {
  return sha256Canonical({
    schemaVersion: 1,
    event,
    scope: "voice-call-r25",
  });
}
