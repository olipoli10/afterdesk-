import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { prepareCalendarConnector } from "@/server/construction-operating-assistant-r3/connectors";
import { prepareCommunicationChannel } from "@/server/construction-operating-assistant-r4/connectors";
import {
  constructionPermissionCenterForUser,
  revokeConstructionPermission,
} from "@/server/construction-operating-assistant-r16/permissions";

async function setup(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R16 owner ${label}`,
      email: `r16-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const office = await prisma.user.create({
    data: {
      name: `R16 office ${label}`,
      email: `r16-office-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R16 field ${label}`,
      email: `r16-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R16 outsider ${label}`,
      email: `r16-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R16 Construction ${label}`,
  });
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    ],
  });
  const calendar = await prepareCalendarConnector({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_CONNECTION",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      mode: "READ_WRITE",
    },
  });
  const sms = await prepareCommunicationChannel({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_CHANNEL",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      channel: "SMS",
    },
  });
  return {
    ownerId: owner.id,
    officeId: office.id,
    fieldId: field.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    calendarAccountId: calendar.accountId,
    smsAccountId: sms.accountId,
  };
}

describe("Construction Operating Assistant R16 permission center on PostgreSQL", () => {
  it("projects exact owner/office authority and only the field worker's non-financial authority", async () => {
    const fixture = await setup("projection");
    const generatedAt = new Date("2026-09-01T22:30:00.000Z");
    const owner = await constructionPermissionCenterForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      generatedAt,
    });
    expect(owner.currentUser.role).toBe("OWNER");
    expect(owner.members).toHaveLength(3);
    expect(owner.connectors).toHaveLength(2);
    expect(owner.connectors.every((connector) => connector.state === "PREPARED_DISABLED")).toBe(true);
    expect(owner.externalTransportEnabled).toBe(false);
    const serialized = JSON.stringify(owner);
    expect(serialized).not.toContain("credentialRef");
    expect(serialized).not.toContain("externalAccountKeyHash");
    expect(serialized).not.toContain("syncCursorRef");

    const office = await constructionPermissionCenterForUser({
      userId: fixture.officeId,
      workspaceId: fixture.workspaceId,
      generatedAt,
    });
    expect(office.currentUser.role).toBe("OFFICE_MANAGER");
    expect(office.canManageConnectors).toBe(true);

    const field = await constructionPermissionCenterForUser({
      userId: fixture.fieldId,
      workspaceId: fixture.workspaceId,
      generatedAt,
    });
    expect(field.currentUser.role).toBe("FIELD_WORKER");
    expect(field.members).toHaveLength(1);
    expect(field.members[0]?.userId).toBe(fixture.fieldId);
    expect(field.connectors).toEqual([]);
    expect(JSON.stringify(field)).not.toMatch(/financial|receivable/i);
  });

  it("revokes one grant atomically and converges concurrent replay to one operation", async () => {
    const fixture = await setup("grant");
    const grant = await prisma.constructionConnectorGrant.findFirstOrThrow({
      where: { connectorAccountId: fixture.calendarAccountId, capability: "calendar_read" },
    });
    const command = {
      schemaVersion: 1,
      action: "REVOKE_GRANT_LOCAL",
      commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      accountId: fixture.calendarAccountId,
      grantId: grant.id,
      expectedStateVersion: grant.stateVersion,
    } as const;
    const [first, second] = await Promise.all([
      revokeConstructionPermission({ userId: fixture.ownerId, command }),
      revokeConstructionPermission({ userId: fixture.ownerId, command }),
    ]);
    expect(new Set([first.operationId, second.operationId]).size).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect((await prisma.constructionConnectorGrant.findUniqueOrThrow({ where: { id: grant.id } })).status)
      .toBe("revoked");
    expect(await prisma.constructionConnectorOperation.count({
      where: {
        workspaceId: fixture.workspaceId,
        kind: "local_revoke",
      },
    })).toBe(1);
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: fixture.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });

  it("revokes a complete account, its grants and local secrets without provider transport", async () => {
    const fixture = await setup("account");
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({
      where: { id: fixture.smsAccountId },
    });
    const command = {
      schemaVersion: 1,
      action: "REVOKE_ACCOUNT_LOCAL",
      commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      accountId: account.id,
      expectedStateVersion: account.stateVersion,
    } as const;
    const first = await revokeConstructionPermission({ userId: fixture.officeId, command });
    const replay = await revokeConstructionPermission({ userId: fixture.officeId, command });
    expect(first.state).toBe("REVOKED");
    expect(first.externalTransportPerformed).toBe(false);
    expect(replay.replayed).toBe(true);
    const persisted = await prisma.constructionConnectorAccount.findUniqueOrThrow({
      where: { id: account.id },
      include: { grants: true },
    });
    expect(persisted.status).toBe("revoked");
    expect(persisted.credentialRef).toBeNull();
    expect(persisted.externalAccountKeyHash).toBeNull();
    expect(persisted.syncCursorRef).toBeNull();
    expect(persisted.grants.every((grant) => grant.status === "revoked")).toBe(true);
    const refreshed = await constructionPermissionCenterForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
    });
    expect(refreshed.connectors.find((connector) => connector.id === account.id)?.state).toBe("REVOKED");
  });

  it("refuses stale, cross-workspace, field and idempotency-drift revocation", async () => {
    const first = await setup("guards-a");
    const second = await setup("guards-b");
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({
      where: { id: first.smsAccountId },
    });
    const base = {
      schemaVersion: 1,
      action: "REVOKE_ACCOUNT_LOCAL",
      commandId: crypto.randomUUID(),
      workspaceId: first.workspaceId,
      accountId: account.id,
      expectedStateVersion: account.stateVersion,
    } as const;
    await expect(revokeConstructionPermission({
      userId: first.ownerId,
      command: { ...base, expectedStateVersion: account.stateVersion + 99 },
    })).rejects.toThrow("PERMISSION_REVOCATION_STALE_STATE");
    await expect(revokeConstructionPermission({ userId: first.fieldId, command: base }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(revokeConstructionPermission({ userId: second.ownerId, command: base }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    const applied = await revokeConstructionPermission({ userId: first.ownerId, command: base });
    expect(applied.replayed).toBe(false);
    await expect(revokeConstructionPermission({
      userId: first.ownerId,
      command: {
        ...base,
        accountId: first.calendarAccountId,
        expectedStateVersion: 1,
      },
    })).rejects.toThrow("PERMISSION_REVOCATION_IDEMPOTENCY_CONFLICT");
    await expect(constructionPermissionCenterForUser({
      userId: first.outsiderId,
      workspaceId: first.workspaceId,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });
});
