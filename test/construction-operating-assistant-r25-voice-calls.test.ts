import { describe, expect, it } from "vitest";
import {
  callTranscriptInboundEventSchema,
  prepareOutboundCallWorkCommandSchema,
  selectedVoiceNoteCommandSchema,
} from "@/lib/construction-operating-assistant-r25/contracts";
import {
  deriveCallTranscriptAdmission,
  deriveOutboundCallPolicy,
  nextCallLifecycle,
  opaqueVoiceContactRef,
} from "@/lib/construction-operating-assistant-r25/policy";

const inboundBase = {
  schemaVersion: 1 as const,
  eventId: "df1b55c5-ef0d-4b4f-80da-1a829cf4ae30",
  callId: "b271be12-0a92-423c-bbdf-2d034132a77c",
  workspaceId: "workspace-1",
  projectId: "project-1",
  callerIdentityRef: `ref_${"a".repeat(64)}`,
  occurredAt: "2026-09-02T03:00:00.000Z",
  direction: "INBOUND" as const,
  purpose: "internal" as const,
  disclosure: {
    version: "r25-disclosure-v1",
    presented: true as const,
    acknowledged: true as const,
  },
  recordingConsent: "NOT_RECORDED" as const,
  transcriptionConsent: "GRANTED" as const,
  normalizedTranscript: "Rendez-vous avec Marc mardi à 14 h pour Laval.",
  transcriptProofLevel: "HUMAN_TRANSCRIBED" as const,
  sourceAudioPersisted: false as const,
  externalTransportPerformed: false as const,
};

describe("R25 voice call contracts and policy", () => {
  it("accepts a strict disclosed transcript and rejects raw provider/audio fields", () => {
    expect(callTranscriptInboundEventSchema.safeParse(inboundBase).success).toBe(true);
    expect(callTranscriptInboundEventSchema.safeParse({
      ...inboundBase,
      recordingUrl: "https://provider.invalid/recording",
    }).success).toBe(false);
    expect(callTranscriptInboundEventSchema.safeParse({
      ...inboundBase,
      sourceAudioPersisted: true,
    }).success).toBe(false);
  });

  it("requires explicit disclosure and transcription authority without inferring consent", () => {
    expect(deriveCallTranscriptAdmission(inboundBase)).toEqual({
      admitted: true,
      verificationState: "HUMAN_CONFIRMED",
    });
    expect(deriveCallTranscriptAdmission({
      ...inboundBase,
      disclosure: { ...inboundBase.disclosure, acknowledged: false },
    })).toEqual({ admitted: false, reason: "DISCLOSURE_NOT_ACKNOWLEDGED" });
    expect(deriveCallTranscriptAdmission({
      ...inboundBase,
      transcriptionConsent: "UNKNOWN",
    })).toEqual({ admitted: false, reason: "TRANSCRIPTION_CONSENT_REQUIRED" });
    expect(deriveCallTranscriptAdmission({
      ...inboundBase,
      transcriptProofLevel: "SYNTHETIC_LOCAL",
    })).toEqual({ admitted: true, verificationState: "UNVERIFIED" });
  });

  it("admits only bounded selected foreground voice-note metadata", () => {
    const voiceNote = {
      schemaVersion: 1 as const,
      action: "ADMIT_SELECTED_VOICE_NOTE" as const,
      commandId: "a79529f4-4cf8-4a5a-9e14-1570c8c28c39",
      workspaceId: "workspace-1",
      projectId: "project-1",
      fileName: "note.m4a",
      mimeType: "audio/mp4" as const,
      durationMs: 119_000,
      sizeBytes: 200_000,
      foregroundRecorded: true as const,
      transcriptionRequested: false as const,
    };
    expect(selectedVoiceNoteCommandSchema.safeParse(voiceNote).success).toBe(true);
    expect(selectedVoiceNoteCommandSchema.safeParse({ ...voiceNote, durationMs: 120_001 }).success)
      .toBe(false);
    expect(selectedVoiceNoteCommandSchema.safeParse({
      ...voiceNote,
      backgroundRecorded: true,
    }).success).toBe(false);
    expect(selectedVoiceNoteCommandSchema.safeParse({
      ...voiceNote,
      transcript: "texte inventé",
    }).success).toBe(false);
  });

  it("prohibits commercial automated calling and prepares service work only", () => {
    expect(deriveOutboundCallPolicy({
      purpose: "service",
      disclosureVersion: "r25-disclosure-v1",
      identityVerified: true,
    })).toEqual({ allowed: true, reason: "LOCAL_PREPARATION_ALLOWED" });
    expect(deriveOutboundCallPolicy({
      purpose: "commercial",
      disclosureVersion: "r25-disclosure-v1",
      identityVerified: true,
    })).toEqual({ allowed: false, reason: "COMMERCIAL_AUTOMATED_CALL_PROHIBITED" });
    expect(prepareOutboundCallWorkCommandSchema.safeParse({
      schemaVersion: 1,
      action: "PREPARE_OUTBOUND_CALL_WORK",
      commandId: "17907955-99bb-48cb-bd5b-b3c92e26d900",
      workspaceId: "workspace-1",
      projectId: "project-1",
      contactId: "contact-1",
      purpose: "service",
      objective: "Confirmer la date de livraison des fenêtres.",
      disclosureVersion: "r25-disclosure-v1",
      disclosureScript: "Bonjour, ici l’assistant ENDVERA de Construction ABC.",
      resultSchema: ["CONTACT_REACHED", "RESULT_SUMMARY", "FOLLOW_UP_DATE"],
      expectedPolicyVersion: "r25-local-disabled-v1",
    }).success).toBe(true);
  });

  it("keeps lifecycle monotonic and identity opaque", () => {
    expect(nextCallLifecycle("RECEIVED", "CLARIFICATION_REQUIRED")).toEqual({
      accepted: true,
      rank: 20,
    });
    expect(nextCallLifecycle("COMPLETED", "PROCESSING")).toEqual({
      accepted: false,
      reason: "CALL_LIFECYCLE_REGRESSION",
    });
    const ref = opaqueVoiceContactRef({ workspaceId: "workspace-1", contactId: "contact-1" });
    expect(ref).toMatch(/^ref_[a-f0-9]{64}$/u);
    expect(ref).not.toContain("contact-1");
  });
});
