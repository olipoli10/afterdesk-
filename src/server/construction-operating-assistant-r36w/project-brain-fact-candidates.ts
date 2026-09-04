import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION,
  buildProjectBrainFactCandidates,
  factCandidateGenerationCommandSchema,
  hashFactCandidateCommand,
  hashProjectBrainFactCandidateSet,
  projectBrainFactCandidateBatchProjectionSchema,
  projectBrainFactCandidateReadResultSchema,
  projectBrainFactCandidateResultSchema,
  type FactCandidateGenerationCommand,
  type ProjectBrainFactCandidate,
  type ProjectBrainFactCandidateReadResult,
  type ProjectBrainFactCandidateResult,
} from "@/lib/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  canonicalProjectBrainSnapshotSchema,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const ALLOWED_MEMBER_ROLES = new Set(["owner", "admin"]);
const TRANSACTION_MAX_WAIT_MS = 15_000;
const TRANSACTION_TIMEOUT_MS = 60_000;
const localCommandTails = new Map<string, Promise<void>>();

type TransactionClient = PrismaTypes.TransactionClient;

function asJson(value: unknown): PrismaTypes.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonValue;
}

async function withLocalSerialization<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localCommandTails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
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

async function lock(tx: TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`endvera:r36w:${key}`}, 0))::text AS acquired`,
  );
}

async function requireWriter(
  tx: TransactionClient,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (!ALLOWED_MEMBER_ROLES.has(membership.role)) {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }
}

async function requireProject(
  tx: TransactionClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  const project = await tx.constructionProject.findFirst({
    where: { id: projectId, workspaceId, status: "active" },
    select: { id: true },
  });
  if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
}

function falseEffects() {
  return {
    providerExecutionPerformed: false as const,
    binaryUnderstandingPerformed: false as const,
    externalTransportPerformed: false as const,
    externalWritePerformed: false as const,
    automaticConfirmationPerformed: false as const,
  };
}

function validateCanonicalInput(input: {
  intake: {
    id: string;
    workspaceId: string;
    projectId: string;
    status: string;
    reviewFingerprint: string | null;
    summary: string | null;
    scope: string | null;
    importantPeople: string | null;
    importantDates: string | null;
    blockers: string | null;
    nextDecision: string | null;
  };
  snapshot: {
    id: string;
    workspaceId: string;
    projectId: string;
    intakeId: string;
    status: string;
    canonicalHash: string;
    snapshot: unknown;
  };
  sources: Array<{
    id: string;
    workspaceId: string;
    projectId: string;
    intakeId: string;
    ordinal: number;
    kind: string;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number | null;
    contentHash: string;
    transcriptionState: string;
    documentUnderstandingState: string;
  }>;
}) {
  const { intake, snapshot } = input;
  if (
    intake.status !== "CONFIRMED" ||
    snapshot.status !== "CONFIRMED" ||
    snapshot.intakeId !== intake.id ||
    snapshot.workspaceId !== intake.workspaceId ||
    snapshot.projectId !== intake.projectId ||
    intake.reviewFingerprint !== snapshot.canonicalHash
  ) {
    throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT");
  }
  const canonical = canonicalProjectBrainSnapshotSchema.safeParse(snapshot.snapshot);
  if (!canonical.success || sha256Canonical(canonical.data) !== snapshot.canonicalHash) {
    throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
  }
  const ownerBrief = canonical.data.ownerBrief;
  const relationalOwnerBrief = {
    summary: intake.summary ?? "",
    scope: intake.scope ?? "",
    importantPeople: intake.importantPeople ?? "",
    importantDates: intake.importantDates ?? "",
    blockers: intake.blockers ?? "",
    nextDecision: intake.nextDecision ?? "",
  };
  if (sha256Canonical({ ...relationalOwnerBrief, provenance: "OWNER_CONFIRMED" }) !== sha256Canonical(ownerBrief)) {
    throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
  }
  const sources = [...input.sources].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
  const inventory = canonical.data.sources;
  if (sources.length !== inventory.length) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const recorded = inventory[index];
    if (
      source.workspaceId !== intake.workspaceId || source.projectId !== intake.projectId ||
      source.intakeId !== intake.id || source.id !== recorded.sourceId ||
      source.kind !== recorded.kind || source.displayName !== recorded.displayName ||
      source.contentHash !== recorded.contentHash ||
      source.transcriptionState !== recorded.transcriptionState ||
      source.documentUnderstandingState !== recorded.documentUnderstandingState
    ) {
      throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
    }
  }
  return {
    canonical,
    ownerBrief: relationalOwnerBrief,
    sources: sources.map((source) => ({
      id: source.id,
      ordinal: source.ordinal,
      kind: canonicalProjectBrainSnapshotSchema.shape.sources.element.shape.kind.parse(source.kind),
      displayName: source.displayName,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      durationMs: source.durationMs,
      contentHash: source.contentHash,
    })),
  };
}

function candidateFromRow(row: {
  id: string;
  candidateFingerprint: string;
  workspaceId: string;
  projectId: string;
  intakeId: string;
  confirmedSnapshotId: string;
  confirmedSnapshotHash: string;
  adapter: string;
  kind: string;
  status: string;
  confidenceClass: string;
  value: string;
  ownerBriefField: string | null;
  rangeUnit: string | null;
  rangeStart: number | null;
  rangeEnd: number | null;
  sourceId: string | null;
  sourceOrdinal: number | null;
  sourceContentHash: string | null;
  metadataField: string | null;
}): ProjectBrainFactCandidate {
  return {
    id: row.id,
    candidateFingerprint: row.candidateFingerprint,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    intakeId: row.intakeId,
    confirmedSnapshotId: row.confirmedSnapshotId,
    confirmedSnapshotHash: row.confirmedSnapshotHash,
    adapter: row.adapter as ProjectBrainFactCandidate["adapter"],
    kind: row.kind as ProjectBrainFactCandidate["kind"],
    status: row.status as ProjectBrainFactCandidate["status"],
    confidenceClass: row.confidenceClass as ProjectBrainFactCandidate["confidenceClass"],
    value: row.value,
    ownerBriefField: row.ownerBriefField as ProjectBrainFactCandidate["ownerBriefField"],
    rangeUnit: row.rangeUnit as ProjectBrainFactCandidate["rangeUnit"],
    rangeStart: row.rangeStart,
    rangeEnd: row.rangeEnd,
    sourceId: row.sourceId,
    sourceOrdinal: row.sourceOrdinal,
    sourceContentHash: row.sourceContentHash,
    metadataField: row.metadataField as ProjectBrainFactCandidate["metadataField"],
  };
}

function assertCandidateRowsMatch(
  expected: ProjectBrainFactCandidate[],
  rows: ReturnType<typeof candidateFromRow>[],
): void {
  if (expected.length !== rows.length) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
  for (let index = 0; index < expected.length; index += 1) {
    const actual = Object.fromEntries(
      Object.entries(rows[index]).filter(([key]) => key !== "id"),
    );
    if (sha256Canonical(actual) !== sha256Canonical(expected[index])) {
      throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
    }
  }
}

async function generateProjectBrainFactCandidatesInternal(input: {
  userId: string;
  command: FactCandidateGenerationCommand;
}): Promise<ProjectBrainFactCandidateResult> {
  const command = factCandidateGenerationCommandSchema.parse(input.command);
  const commandHash = hashFactCandidateCommand(command);
  return withLocalSerialization(`${command.workspaceId}:${command.commandId}`, async () =>
    prisma.$transaction(async (tx) => {
      await lock(tx, `command:${command.workspaceId}:${command.commandId}`);
      await lock(tx, `input:${command.intakeId}:${command.adapterSetVersion}`);
      await requireWriter(tx, input.userId, command.workspaceId);
      await requireProject(tx, command.workspaceId, command.projectId);

      const priorDecision = await tx.constructionProjectBrainFactCandidateDecision.findUnique({
        where: { workspaceId_commandId: { workspaceId: command.workspaceId, commandId: command.commandId } },
      });
      if (priorDecision) {
        if (priorDecision.commandHash !== commandHash) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT");
        const prior = projectBrainFactCandidateResultSchema.safeParse(priorDecision.result);
        if (!prior.success || sha256Canonical(prior.data) !== priorDecision.resultHash) {
          throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
        }
        return projectBrainFactCandidateResultSchema.parse({ ...prior.data, replayed: true });
      }

      const intake = await tx.constructionProjectBrainIntake.findFirst({
        where: { id: command.intakeId, workspaceId: command.workspaceId, projectId: command.projectId },
        select: {
          id: true, workspaceId: true, projectId: true, status: true, reviewFingerprint: true,
          summary: true, scope: true, importantPeople: true, importantDates: true, blockers: true, nextDecision: true,
        },
      });
      if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
      const snapshot = await tx.constructionProjectBrainSnapshot.findFirst({
        where: {
          intakeId: intake.id, workspaceId: intake.workspaceId, projectId: intake.projectId,
          status: "CONFIRMED", canonicalHash: command.confirmedSnapshotHash,
        },
        orderBy: [{ stateVersion: "desc" }, { id: "asc" }],
      });
      if (!snapshot || intake.status !== "CONFIRMED") throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT");
      const sources = await tx.constructionProjectBrainSource.findMany({
        where: { intakeId: intake.id, workspaceId: intake.workspaceId, projectId: intake.projectId },
        orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      });
      const canonical = validateCanonicalInput({ intake, snapshot, sources });
      const candidates = buildProjectBrainFactCandidates({
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeId: command.intakeId,
        confirmedSnapshotId: snapshot.id,
        confirmedSnapshotHash: snapshot.canonicalHash,
        ownerBrief: canonical.ownerBrief,
        sources: canonical.sources,
      });
      const candidateSetHash = hashProjectBrainFactCandidateSet(candidates);

      const equivalent = await tx.constructionProjectBrainFactCandidateBatch.findUnique({
        where: { intakeId_confirmedSnapshotId_adapterSetVersion: {
          intakeId: intake.id,
          confirmedSnapshotId: snapshot.id,
          adapterSetVersion: command.adapterSetVersion,
        } },
        include: { decisions: { where: { outcome: "ACCEPTED" }, take: 1 } },
      });
      if (equivalent) {
        if (
          equivalent.confirmedSnapshotHash !== snapshot.canonicalHash ||
          equivalent.candidateSetHash !== candidateSetHash ||
          equivalent.candidateCount !== candidates.length
        ) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
        const replayedResult = projectBrainFactCandidateResultSchema.parse({
          schemaVersion: 1,
          commandId: command.commandId,
          action: command.action,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          intakeId: command.intakeId,
          batchId: equivalent.id,
          confirmedSnapshotHash: snapshot.canonicalHash,
          adapterSetVersion: PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION,
          candidateCount: candidates.length,
          candidateSetHash,
          replayed: true,
          ...falseEffects(),
        });
        await tx.constructionProjectBrainFactCandidateDecision.create({
          data: {
            id: randomUUID(),
            workspaceId: command.workspaceId,
            projectId: command.projectId,
            intakeId: command.intakeId,
            batchId: equivalent.id,
            commandId: command.commandId,
            commandHash,
            decision: "GENERATE_FACT_CANDIDATES",
            outcome: "REPLAYED",
            confirmedSnapshotHash: snapshot.canonicalHash,
            adapterSetVersion: command.adapterSetVersion,
            candidateSetHash,
            result: asJson(replayedResult),
            resultHash: sha256Canonical(replayedResult),
            actorUserId: input.userId,
          },
        });
        return replayedResult;
      }

      const batchId = randomUUID();
      await tx.constructionProjectBrainFactCandidateBatch.create({
        data: {
          id: batchId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          intakeId: command.intakeId,
          confirmedSnapshotId: snapshot.id,
          confirmedSnapshotHash: snapshot.canonicalHash,
          schemaVersion: 1,
          adapterSetVersion: command.adapterSetVersion,
          commandId: command.commandId,
          commandHash,
          status: "COMPLETED_LOCAL",
          candidateCount: candidates.length,
          candidateSetHash,
          createdByUserId: input.userId,
        },
      });
      if (candidates.length > 0) {
        await tx.constructionProjectBrainFactCandidate.createMany({
          data: candidates.map((candidate) => ({
            id: randomUUID(),
            batchId,
            ...candidate,
          })),
        });
      }
      const result = projectBrainFactCandidateResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        action: command.action,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        intakeId: command.intakeId,
        batchId,
        confirmedSnapshotHash: snapshot.canonicalHash,
        adapterSetVersion: PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION,
        candidateCount: candidates.length,
        candidateSetHash,
        replayed: false,
        ...falseEffects(),
      });
      await tx.constructionProjectBrainFactCandidateDecision.create({
        data: {
          id: randomUUID(),
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          intakeId: command.intakeId,
          batchId,
          commandId: command.commandId,
          commandHash,
          decision: "GENERATE_FACT_CANDIDATES",
          outcome: "ACCEPTED",
          confirmedSnapshotHash: snapshot.canonicalHash,
          adapterSetVersion: command.adapterSetVersion,
          candidateSetHash,
          result: asJson(result),
          resultHash: sha256Canonical(result),
          actorUserId: input.userId,
        },
      });
      return result;
    }, { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS }),
  );
}

async function recordAuthorizedRefusal(input: {
  userId: string;
  command: FactCandidateGenerationCommand;
  commandHash: string;
  reasonCode: string;
}): Promise<void> {
  if (!["PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT", "PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT"].includes(input.reasonCode)) return;
  try {
    await prisma.$transaction(async (tx) => {
      await requireWriter(tx, input.userId, input.command.workspaceId);
      await requireProject(tx, input.command.workspaceId, input.command.projectId);
      const intake = await tx.constructionProjectBrainIntake.findFirst({
        where: {
          id: input.command.intakeId,
          workspaceId: input.command.workspaceId,
          projectId: input.command.projectId,
        },
        select: { id: true },
      });
      if (!intake) return;
      const audit = {
        workspaceId: input.command.workspaceId,
        actorUserId: input.userId,
        entityType: "project_brain_fact_candidate_batch",
        entityId: input.command.intakeId,
        action: "project_brain_fact_candidate_generation_refused",
        reasonCode: input.reasonCode,
        metadata: asJson({
          commandId: input.command.commandId,
          commandHash: input.commandHash,
          intakeId: input.command.intakeId,
          adapterSetVersion: input.command.adapterSetVersion,
          ...falseEffects(),
        }),
      };
      await tx.constructionAuditEvent.createMany({
        data: [{
          ...audit,
          fingerprint: sha256Canonical({ ...audit, refusalKey: input.command.commandId }),
        }],
        skipDuplicates: true,
      });
    });
  } catch {
    // Refusal evidence never replaces the original non-enumerating failure.
  }
}

export async function generateProjectBrainFactCandidatesForUser(input: {
  userId: string;
  command: FactCandidateGenerationCommand;
}): Promise<ProjectBrainFactCandidateResult> {
  const command = factCandidateGenerationCommandSchema.parse(input.command);
  const commandHash = hashFactCandidateCommand(command);
  try {
    return await generateProjectBrainFactCandidatesInternal({ ...input, command });
  } catch (error) {
    await recordAuthorizedRefusal({
      userId: input.userId,
      command,
      commandHash,
      reasonCode: error instanceof Error ? error.message : "UNKNOWN",
    });
    throw error;
  }
}

export async function projectBrainFactCandidatesForUser(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  intakeId: string;
}): Promise<ProjectBrainFactCandidateReadResult> {
  return prisma.$transaction(async (tx) => {
    await requireWriter(tx, input.userId, input.workspaceId);
    await requireProject(tx, input.workspaceId, input.projectId);
    const intake = await tx.constructionProjectBrainIntake.findFirst({
      where: { id: input.intakeId, workspaceId: input.workspaceId, projectId: input.projectId },
      select: {
        id: true, workspaceId: true, projectId: true, status: true, reviewFingerprint: true,
        summary: true, scope: true, importantPeople: true, importantDates: true, blockers: true, nextDecision: true,
      },
    });
    if (!intake) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const batch = await tx.constructionProjectBrainFactCandidateBatch.findFirst({
      where: { workspaceId: input.workspaceId, projectId: input.projectId, intakeId: input.intakeId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: {
        candidates: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        decisions: { where: { outcome: "ACCEPTED" }, take: 1 },
      },
    });
    if (!batch) return projectBrainFactCandidateReadResultSchema.parse({ schemaVersion: 1, batch: null, ...falseEffects() });
    const snapshot = await tx.constructionProjectBrainSnapshot.findUnique({ where: { id: batch.confirmedSnapshotId } });
    if (!snapshot) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
    const sources = await tx.constructionProjectBrainSource.findMany({
      where: { intakeId: input.intakeId, workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
    });
    const canonical = validateCanonicalInput({ intake, snapshot, sources });
    const expected = buildProjectBrainFactCandidates({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      intakeId: input.intakeId,
      confirmedSnapshotId: snapshot.id,
      confirmedSnapshotHash: snapshot.canonicalHash,
      ownerBrief: canonical.ownerBrief,
      sources: canonical.sources,
    });
    const rows = batch.candidates.map(candidateFromRow);
    rows.sort((left, right) => expected.findIndex((item) => item.candidateFingerprint === left.candidateFingerprint) - expected.findIndex((item) => item.candidateFingerprint === right.candidateFingerprint));
    assertCandidateRowsMatch(expected, rows);
    const candidateSetHash = hashProjectBrainFactCandidateSet(expected);
    const decision = batch.decisions[0];
    if (
      batch.status !== "COMPLETED_LOCAL" || batch.schemaVersion !== 1 ||
      batch.adapterSetVersion !== PROJECT_BRAIN_FACT_CANDIDATE_ADAPTER_SET_VERSION ||
      batch.candidateCount !== expected.length || batch.candidateSetHash !== candidateSetHash ||
      batch.confirmedSnapshotHash !== snapshot.canonicalHash || !decision ||
      decision.candidateSetHash !== candidateSetHash ||
      sha256Canonical(projectBrainFactCandidateResultSchema.parse(decision.result)) !== decision.resultHash
    ) throw new Error("PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT");
    return projectBrainFactCandidateReadResultSchema.parse({
      schemaVersion: 1,
      batch: projectBrainFactCandidateBatchProjectionSchema.parse({
        id: batch.id,
        workspaceId: batch.workspaceId,
        projectId: batch.projectId,
        intakeId: batch.intakeId,
        confirmedSnapshotId: batch.confirmedSnapshotId,
        confirmedSnapshotHash: batch.confirmedSnapshotHash,
        schemaVersion: batch.schemaVersion,
        adapterSetVersion: batch.adapterSetVersion,
        status: batch.status,
        candidateCount: batch.candidateCount,
        candidateSetHash: batch.candidateSetHash,
        candidates: rows,
        limitations: canonical.canonical.data.limitations,
        createdAt: batch.createdAt.toISOString(),
      }),
      ...falseEffects(),
    });
  }, { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS });
}
