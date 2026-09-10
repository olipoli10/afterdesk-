import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { PROJECT_BRAIN_MAX_SOURCE_BYTES, PROJECT_BRAIN_MAX_VOICE_DURATION_MS } from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";
import { readProjectBrainSourceBytesInternally } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { VOICE_LIMITS } from "./types";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().datetime({ offset: true });
const requestSchema = z.object({
  // actorUserId is supplied by a trusted authenticated server caller, never the request body.
  actorUserId: id, workspaceId: id, projectId: id, intakeId: id, sourceId: id,
  expectedIntakeStateVersion: z.number().int().positive(),
}).strict();

export const projectBrainVoiceSourceSubjectSchema = z.object({
  kind: z.literal("project_brain_voice_source"),
  actorUserId: id, workspaceId: id, projectId: id, intakeId: id, sourceId: id, fileId: id,
  memberId: id, memberRevision: revision, workspaceRevision: revision, projectRevision: revision,
  intakeStateVersion: z.number().int().positive(), intakeRevision: revision,
  intakeStatus: z.enum(["DRAFT", "READY_FOR_REVIEW", "CONFIRMED"]),
  sourceContentHash: hash, sourceMimeType: z.enum(["audio/mp4", "audio/m4a", "audio/x-m4a"]),
  sourceSizeBytes: z.number().int().positive().max(PROJECT_BRAIN_MAX_SOURCE_BYTES),
  sourceDurationMs: z.number().int().positive().max(Math.min(PROJECT_BRAIN_MAX_VOICE_DURATION_MS, VOICE_LIMITS.maxSessionDurationMs)),
}).strict();
export type ProjectBrainVoiceSourceSubject = Readonly<z.infer<typeof projectBrainVoiceSourceSubjectSchema>>;
export type ProjectBrainVoiceSourceRequest = z.infer<typeof requestSchema>;

/** Current local authority inspection; caller owns transaction isolation and any required row locks. */
export async function inspectProjectBrainVoiceSourceInTransaction(tx: Prisma.TransactionClient, input: ProjectBrainVoiceSourceRequest): Promise<ProjectBrainVoiceSourceSubject> {
    const membership = await requireActiveConstructionMember(tx, input.actorUserId, input.workspaceId);
    if (membership.role !== "owner") throw new Error("PROJECT_BRAIN_VOICE_SOURCE_REFUSED");
    const [member, workspace, project, source] = await Promise.all([
      tx.constructionWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.actorUserId } } }),
      tx.constructionWorkspace.findFirst({ where: { id: input.workspaceId, ownerUserId: input.actorUserId, status: "active" } }),
      tx.constructionProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, status: "active" } }),
      tx.constructionProjectBrainSource.findFirst({ where: { id: input.sourceId, workspaceId: input.workspaceId, projectId: input.projectId, intakeId: input.intakeId }, include: { intake: true, file: true } }),
    ]);
    if (!member || member.role !== "owner" || member.status !== "active" || !workspace || !project || !source
      || source.createdByUserId !== input.actorUserId || source.file.uploaderId !== input.actorUserId
      || source.intake.createdByUserId !== input.actorUserId || source.kind !== "VOICE_NOTE"
      || source.intake.id !== input.intakeId || source.intake.workspaceId !== input.workspaceId || source.intake.projectId !== input.projectId
      || source.intake.stateVersion !== input.expectedIntakeStateVersion
      || source.file.id !== source.fileId || source.file.purgedAt !== null
      || source.file.taskId !== null || source.file.submissionId !== null
      || source.contentHash !== source.file.sha256 || source.mimeType !== source.file.detectedMime
      || source.sizeBytes !== source.file.sizeBytes || !source.file.scanDetails?.startsWith("LOCAL_SIGNATURE_SANITIZATION;")
      || source.transcriptionState !== "NOT_REQUESTED_LOCAL_ONLY" || source.documentUnderstandingState !== "NOT_REQUESTED_LOCAL_ONLY") {
      throw new Error("PROJECT_BRAIN_VOICE_SOURCE_REFUSED");
    }
    return Object.freeze(projectBrainVoiceSourceSubjectSchema.parse({
      kind: "project_brain_voice_source", actorUserId: input.actorUserId,
      workspaceId: workspace.id, projectId: project.id, intakeId: source.intakeId, sourceId: source.id, fileId: source.fileId,
      memberId: member.id, memberRevision: member.updatedAt.toISOString(), workspaceRevision: workspace.updatedAt.toISOString(),
      projectRevision: project.updatedAt.toISOString(), intakeRevision: source.intake.updatedAt.toISOString(),
      intakeStateVersion: source.intake.stateVersion, intakeStatus: source.intake.status,
      sourceContentHash: source.contentHash, sourceMimeType: source.mimeType, sourceSizeBytes: source.sizeBytes, sourceDurationMs: source.durationMs,
    }));
}

async function loadCurrentSubject(input: ProjectBrainVoiceSourceRequest): Promise<ProjectBrainVoiceSourceSubject> {
  return prisma.$transaction(tx => inspectProjectBrainVoiceSourceInTransaction(tx, input), { isolationLevel: "Serializable" });
}

/** OFF by default. Does not create a session, reserve money, accept consent, or dispatch. */
export async function resolveProjectBrainVoiceSource(input: ProjectBrainVoiceSourceRequest & { enabled?: boolean }) {
  if (input.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const { enabled: _enabled, ...request } = input;
  void _enabled;
  const parsed = requestSchema.parse(request);
  const before = await loadCurrentSubject(parsed);
  const source = await readProjectBrainSourceBytesInternally({ userId: parsed.actorUserId, sourceId: parsed.sourceId });
  if (source.bytes.byteLength !== before.sourceSizeBytes) throw new Error("PROJECT_BRAIN_VOICE_BYTES_CHANGED");
  const bytes = Buffer.from(source.bytes);
  if (bytes.length !== before.sourceSizeBytes || source.mimeType !== before.sourceMimeType
    || source.contentHash !== before.sourceContentHash || createHash("sha256").update(bytes).digest("hex") !== before.sourceContentHash) {
    throw new Error("PROJECT_BRAIN_VOICE_BYTES_CHANGED");
  }
  const after = await loadCurrentSubject(parsed);
  const fingerprint = sha256Canonical(before);
  if (sha256Canonical(after) !== fingerprint) throw new Error("PROJECT_BRAIN_VOICE_AUTHORITY_CHANGED");
  // Byte buffers cannot be frozen; every downstream transformation must hash its own copy again.
  return Object.freeze({ status: "RESOLVED_LOCAL_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    externalTransportPerformed: false as const, subject: after, subjectFingerprint: fingerprint, bytes });
}
