import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { constructionMobileBootstrapForUser } from "@/server/construction-operating-assistant-r8/bootstrap";

describe("Construction Operating Assistant R8 mobile bootstrap on disposable PostgreSQL", () => {
  it("returns only active server-derived memberships and never grants transport", async () => {
    const user = await prisma.user.create({
      data: {
        name: "R8 mobile owner",
        email: `r8-owner-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const fieldWorker = await prisma.user.create({
      data: {
        name: "R8 mobile field worker",
        email: `r8-field-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const active = await initializeConstructionWorkspace({
      userId: user.id,
      name: "R8 Active Construction",
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: active.workspaceId,
        userId: fieldWorker.id,
        role: "member",
        status: "active",
      },
    });
    const revokedOwner = await prisma.user.create({
      data: {
        name: "R8 revoked owner",
        email: `r8-revoked-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const revoked = await initializeConstructionWorkspace({
      userId: revokedOwner.id,
      name: "R8 Revoked Construction",
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: revoked.workspaceId,
        userId: user.id,
        role: "admin",
        status: "revoked",
      },
    });
    const archivedOwner = await prisma.user.create({
      data: {
        name: "R8 archived owner",
        email: `r8-archived-${crypto.randomUUID()}@example.invalid`,
        role: "CLIENT",
      },
    });
    const archived = await initializeConstructionWorkspace({
      userId: archivedOwner.id,
      name: "R8 Archived Construction",
    });
    await prisma.constructionWorkspaceMember.create({
      data: {
        workspaceId: archived.workspaceId,
        userId: user.id,
        role: "admin",
        status: "active",
      },
    });
    await prisma.constructionWorkspace.update({
      where: { id: archived.workspaceId },
      data: { status: "archived" },
    });

    const ownerView = await constructionMobileBootstrapForUser({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    });
    expect(ownerView.workspaces).toHaveLength(1);
    expect(ownerView.workspaces[0]).toMatchObject({
      id: active.workspaceId,
      role: "OWNER",
      permissions: {
        financialsVisible: true,
        canManageReceivables: true,
        externalTransportAuthorized: false,
      },
    });

    const fieldView = await constructionMobileBootstrapForUser({
      userId: fieldWorker.id,
      userName: fieldWorker.name,
      userEmail: fieldWorker.email,
    });
    expect(fieldView.workspaces).toHaveLength(1);
    expect(fieldView.workspaces[0]).toMatchObject({
      id: active.workspaceId,
      role: "FIELD_WORKER",
      permissions: {
        financialsVisible: false,
        canManageReceivables: false,
        canScheduleFollowUps: false,
        canApprovePreparedActions: false,
        canAddEvidence: true,
        externalTransportAuthorized: false,
      },
    });

    const serialized = JSON.stringify(fieldView);
    expect(serialized).not.toContain("amountMinor");
    expect(serialized).not.toContain("invoiceReference");
    expect(serialized).not.toContain("normalizedPhone");
    expect(serialized).not.toContain("sessionToken");
    expect(
      await prisma.constructionConnectorOperation.count({
        where: { externalTransportPerformed: true },
      }),
    ).toBe(0);
  });
});
