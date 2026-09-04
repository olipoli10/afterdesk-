import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteLocalObject } from "@/lib/storage-local";
import {
  generateProjectBrainFactCandidatesForUser,
  projectBrainFactCandidatesForUser,
} from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  admitProjectBrainSource,
  processProjectBrainIntakeCommand,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

async function setupConfirmedIntake(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R36W ${label}`,
      email: `r36w-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
      emailVerified: true,
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R36W field ${label}`,
      email: `r36w-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
      emailVerified: true,
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R36W ${label}` });
  await prisma.constructionWorkspaceMember.create({
    data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R36W-${label}`,
    name: `Chantier ${label}`,
  });
  const create = await processProjectBrainIntakeCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "CREATE_PROJECT_BRAIN_INTAKE",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      projectId: project.id,
    },
  });
  await processProjectBrainIntakeCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "ADD_OWNER_BRIEF",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      intakeId: create.intakeId,
      expectedStateVersion: create.stateVersion,
      brief: {
        summary: "Dosseret 👷🏽‍♂️ terminé",
        scope: "Cuisine Laval",
        importantPeople: "Marc",
        importantDates: "Mardi",
        blockers: "",
        nextDecision: "Préparer la facture",
      },
    },
  });
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await admitProjectBrainSource({
    userId: owner.id,
    bytes,
    command: {
      schemaVersion: 1,
      action: "ADMIT_PROJECT_BRAIN_SOURCE",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      intakeId: create.intakeId,
      expectedStateVersion: 2,
      kind: "PHOTO",
      fileName: "preuve.png",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      durationMs: null,
    },
  });
  const submitted = await processProjectBrainIntakeCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "SUBMIT_PROJECT_BRAIN_INTAKE",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      intakeId: create.intakeId,
      expectedStateVersion: 3,
    },
  });
  const confirmed = await processProjectBrainIntakeCommand({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "CONFIRM_PROJECT_BRAIN_INTAKE",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      intakeId: create.intakeId,
      expectedStateVersion: submitted.stateVersion,
      reviewFingerprint: submitted.reviewFingerprint!,
    },
  });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    intakeId: create.intakeId,
    confirmedSnapshotHash: confirmed.reviewFingerprint!,
  };
}

function command(fixture: Awaited<ReturnType<typeof setupConfirmedIntake>>, commandId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES" as const,
    commandId,
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    intakeId: fixture.intakeId,
    confirmedSnapshotHash: fixture.confirmedSnapshotHash,
    adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1" as const,
  };
}

describe("R36W Project Brain fact candidates persistence", () => {
  afterEach(async () => {
    const files = await prisma.file.findMany({
      where: { storageKey: { startsWith: "project-brain-intake/" } },
      select: { storageKey: true },
    });
    await Promise.all(files.map((file) => deleteLocalObject(file.storageKey).catch(() => undefined)));
  });

  it("commits one exact candidate set and replays without a second effect", async () => {
    const fixture = await setupConfirmedIntake("replay");
    const input = command(fixture);
    const first = await generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: input });
    const replay = await generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: input });
    expect(replay).toMatchObject({ batchId: first.batchId, candidateSetHash: first.candidateSetHash, replayed: true });
    expect(first.candidateCount).toBe(11);
    const [batches, candidates, decisions] = await Promise.all([
      prisma.constructionProjectBrainFactCandidateBatch.count({ where: { intakeId: fixture.intakeId } }),
      prisma.constructionProjectBrainFactCandidate.count({ where: { intakeId: fixture.intakeId } }),
      prisma.constructionProjectBrainFactCandidateDecision.count({ where: { intakeId: fixture.intakeId } }),
    ]);
    expect({ batches, candidates, decisions }).toEqual({ batches: 1, candidates: 11, decisions: 1 });
    const drift = { ...input, confirmedSnapshotHash: "b".repeat(64) };
    await expect(generateProjectBrainFactCandidatesForUser({
      userId: fixture.ownerId,
      command: drift,
    })).rejects.toThrow("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT");
    await expect(generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: drift }))
      .rejects.toThrow("PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT");
    expect(await prisma.constructionAuditEvent.count({
      where: { workspaceId: fixture.workspaceId, action: "project_brain_fact_candidate_generation_refused" },
    })).toBe(1);
  });

  it("converges distinct equivalent commands and returns an exact restart-safe projection", async () => {
    const fixture = await setupConfirmedIntake("converge");
    const [left, right] = await Promise.all([
      generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: command(fixture) }),
      generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: command(fixture) }),
    ]);
    expect(left.batchId).toBe(right.batchId);
    const before = await projectBrainFactCandidatesForUser({ userId: fixture.ownerId, ...fixture });
    await prisma.$disconnect();
    const after = await projectBrainFactCandidatesForUser({ userId: fixture.ownerId, ...fixture });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(after.batch?.candidates.every((candidate) => candidate.status === "CANDIDATE_UNCONFIRMED")).toBe(true);
    expect(after).toMatchObject({
      providerExecutionPerformed: false,
      binaryUnderstandingPerformed: false,
      externalTransportPerformed: false,
      externalWritePerformed: false,
      automaticConfirmationPerformed: false,
    });
  });

  it("refuses field workers and raw-SQL mutation or forged provenance", async () => {
    const fixture = await setupConfirmedIntake("guards");
    const result = await generateProjectBrainFactCandidatesForUser({ userId: fixture.ownerId, command: command(fixture) });
    await expect(projectBrainFactCandidatesForUser({ userId: fixture.fieldId, ...fixture }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const candidate = await prisma.constructionProjectBrainFactCandidate.findFirstOrThrow({ where: { batchId: result.batchId } });
    await expect(prisma.$executeRawUnsafe(
      `UPDATE "ConstructionProjectBrainFactCandidate" SET "value" = 'invented' WHERE "id" = $1`,
      candidate.id,
    )).rejects.toThrow(/immutable|append-only/i);
    await expect(prisma.$transaction(async (tx) => {
      await tx.constructionProjectBrainFactCandidate.create({
        data: {
          ...candidate,
          id: crypto.randomUUID(),
          candidateFingerprint: "b".repeat(64),
          value: "invented",
          createdAt: undefined,
        },
      });
    })).rejects.toThrow(/range|count|exact value|canonical source/i);
  });
});
