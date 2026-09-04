import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  buildProjectBrainUnderstandingSnapshot,
  canonicalProjectBrainUnderstandingSnapshotSchema,
  deriveContradictionOutcomes,
  projectBrainUnderstandingCommandResultSchema,
  projectBrainUnderstandingCommandSchema,
  projectBrainUnderstandingFalseEffects,
  projectBrainUnderstandingProjectionSchema,
  type ProjectBrainUnderstandingCommand,
  type ProjectBrainUnderstandingCommandResult,
  type ProjectBrainUnderstandingProjection,
  type ProjectBrainResolution,
} from "@/lib/construction-operating-assistant-r36x/project-brain-understanding-review";
import {
  buildProjectBrainFactCandidates,
  hashProjectBrainFactCandidateSet,
  projectBrainFactCandidateProjectionSchema,
} from "@/lib/construction-operating-assistant-r36w/project-brain-fact-candidates";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const ALLOWED_REVIEWER_ROLES = new Set(["owner", "admin"]);
const TRANSACTION = { maxWait: 15_000, timeout: 60_000 } as const;
const localTails = new Map<string, Promise<void>>();
type Tx = PrismaTypes.TransactionClient;

const asJson = (value: unknown): PrismaTypes.InputJsonValue => JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;

async function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = localTails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = prior.then(() => gate);
  localTails.set(key, tail);
  await prior;
  try { return await operation(); } finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r36x:${key}`}, 0))::text AS acquired`);
}

async function requireReviewer(tx: Tx, userId: string, workspaceId: string): Promise<void> {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (!ALLOWED_REVIEWER_ROLES.has(membership.role)) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
}

async function requireProject(tx: Tx, workspaceId: string, projectId: string) {
  const project = await tx.constructionProject.findFirst({
    where: { id: projectId, workspaceId, status: "active" },
    select: { id: true, code: true, name: true },
  });
  if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  return project;
}

function provenance(candidate: {
  kind: string; ownerBriefField: string | null; rangeUnit: string | null; rangeStart: number | null; rangeEnd: number | null;
  sourceId: string | null; sourceOrdinal: number | null; sourceContentHash: string | null; metadataField: string | null;
}) {
  if (candidate.kind === "OWNER_TEXT") return {
    kind: "OWNER_TEXT" as const,
    ownerBriefField: candidate.ownerBriefField as "summary" | "scope" | "importantPeople" | "importantDates" | "blockers" | "nextDecision",
    rangeUnit: "UTF16_CODE_UNIT" as const,
    rangeStart: candidate.rangeStart ?? 0,
    rangeEnd: candidate.rangeEnd ?? 1,
  };
  return {
    kind: "SOURCE_METADATA" as const,
    sourceId: candidate.sourceId ?? "",
    sourceOrdinal: candidate.sourceOrdinal ?? 1,
    sourceContentHash: candidate.sourceContentHash ?? "",
    metadataField: candidate.metadataField as "kind" | "displayName" | "mimeType" | "sizeBytes" | "durationMs" | "ordinal" | "contentHash",
  };
}

function resolutionValue(row: { mode: string; selectedCandidateIds: string[]; ownerResolutionText: string | null }): ProjectBrainResolution {
  if (row.mode === "SELECT_SUPPORTED_CANDIDATES") return { mode: row.mode, selectedCandidateIds: row.selectedCandidateIds };
  if (row.mode === "OWNER_RESOLUTION") return { mode: row.mode, ownerResolutionText: row.ownerResolutionText ?? "" };
  return { mode: "REJECT_ALL_UNSUPPORTED" };
}

