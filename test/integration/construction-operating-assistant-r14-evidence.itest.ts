import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { constructionSharedCockpitForUser } from "@/server/construction-operating-assistant-r7/gateway";
import { admitMobileConstructionEvidence } from "@/server/construction-operating-assistant-r14/evidence";
import { recordWorkFinished } from "@/server/construction-operating-assistant-r0/open-loops";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";

const workspaceIds: string[] = [];

const pdf = (label: string) =>
  Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Label (${label}) >>\nendobj\n%%EOF`, "utf8");

async function setup() {
  const owner = await prisma.user.create({
    data: {
      name: "R14 owner",
      email: `r14-owner-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: "R14 field worker",
      email: `r14-field-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: "R14 outsider",
      email: `r14-outsider-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: "R14 Construction",
  });
  workspaceIds.push(workspace.workspaceId);
  await prisma.constructionWorkspaceMember.create({
    data: {
      workspaceId: workspace.workspaceId,
      userId: field.id,
      role: "member",
      status: "active",
    },
  });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: "LAVAL-R14",
    name: "Rénovation Laval R14",
  });
  const otherProject = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: "OTHER-R14",
    name: "Autre chantier R14",
  });
  const message = await prisma.constructionMessage.create({
    data: {
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      direction: "inbound",
      channel: "portal",
      idempotencyKey: `r14-source-${crypto.randomUUID()}`,
      sender: `user:${owner.id}`,
      recipients: ["ENDVERA_LOCAL"],
      originalBody: "Travail terminé pour le dosseret.",
      normalizedBody: "Travail terminé pour le dosseret.",
      status: "received",
      receivedAt: new Date("2026-09-01T13:00:00.000Z"),
    },
  });
  const opened = await recordWorkFinished({
    schemaVersion: 1,
    commandId: `r14-open-${crypto.randomUUID()}`,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    actorId: owner.id,
    sourceMessageId: message.id,
    commandType: "REPORT_WORK_FINISHED",
    claims: {
      billingBasis: "CHANGE_ORDER",
      workDescription: "Dosseret de cuisine",
      amountMinor: 120_000,
      currency: "CAD",
      completion: true,
      approvalState: "UNKNOWN",
    },
  });
  return {
    ownerId: owner.id,
    fieldId: field.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    otherProjectId: otherProject.id,
    loopId: opened.loopId,
    stateVersion: opened.decision.stateVersion,
  };
}

function command(
  fixture: Awaited<ReturnType<typeof setup>>,
  input: {
    commandId: string;
    projectId?: string;
    stateVersion?: number;
    kind?: "WRITTEN_APPROVAL" | "DOCUMENT";
    fileName?: string;
    bytes: Buffer;
  },
) {
  return {
    schemaVersion: 1 as const,
    commandId: input.commandId,
    workspaceId: fixture.workspaceId,
    projectId: input.projectId ?? fixture.projectId,
    loopId: fixture.loopId,
    expectedStateVersion: input.stateVersion ?? fixture.stateVersion,
    kind: input.kind ?? ("DOCUMENT" as const),
    fileName: input.fileName ?? "preuve.pdf",
    mimeType: "application/pdf" as const,
    sizeBytes: input.bytes.length,
  };
}

describe("Construction Operating Assistant R14 evidence on disposable PostgreSQL", () => {
  afterAll(async () => {
    const evidence = await prisma.constructionOpenLoopEvidence.findMany({
      where: { workspaceId: { in: workspaceIds }, sourceRef: { startsWith: "file:" } },
      select: { sourceRef: true },
    });
    const fileIds = evidence.map((item) => item.sourceRef.slice("file:".length));
    const files = fileIds.length
      ? await prisma.file.findMany({
          where: { id: { in: fileIds } },
          select: { storageKey: true },
        })
      : [];
    await Promise.all(files.map((file) => deleteObject(file.storageKey)));
    await prisma.$disconnect();
  });

  it("admits one exact unverified file, refuses replay drift and preserves role isolation", async () => {
    const fixture = await setup();
    const firstBytes = pdf("r14-first");
    const firstCommandId = "14141414-1414-4141-8141-141414141414";
    const firstCommand = command(fixture, { commandId: firstCommandId, bytes: firstBytes });

    const first = await admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: firstCommand,
      bytes: firstBytes,
    });
    expect(first).toMatchObject({
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      loopId: fixture.loopId,
      kind: "DOCUMENT",
      state: "PRESENT_UNVERIFIED",
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(first.stateVersion).toBe(fixture.stateVersion + 1);

    const replay = await admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: firstCommand,
      bytes: firstBytes,
    });
    expect(replay).toMatchObject({ evidenceId: first.evidenceId, replayed: true });
    expect(await prisma.constructionOpenLoopEvidence.count({
      where: { loopId: fixture.loopId },
    })).toBe(1);
    expect(await prisma.fileAccessLog.count({
      where: { userId: fixture.ownerId, action: "upload" },
    })).toBe(1);

    const alteredBytes = pdf("r14-altered");
    await expect(admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: { ...firstCommand, sizeBytes: alteredBytes.length },
      bytes: alteredBytes,
    })).rejects.toThrow("EVIDENCE_IDEMPOTENCY_CONFLICT");
    await expect(admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: { ...firstCommand, fileName: "renamed.pdf" },
      bytes: firstBytes,
    })).rejects.toThrow("EVIDENCE_IDEMPOTENCY_CONFLICT");
    await expect(admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: command(fixture, {
        commandId: "45454545-4545-4545-8545-454545454545",
        stateVersion: first.stateVersion,
        fileName: "../escape.pdf",
        bytes: firstBytes,
      }),
      bytes: firstBytes,
    })).rejects.toThrow("filename is invalid");
    await expect(admitMobileConstructionEvidence({
      userId: fixture.outsiderId,
      command: firstCommand,
      bytes: firstBytes,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    const crossProjectId = "24242424-2424-4242-8242-242424242424";
    await expect(admitMobileConstructionEvidence({
      userId: fixture.ownerId,
      command: command(fixture, {
        commandId: crossProjectId,
        projectId: fixture.otherProjectId,
        stateVersion: first.stateVersion,
        bytes: firstBytes,
      }),
      bytes: firstBytes,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    const approvalBytes = pdf("r14-field-approval");
    const field = await admitMobileConstructionEvidence({
      userId: fixture.fieldId,
      command: command(fixture, {
        commandId: "34343434-3434-4343-8343-343434343434",
        stateVersion: first.stateVersion,
        kind: "WRITTEN_APPROVAL",
        fileName: "approbation.pdf",
        bytes: approvalBytes,
      }),
      bytes: approvalBytes,
    });
    expect(field.state).toBe("PRESENT_UNVERIFIED");
    expect(await prisma.constructionOpenLoopEvidence.count({
      where: { loopId: fixture.loopId },
    })).toBe(2);

    const fieldView = await constructionSharedCockpitForUser({
      userId: fixture.fieldId,
      workspaceId: fixture.workspaceId,
    });
    const fieldJson = JSON.stringify(fieldView);
    expect(fieldView.permissions.canAddEvidence).toBe(true);
    expect(fieldJson).not.toContain("120000");
    expect(fieldJson).not.toContain("amountMinor");
    expect(fieldJson).not.toContain("invoiceReference");
  });
});
