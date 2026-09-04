import "server-only";

import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  buildCanonicalProjectBrainSnapshot,
  canonicalProjectBrainSnapshotSchema,
  hashProjectBrainCommand,
  projectBrainCommandResultSchema,
  projectBrainCommandSchema,
  projectBrainIntakeProjectionSchema,
  projectBrainSourceCommandSchema,
  projectBrainSourceKindSchema,
  type ProjectBrainCommand,
  type ProjectBrainCommandResult,
  type ProjectBrainOwnerBrief,
  type ProjectBrainSourceCommand,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import {
  FileRejectedError,
} from "@/lib/file-security";
import { inspectProjectBrainSourceLocally } from "@/lib/file-security-local";
import {
  deleteLocalObject,
  LOCAL_OBJECT_SCAN_MAX_ENTRIES,
  putLocalObject,
  readLocalObject,
  scanLocalObjects,
} from "@/lib/storage-local";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const SERIALIZABLE_RETRY_LIMIT = 8;
const TRANSACTION_MAX_WAIT_MS = 15_000;
const TRANSACTION_TIMEOUT_MS = 30_000;
const LOCAL_CRASH_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1_000;
const LOCAL_CRASH_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;
export const PROJECT_BRAIN_LOCAL_CLEANUP_BATCH_SIZE = 64;
export const PROJECT_BRAIN_LOCAL_CLEANUP_SCAN_LIMIT = 256;
const localCommandTails = new Map<string, Promise<void>>();
let automaticLocalCleanupNextRunMs = 0;
let automaticLocalCleanupInFlight: Promise<void> | null = null;
// Database roles are owner/admin/field_worker. Product surfaces project admin
// as OFFICE_MANAGER, but that label is never persisted.
const ALLOWED_MEMBER_ROLES = new Set(["owner", "admin"]);
const AUDITABLE_REFUSAL_CODES = new Set([
  "PROJECT_BRAIN_ACTIVE_INTAKE_EXISTS",
  "PROJECT_BRAIN_IDEMPOTENCY_CONFLICT",
  "PROJECT_BRAIN_INCOMPLETE",
  "PROJECT_BRAIN_REVIEW_FINGERPRINT_CONFLICT",
  "PROJECT_BRAIN_SOURCE_LIMIT_REACHED",
  "PROJECT_BRAIN_STALE_STATE_VERSION",
  "PROJECT_BRAIN_STATE_REFUSED",
  "PROJECT_BRAIN_VOICE_NOTE_LIMIT_REACHED",
  "PROJECT_BRAIN_MEDIA_REFUSED",
]);

const DECISION_ACTIONS = {
  CREATE: "CREATE_PROJECT_BRAIN_INTAKE",
  ADD_OWNER_BRIEF: "ADD_OWNER_BRIEF",
  ADMIT_SOURCE: "ADMIT_PROJECT_BRAIN_SOURCE",
  SUBMIT_FOR_REVIEW: "SUBMIT_PROJECT_BRAIN_INTAKE",
  CONFIRM_EXACT: "CONFIRM_PROJECT_BRAIN_INTAKE",
  REJECT: "REJECT_PROJECT_BRAIN_INTAKE",
} as const;

const MIME_EXTENSIONS = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "audio/mp4": ["m4a"],
  "audio/m4a": ["m4a"],
  "audio/x-m4a": ["m4a"],
} satisfies Record<ProjectBrainSourceCommand["mimeType"], readonly string[]>;

async function withLocalCommandSerialization<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = localCommandTails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  localCommandTails.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (localCommandTails.get(key) === tail) localCommandTails.delete(key);
  }
}

function asJson(value: unknown): PrismaTypes.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;
}