async function loadReview(tx: Tx, input: { workspaceId: string; projectId: string; reviewId?: string }) {
  const where = input.reviewId
    ? { id: input.reviewId, workspaceId: input.workspaceId, projectId: input.projectId }
    : { workspaceId: input.workspaceId, projectId: input.projectId };
  return tx.constructionProjectBrainUnderstandingReview.findFirst({
    where,
    orderBy: input.reviewId ? undefined : [{ reviewSequence: "desc" }, { id: "asc" }],
    include: {
      candidateBatch: { include: { candidates: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
      intake: { include: { sources: { orderBy: [{ ordinal: "asc" }, { id: "asc" }] } } },
      dispositions: { orderBy: [{ nextStateVersion: "asc" }, { id: "asc" }] },
      contradictions: {
        orderBy: [{ groupSequence: "asc" }, { id: "asc" }],
        include: {
          members: { orderBy: [{ ordinal: "asc" }, { id: "asc" }] },
          resolutions: { orderBy: [{ nextStateVersion: "asc" }, { id: "asc" }] },
        },
      },
      snapshots: { orderBy: [{ stateVersion: "desc" }, { id: "asc" }] },
    },
  });
}

function assertReviewBinding(review: NonNullable<Awaited<ReturnType<typeof loadReview>>>) {
  const batch = review.candidateBatch;
  if (
    batch.workspaceId !== review.workspaceId || batch.projectId !== review.projectId || batch.intakeId !== review.intakeId ||
    batch.confirmedSnapshotId !== review.confirmedIntakeSnapshotId || batch.candidateSetHash !== review.candidateSetHash ||
    batch.candidateCount !== batch.candidates.length || batch.status !== "COMPLETED_LOCAL" || review.intake.status !== "CONFIRMED"
  ) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  const expectedCandidates = buildProjectBrainFactCandidates({
    workspaceId: review.workspaceId,
    projectId: review.projectId,
    intakeId: review.intakeId,
    confirmedSnapshotId: batch.confirmedSnapshotId,
    confirmedSnapshotHash: batch.confirmedSnapshotHash,
    ownerBrief: {
      summary: review.intake.summary ?? "",
      scope: review.intake.scope ?? "",
      importantPeople: review.intake.importantPeople ?? "",
      importantDates: review.intake.importantDates ?? "",
      blockers: review.intake.blockers ?? "",
      nextDecision: review.intake.nextDecision ?? "",
    },
    sources: review.intake.sources.map((source) => ({
      id: source.id,
      ordinal: source.ordinal,
      kind: source.kind as "PHOTO" | "DOCUMENT" | "VOICE_NOTE",
      displayName: source.displayName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      durationMs: source.durationMs,
      contentHash: source.contentHash,
    })),
  });
  if (
    hashProjectBrainFactCandidateSet(expectedCandidates) !== batch.candidateSetHash ||
    expectedCandidates.length !== batch.candidates.length
  ) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  const expectedByFingerprint = new Map(expectedCandidates.map((candidate) => [candidate.candidateFingerprint, candidate]));
  for (const candidate of batch.candidates) {
    const parsed = projectBrainFactCandidateProjectionSchema.safeParse({
      id: candidate.id,
      candidateFingerprint: candidate.candidateFingerprint,
      workspaceId: candidate.workspaceId,
      projectId: candidate.projectId,
      intakeId: candidate.intakeId,
      confirmedSnapshotId: candidate.confirmedSnapshotId,
      confirmedSnapshotHash: candidate.confirmedSnapshotHash,
      adapter: candidate.adapter,
      kind: candidate.kind,
      status: candidate.status,
      confidenceClass: candidate.confidenceClass,
      value: candidate.value,
      ownerBriefField: candidate.ownerBriefField,
      rangeUnit: candidate.rangeUnit,
      rangeStart: candidate.rangeStart,
      rangeEnd: candidate.rangeEnd,
      sourceId: candidate.sourceId,
      sourceOrdinal: candidate.sourceOrdinal,
      sourceContentHash: candidate.sourceContentHash,
      metadataField: candidate.metadataField,
    });
    const expected = expectedByFingerprint.get(candidate.candidateFingerprint);
    if (!parsed.success || !expected) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
    const actualWithoutId = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => key !== "id"));
    const expectedWithoutId = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "id"));
    if (sha256Canonical(actualWithoutId) !== sha256Canonical(expectedWithoutId)) {
      throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
    }
  }
  const candidateIds = new Set(batch.candidates.map((item) => item.id));
  if (review.dispositions.some((item) => !candidateIds.has(item.candidateId))) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  for (const contradiction of review.contradictions) {
    if (contradiction.members.length < 2 || contradiction.members.some((item) => !candidateIds.has(item.candidateId))) {
      throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
    }
  }
}

