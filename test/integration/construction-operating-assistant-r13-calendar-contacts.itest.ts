import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { constructionSharedCockpitForUser } from "@/server/construction-operating-assistant-r7/gateway";

describe("Construction Operating Assistant R13 Calendar and Contacts on disposable PostgreSQL", () => {
  it("projects the exact project/contact/calendar state without field-worker private coordinates", async () => {
    const owner = await prisma.user.create({
      data: {
        name: "R13 owner",
        email: `r13-owner-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const fieldWorker = await prisma.user.create({
      data: {
        name: "R13 field worker",
        email: `r13-field-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const outsider = await prisma.user.create({
      data: {
        name: "R13 outsider",
        email: `r13-outsider-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const workspace = await initializeConstructionWorkspace({
      userId: owner.id,
      name: "R13 Construction",
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: workspace.workspaceId,
        userId: fieldWorker.id,
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
      role: "Fournisseur",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc-r13@example.invalid",
    });
    const result = await processConstructionMessage({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
      channel: "portal",
      body: "Rendez-vous avec Marc mardi à 14 h pour Rénovation Laval.",
      idempotencyKey: `r13-${crypto.randomUUID()}`,
      referenceNow: new Date("2026-09-01T13:00:00.000Z"),
    });
    expect(result.intent).toBe("CALENDAR_ITEM_CREATE");
    expect(result.calendarItemId).toBeTruthy();

    const ownerView = await constructionSharedCockpitForUser({
      userId: owner.id,
      workspaceId: workspace.workspaceId,
    });
    const fieldView = await constructionSharedCockpitForUser({
      userId: fieldWorker.id,
      workspaceId: workspace.workspaceId,
    });

    expect(ownerView.contacts).toHaveLength(1);
    expect(ownerView.contacts[0]).toMatchObject({
      displayName: "Marc",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc-r13@example.invalid",
      project: { id: project.id, code: "LAVAL-001" },
    });
    expect(ownerView.calendar).toHaveLength(1);
    expect(ownerView.calendar[0]).toMatchObject({
      title: "Rendez-vous avec Marc",
      project: { id: project.id, code: "LAVAL-001" },
      contact: { displayName: "Marc" },
    });

    const fieldJson = JSON.stringify(fieldView);
    expect(fieldView.contacts[0]).toMatchObject({
      displayName: "Marc",
      project: { id: project.id, code: "LAVAL-001" },
    });
    expect(fieldJson).not.toContain("+15555550184");
    expect(fieldJson).not.toContain("marc-r13@example.invalid");
    expect(fieldJson).not.toContain("normalizedPhone");
    expect(fieldJson).not.toContain("normalizedEmail");
    expect(fieldView.calendar[0]).not.toHaveProperty("title");

    await expect(
      constructionSharedCockpitForUser({
        userId: outsider.id,
        workspaceId: workspace.workspaceId,
      }),
    ).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