async function withSerializedTransaction<T>(
  operation: (tx: PrismaTypes.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      // The advisory lock is the serialization boundary. READ COMMITTED makes
      // a waiter observe the winner's committed receipt after acquiring it;
      // a transaction-wide SERIALIZABLE snapshot could remain stale here.
      return await prisma.$transaction(operation, {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("PROJECT_BRAIN_SERIALIZABLE_RETRY_EXHAUSTED");
}

async function lock(tx: PrismaTypes.TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r36v:${key}`}, 0))::text AS acquired`,
  );
}

async function requireWriter(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (!ALLOWED_MEMBER_ROLES.has(membership.role)) {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }
}

async function requireProject(
  tx: PrismaTypes.TransactionClient,
  workspaceId: string,
  projectId: string,
) {
  const project = await tx.constructionProject.findFirst({
    where: { id: projectId, workspaceId, status: "active" },
    select: { id: true, code: true, name: true },
  });
  if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  return project;
}

async function recordAuthorizedProjectBrainRefusal(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  intakeId?: string;
  commandId: string;
  commandAction: string;
  commandHash: string;
  reasonCode: string;
}): Promise<void> {
  if (!AUDITABLE_REFUSAL_CODES.has(input.reasonCode)) return;
  try {
    await prisma.$transaction(async (tx) => {
      await requireWriter(tx, input.userId, input.workspaceId);
      await requireProject(tx, input.workspaceId, input.projectId);
      if (input.intakeId) {
        const intake = await tx.constructionProjectBrainIntake.findFirst({
          where: {
            id: input.intakeId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
          },
          select: { id: true },
        });
        if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      }
      const audit = {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        entityType: input.intakeId ? "project_brain_intake" : "construction_project",
        entityId: input.intakeId ?? input.projectId,
        action: "project_brain_command_refused",
        reasonCode: input.reasonCode,
        metadata: asJson({
          commandId: input.commandId,
          commandAction: input.commandAction,
          commandHash: input.commandHash,
          projectId: input.projectId,
          providerExecutionPerformed: false,
        }),
      };
      await tx.constructionAuditEvent.createMany({
        data: [{
          ...audit,
          fingerprint: sha256Canonical({ ...audit, refusalKey: input.commandId }),
        }],
        skipDuplicates: true,
      });
    });
  } catch {
    // A refusal audit must never reveal resource existence or replace the
    // original fail-closed outcome when authorization/audit storage is absent.
  }
}

async function requireSourceAdmissionState(
  tx: PrismaTypes.TransactionClient,
  command: ProjectBrainSourceCommand,
) {
  const intake = await tx.constructionProjectBrainIntake.findFirst({
    where: {
      id: command.intakeId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
    },
    select: { id: true, status: true, stateVersion: true },
  });
  if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  if (intake.status !== "DRAFT") throw new Error("PROJECT_BRAIN_STATE_REFUSED");
  if (intake.stateVersion !== command.expectedStateVersion) {
    throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
  }

  const latest = await tx.constructionProjectBrainSource.aggregate({
    where: { intakeId: intake.id },
    _max: { ordinal: true },
    _count: { id: true },
  });
  if (latest._count.id >= 20) throw new Error("PROJECT_BRAIN_SOURCE_LIMIT_REACHED");
  if (command.kind === "VOICE_NOTE") {
    const existingVoice = await tx.constructionProjectBrainSource.findFirst({
      where: { intakeId: intake.id, kind: "VOICE_NOTE" },
      select: { id: true },
    });
    if (existingVoice) throw new Error("PROJECT_BRAIN_VOICE_NOTE_LIMIT_REACHED");
  }
  return { intake, latest };
}

function makeResult(input: {
  commandId: string;
  action: ProjectBrainCommandResult["action"];
  intakeId: string;
  workspaceId: string;
  projectId: string;
  stateVersion: number;
  status: ProjectBrainCommandResult["status"];
  reviewFingerprint: string | null;
  canonicalEffectId: string;
  replayed?: boolean;
}): ProjectBrainCommandResult {
  return projectBrainCommandResultSchema.parse({
    schemaVersion: 1,
    ...input,
    replayed: input.replayed ?? false,
    providerExecutionPerformed: false,
    externalTransportPerformed: false,
  });
}

async function replayDecision(
  tx: PrismaTypes.TransactionClient,
  actorUserId: string,
  workspaceId: string,
  commandId: string,
  commandHash: string,
): Promise<ProjectBrainCommandResult | null> {
  // Receipts are unique across an entire workspace, not merely one intake.
  // Taking this lock before reading the receipt makes two concurrent uses of
  // the same commandId converge even when they target different projects.
  await lock(tx, `command:${workspaceId}:${commandId}`);
  const existing = await tx.constructionProjectBrainDecision.findUnique({
    where: { workspaceId_commandId: { workspaceId, commandId } },
    select: {
      id: true,
      projectId: true,
      intakeId: true,
      decision: true,
      nextStateVersion: true,
      commandHash: true,
      result: true,
      resultHash: true,
    },
  });
  if (!existing) return null;
  if (existing.commandHash !== commandHash) {
    throw new Error("PROJECT_BRAIN_IDEMPOTENCY_CONFLICT");
  }
  const parsed = projectBrainCommandResultSchema.parse(existing.result);
  const expectedAction = DECISION_ACTIONS[
    existing.decision as keyof typeof DECISION_ACTIONS
  ];
  if (
    !expectedAction
    || parsed.replayed
    || parsed.workspaceId !== workspaceId
    || parsed.commandId !== commandId
    || parsed.projectId !== existing.projectId
    || parsed.intakeId !== existing.intakeId
    || parsed.stateVersion !== existing.nextStateVersion
    || parsed.canonicalEffectId !== existing.id
    || parsed.action !== expectedAction
    || hashProjectBrainCommand(parsed) !== existing.resultHash
  ) {
    throw new Error("PROJECT_BRAIN_RESULT_CORRUPT");
  }
  const replayed = makeResult({ ...parsed, replayed: true });
  const replayAudit = {
    workspaceId,
    actorUserId,
    entityType: "project_brain_decision",
    entityId: existing.id,
    action: "project_brain_command_replayed",
    reasonCode: "IDEMPOTENT_RECEIPT_REUSED",
    metadata: asJson({
      commandId,
      commandAction: parsed.action,
      stateVersion: parsed.stateVersion,
      canonicalEffectId: parsed.canonicalEffectId,
      providerExecutionPerformed: false,
    }),
  };
  // Repeating the same replay is observationally stable: one receipt and one
  // replay audit effect, regardless of how many retries reach the service.
  await tx.constructionAuditEvent.createMany({
    data: [{
      ...replayAudit,
      fingerprint: sha256Canonical({
        ...replayAudit,
        replayKey: `${workspaceId}:${commandId}:${actorUserId}`,
      }),
    }],
    skipDuplicates: true,
  });
  return replayed;
}

async function persistDecision(
  tx: PrismaTypes.TransactionClient,
  input: {
    id: string;
    userId: string;
    workspaceId: string;
    projectId: string;
    intakeId: string;
    commandId: string;
    commandHash: string;
    decision: "CREATE" | "ADD_OWNER_BRIEF" | "ADMIT_SOURCE" | "SUBMIT_FOR_REVIEW" | "CONFIRM_EXACT" | "REJECT";
    priorStateVersion: number;
    nextStateVersion: number;
    snapshotHash?: string | null;
    result: ProjectBrainCommandResult;
  },
): Promise<void> {
  await tx.constructionProjectBrainDecision.create({
    data: {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      intakeId: input.intakeId,
      commandId: input.commandId,
      commandHash: input.commandHash,
      decision: input.decision,
      priorStateVersion: input.priorStateVersion,
      nextStateVersion: input.nextStateVersion,
      snapshotHash: input.snapshotHash ?? null,
      result: asJson(input.result),
      resultHash: hashProjectBrainCommand(input.result),
      actorUserId: input.userId,
    },
  });
}

function ownerBriefFromRow(row: {
  summary: string | null;
  scope: string | null;
  importantPeople: string | null;
  importantDates: string | null;
  blockers: string | null;
  nextDecision: string | null;
}): ProjectBrainOwnerBrief | null {
  if (row.summary === null) return null;
  return {
    summary: row.summary,
    scope: row.scope ?? "",
    importantPeople: row.importantPeople ?? "",
    importantDates: row.importantDates ?? "",
    blockers: row.blockers ?? "",
    nextDecision: row.nextDecision ?? "",
  };
}

function safeFileName(value: string): string {
  const base = path.basename(value);
  if (
    base !== value ||
    Buffer.byteLength(base, "utf8") > 255 ||
    /[\u0000-\u001f\u007f]/u.test(base)
  ) {
    throw new FileRejectedError("The filename is invalid or too long.");
  }
  return base;
}

function extensionFor(command: ProjectBrainSourceCommand): string {
  const extension = path.extname(command.fileName).slice(1).toLowerCase();
  if (!MIME_EXTENSIONS[command.mimeType].includes(extension)) {
    throw new FileRejectedError("The filename and media type do not match.");
  }
  return extension;
}

async function createIntake(input: {
  userId: string;
  command: ProjectBrainCommand & { action: "CREATE_PROJECT_BRAIN_INTAKE" };
}): Promise<ProjectBrainCommandResult> {
  const { command } = input;
  const commandHash = hashProjectBrainCommand(command);
  return withSerializedTransaction(async (tx) => {
    await lock(tx, `project:${command.workspaceId}:${command.projectId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;

    const active = await tx.constructionProjectBrainIntake.findFirst({
      where: {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        status: { in: ["DRAFT", "READY_FOR_REVIEW"] },
      },
      select: { id: true },
    });
    if (active) throw new Error("PROJECT_BRAIN_ACTIVE_INTAKE_EXISTS");

    const latest = await tx.constructionProjectBrainIntake.aggregate({
      where: { workspaceId: command.workspaceId, projectId: command.projectId },
      _max: { intakeSequence: true },
    });
    const intakeId = randomUUID();
    const effectId = randomUUID();
    const intakeSequence = (latest._max.intakeSequence ?? 0) + 1;
    await tx.constructionProjectBrainIntake.create({
      data: {
        id: intakeId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeSequence,
        createCommandId: command.commandId,
        createCommandHash: commandHash,
        createdByUserId: input.userId,
      },
    });
    const result = makeResult({
      commandId: command.commandId,
      action: command.action,
      intakeId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      stateVersion: 1,
      status: "DRAFT",
      reviewFingerprint: null,
      canonicalEffectId: effectId,
    });
    await persistDecision(tx, {
      id: effectId,
      userId: input.userId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      intakeId,
      commandId: command.commandId,
      commandHash,
      decision: "CREATE",
      priorStateVersion: 0,
      nextStateVersion: 1,
      result,
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "project_brain_intake",
      entityId: intakeId,
      action: "project_brain_intake_created",
      reasonCode: "LOCAL_OWNER_AUTHORED_MEMORY",
      metadata: asJson({ projectId: command.projectId, intakeSequence }),
    });
    return result;
  });
}

async function addOwnerBrief(input: {
  userId: string;
  command: ProjectBrainCommand & { action: "ADD_OWNER_BRIEF" };
}): Promise<ProjectBrainCommandResult> {
  const { command } = input;
  const commandHash = hashProjectBrainCommand(command);
  return withSerializedTransaction(async (tx) => {
    await lock(tx, `intake:${command.intakeId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: {
        id: command.intakeId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
      },
      select: { id: true, stateVersion: true, status: true },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (intake.status !== "DRAFT") throw new Error("PROJECT_BRAIN_STATE_REFUSED");
    if (intake.stateVersion !== command.expectedStateVersion) {
      throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    }
    const nextStateVersion = intake.stateVersion + 1;
    const updated = await tx.constructionProjectBrainIntake.updateMany({
      where: { id: intake.id, stateVersion: intake.stateVersion, status: "DRAFT" },
      data: {
        summary: command.brief.summary,
        scope: command.brief.scope,
        importantPeople: command.brief.importantPeople,
        importantDates: command.brief.importantDates,
        blockers: command.brief.blockers,
        nextDecision: command.brief.nextDecision,
        stateVersion: nextStateVersion,
      },
    });
    if (updated.count !== 1) throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    const effectId = randomUUID();
    const result = makeResult({
      commandId: command.commandId,
      action: command.action,
      intakeId: intake.id,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      stateVersion: nextStateVersion,
      status: "DRAFT",
      reviewFingerprint: null,
      canonicalEffectId: effectId,
    });
    await persistDecision(tx, {
      id: effectId,
      userId: input.userId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      intakeId: intake.id,
      commandId: command.commandId,
      commandHash,
      decision: "ADD_OWNER_BRIEF",
      priorStateVersion: intake.stateVersion,
      nextStateVersion,
      result,
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "project_brain_intake",
      entityId: intake.id,
      action: "project_brain_owner_brief_recorded",
      reasonCode: "OWNER_AUTHORED_NOT_MODEL_INFERRED",
      metadata: asJson({ projectId: command.projectId, stateVersion: nextStateVersion }),
    });
    return result;
  });
}

async function submitIntake(input: {
  userId: string;
  command: ProjectBrainCommand & { action: "SUBMIT_PROJECT_BRAIN_INTAKE" };
}): Promise<ProjectBrainCommandResult> {
  const { command } = input;
  const commandHash = hashProjectBrainCommand(command);
  return withSerializedTransaction(async (tx) => {
    await lock(tx, `intake:${command.intakeId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: { id: command.intakeId, workspaceId: command.workspaceId, projectId: command.projectId },
      include: {
        project: { select: { id: true, code: true, name: true } },
        sources: {
          orderBy: [{ ordinal: "asc" }, { id: "asc" }],
          select: { id: true, ordinal: true, kind: true, displayName: true, contentHash: true },
        },
      },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (intake.status !== "DRAFT") throw new Error("PROJECT_BRAIN_STATE_REFUSED");
    if (intake.stateVersion !== command.expectedStateVersion) {
      throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    }
    const ownerBrief = ownerBriefFromRow(intake);
    if (!ownerBrief || intake.sources.length === 0) {
      throw new Error("PROJECT_BRAIN_INCOMPLETE");
    }
    const built = buildCanonicalProjectBrainSnapshot({
      project: intake.project,
      ownerBrief,
      sources: intake.sources.map((source) => ({
        sourceId: source.id,
        ordinal: source.ordinal,
        kind: projectBrainSourceKindSchema.parse(source.kind),
        displayName: source.displayName,
        contentHash: source.contentHash,
      })),
    });
    const nextStateVersion = intake.stateVersion + 1;
    const snapshotId = randomUUID();
    const effectId = randomUUID();
    const updated = await tx.constructionProjectBrainIntake.updateMany({
      where: { id: intake.id, stateVersion: intake.stateVersion, status: "DRAFT" },
      data: {
        status: "READY_FOR_REVIEW",
        stateVersion: nextStateVersion,
        reviewFingerprint: built.canonicalHash,
        submittedAt: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    await tx.constructionProjectBrainSnapshot.create({
      data: {
        id: snapshotId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeId: intake.id,
        stateVersion: nextStateVersion,
        status: "PROPOSED",
        snapshot: asJson(built.snapshot),
        canonicalHash: built.canonicalHash,
        createdByUserId: input.userId,
      },
    });
    const result = makeResult({
      commandId: command.commandId,
      action: command.action,
      intakeId: intake.id,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      stateVersion: nextStateVersion,
      status: "READY_FOR_REVIEW",
      reviewFingerprint: built.canonicalHash,
      canonicalEffectId: effectId,
    });
    await persistDecision(tx, {
      id: effectId,
      userId: input.userId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      intakeId: intake.id,
      commandId: command.commandId,
      commandHash,
      decision: "SUBMIT_FOR_REVIEW",
      priorStateVersion: intake.stateVersion,
      nextStateVersion,
      snapshotHash: built.canonicalHash,
      result,
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "project_brain_snapshot",
      entityId: snapshotId,
      action: "project_brain_understanding_proposed",
      reasonCode: "EXACT_OWNER_REVIEW_REQUIRED",
      metadata: asJson({
        intakeId: intake.id,
        projectId: command.projectId,
        stateVersion: nextStateVersion,
        canonicalHash: built.canonicalHash,
      }),
    });
    return result;
  });
}

async function confirmIntake(input: {
  userId: string;
  command: ProjectBrainCommand & { action: "CONFIRM_PROJECT_BRAIN_INTAKE" };
}): Promise<ProjectBrainCommandResult> {
  const { command } = input;
  const commandHash = hashProjectBrainCommand(command);
  return withSerializedTransaction(async (tx) => {
    await lock(tx, `intake:${command.intakeId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: { id: command.intakeId, workspaceId: command.workspaceId, projectId: command.projectId },
      select: { id: true, status: true, stateVersion: true, reviewFingerprint: true },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (intake.status !== "READY_FOR_REVIEW") throw new Error("PROJECT_BRAIN_STATE_REFUSED");
    if (intake.stateVersion !== command.expectedStateVersion) {
      throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    }
    if (!intake.reviewFingerprint || intake.reviewFingerprint !== command.reviewFingerprint) {
      throw new Error("PROJECT_BRAIN_REVIEW_FINGERPRINT_CONFLICT");
    }
    const proposed = await tx.constructionProjectBrainSnapshot.findFirst({
      where: {
        intakeId: intake.id,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        stateVersion: intake.stateVersion,
        status: "PROPOSED",
        canonicalHash: command.reviewFingerprint,
      },
      orderBy: { createdAt: "desc" },
      select: { snapshot: true, canonicalHash: true },
    });
    if (!proposed) throw new Error("PROJECT_BRAIN_PROPOSED_SNAPSHOT_MISSING");
    const proposedSnapshot = canonicalProjectBrainSnapshotSchema.safeParse(proposed.snapshot);
    if (
      !proposedSnapshot.success
      || proposedSnapshot.data.project.id !== command.projectId
      || hashProjectBrainCommand(proposedSnapshot.data) !== proposed.canonicalHash
    ) {
      throw new Error("PROJECT_BRAIN_PROPOSED_SNAPSHOT_CORRUPT");
    }
    const nextStateVersion = intake.stateVersion + 1;
    const snapshotId = randomUUID();
    const effectId = randomUUID();
    const updated = await tx.constructionProjectBrainIntake.updateMany({
      where: { id: intake.id, stateVersion: intake.stateVersion, status: "READY_FOR_REVIEW" },
      data: { status: "CONFIRMED", stateVersion: nextStateVersion, confirmedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    await tx.constructionProjectBrainSnapshot.create({
      data: {
        id: snapshotId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeId: intake.id,
        stateVersion: nextStateVersion,
        status: "CONFIRMED",
        snapshot: asJson(proposedSnapshot.data),
        canonicalHash: proposed.canonicalHash,
        createdByUserId: input.userId,
      },
    });
    const result = makeResult({
      commandId: command.commandId,
      action: command.action,
      intakeId: intake.id,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      stateVersion: nextStateVersion,
      status: "CONFIRMED",
      reviewFingerprint: proposed.canonicalHash,
      canonicalEffectId: effectId,
    });
    await persistDecision(tx, {
      id: effectId,
      userId: input.userId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      intakeId: intake.id,
      commandId: command.commandId,
      commandHash,
      decision: "CONFIRM_EXACT",
      priorStateVersion: intake.stateVersion,
      nextStateVersion,
      snapshotHash: proposed.canonicalHash,
      result,
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "project_brain_snapshot",
      entityId: snapshotId,
      action: "project_brain_memory_confirmed_exactly",
      reasonCode: "OWNER_CONFIRMED_FINGERPRINT",
      metadata: asJson({
        intakeId: intake.id,
        projectId: command.projectId,
        canonicalHash: proposed.canonicalHash,
        stateVersion: nextStateVersion,
      }),
    });
    return result;
  });
}

async function rejectIntake(input: {
  userId: string;
  command: ProjectBrainCommand & { action: "REJECT_PROJECT_BRAIN_INTAKE" };
}): Promise<ProjectBrainCommandResult> {
  const { command } = input;
  const commandHash = hashProjectBrainCommand(command);
  return withSerializedTransaction(async (tx) => {
    await lock(tx, `intake:${command.intakeId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: { id: command.intakeId, workspaceId: command.workspaceId, projectId: command.projectId },
      select: { id: true, status: true, stateVersion: true, reviewFingerprint: true },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (intake.status !== "READY_FOR_REVIEW") throw new Error("PROJECT_BRAIN_STATE_REFUSED");
    if (intake.stateVersion !== command.expectedStateVersion) {
      throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    }
    if (!intake.reviewFingerprint || intake.reviewFingerprint !== command.reviewFingerprint) {
      throw new Error("PROJECT_BRAIN_REVIEW_FINGERPRINT_CONFLICT");
    }
    const nextStateVersion = intake.stateVersion + 1;
    const effectId = randomUUID();
    const updated = await tx.constructionProjectBrainIntake.updateMany({
      where: { id: intake.id, stateVersion: intake.stateVersion, status: "READY_FOR_REVIEW" },
      data: { status: "REJECTED", stateVersion: nextStateVersion, rejectedAt: new Date() },
    });
    if (updated.count !== 1) throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
    const result = makeResult({
      commandId: command.commandId,
      action: command.action,
      intakeId: intake.id,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      stateVersion: nextStateVersion,
      status: "REJECTED",
      reviewFingerprint: intake.reviewFingerprint,
      canonicalEffectId: effectId,
    });
    await persistDecision(tx, {
      id: effectId,
      userId: input.userId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      intakeId: intake.id,
      commandId: command.commandId,
      commandHash,
      decision: "REJECT",
      priorStateVersion: intake.stateVersion,
      nextStateVersion,
      result,
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "project_brain_intake",
      entityId: intake.id,
      action: "project_brain_understanding_rejected",
      reasonCode: "OWNER_REJECTED_EXACT_FINGERPRINT",
      metadata: asJson({ projectId: command.projectId, stateVersion: nextStateVersion }),
    });
    return result;
  });
}

export async function processProjectBrainCommand(input: {
  userId: string;
  command: unknown;
}): Promise<ProjectBrainCommandResult> {
  const command = projectBrainCommandSchema.parse(input.command);
  return withLocalCommandSerialization(
    `${command.workspaceId}:${command.commandId}`,
    async () => {
      try {
        switch (command.action) {
          case "CREATE_PROJECT_BRAIN_INTAKE":
            return await createIntake({ userId: input.userId, command });
          case "ADD_OWNER_BRIEF":
            return await addOwnerBrief({ userId: input.userId, command });
          case "SUBMIT_PROJECT_BRAIN_INTAKE":
            return await submitIntake({ userId: input.userId, command });
          case "CONFIRM_PROJECT_BRAIN_INTAKE":
            return await confirmIntake({ userId: input.userId, command });
          case "REJECT_PROJECT_BRAIN_INTAKE":
            return await rejectIntake({ userId: input.userId, command });
        }
      } catch (error) {
        const reasonCode = error instanceof Error ? error.message : "";
        await recordAuthorizedProjectBrainRefusal({
          userId: input.userId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          intakeId: "intakeId" in command ? command.intakeId : undefined,
          commandId: command.commandId,
          commandAction: command.action,
          commandHash: hashProjectBrainCommand(command),
          reasonCode,
        });
        throw error;
      }
    },
  );
}

export const processProjectBrainIntakeCommand = processProjectBrainCommand;

export type ProjectBrainLocalCleanupBatchResult = Readonly<{
  removed: number;
  scanned: number;
  cycleComplete: boolean;
}>;

export async function reconcileProjectBrainLocalObjectBatch(input: {
  now?: Date;
  batchSize?: number;
  scanLimit?: number;
} = {}): Promise<ProjectBrainLocalCleanupBatchResult> {
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? PROJECT_BRAIN_LOCAL_CLEANUP_BATCH_SIZE;
  const scanLimit = input.scanLimit ?? PROJECT_BRAIN_LOCAL_CLEANUP_SCAN_LIMIT;
  if (
    !Number.isSafeInteger(batchSize)
    || batchSize <= 0
    || !Number.isSafeInteger(scanLimit)
    || scanLimit <= 0
    || scanLimit > LOCAL_OBJECT_SCAN_MAX_ENTRIES
    || batchSize > scanLimit
  ) {
    throw new Error("PROJECT_BRAIN_LOCAL_CLEANUP_BATCH_INVALID");
  }
  const cutoff = now.getTime() - LOCAL_CRASH_ORPHAN_GRACE_MS;
  const page = await scanLocalObjects("project-brain-intake", {
    maxScannedEntries: scanLimit,
    maxResults: batchSize,
    modifiedBeforeMs: cutoff,
  });
  const stale = page.entries;
  const durableKeys = stale
    .filter((entry) => !entry.key.endsWith(".tmp"))
    .map((entry) => entry.key);
  let retainedKeys = new Set<string>();
  if (durableKeys.length > 0) {
    const remaining = await prisma.$transaction(async (tx) => {
      await tx.file.deleteMany({
        where: {
          storageKey: { in: durableKeys },
          projectBrainSources: { none: {} },
        },
      });
      return tx.file.findMany({
        where: { storageKey: { in: durableKeys } },
        select: { storageKey: true },
      });
    }, {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    });
    retainedKeys = new Set(remaining.map((file) => file.storageKey));
  }

  const removableKeys = stale
    .map((entry) => entry.key)
    .filter((key) => key.endsWith(".tmp") || !retainedKeys.has(key));
  for (const key of removableKeys) await deleteLocalObject(key);
  return Object.freeze({
    removed: removableKeys.length,
    scanned: page.scannedEntries,
    cycleComplete: page.cycleComplete,
  });
}

export async function reconcileProjectBrainLocalObjects(
  now = new Date(),
): Promise<number> {
  return (await reconcileProjectBrainLocalObjectBatch({ now })).removed;
}

async function maybeReconcileProjectBrainLocalObjects(): Promise<void> {
  const nowMs = Date.now();
  if (automaticLocalCleanupInFlight) {
    await automaticLocalCleanupInFlight;
    return;
  }
  if (nowMs < automaticLocalCleanupNextRunMs) return;
  automaticLocalCleanupNextRunMs = nowMs + LOCAL_CRASH_CLEANUP_INTERVAL_MS;
  const operation = reconcileProjectBrainLocalObjectBatch({
    now: new Date(nowMs),
  }).then(() => undefined);
  automaticLocalCleanupInFlight = operation;
  try {
    await operation;
  } catch (error) {
    automaticLocalCleanupNextRunMs = 0;
    throw error;
  } finally {
    if (automaticLocalCleanupInFlight === operation) automaticLocalCleanupInFlight = null;
  }
}

async function admitProjectBrainSourceInternal(input: {
  userId: string;
  command: unknown;
  bytes: Buffer;
}): Promise<ProjectBrainCommandResult> {
  const command = projectBrainSourceCommandSchema.parse(input.command);
  const fileName = safeFileName(command.fileName);
  if (
    input.bytes.length <= 0 ||
    input.bytes.length !== command.sizeBytes
  ) {
    throw new FileRejectedError("The selected file size is invalid.");
  }
  const extension = extensionFor(command);

  // Reject unauthorized or cross-tenant uploads before performing the more
  // expensive local inspection. State is rechecked under the intake lock once
  // the content-bound command hash is known.
  await withSerializedTransaction(async (tx) => {
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: {
        id: command.intakeId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
      },
      select: { id: true },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
  await maybeReconcileProjectBrainLocalObjects();

  const inspected = await inspectProjectBrainSourceLocally({
    buffer: input.bytes,
    extension,
    declaredDurationMs: command.durationMs,
  });
  const rawContentHash = createHash("sha256").update(input.bytes).digest("hex");
  const commandHash = hashProjectBrainCommand({
    command,
    rawContentHash,
    retainedContentHash: inspected.sha256,
  });

  const beforeStorage = await withSerializedTransaction(async (tx) => {
    await lock(tx, `intake:${command.intakeId}`);
    await requireWriter(tx, input.userId, command.workspaceId);
    await requireProject(tx, command.workspaceId, command.projectId);
    const replayed = await replayDecision(
      tx,
      input.userId,
      command.workspaceId,
      command.commandId,
      commandHash,
    );
    if (replayed) return replayed;
    await requireSourceAdmissionState(tx, command);
    return null;
  });
  if (beforeStorage) return beforeStorage;

  // Each attempt owns a distinct immutable object. A losing concurrent retry
  // can compensate its bytes without deleting the winner's committed object.
  const fileId = randomUUID();
  const storageKey = [
    "project-brain-intake",
    command.workspaceId,
    command.projectId,
    command.intakeId,
    `${fileId}-${inspected.sha256}.${extension}`,
  ].join("/");
  await putLocalObject(storageKey, inspected.buffer);
  try {
    const outcome = await withSerializedTransaction(async (tx) => {
      await lock(tx, `intake:${command.intakeId}`);
      await requireWriter(tx, input.userId, command.workspaceId);
      await requireProject(tx, command.workspaceId, command.projectId);
      const replayed = await replayDecision(
        tx,
        input.userId,
        command.workspaceId,
        command.commandId,
        commandHash,
      );
      if (replayed) return { admitted: false as const, result: replayed };
      const { intake, latest } = await requireSourceAdmissionState(tx, command);
      const sourceId = randomUUID();
      const effectId = randomUUID();
      const nextStateVersion = intake.stateVersion + 1;
      const ordinal = (latest._max.ordinal ?? 0) + 1;
      const identicalSource = await tx.constructionProjectBrainSource.findFirst({
        where: {
          intakeId: intake.id,
          contentHash: inspected.sha256,
          kind: command.kind,
          mimeType: inspected.detectedMime,
          sizeBytes: inspected.buffer.length,
        },
        orderBy: { ordinal: "asc" },
        select: {
          fileId: true,
          file: {
            select: {
              sha256: true,
              detectedMime: true,
              sizeBytes: true,
              storageKey: true,
            },
          },
        },
      });
      if (
        identicalSource
        && (
          identicalSource.file.sha256 !== inspected.sha256
          || identicalSource.file.detectedMime !== inspected.detectedMime
          || identicalSource.file.sizeBytes !== inspected.buffer.length
          || !identicalSource.file.storageKey.startsWith("project-brain-intake/")
        )
      ) {
        throw new Error("PROJECT_BRAIN_SOURCE_STORAGE_CORRUPT");
      }
      if (identicalSource) {
        try {
          // Re-publish to the immutable canonical key before binding another
          // provenance row. This heals a missing object and byte-verifies an
          // existing object; a corrupt object fails closed.
          await putLocalObject(identicalSource.file.storageKey, inspected.buffer);
        } catch {
          throw new Error("PROJECT_BRAIN_SOURCE_STORAGE_CORRUPT");
        }
      }
      const canonicalFileId = identicalSource?.fileId ?? fileId;
      const updated = await tx.constructionProjectBrainIntake.updateMany({
        where: { id: intake.id, stateVersion: intake.stateVersion, status: "DRAFT" },
        data: { stateVersion: nextStateVersion },
      });
      if (updated.count !== 1) throw new Error("PROJECT_BRAIN_STALE_STATE_VERSION");
      if (!identicalSource) {
        await tx.file.create({
          data: {
            id: fileId,
            taskId: null,
            submissionId: null,
            kind: "input",
            uploaderId: input.userId,
            storageKey,
            fileName,
            mime: inspected.detectedMime,
            sizeBytes: inspected.buffer.length,
            scanStatus: "pending",
            detectedMime: inspected.detectedMime,
            sha256: inspected.sha256,
            scanDetails: `LOCAL_SIGNATURE_SANITIZATION; providerExecutionPerformed=false; ${inspected.details}`,
            scannedAt: null,
          },
        });
        await tx.fileAccessLog.create({
          data: { fileId, userId: input.userId, action: "upload" },
        });
      }
      await tx.constructionProjectBrainSource.create({
        data: {
          id: sourceId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          intakeId: intake.id,
          commandId: command.commandId,
          commandHash,
          kind: command.kind,
          fileId: canonicalFileId,
          contentHash: inspected.sha256,
          displayName: fileName,
          mimeType: inspected.detectedMime,
          sizeBytes: inspected.buffer.length,
          durationMs: inspected.actualVoiceDurationMs,
          ordinal,
          createdByUserId: input.userId,
        },
      });
      const result = makeResult({
        commandId: command.commandId,
        action: command.action,
        intakeId: intake.id,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        stateVersion: nextStateVersion,
        status: "DRAFT",
        reviewFingerprint: null,
        canonicalEffectId: effectId,
      });
      await persistDecision(tx, {
        id: effectId,
        userId: input.userId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeId: intake.id,
        commandId: command.commandId,
        commandHash,
        decision: "ADMIT_SOURCE",
        priorStateVersion: intake.stateVersion,
        nextStateVersion,
        result,
      });
      await appendConstructionAudit(tx, {
        workspaceId: command.workspaceId,
        actorUserId: input.userId,
        entityType: "project_brain_source",
        entityId: sourceId,
        action: "project_brain_source_admitted_locally",
        reasonCode: "LOCAL_SIGNATURE_SANITIZATION_ONLY",
        metadata: asJson({
          intakeId: intake.id,
          projectId: command.projectId,
          ordinal,
          contentHash: inspected.sha256,
          canonicalFileReused: Boolean(identicalSource),
          providerExecutionPerformed: false,
        }),
      });
      return {
        admitted: true as const,
        retainedAttemptObject: !identicalSource,
        result,
      };
    });
    if (!outcome.admitted || !outcome.retainedAttemptObject) {
      await deleteLocalObject(storageKey);
    }
    return outcome.result;
  } catch (error) {
    // A driver error can make commit outcome uncertain. Inspect both the
    // receipt and this attempt's exact File reference under the same lock before
    // deciding whether deleting the object is safe.
    let recovery: {
      replayed: ProjectBrainCommandResult | null;
      filePersisted: boolean;
    };
    try {
      recovery = await withSerializedTransaction(async (tx) => {
        await lock(tx, `intake:${command.intakeId}`);
        await requireWriter(tx, input.userId, command.workspaceId);
        await requireProject(tx, command.workspaceId, command.projectId);
        const scopedIntake = await tx.constructionProjectBrainIntake.findFirst({
          where: {
            id: command.intakeId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
          },
          select: { id: true },
        });
        if (!scopedIntake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
        const persistedFile = await tx.file.findFirst({
          where: { id: fileId, storageKey },
          select: { id: true },
        });
        try {
          const replayed = await replayDecision(
            tx,
            input.userId,
            command.workspaceId,
            command.commandId,
            commandHash,
          );
          return { replayed, filePersisted: persistedFile !== null };
        } catch {
          return { replayed: null, filePersisted: persistedFile !== null };
        }
      });
    } catch {
      // Recovery unavailable: preserve possibly committed bytes rather than
      // risk breaking a durable File reference.
      throw error;
    }
    if (!recovery.filePersisted) await deleteLocalObject(storageKey);
    if (recovery.replayed) return recovery.replayed;
    throw error;
  }
}

export async function admitProjectBrainSource(input: {
  userId: string;
  command: unknown;
  bytes: Buffer;
}): Promise<ProjectBrainCommandResult> {
  const parsed = projectBrainSourceCommandSchema.safeParse(input.command);
  const operation = async () => {
    try {
      return await admitProjectBrainSourceInternal(input);
    } catch (error) {
      if (parsed.success) {
        const reasonCode = error instanceof FileRejectedError
          ? "PROJECT_BRAIN_MEDIA_REFUSED"
          : error instanceof Error
            ? error.message
            : "";
        await recordAuthorizedProjectBrainRefusal({
          userId: input.userId,
          workspaceId: parsed.data.workspaceId,
          projectId: parsed.data.projectId,
          intakeId: parsed.data.intakeId,
          commandId: parsed.data.commandId,
          commandAction: parsed.data.action,
          commandHash: hashProjectBrainCommand({
            command: parsed.data,
            contentHash: createHash("sha256").update(input.bytes).digest("hex"),
          }),
          reasonCode,
        });
      }
      throw error;
    }
  };
  return parsed.success
    ? withLocalCommandSerialization(
        `${parsed.data.workspaceId}:${parsed.data.commandId}`,
        operation,
      )
    : operation();
}

export async function projectBrainIntakeForUser(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
}) {
  const projection = await prisma.$transaction(async (tx) => {
    await requireWriter(tx, input.userId, input.workspaceId);
    await requireProject(tx, input.workspaceId, input.projectId);
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ intakeSequence: "desc" }, { createdAt: "desc" }],
      include: {
        sources: { orderBy: [{ ordinal: "asc" }, { id: "asc" }] },
        snapshots: { orderBy: [{ stateVersion: "asc" }, { createdAt: "asc" }] },
        decisions: { orderBy: [{ nextStateVersion: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (intake) {
      for (const snapshot of intake.snapshots) {
        const parsed = canonicalProjectBrainSnapshotSchema.safeParse(snapshot.snapshot);
        if (
          !parsed.success
          || snapshot.workspaceId !== intake.workspaceId
          || snapshot.projectId !== intake.projectId
          || snapshot.intakeId !== intake.id
          || parsed.data.project.id !== intake.projectId
          || hashProjectBrainCommand(parsed.data) !== snapshot.canonicalHash
        ) {
          throw new Error("PROJECT_BRAIN_HISTORY_CORRUPT");
        }
      }

      let priorStateVersion = 0;
      for (const decision of intake.decisions) {
        const result = projectBrainCommandResultSchema.safeParse(decision.result);
        const expectedAction = DECISION_ACTIONS[
          decision.decision as keyof typeof DECISION_ACTIONS
        ];
        if (
          !result.success
          || !expectedAction
          || decision.workspaceId !== intake.workspaceId
          || decision.projectId !== intake.projectId
          || decision.intakeId !== intake.id
          || decision.priorStateVersion !== priorStateVersion
          || decision.nextStateVersion !== priorStateVersion + 1
          || result.data.replayed
          || result.data.action !== expectedAction
          || result.data.commandId !== decision.commandId
          || result.data.workspaceId !== intake.workspaceId
          || result.data.projectId !== intake.projectId
          || result.data.intakeId !== intake.id
          || result.data.stateVersion !== decision.nextStateVersion
          || result.data.canonicalEffectId !== decision.id
          || hashProjectBrainCommand(result.data) !== decision.resultHash
        ) {
          throw new Error("PROJECT_BRAIN_HISTORY_CORRUPT");
        }
        if (decision.snapshotHash !== null) {
          const matchingSnapshot = intake.snapshots.find((snapshot) => (
            snapshot.stateVersion === decision.nextStateVersion
            && snapshot.canonicalHash === decision.snapshotHash
          ));
          if (!matchingSnapshot || result.data.reviewFingerprint !== decision.snapshotHash) {
            throw new Error("PROJECT_BRAIN_HISTORY_CORRUPT");
          }
        }
        priorStateVersion = decision.nextStateVersion;
      }
      if (priorStateVersion !== intake.stateVersion) {
        throw new Error("PROJECT_BRAIN_HISTORY_CORRUPT");
      }
    }
    return {
      schemaVersion: 1 as const,
      intake: intake ? {
        id: intake.id,
        workspaceId: intake.workspaceId,
        projectId: intake.projectId,
        intakeSequence: intake.intakeSequence,
        status: intake.status,
        stateVersion: intake.stateVersion,
        ownerBrief: ownerBriefFromRow(intake),
        reviewFingerprint: intake.reviewFingerprint,
        sources: intake.sources.map((source) => ({
          id: source.id,
          ordinal: source.ordinal,
          kind: source.kind,
          fileId: source.fileId,
          contentHash: source.contentHash,
          displayName: source.displayName,
          mimeType: source.mimeType,
          sizeBytes: source.sizeBytes,
          durationMs: source.durationMs,
          transcriptionState: source.transcriptionState,
          documentUnderstandingState: source.documentUnderstandingState,
          createdAt: source.createdAt.toISOString(),
        })),
        snapshots: intake.snapshots.map((snapshot) => ({
          id: snapshot.id,
          stateVersion: snapshot.stateVersion,
          status: snapshot.status,
          canonicalHash: snapshot.canonicalHash,
          snapshot: snapshot.snapshot,
          createdAt: snapshot.createdAt.toISOString(),
        })),
        decisions: intake.decisions.map((decision) => ({
          id: decision.id,
          decision: decision.decision,
          priorStateVersion: decision.priorStateVersion,
          nextStateVersion: decision.nextStateVersion,
          snapshotHash: decision.snapshotHash,
          createdAt: decision.createdAt.toISOString(),
        })),
        createdAt: intake.createdAt.toISOString(),
        updatedAt: intake.updatedAt.toISOString(),
      } : null,
      limitations: intake?.sources.length ? [
        ...(intake.sources.some((source) => source.kind === "VOICE_NOTE")
          ? (["VOICE_NOT_TRANSCRIBED"] as const)
          : []),
        ...(intake.sources.some((source) => source.kind !== "VOICE_NOTE")
          ? (["DOCUMENT_CONTENT_NOT_INTERPRETED"] as const)
          : []),
      ] : [],
      providerExecutionPerformed: false as const,
      externalTransportPerformed: false as const,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return projectBrainIntakeProjectionSchema.parse(projection);
}

export async function projectBrainSourceBytesForUser(input: {
  userId: string;
  sourceId: string;
}) {
  const source = await prisma.$transaction(async (tx) => {
    const located = await tx.constructionProjectBrainSource.findUnique({
      where: { id: input.sourceId },
      select: { workspaceId: true, projectId: true },
    });
    if (!located) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await requireWriter(tx, input.userId, located.workspaceId);
    await requireProject(tx, located.workspaceId, located.projectId);
    const authorized = await tx.constructionProjectBrainSource.findFirst({
      where: {
        id: input.sourceId,
        workspaceId: located.workspaceId,
        projectId: located.projectId,
      },
      include: {
        file: {
          select: {
            id: true,
            storageKey: true,
            fileName: true,
            detectedMime: true,
            sha256: true,
            sizeBytes: true,
            scanDetails: true,
          },
        },
      },
    });
    if (!authorized) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    return authorized;
  });

  const bytes = await readLocalObject(source.file.storageKey);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.length !== source.sizeBytes
    || bytes.length !== source.file.sizeBytes
    || contentHash !== source.contentHash
    || contentHash !== source.file.sha256
    || source.mimeType !== source.file.detectedMime
    || !source.file.scanDetails?.startsWith("LOCAL_SIGNATURE_SANITIZATION;")
  ) {
    throw new Error("PROJECT_BRAIN_SOURCE_BYTES_CORRUPT");
  }

  await prisma.$transaction(async (tx) => {
    await requireWriter(tx, input.userId, source.workspaceId);
    await requireProject(tx, source.workspaceId, source.projectId);
    const stillAuthorized = await tx.constructionProjectBrainSource.findFirst({
      where: {
        id: source.id,
        workspaceId: source.workspaceId,
        projectId: source.projectId,
        fileId: source.file.id,
      },
      select: { id: true },
    });
    if (!stillAuthorized) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await tx.fileAccessLog.create({
      data: { fileId: source.file.id, userId: input.userId, action: "download" },
    });
  });

  return {
    bytes,
    fileName: source.displayName,
    mimeType: source.mimeType,
    contentHash,
  };
}

export const projectBrainIntakeProjectionForUser = projectBrainIntakeForUser;