async function projection(tx: Tx, input: { workspaceId: string; projectId: string; reviewId?: string }): Promise<ProjectBrainUnderstandingProjection> {
  const review = await loadReview(tx, input);
  if (!review) return projectBrainUnderstandingProjectionSchema.parse({ schemaVersion: 1, review: null, falseEffects: projectBrainUnderstandingFalseEffects() });
  assertReviewBinding(review);
  for (const snapshot of review.snapshots) {
    const parsed = canonicalProjectBrainUnderstandingSnapshotSchema.safeParse(snapshot.snapshot);
    if (
      !parsed.success || sha256Canonical(parsed.data) !== snapshot.canonicalHash ||
      parsed.data.project.id !== review.projectId || parsed.data.inputs.intakeId !== review.intakeId ||
      parsed.data.inputs.candidateBatchId !== review.candidateBatchId ||
      parsed.data.inputs.candidateSetHash !== review.candidateSetHash ||
      snapshot.workspaceId !== review.workspaceId || snapshot.projectId !== review.projectId ||
      snapshot.intakeId !== review.intakeId || snapshot.candidateBatchId !== review.candidateBatchId
    ) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  }
  const dispositionsByCandidate = new Map<string, typeof review.dispositions>();
  for (const item of review.dispositions) dispositionsByCandidate.set(item.candidateId, [...(dispositionsByCandidate.get(item.candidateId) ?? []), item]);
  const proposed = review.snapshots.find((item) => item.status === "PROPOSED") ?? null;
  const confirmed = review.snapshots.find((item) => item.status === "CONFIRMED") ?? null;
  if (review.snapshots.filter((item) => item.status === "CONFIRMED").length > 1) {
    throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  }
  if (
    (review.status === "READY_FOR_CONFIRMATION" && (!proposed || proposed.canonicalHash !== review.reviewFingerprint)) ||
    (review.status === "CONFIRMED" && (!confirmed || confirmed.canonicalHash !== review.reviewFingerprint || !review.confirmedUnderstandingSequence))
  ) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  if (review.status !== "DRAFT") {
    const canonical = await canonicalForReview(tx, review.id);
    if (canonical.canonicalHash !== review.reviewFingerprint) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
  }
  return projectBrainUnderstandingProjectionSchema.parse({
    schemaVersion: 1,
    review: {
      id: review.id, workspaceId: review.workspaceId, projectId: review.projectId, intakeId: review.intakeId,
      candidateBatchId: review.candidateBatchId, stateVersion: review.stateVersion, status: review.status,
      reviewFingerprint: review.reviewFingerprint,
      confirmedUnderstandingSequence: review.confirmedUnderstandingSequence,
      sources: review.intake.sources.map((source) => ({
        id: source.id, ordinal: source.ordinal, kind: source.kind, displayName: source.displayName, mimeType: source.mimeType,
        sizeBytes: source.sizeBytes, durationMs: source.durationMs, contentHash: source.contentHash,
        transcriptionState: source.transcriptionState, documentUnderstandingState: source.documentUnderstandingState,
      })),
      candidates: review.candidateBatch.candidates.map((candidate) => ({
        id: candidate.id, value: candidate.value, status: candidate.status, confidenceClass: candidate.confidenceClass,
        provenance: provenance(candidate),
        dispositions: (dispositionsByCandidate.get(candidate.id) ?? []).map((item) => ({
          id: item.id, candidateId: item.candidateId, disposition: item.disposition,
          priorStateVersion: item.priorStateVersion, nextStateVersion: item.nextStateVersion, createdAt: item.createdAt.toISOString(),
        })),
      })),
      contradictions: review.contradictions.map((item) => ({
        id: item.id,
        memberCandidateIds: item.members.map((member) => member.candidateId),
        resolutions: item.resolutions.map((resolution) => ({
          id: resolution.id, contradictionId: resolution.contradictionId, resolution: resolutionValue(resolution),
          provenance: resolution.provenance, priorStateVersion: resolution.priorStateVersion,
          nextStateVersion: resolution.nextStateVersion, createdAt: resolution.createdAt.toISOString(),
        })),
      })),
      proposedSnapshotHash: proposed?.canonicalHash ?? null,
      confirmedSnapshotHash: confirmed?.canonicalHash ?? null,
      limitations: ["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED", "CANDIDATES_REQUIRE_EXPLICIT_REVIEW"],
    },
    falseEffects: projectBrainUnderstandingFalseEffects(),
  });
}

