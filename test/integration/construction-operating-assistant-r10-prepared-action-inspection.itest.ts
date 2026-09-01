import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { preparedActionInspectionSchema } from "@/lib/construction-operating-assistant-r10/prepared-action-contracts";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { constructionSharedCockpitForUser } from "@/server/construction-operating-assistant-r7/gateway";

describe("Construction Operating Assistant R10 inspection on disposable PostgreSQL", () => {
  it("shows the exact draft only to an authorized office role", async () => {
    const owner = await prisma.user.create({
      data: {
        name: "R10 owner",
        email: `r10-owner-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const field = await prisma.user.create({
      data: {
        name: "R10 field",
        email: `r10-field-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const outsider = await prisma.user.create({
      data: {
        name: "R10 outsider",
        email: `r10-outsider-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const workspace = await initializeConstructionWorkspace({
      userId: owner.id,
      name: "R10 Construction",
    });
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
      code: "LAVAL-001",
      name: "Rénovation Laval",
    });
    await createConstructionContact({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      projectId: project.id,
      displayName: "Marc",
      role: "Fournisseur synthétique",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc-r10@example.invalid",
    });

    const prepared = await processConstructionMessage({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      channel: "portal",
      body: "Texte Marc que je serai 30 minutes en retard.",
      idempotencyKey: `r10-${crypto.randomUUID()}`,
      referenceNow: new Date("2026-09-01T13:00:00.000Z"),
    });
    expect(prepared.actionId).toBeTruthy();

    const ownerCockpit = await constructionSharedCockpitForUser({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
    });
    const ownerAction = ownerCockpit.actions.find(
      (candidate) => candidate.id === prepared.actionId,
    );
    if (!ownerAction || !("payload" in ownerAction)) {
      throw new Error("R10_OWNER_ACTION_MISSING");
    }
    const inspection = preparedActionInspectionSchema.parse(ownerAction.payload);
    expect(inspection).toMatchObject({
      recipient: "+15555550184",
      channel: "SMS",
      state: "PREPARED_UNSENT",
      provenance: { channel: "portal", direction: "inbound" },
      externalTransportPerformed: false,
    });

    const fieldCockpit = await constructionSharedCockpitForUser({
      userId: field.id,
      workspaceId: workspace.workspaceId,
    });
    const fieldJson = JSON.stringify(fieldCockpit);
    expect(fieldJson).not.toContain("+15555550184");
    expect(fieldJson).not.toContain(inspection.body);
    expect(fieldJson).not.toContain(inspection.fingerprint);
    expect(fieldJson).not.toContain("sourceMessageId");

    await expect(
      constructionSharedCockpitForUser({
        userId: outsider.id,
        workspaceId: workspace.workspaceId,
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(
      await prisma.constructionConnectorOperation.count({
        where: {
          workspaceId: workspace.workspaceId,
          externalTransportPerformed: true,
        },
      }),
    ).toBe(0);
  });
});
