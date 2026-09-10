import { createHash } from "node:crypto";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";

export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function voiceFixture(durationMs = 60_000) {
  const bytes = Buffer.from("synthetic-only-not-a-playable-audio-container");
  const now = new Date("2026-09-10T12:00:00.000Z");
  const request = { actorUserId: "owner-a", workspaceId: "workspace-a", projectId: "project-a", intakeId: "intake-a", sourceId: "source-a", expectedIntakeStateVersion: 3 };
  const member = { id: "member-a", workspaceId: request.workspaceId, userId: request.actorUserId, role: "owner", status: "active", updatedAt: now };
  const workspace = { id: request.workspaceId, ownerUserId: request.actorUserId, status: "active", updatedAt: now };
  const project = { id: request.projectId, workspaceId: request.workspaceId, status: "active", updatedAt: now };
  const source = { id: request.sourceId, workspaceId: request.workspaceId, projectId: request.projectId, intakeId: request.intakeId,
    kind: "VOICE_NOTE", fileId: "file-a", contentHash: digest(bytes), mimeType: "audio/mp4", sizeBytes: bytes.length, durationMs,
    createdByUserId: request.actorUserId, transcriptionState: "NOT_REQUESTED_LOCAL_ONLY", documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY",
    intake: { id: request.intakeId, workspaceId: request.workspaceId, projectId: request.projectId, createdByUserId: request.actorUserId, status: "CONFIRMED", stateVersion: 3, updatedAt: now },
    file: { id: "file-a", uploaderId: request.actorUserId, sha256: digest(bytes), detectedMime: "audio/mp4", sizeBytes: bytes.length,
      purgedAt: null as Date | null, taskId: null as string | null, submissionId: null, scanDetails: "LOCAL_SIGNATURE_SANITIZATION; synthetic" },
  };
  const subject = { kind: "project_brain_voice_source" as const,
    actorUserId: request.actorUserId, workspaceId: request.workspaceId, projectId: request.projectId, intakeId: request.intakeId, sourceId: request.sourceId,
    fileId: source.fileId, memberId: member.id, memberRevision: now.toISOString(), workspaceRevision: now.toISOString(), projectRevision: now.toISOString(),
    intakeRevision: now.toISOString(), intakeStatus: "CONFIRMED" as const, intakeStateVersion: 3, sourceContentHash: source.contentHash,
    sourceMimeType: "audio/mp4" as const, sourceSizeBytes: source.sizeBytes, sourceDurationMs: durationMs };
  const segments = Array.from({ length: Math.ceil(durationMs / 45_000) }, (_, ordinal) => {
    const segmentBytes = Buffer.from(`synthetic-only-segment-${ordinal}`);
    const startMs = ordinal * 45_000, endMs = Math.min(durationMs, startMs + 45_000);
    return { ordinal, startMs, endMs, durationMs: endMs - startMs, mediaFormat: "m4a", mimeType: "audio/mp4", bytes: segmentBytes, contentHash: digest(segmentBytes) };
  });
  return { request, member, workspace, project, source, bytes, subject,
    manifest: { subject, subjectFingerprint: sha256Canonical(subject), sourceBytes: bytes,
      transformer: { id: "synthetic-injected", version: "1", encodingProfile: "synthetic-not-a-decoder", mode: "SYNTHETIC_LOCAL" }, segments } };
}