function latestByKey<T>(items: T[], key: (item: T) => string, version: (item: T) => number): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const current = result.get(key(item));
    if (!current || version(item) > version(current)) result.set(key(item), item);
  }
  return result;
}

async function canonicalForReview(tx: Tx, reviewId: string) {
  const exact = await tx.constructionProjectBrainUnderstandingReview.findUnique({
    where: { id: reviewId },
    include: {
      project: { select: { id: true, code: true, name: true } },
      candidateBatch: { include: { candidates: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
      intake: { include: { sources: { orderBy: [{ ordinal: "asc" }, { id: "asc" }] } } },
      confirmedIntakeSnapshot: true,
      dispositions: true,
      contradictions: { include: { members: { orderBy: { ordinal: "asc" } }, resolutions: true } },
      snapshots: true,
    },
  });
  if (!exact) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  assertReviewBinding(exact);
  const dispositions = latestByKey(exact.dispositions, (item) => item.candidateId, (item) => item.nextStateVersion);
  if (dispositions.size !== exact.candidateBatch.candidates.length) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE");
  const derived = new Map<string, string>();
  const ownerResolutions: Array<{ contradictionId: string; text: string; provenance: "OWNER_RESOLUTION" }> = [];
  const contradictions = exact.contradictions.map((item) => {
    const current = [...item.resolutions].sort((a, b) => b.nextStateVersion - a.nextStateVersion || a.id.localeCompare(b.id))[0];
    if (!current) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE");
    const resolved = resolutionValue(current);
    const outcomes = deriveContradictionOutcomes({ memberCandidateIds: item.members.map((member) => member.candidateId), resolution: resolved });
    for (const [candidateId, outcome] of Object.entries(outcomes)) {
      const prior = derived.get(candidateId);
      if (prior && prior !== outcome) throw new Error("CONFLICTING_RESOLUTIONS");
      derived.set(candidateId, outcome);
    }
    if (resolved.mode === "OWNER_RESOLUTION") ownerResolutions.push({ contradictionId: item.id, text: resolved.ownerResolutionText, provenance: "OWNER_RESOLUTION" });
    return { contradictionId: item.id, memberCandidateIds: item.members.map((member) => member.candidateId), resolution: resolved };
  });
  for (const candidate of exact.candidateBatch.candidates) {
    const decision = dispositions.get(candidate.id);
    if (!decision || decision.disposition === "RETAIN_FOR_CONTRADICTION") throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE");
    const expected = derived.get(candidate.id);
    if (expected && expected !== decision.disposition) throw new Error("CONFLICTING_RESOLUTIONS");
  }
  return buildProjectBrainUnderstandingSnapshot({
    project: { id: exact.project.id, code: exact.project.code, name: exact.project.name },
    inputs: {
      intakeId: exact.intakeId,
      confirmedIntakeSnapshotHash: exact.confirmedIntakeSnapshot.canonicalHash,
      candidateBatchId: exact.candidateBatchId,
      candidateSetHash: exact.candidateSetHash,
    },
    sources: exact.intake.sources.map((source) => ({
      id: source.id, ordinal: source.ordinal, kind: source.kind as "PHOTO" | "DOCUMENT" | "VOICE_NOTE",
      displayName: source.displayName, mimeType: source.mimeType, sizeBytes: source.sizeBytes, durationMs: source.durationMs,
      contentHash: source.contentHash, transcriptionState: "NOT_REQUESTED_LOCAL_ONLY", documentUnderstandingState: "NOT_REQUESTED_LOCAL_ONLY",
    })),
    candidates: exact.candidateBatch.candidates.map((candidate) => ({
      candidateId: candidate.id, value: candidate.value, status: "CANDIDATE_UNCONFIRMED",
      provenance: provenance(candidate),
      disposition: dispositions.get(candidate.id)!.disposition as "ACCEPT_AS_REVIEWED" | "REJECT_AS_UNSUPPORTED",
    })),
    contradictions,
    ownerResolutions,
    limitations: ["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED", "CANDIDATES_REQUIRE_EXPLICIT_REVIEW"],
  });
}

const decisionName = (action: ProjectBrainUnderstandingCommand["action"]) => ({
  CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW: "CREATE_REVIEW",
  DISPOSITION_PROJECT_BRAIN_CANDIDATE: "DISPOSITION_CANDIDATE",
  DECLARE_PROJECT_BRAIN_CONTRADICTION: "DECLARE_CONTRADICTION",
  RESOLVE_PROJECT_BRAIN_CONTRADICTION: "RESOLVE_CONTRADICTION",
  PREPARE_PROJECT_BRAIN_UNDERSTANDING: "PREPARE_UNDERSTANDING",
  CONFIRM_PROJECT_BRAIN_UNDERSTANDING: "CONFIRM_EXACT_UNDERSTANDING",
} as const)[action];

function result(input: {
  command: ProjectBrainUnderstandingCommand; reviewId: string; stateVersion: number; status: string;
  reviewFingerprint: string | null; canonicalEffectId: string; replayed?: boolean;
}): ProjectBrainUnderstandingCommandResult {
  return projectBrainUnderstandingCommandResultSchema.parse({
    schemaVersion: 1, commandId: input.command.commandId, action: input.command.action,
    workspaceId: input.command.workspaceId, projectId: input.command.projectId,
    reviewId: input.reviewId, stateVersion: input.stateVersion, status: input.status,
    reviewFingerprint: input.reviewFingerprint, canonicalEffectId: input.canonicalEffectId,
    replayed: input.replayed ?? false, falseEffects: projectBrainUnderstandingFalseEffects(),
  });
}

export async function applyProjectBrainUnderstandingCommandForUser(input: {
  userId: string; command: ProjectBrainUnderstandingCommand;
}): Promise<ProjectBrainUnderstandingCommandResult> {
  const command = projectBrainUnderstandingCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return serialize(`${command.workspaceId}:${command.commandId}`, () => prisma.$transaction(async (tx) => {
    await lock(tx, `command:${command.workspaceId}:${command.commandId}`);
    await requireReviewer(tx, input.userId, command.workspaceId);
    const prior = await tx.constructionProjectBrainUnderstandingDecision.findUnique({
      where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
    });
    if (prior) {
      if (prior.commandHash !== commandHash) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
      const parsed = projectBrainUnderstandingCommandResultSchema.safeParse(prior.result);
      if (!parsed.success || sha256Canonical(parsed.data) !== prior.resultHash) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CORRUPT");
      return projectBrainUnderstandingCommandResultSchema.parse({ ...parsed.data, replayed: true });
    }
    await requireProject(tx, command.workspaceId, command.projectId);

    if (command.action === "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW") {
      await lock(tx, `project:${command.workspaceId}:${command.projectId}:create`);
      const batches = await tx.constructionProjectBrainFactCandidateBatch.findMany({
        where: { workspaceId: command.workspaceId, projectId: command.projectId, status: "COMPLETED_LOCAL" },
        include: { intake: { select: { intakeSequence: true, status: true } }, candidates: { select: { id: true } } },
      });
      batches.sort((a, b) => b.intake.intakeSequence - a.intake.intakeSequence || a.id.localeCompare(b.id));
      const batch = batches[0];
      if (!batch || batch.intake.status !== "CONFIRMED" || batch.candidateCount !== batch.candidates.length) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE");
      const existing = await tx.constructionProjectBrainUnderstandingReview.findUnique({ where: { candidateBatchId: batch.id } });
      if (existing) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
      const aggregate = await tx.constructionProjectBrainUnderstandingReview.aggregate({
        where: { workspaceId: command.workspaceId, projectId: command.projectId }, _max: { reviewSequence: true },
      });
      const reviewId = randomUUID();
      await tx.constructionProjectBrainUnderstandingReview.create({ data: {
        id: reviewId, workspaceId: command.workspaceId, projectId: command.projectId, intakeId: batch.intakeId,
        confirmedIntakeSnapshotId: batch.confirmedSnapshotId, candidateBatchId: batch.id, candidateSetHash: batch.candidateSetHash,
        reviewSequence: (aggregate._max.reviewSequence ?? 0) + 1, status: "DRAFT", stateVersion: 1,
        createCommandId: command.commandId, createCommandHash: commandHash, createdByUserId: input.userId,
      } });
      const accepted = result({ command, reviewId, stateVersion: 1, status: "DRAFT", reviewFingerprint: null, canonicalEffectId: reviewId });
      await tx.constructionProjectBrainUnderstandingDecision.create({ data: {
        id: randomUUID(), workspaceId: command.workspaceId, projectId: command.projectId, reviewId,
        commandId: command.commandId, commandHash, decision: decisionName(command.action), priorStateVersion: 0, nextStateVersion: 1,
        result: asJson(accepted), resultHash: sha256Canonical(accepted), actorUserId: input.userId,
      } });
      return accepted;
    }

    await lock(tx, `review:${command.reviewId}`);
    const review = await tx.constructionProjectBrainUnderstandingReview.findFirst({
      where: { id: command.reviewId, workspaceId: command.workspaceId, projectId: command.projectId },
      include: { candidateBatch: { include: { candidates: { select: { id: true } } } } },
    });
    if (!review) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    if (review.status === "CONFIRMED" || review.stateVersion !== command.expectedStateVersion) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
    const next = review.stateVersion + 1;
    const effectId = randomUUID();
    let nextStatus = "DRAFT";
    let fingerprint: string | null = null;
    let snapshotHash: string | null = null;

    if (command.action === "DISPOSITION_PROJECT_BRAIN_CANDIDATE") {
      if (!review.candidateBatch.candidates.some((item) => item.id === command.candidateId)) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      await tx.constructionProjectBrainCandidateDisposition.create({ data: {
        id: effectId, workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        candidateId: command.candidateId, disposition: command.disposition, priorStateVersion: review.stateVersion,
        nextStateVersion: next, commandId: command.commandId, commandHash, actorUserId: input.userId,
      } });
    } else if (command.action === "DECLARE_PROJECT_BRAIN_CONTRADICTION") {
      const eligible = new Set(review.candidateBatch.candidates.map((item) => item.id));
      if (command.candidateIds.some((id) => !eligible.has(id))) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      const aggregate = await tx.constructionProjectBrainContradiction.aggregate({ where: { reviewId: review.id }, _max: { groupSequence: true } });
      await tx.constructionProjectBrainContradiction.create({ data: {
        id: effectId, workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        groupSequence: (aggregate._max.groupSequence ?? 0) + 1, commandId: command.commandId, commandHash, actorUserId: input.userId,
      } });
      await tx.constructionProjectBrainContradictionMember.createMany({ data: [...command.candidateIds].sort().map((candidateId, index) => ({
        id: randomUUID(), workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        contradictionId: effectId, candidateId, ordinal: index + 1,
      })) });
    } else if (command.action === "RESOLVE_PROJECT_BRAIN_CONTRADICTION") {
      const contradiction = await tx.constructionProjectBrainContradiction.findFirst({
        where: { id: command.contradictionId, reviewId: review.id }, include: { members: true },
      });
      if (!contradiction) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      const members = contradiction.members.map((item) => item.candidateId);
      deriveContradictionOutcomes({ memberCandidateIds: members, resolution: command.resolution });
      await tx.constructionProjectBrainContradictionResolution.create({ data: {
        id: effectId, workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        contradictionId: contradiction.id, mode: command.resolution.mode,
        selectedCandidateIds: command.resolution.mode === "SELECT_SUPPORTED_CANDIDATES" ? command.resolution.selectedCandidateIds : [],
        ownerResolutionText: command.resolution.mode === "OWNER_RESOLUTION" ? command.resolution.ownerResolutionText : null,
        provenance: command.resolution.mode === "OWNER_RESOLUTION" ? "OWNER_RESOLUTION" : "OWNER_DECISION",
        priorStateVersion: review.stateVersion, nextStateVersion: next, commandId: command.commandId, commandHash, actorUserId: input.userId,
      } });
    } else if (command.action === "PREPARE_PROJECT_BRAIN_UNDERSTANDING") {
      const canonical = await canonicalForReview(tx, review.id);
      fingerprint = canonical.canonicalHash;
      snapshotHash = fingerprint;
      nextStatus = "READY_FOR_CONFIRMATION";
      await tx.constructionProjectBrainUnderstandingSnapshot.create({ data: {
        id: effectId, workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        intakeId: review.intakeId, confirmedIntakeSnapshotId: review.confirmedIntakeSnapshotId,
        candidateBatchId: review.candidateBatchId, stateVersion: next, status: "PROPOSED",
        snapshot: asJson(canonical.snapshot), canonicalHash: fingerprint, createdByUserId: input.userId,
      } });
    } else {
      if (review.status !== "READY_FOR_CONFIRMATION" || review.reviewFingerprint !== command.reviewFingerprint) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
      await lock(tx, `project:${command.workspaceId}:${command.projectId}:confirm`);
      const canonical = await canonicalForReview(tx, review.id);
      if (canonical.canonicalHash !== command.reviewFingerprint) throw new Error("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
      const aggregate = await tx.constructionProjectBrainUnderstandingReview.aggregate({
        where: { workspaceId: command.workspaceId, projectId: command.projectId, status: "CONFIRMED" },
        _max: { confirmedUnderstandingSequence: true },
      });
      fingerprint = canonical.canonicalHash;
      snapshotHash = fingerprint;
      nextStatus = "CONFIRMED";
      await tx.constructionProjectBrainUnderstandingSnapshot.create({ data: {
        id: effectId, workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
        intakeId: review.intakeId, confirmedIntakeSnapshotId: review.confirmedIntakeSnapshotId,
        candidateBatchId: review.candidateBatchId, stateVersion: next, status: "CONFIRMED",
        snapshot: asJson(canonical.snapshot), canonicalHash: fingerprint, createdByUserId: input.userId,
      } });
      await tx.constructionProjectBrainUnderstandingReview.update({ where: { id: review.id }, data: {
        status: nextStatus, stateVersion: next, reviewFingerprint: fingerprint,
        confirmedUnderstandingSequence: (aggregate._max.confirmedUnderstandingSequence ?? 0) + 1, confirmedAt: new Date(),
      } });
    }

    if (command.action !== "CONFIRM_PROJECT_BRAIN_UNDERSTANDING") {
      await tx.constructionProjectBrainUnderstandingReview.update({ where: { id: review.id }, data: {
        status: nextStatus, stateVersion: next, reviewFingerprint: fingerprint,
      } });
    }
    const accepted = result({ command, reviewId: review.id, stateVersion: next, status: nextStatus, reviewFingerprint: fingerprint, canonicalEffectId: effectId });
    await tx.constructionProjectBrainUnderstandingDecision.create({ data: {
      id: randomUUID(), workspaceId: command.workspaceId, projectId: command.projectId, reviewId: review.id,
      commandId: command.commandId, commandHash, decision: decisionName(command.action),
      priorStateVersion: review.stateVersion, nextStateVersion: next, snapshotHash,
      result: asJson(accepted), resultHash: sha256Canonical(accepted), actorUserId: input.userId,
    } });
    return accepted;
  }, TRANSACTION));
}

export async function projectBrainUnderstandingForUser(input: {
  userId: string; workspaceId: string; projectId: string;
}): Promise<ProjectBrainUnderstandingProjection> {
  return prisma.$transaction(async (tx) => {
    await requireReviewer(tx, input.userId, input.workspaceId);
    await requireProject(tx, input.workspaceId, input.projectId);
    return projection(tx, input);
  }, TRANSACTION);
}
