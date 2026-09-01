import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import {
  calendarConnectorStatusForUser,
  prepareCalendarConnector,
  revokeCalendarConnector,
} from "@/server/construction-operating-assistant-r3/connectors";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: { name: `R3 ${label}`, email: `r3-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R3 ${label}` });
  return { userId: owner.id, workspaceId: workspace.workspaceId };
}

describe("Construction Operating Assistant R3 connector authority on PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("prepares exactly one account and operation across replay without transport", async () => {
    const f = await fixture("prepare");
    const command = {
      schemaVersion: 1,
      action: "PREPARE_CONNECTION",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      mode: "READ_ONLY",
    } as const;
    const first = await prepareCalendarConnector({ userId: f.userId, command });
    const replay = await prepareCalendarConnector({ userId: f.userId, command });
    expect(first.status).toBe("PREPARED");
    expect(first.authorizationUrl).toBeNull();
    expect(first.externalTransportPerformed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.operationId).toBe(first.operationId);
    expect(await prisma.constructionConnectorAccount.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionConnectorGrant.count({ where: { connectorAccountId: first.accountId } })).toBe(1);
    await expect(prisma.constructionConnectorAccount.update({
      where: { id: first.accountId },
      data: { status: "connected" },
    })).rejects.toThrow();
    await expect(prisma.constructionConnectorOperation.update({
      where: { id: first.operationId },
      data: { externalTransportPerformed: true },
    })).rejects.toThrow();
    await expect(prepareCalendarConnector({
      userId: f.userId,
      command: { ...command, mode: "READ_WRITE" },
    })).rejects.toThrow("CONNECTOR_IDEMPOTENCY_INPUT_MISMATCH");
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("converges concurrent copies of the same preparation command", async () => {
    const f = await fixture("concurrent");
    const command = {
      schemaVersion: 1,
      action: "PREPARE_CONNECTION",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      mode: "READ_WRITE",
    } as const;
    const [a, b] = await Promise.all([
      prepareCalendarConnector({ userId: f.userId, command }),
      prepareCalendarConnector({ userId: f.userId, command }),
    ]);
    expect(new Set([a.operationId, b.operationId]).size).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(await prisma.constructionConnectorAccount.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
  });

  it("keeps prepared authority disabled and revokes it locally and idempotently", async () => {
    const f = await fixture("revoke");
    const prepared = await prepareCalendarConnector({
      userId: f.userId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_CONNECTION",
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        mode: "READ_WRITE",
      },
    });
    const before = await calendarConnectorStatusForUser(f);
    expect(before.status).toBe("PREPARED");
    expect(before.readEnabled).toBe(false);
    expect(before.writeEnabled).toBe(false);
    const command = {
      schemaVersion: 1,
      action: "REVOKE_LOCAL",
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
    } as const;
    const first = await revokeCalendarConnector({ userId: f.userId, command });
    const replay = await revokeCalendarConnector({ userId: f.userId, command });
    expect(first.localAccessDisabled).toBe(true);
    expect(first.providerRevocationPerformed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.operationId).toBe(first.operationId);
    const after = await calendarConnectorStatusForUser(f);
    expect(after.status).toBe("REVOKED");
    expect(after.grantedScopes).toEqual([]);
    expect(after.credentialStored).toBe(false);
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({ where: { id: prepared.accountId } });
    expect(account.credentialRef).toBeNull();
    expect(account.syncCursorRef).toBeNull();
    const operation = await prisma.constructionConnectorOperation.findUniqueOrThrow({
      where: { id: first.operationId },
    });
    expect(operation.resultHash).toBe(sha256Canonical(operation.result));
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } })).toBe(0);
  });

  it("refuses cross-workspace status and connector management", async () => {
    const first = await fixture("isolation-a");
    const second = await fixture("isolation-b");
    await expect(calendarConnectorStatusForUser({ userId: second.userId, workspaceId: first.workspaceId }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(prepareCalendarConnector({
      userId: second.userId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_CONNECTION",
        commandId: crypto.randomUUID(),
        workspaceId: first.workspaceId,
        mode: "READ_ONLY",
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });

  it("allows members to inspect status but only owners or admins to manage it", async () => {
    const owner = await fixture("roles");
    const member = await prisma.user.create({
      data: { name: "R3 member", email: `r3-member-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
    });
    await prisma.constructionWorkspaceMember.create({
      data: { workspaceId: owner.workspaceId, userId: member.id, role: "member", status: "active" },
    });
    expect((await calendarConnectorStatusForUser({ userId: member.id, workspaceId: owner.workspaceId })).status)
      .toBe("NOT_CONFIGURED");
    await expect(prepareCalendarConnector({
      userId: member.id,
      command: {
        schemaVersion: 1,
        action: "PREPARE_CONNECTION",
        commandId: crypto.randomUUID(),
        workspaceId: owner.workspaceId,
        mode: "READ_ONLY",
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
