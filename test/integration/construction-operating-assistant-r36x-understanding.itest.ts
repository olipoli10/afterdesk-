import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteLocalObject } from "@/lib/storage-local";
import { createConstructionProject, initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { admitProjectBrainSource, processProjectBrainIntakeCommand } from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { generateProjectBrainFactCandidatesForUser } from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";
import { applyProjectBrainUnderstandingCommandForUser, projectBrainUnderstandingForUser } from "@/server/construction-operating-assistant-r36x/project-brain-understanding-review";

async function fixture(label: string) {
  const owner = await prisma.user.create({ data: { name: `R36X ${label}`, email: `r36x-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const field = await prisma.user.create({ data: { name: `R36X field ${label}`, email: `r36x-field-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true } });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R36X ${label}` });
  await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
  const project = await createConstructionProject({ userId: owner.id, workspaceId: workspace.workspaceId, code: `R36X-${label}`, name: `Chantier ${label}` });
  const created = await processProjectBrainIntakeCommand({ userId: owner.id, command: { schemaVersion: 1, action: "CREATE_PROJECT_BRAIN_INTAKE", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id } });
  await processProjectBrainIntakeCommand({ userId: owner.id, command: { schemaVersion: 1, action: "ADD_OWNER_BRIEF", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id, intakeId: created.intakeId, expectedStateVersion: 1, brief: { summary: "Dosseret terminé", scope: "Cuisine Laval", importantPeople: "Marc", importantDates: "Mardi", blockers: "Date contestée", nextDecision: "Facturer" } } });
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await admitProjectBrainSource({ userId: owner.id, bytes, command: { schemaVersion: 1, action: "ADMIT_PROJECT_BRAIN_SOURCE", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id, intakeId: created.intakeId, expectedStateVersion: 2, kind: "PHOTO", fileName: "preuve.png", mimeType: "image/png", sizeBytes: bytes.length, durationMs: null } });
  const proposed = await processProjectBrainIntakeCommand({ userId: owner.id, command: { schemaVersion: 1, action: "SUBMIT_PROJECT_BRAIN_INTAKE", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id, intakeId: created.intakeId, expectedStateVersion: 3 } });
  await processProjectBrainIntakeCommand({ userId: owner.id, command: { schemaVersion: 1, action: "CONFIRM_PROJECT_BRAIN_INTAKE", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id, intakeId: created.intakeId, expectedStateVersion: proposed.stateVersion, reviewFingerprint: proposed.reviewFingerprint! } });
  const batch = await generateProjectBrainFactCandidatesForUser({ userId: owner.id, command: { schemaVersion: 1, action: "GENERATE_PROJECT_BRAIN_FACT_CANDIDATES", commandId: crypto.randomUUID(), workspaceId: workspace.workspaceId, projectId: project.id, intakeId: created.intakeId, confirmedSnapshotHash: proposed.reviewFingerprint!, adapterSetVersion: "PROJECT_BRAIN_FACT_CANDIDATES_V1" } });
  return { ownerId: owner.id, fieldId: field.id, workspaceId: workspace.workspaceId, projectId: project.id, batchId: batch.batchId };
}

const base = (f: Awaited<ReturnType<typeof fixture>>) => ({ schemaVersion: 1 as const, commandId: crypto.randomUUID(), workspaceId: f.workspaceId, projectId: f.projectId });

describe("R36X Project Brain understanding persistence", () => {
  afterEach(async () => {
    const files = await prisma.file.findMany({ where: { storageKey: { startsWith: "project-brain-intake/" } }, select: { storageKey: true } });
    await Promise.all(files.map((file) => deleteLocalObject(file.storageKey).catch(() => undefined)));
  });

  it("preserves explicit history, seals an exact understanding and replays without a second effect", async () => {
    const f = await fixture("happy");
    const createCommand = { ...base(f), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" as const };
    const created = await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: createCommand });
    const replayed = await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: createCommand });
    expect(replayed).toMatchObject({ reviewId: created.reviewId, replayed: true });
    let view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    expect(view.review?.candidateBatchId).toBe(f.batchId);
    const candidateIds = view.review!.candidates.map((item) => item.id);
    for (const [index, candidateId] of candidateIds.entries()) {
      const current = view.review!;
      await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE", reviewId: current.id, expectedStateVersion: current.stateVersion, candidateId, disposition: index < 2 ? "RETAIN_FOR_CONTRADICTION" : "ACCEPT_AS_REVIEWED" } });
      view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    }
    let current = view.review!;
    const declared = await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "DECLARE_PROJECT_BRAIN_CONTRADICTION", reviewId: current.id, expectedStateVersion: current.stateVersion, candidateIds: candidateIds.slice(0, 2) } });
    view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    current = view.review!;
    expect(current.contradictions[0].memberCandidateIds).toEqual([...candidateIds.slice(0, 2)].sort());
    await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "RESOLVE_PROJECT_BRAIN_CONTRADICTION", reviewId: current.id, expectedStateVersion: current.stateVersion, contradictionId: declared.canonicalEffectId, resolution: { mode: "SELECT_SUPPORTED_CANDIDATES", selectedCandidateIds: [candidateIds[0]] } } });
    for (const [candidateId, disposition] of [[candidateIds[0], "ACCEPT_AS_REVIEWED"], [candidateIds[1], "REJECT_AS_UNSUPPORTED"]] as const) {
      view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId }); current = view.review!;
      await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE", reviewId: current.id, expectedStateVersion: current.stateVersion, candidateId, disposition } });
    }
    view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId }); current = view.review!;
    const prepared = await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING", reviewId: current.id, expectedStateVersion: current.stateVersion } });
    expect(prepared.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const confirmationCommands = [base(f), base(f)].map((commandBase) => ({ ...commandBase, action: "CONFIRM_PROJECT_BRAIN_UNDERSTANDING" as const, reviewId: current.id, expectedStateVersion: prepared.stateVersion, reviewFingerprint: prepared.reviewFingerprint! }));
    const raced = await Promise.allSettled(confirmationCommands.map((command) => applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command })));
    expect(raced.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((item) => item.status === "rejected")).toHaveLength(1);
    const winningCommand = confirmationCommands[raced.findIndex((item) => item.status === "fulfilled")];
    expect(await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: winningCommand })).toMatchObject({ status: "CONFIRMED", replayed: true });
    expect(await prisma.constructionProjectBrainUnderstandingSnapshot.count({ where: { reviewId: current.id, status: "CONFIRMED" } })).toBe(1);
    const before = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    await prisma.$disconnect();
    const after = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(after.review?.contradictions[0].resolutions).toHaveLength(1);
    await expect(prisma.$executeRawUnsafe(`UPDATE "ConstructionProjectBrainContradictionMember" SET "ordinal" = 9 WHERE "contradictionId" = $1`, declared.canonicalEffectId)).rejects.toThrow(/immutable|append-only/i);
  });

  it("refuses incomplete, unauthorized, cross-batch and body-drift operations without partial effects", async () => {
    const f = await fixture("guards");
    const command = { ...base(f), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" as const };
    const created = await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command });
    await expect(projectBrainUnderstandingForUser({ userId: f.fieldId, workspaceId: f.workspaceId, projectId: f.projectId })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...command, projectId: "changed" } })).rejects.toThrow("PROJECT_BRAIN_UNDERSTANDING_CONFLICT");
    await expect(applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING", reviewId: created.reviewId, expectedStateVersion: created.stateVersion } })).rejects.toThrow("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE");
    expect(await prisma.constructionProjectBrainUnderstandingSnapshot.count({ where: { reviewId: created.reviewId } })).toBe(0);
  });

  it("refuses incompatible outcomes derived from overlapping contradiction groups", async () => {
    const f = await fixture("overlap");
    await applyProjectBrainUnderstandingCommandForUser({ userId: f.ownerId, command: { ...base(f), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" } });
    let view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    const candidateIds = view.review!.candidates.map((candidate) => candidate.id);
    expect(candidateIds.length).toBeGreaterThanOrEqual(3);

    for (const [index, candidateId] of candidateIds.entries()) {
      const current = view.review!;
      await applyProjectBrainUnderstandingCommandForUser({
        userId: f.ownerId,
        command: {
          ...base(f),
          action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE",
          reviewId: current.id,
          expectedStateVersion: current.stateVersion,
          candidateId,
          disposition: index < 3 ? "RETAIN_FOR_CONTRADICTION" : "ACCEPT_AS_REVIEWED",
        },
      });
      view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    }

    const declare = async (members: string[]) => {
      const current = view.review!;
      const result = await applyProjectBrainUnderstandingCommandForUser({
        userId: f.ownerId,
        command: {
          ...base(f),
          action: "DECLARE_PROJECT_BRAIN_CONTRADICTION",
          reviewId: current.id,
          expectedStateVersion: current.stateVersion,
          candidateIds: members,
        },
      });
      view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
      return result.canonicalEffectId;
    };
    const firstGroup = await declare([candidateIds[0], candidateIds[1]]);
    const secondGroup = await declare([candidateIds[0], candidateIds[2]]);

    for (const [contradictionId, selectedCandidateIds] of [
      [firstGroup, [candidateIds[0]]],
      [secondGroup, [candidateIds[2]]],
    ] as const) {
      const current = view.review!;
      await applyProjectBrainUnderstandingCommandForUser({
        userId: f.ownerId,
        command: {
          ...base(f),
          action: "RESOLVE_PROJECT_BRAIN_CONTRADICTION",
          reviewId: current.id,
          expectedStateVersion: current.stateVersion,
          contradictionId,
          resolution: { mode: "SELECT_SUPPORTED_CANDIDATES", selectedCandidateIds: [...selectedCandidateIds] },
        },
      });
      view = await projectBrainUnderstandingForUser({ userId: f.ownerId, workspaceId: f.workspaceId, projectId: f.projectId });
    }

    const current = view.review!;
    await expect(applyProjectBrainUnderstandingCommandForUser({
      userId: f.ownerId,
      command: {
        ...base(f),
        action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING",
        reviewId: current.id,
        expectedStateVersion: current.stateVersion,
      },
    })).rejects.toThrow("CONFLICTING_RESOLUTIONS");
    expect(await prisma.constructionProjectBrainUnderstandingSnapshot.count({ where: { reviewId: current.id } })).toBe(0);
  });
});
