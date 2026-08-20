"use server";

import type {
  VoiceCommandResult,
  VoiceCreateResult,
  VoiceMimeType,
  VoiceReadinessFacts,
  VoiceTranscriptResult,
} from "@/lib/voice-intake-contract";
import type { ClientPortalLang } from "@/lib/i18n/client-portal";
import { requireRole } from "@/lib/authz";
import {
  assemblePortalVoiceTranscript,
  cancelPortalVoiceSession,
  createPortalVoiceSession,
  finishPortalVoiceSession,
  getVoiceRuntimeReadiness,
  registerPortalVoiceSegment,
} from "@/server/voice-intake-runtime-boundary";

export async function getVoiceReadiness(): Promise<Partial<VoiceReadinessFacts>> {
  await requireRole("CLIENT");
  return getVoiceRuntimeReadiness();
}

export async function createVoiceSession(input: {
  languageHint: ClientPortalLang;
  consentVersion: string;
  consentAccepted: true;
}): Promise<VoiceCreateResult> {
  const user = await requireRole("CLIENT");
  return createPortalVoiceSession({ actor: { id: user.id, role: user.role }, ...input });
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
  const user = await requireRole("CLIENT");
  return registerPortalVoiceSegment({ actor: { id: user.id, role: user.role }, ...input });
}

export async function finishVoiceSession(input: {
  sessionId: string;
  expectedSegmentCount: number;
}): Promise<VoiceCommandResult> {
  const user = await requireRole("CLIENT");
  return finishPortalVoiceSession({ actor: { id: user.id, role: user.role }, ...input });
}

export async function assembleVoiceTranscript(input: {
  sessionId: string;
}): Promise<VoiceTranscriptResult> {
  const user = await requireRole("CLIENT");
  return assemblePortalVoiceTranscript({ actor: { id: user.id, role: user.role }, ...input });
}

export async function cancelVoiceSession(input: {
  sessionId: string;
}): Promise<VoiceCommandResult> {
  const user = await requireRole("CLIENT");
  return cancelPortalVoiceSession({ actor: { id: user.id, role: user.role }, ...input });
}
