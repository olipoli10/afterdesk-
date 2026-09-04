import { randomUUID } from "node:crypto";
import { describe, expect, it, onTestFinished } from "vitest";
import { prisma } from "@/lib/db";
import { deleteLocalObject } from "@/lib/storage-local";
import {
  admitProjectBrainSource,
  processProjectBrainIntakeCommand,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";

const HASH_B = "b".repeat(64);
const REFERENCED_PDF = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Label (file-ownership) >>\nendobj\n%%EOF",
  "utf8",
);

describe("R36V Project Brain referenced File lifecycle on disposable PostgreSQL", () => {
  it("blocks repurposing and mutation while ordinary unreferenced Files stay mutable", async () => {
    const owner = await prisma.user.create({
      data: {
        name: "R36V File Guard Owner",
        email: `r36v-file-guard-${randomUUID()}@example.invalid`,
        emailVerified: true,
        role: "CLIENT",
      },
    });
    const workspace = await prisma.constructionWorkspace.create({
      data: {
        ownerUserId: owner.id,
        name: "R36V File Guard Workspace",
      },
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        role: "owner",
        status: "active",
      },
    });
    const project = await prisma.constructionProject.create({
      data: {
        workspaceId: workspace.id,
        code: `R36V-FILE-${randomUUID()}`,
        name: "R36V File Guard Project",
        timezone: "America/Toronto",
      },
    });
    const created = await processProjectBrainIntakeCommand({
      userId: owner.id,
      command: {
        schemaVersion: 1,
        action: "CREATE_PROJECT_BRAIN_INTAKE",
        commandId: randomUUID(),
        workspaceId: workspace.id,
        projectId: project.id,
      },
    });
    const sourceCommandId = randomUUID();
    await admitProjectBrainSource({
      userId: owner.id,
      command: {
        schemaVersion: 1,
        action: "ADMIT_PROJECT_BRAIN_SOURCE",
        commandId: sourceCommandId,
        workspaceId: workspace.id,
        projectId: project.id,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
        kind: "DOCUMENT",
        fileName: "plan.pdf",
        mimeType: "application/pdf",
        sizeBytes: REFERENCED_PDF.length,
        durationMs: null,
      },
      bytes: REFERENCED_PDF,
    });
    const referencedSource = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId, commandId: sourceCommandId },
      include: { file: true },
    });
    const referencedFile = referencedSource.file;
    onTestFinished(async () => {
      await deleteLocalObject(referencedFile.storageKey);
    });
    expect(referencedSource).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      intakeId: created.intakeId,
      fileId: referencedFile.id,
      contentHash: referencedFile.sha256,
      mimeType: referencedFile.detectedMime,
      sizeBytes: referencedFile.sizeBytes,
    });
    const genericTask = await prisma.task.create({
      data: {
        clientId: owner.id,
        title: "Generic task",
        description: "A legitimate generic task used by the File guard test.",
      },
    });

    const blockedMutations = [
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: { taskId: genericTask.id },
      }),
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: { submissionId: "blocked-submission" },
      }),
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: { purgedAt: new Date("2026-09-03T12:05:00.000Z") },
      }),
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: { storageKey: `${referencedFile.storageKey}.moved` },
      }),
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: { sha256: HASH_B },
      }),
      () => prisma.file.update({
        where: { id: referencedFile.id },
        data: {
          scanStatus: "rejected",
          scanDetails: "generic scanner rewrote the provenance",
          scannedAt: new Date("2026-09-03T12:10:00.000Z"),
        },
      }),
      () => prisma.file.delete({ where: { id: referencedFile.id } }),
    ];

    for (const mutate of blockedMutations) {
      await expect(mutate()).rejects.toThrow(
        "Construction Project Brain source File is immutable",
      );
    }

    await expect(prisma.file.update({
      where: { id: referencedFile.id },
      data: { scanStatus: referencedFile.scanStatus },
    })).resolves.toMatchObject({
      id: referencedFile.id,
      scanStatus: referencedFile.scanStatus,
    });

    const after = await prisma.file.findUniqueOrThrow({
      where: { id: referencedFile.id },
    });
    expect(after).toMatchObject({
      taskId: null,
      submissionId: null,
      purgedAt: null,
      storageKey: referencedFile.storageKey,
      sha256: referencedFile.sha256,
      scanStatus: referencedFile.scanStatus,
      scanDetails: referencedFile.scanDetails,
    });

    const ordinaryFile = await prisma.file.create({
      data: {
        kind: "input",
        uploaderId: owner.id,
        storageKey: `uploads/${randomUUID()}`,
        fileName: "ordinary.pdf",
        mime: "application/pdf",
        detectedMime: "application/pdf",
        sizeBytes: 8,
        scanStatus: "clean",
        sha256: HASH_B,
        scanDetails: "ordinary upload",
        scannedAt: new Date("2026-09-03T12:00:00.000Z"),
      },
    });
    const purgeTime = new Date("2026-09-03T12:15:00.000Z");
    await expect(prisma.file.update({
      where: { id: ordinaryFile.id },
      data: {
        taskId: genericTask.id,
        scanStatus: "rejected",
        scanDetails: "ordinary lifecycle remains mutable",
        purgedAt: purgeTime,
      },
    })).resolves.toMatchObject({
      id: ordinaryFile.id,
      taskId: genericTask.id,
      scanStatus: "rejected",
      scanDetails: "ordinary lifecycle remains mutable",
      purgedAt: purgeTime,
    });
  });
});
