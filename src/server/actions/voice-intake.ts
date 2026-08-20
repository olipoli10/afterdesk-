"use server";

import type {
  VoiceCommandResult,
  VoiceCreateResult,
  VoiceMimeType,
  VoiceReadinessFacts,
  VoiceTranscriptResult,
} from "@/lib/voice-intake-contract";
import type { ClientPortalLang } from "@/lib/i18n/client-portal";

/**
 * Portal-side reconciliation seam for the approved Audio Intake contract.
 *
 * The audio runtime lives on a divergent, unmerged branch. Returning explicit
 * negative facts is intentional: the client cannot infer or override provider,
 * route, spend, consent or rollout readiness. These actions remain inert until
 * the controller authorizes and merges the real gateway boundary separately.
 */
export async function getVoiceReadiness(): Promise<Partial<VoiceReadinessFacts>> {
  return {
    operationEnabled: false,
    publishedPolicyAvailable: false,
    eligibleRouteAvailable: false,
    configuredSpendCeiling: false,
    consentVersion: "",
    allowedLanguages: [],
    allowedFormats: [],
  };
}

export async function createVoiceSession(input: {
  languageHint: ClientPortalLang;
  consentVersion: string;
  consentAccepted: true;
}): Promise<VoiceCreateResult> {
  void input;
  return { kind: "disabled" };
}

export async function submitVoiceSegment(input: {
  sessionId: string;
  ordinal: number;
  format: VoiceMimeType;
  mimeType: VoiceMimeType;
  durationMs: number;
  bytes: number;
  audio: ArrayBuffer;
}): Promise<VoiceCommandResult> {
  void input;
  return { kind: "disabled" };
}

export async function finishVoiceSession(input: {
  sessionId: string;
  expectedSegmentCount: number;
}): Promise<VoiceCommandResult> {
  void input;
  return { kind: "disabled" };
}

export async function assembleVoiceTranscript(input: {
  sessionId: string;
}): Promise<VoiceTranscriptResult> {
  void input;
  return { kind: "disabled" };
}

export async function cancelVoiceSession(input: {
  sessionId: string;
}): Promise<VoiceCommandResult> {
  void input;
  return { kind: "disabled" };
}
