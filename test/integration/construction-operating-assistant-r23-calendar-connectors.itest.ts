import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import {
  calendarConnectorCockpitForUser,
  canonicalCalendarItemFingerprint,
  prepareCalendarConnectionR23,
  prepareCalendarWorkR23,
  revokeCalendarConnectionR23,
} from "@/server/construction-operating-assistant-r23/connectors";

async function setup(label: string) {
  const owner = await prisma.user.create({
    data: {
      name: `R23 owner ${label}`,
      email: `r23-owner-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const office = await prisma.user.create({
    data: {
      name: `R23 office ${label}`,
      email: `r23-office-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const field = await prisma.user.create({
    data: {
      name: `R23 field ${label}`,
      email: `r23-field-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const outsider = await prisma.user.create({
    data: {
      name: `R23 outsider ${label}`,
      email: `r23-outsider-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R23 Construction ${label}`,
  });
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
    ],
  });
  return {
    ownerId: owner.id,
    officeId: office.id,
    fieldId: field.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
  };
}

function prepareCommand(
  workspaceId: string,
  provider: "google_calendar" | "microsoft_calendar",
  mode: "READ_ONLY" | "READ_WRITE",
) {
  return {
    schemaVersion: 1,
    action: "PREPARE_CONNECTION",
    commandId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId,
    provider,
    mode,
    expectedStateVersion: 0,
  } as const;
}

describe("Construction Operating Assistant R23 calendar connectors on PostgreSQL", () => {
  it("prepares Google and Microsoft independently with exact replay and concurrency", async () => {
    const fixture = await setup("prepare");
    const googleCommand = prepareCommand(fixture.workspaceId, "google_calendar", "READ_ONLY");
    const microsoftCommand = prepareCommand(
      fixture.workspaceId,
      "microsoft_calendar",
      "READ_WRITE",
    );
    const google = await prepareCalendarConnectionR23({
      userId: fixture.ownerId,
      command: googleCommand,
    });
    const [microsoftA, microsoftB] = await Promise.all([
      prepareCalendarConnectionR23({ userId: fixture.officeId, command: microsoftCommand }),
      prepareCalendarConnectionR23({ userId: fixture.officeId, command: microsoftCommand }),
    ]);
    const googleReplay = await prepareCalendarConnectionR23({
      userId: fixture.ownerId,
      command: googleCommand,
    });

    expect(google.requestedScopes).toEqual([
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ]);
    expect(googleReplay).toMatchObject({ operationId: google.operationId, replayed: true });
    expect(new Set([microsoftA.operationId, microsoftB.operationId]).size).toBe(1);
    expect([microsoftA.replayed, microsoftB.replayed].sort()).toEqual([false, true]);
    expect(microsoftA.requestedScopes).toEqual(["Calendars.ReadWrite"]);
    expect(await prisma.constructionConnectorAccount.count({
      where: { workspaceId: fixture.workspaceId },
    })).toBe(2);
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: fixture.workspaceId, externalTransportPerformed: true },
    })).toBe(0);

    const cockpit = await calendarConnectorCockpitForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
    });
    expect(cockpit.providers.map((provider) => provider.provider)).toEqual([
      "google_calendar",
      "microsoft_calendar",
    ]);
    expect(cockpit.providers.every((provider) => provider.status === "PREPARED")).toBe(true);
    expect(JSON.stringify(cockpit)).not.toMatch(/credentialRef|syncCursorRef|externalAccountKeyHash/);

    const field = await calendarConnectorCockpitForUser({
      userId: fixture.fieldId,
      workspaceId: fixture.workspaceId,
    });
    expect(field.providers).toEqual([]);
    await expect(calendarConnectorCockpitForUser({
      userId: fixture.outsiderId,
      workspaceId: fixture.workspaceId,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
  });

  it("refuses stale, changed-content, field and cross-workspace preparation atomically", async () => {
    const first = await setup("guards-a");
    const second = await setup("guards-b");
    const command = prepareCommand(first.workspaceId, "microsoft_calendar", "READ_ONLY");
    await expect(prepareCalendarConnectionR23({
      userId: first.ownerId,
      command: { ...command, expectedStateVersion: 2 },
    })).rejects.toThrow("CALENDAR_CONNECTOR_STALE_STATE");
    await expect(prepareCalendarConnectionR23({ userId: first.fieldId, command }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(prepareCalendarConnectionR23({ userId: second.ownerId, command }))
      .rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    await prepareCalendarConnectionR23({ userId: first.ownerId, command });
    await expect(prepareCalendarConnectionR23({
      userId: first.ownerId,
      command: { ...command, mode: "READ_WRITE" },
    })).rejects.toThrow("CALENDAR_CONNECTOR_IDEMPOTENCY_CONFLICT");
    expect(await prisma.constructionConnectorAccount.count({
      where: { workspaceId: first.workspaceId, provider: "microsoft_calendar" },
    })).toBe(1);
  });

  it("prepares safe sync and canonical write work only for synthetic connected authority", async () => {
    const fixture = await setup("work");
    const prepared = await prepareCalendarConnectionR23({
      userId: fixture.ownerId,
      command: prepareCommand(fixture.workspaceId, "microsoft_calendar", "READ_WRITE"),
    });
    await prisma.constructionConnectorAccount.update({
      where: { id: prepared.accountId },
      data: {
        status: "connected",
        grantedScopes: ["Calendars.ReadWrite"],
        credentialRef: "secret://synthetic-r23/credential",
        syncCursorRef: "secret://synthetic-r23/cursor",
        externalAccountKeyHash: "a".repeat(64),
        connectedAt: new Date("2026-09-02T00:00:00.000Z"),
        stateVersion: { increment: 1 },
      },
    });
    await prisma.constructionConnectorGrant.updateMany({
      where: { connectorAccountId: prepared.accountId },
      data: {
        status: "active",
        grantedScopes: ["Calendars.ReadWrite"],
        grantedAt: new Date("2026-09-02T00:00:00.000Z"),
        stateVersion: { increment: 1 },
      },
    });
    const account = await prisma.constructionConnectorAccount.findUniqueOrThrow({
      where: { id: prepared.accountId },
    });
    const project = await prisma.constructionProject.create({
      data: {
        workspaceId: fixture.workspaceId,
        code: `R23-${crypto.randomUUID()}`,
        name: "Rénovation Laval",
        timezone: "America/Toronto",
      },
    });
    const message = await prisma.constructionMessage.create({
      data: {
        workspaceId: fixture.workspaceId,
        projectId: project.id,
        direction: "inbound",
        channel: "portal",
        idempotencyKey: crypto.randomUUID(),
        recipients: [],
        originalBody: "Rendez-vous mardi à 14 h.",
        normalizedBody: "Rendez-vous mardi à 14 h.",
      },
    });
    const item = await prisma.constructionCalendarItem.create({
      data: {
        workspaceId: fixture.workspaceId,
        projectId: project.id,
        sourceMessageId: message.id,
        type: "meeting",
        title: "Visite chantier Laval",
        startsAt: new Date("2026-09-08T18:00:00.000Z"),
        endsAt: new Date("2026-09-08T19:00:00.000Z"),
        timezone: "America/Toronto",
        confidence: 1,
        verificationState: "verified",
      },
    });
    const fingerprint = canonicalCalendarItemFingerprint(item);
    const syncCommand = {
      schemaVersion: 1,
      action: "PREPARE_SYNC",
      commandId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      provider: "microsoft_calendar",
      expectedStateVersion: account.stateVersion,
      accountId: account.id,
      rangeStartsAt: "2026-09-01T00:00:00.000Z",
      rangeEndsAt: "2026-10-01T00:00:00.000Z",
      timezone: "America/Toronto",
    } as const;
    const sync = await prepareCalendarWorkR23({ userId: fixture.ownerId, command: syncCommand });
    const syncReplay = await prepareCalendarWorkR23({
      userId: fixture.ownerId,
      command: syncCommand,
    });
    expect(sync).toMatchObject({
      kind: "SYNC_READ",
      cursorReferencePresent: true,
      providerExecutionAvailable: false,
      externalTransportPerformed: false,
    });
    expect(syncReplay).toMatchObject({ operationId: sync.operationId, replayed: true });

    const write = await prepareCalendarWorkR23({
      userId: fixture.officeId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_WRITE",
        commandId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        provider: "microsoft_calendar",
        expectedStateVersion: account.stateVersion,
        accountId: account.id,
        operation: "CREATE",
        calendarItemId: item.id,
        canonicalFingerprint: fingerprint,
        remoteEventRefHash: null,
        remotePreconditionHash: null,
      },
    });
    expect(write).toMatchObject({
      kind: "CREATE_EVENT",
      canonicalFingerprint: fingerprint,
      remotePreconditionRequired: false,
      providerExecutionAvailable: false,
      externalTransportPerformed: false,
    });
    await expect(prepareCalendarWorkR23({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "PREPARE_WRITE",
        commandId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        provider: "microsoft_calendar",
        expectedStateVersion: account.stateVersion,
        accountId: account.id,
        operation: "CREATE",
        calendarItemId: item.id,
        canonicalFingerprint: "b".repeat(64),
        remoteEventRefHash: null,
        remotePreconditionHash: null,
      },
    })).rejects.toThrow("CALENDAR_CANONICAL_FINGERPRINT_MISMATCH");
  });

  it("revokes one provider exactly, preserves the other and refuses later work", async () => {
    const fixture = await setup("revoke");
    const google = await prepareCalendarConnectionR23({
      userId: fixture.ownerId,
      command: prepareCommand(fixture.workspaceId, "google_calendar", "READ_ONLY"),
    });
    const microsoft = await prepareCalendarConnectionR23({
      userId: fixture.ownerId,
      command: prepareCommand(fixture.workspaceId, "microsoft_calendar", "READ_ONLY"),
    });
    const command = {
      schemaVersion: 1,
      action: "REVOKE_LOCAL",
      commandId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      provider: "google_calendar",
      expectedStateVersion: 1,
    } as const;
    const [first, second] = await Promise.all([
      revokeCalendarConnectionR23({ userId: fixture.ownerId, command }),
      revokeCalendarConnectionR23({ userId: fixture.ownerId, command }),
    ]);
    expect(new Set([first.operationId, second.operationId]).size).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const accounts = await prisma.constructionConnectorAccount.findMany({
      where: { workspaceId: fixture.workspaceId },
      orderBy: { provider: "asc" },
    });
    expect(accounts.find((account) => account.id === google.accountId)).toMatchObject({
      status: "revoked",
      credentialRef: null,
      syncCursorRef: null,
      grantedScopes: [],
    });
    expect(accounts.find((account) => account.id === microsoft.accountId)?.status).toBe("prepared");
    const cockpit = await calendarConnectorCockpitForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
    });
    expect(cockpit.providers.find((provider) => provider.provider === "google_calendar")?.status)
      .toBe("REVOKED");
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: fixture.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });
});
