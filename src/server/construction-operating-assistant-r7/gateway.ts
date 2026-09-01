import "server-only";

import {
  CONSTRUCTION_SHARED_API_VERSION,
  constructionSharedApiCommandSchema,
  type ConstructionSharedApiCommand,
} from "@/lib/construction-operating-assistant-r7/api-contracts";
import { prisma } from "@/lib/db";
import {
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";
import {
  constructionReceivablesForRole,
  recordConstructionReceivable,
  recordConstructionReceivablePayment,
  scheduleConstructionFollowUp,
} from "@/server/construction-operating-assistant-r6/receivables";
import { projectOwnerConstructionAction } from "@/server/construction-operating-assistant-r10/projection";

export function constructionProjectionRole(role: "owner" | "admin" | "member") {
  return role === "owner"
    ? ("OWNER" as const)
    : role === "admin"
      ? ("OFFICE_MANAGER" as const)
      : ("FIELD_WORKER" as const);
}

export function constructionPermissionsForRole(
  role: "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER",
) {
  const financialsVisible = role !== "FIELD_WORKER";
  return {
    financialsVisible,
    canManageReceivables: role !== "FIELD_WORKER",
    canScheduleFollowUps: role !== "FIELD_WORKER",
    canApprovePreparedActions: role !== "FIELD_WORKER",
    externalTransportAuthorized: false as const,
  };
}

export async function processConstructionSharedApiCommand(input: {
  userId: string;
  command: ConstructionSharedApiCommand | unknown;
}) {
  const command = constructionSharedApiCommandSchema.parse(input.command);
  switch (command.type) {
    case "RECORD_RECEIVABLE": {
      const result = await recordConstructionReceivable({
        schemaVersion: 1,
        requestId: command.requestId,
        actorId: input.userId,
        ...command.payload,
      });
      return {
        schemaVersion: CONSTRUCTION_SHARED_API_VERSION,
        requestId: command.requestId,
        resultType: "RECEIVABLE_RECORDED" as const,
        replayed: result.replayed,
        data: result,
      };
    }
    case "RECORD_PAYMENT": {
      const result = await recordConstructionReceivablePayment({
        schemaVersion: 1,
        actorId: input.userId,
        ...command.payload,
      });
      return {
        schemaVersion: CONSTRUCTION_SHARED_API_VERSION,
        requestId: command.requestId,
        resultType: "PAYMENT_RECORDED" as const,
        replayed: result.replayed,
        data: result,
      };
    }
    case "SCHEDULE_FOLLOW_UP": {
      const result = await scheduleConstructionFollowUp({
        schemaVersion: 1,
        requestId: command.requestId,
        actorId: input.userId,
        ...command.payload,
      });
      return {
        schemaVersion: CONSTRUCTION_SHARED_API_VERSION,
        requestId: command.requestId,
        resultType: "FOLLOW_UP_SCHEDULED" as const,
        replayed: result.replayed,
        data: result,
      };
    }
  }
}

export async function constructionSharedCockpitForUser(input: {
  userId: string;
  workspaceId: string;
}) {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  const role = constructionProjectionRole(membership.role);
  const permissions = constructionPermissionsForRole(role);
  const financialsVisible = permissions.financialsVisible;

  const [workspace, contacts, calendarItems, openLoops, actions, receivables] =
    await Promise.all([
      prisma.constructionWorkspace.findFirst({
        where: { id: input.workspaceId, status: "active" },
        select: {
          id: true,
          name: true,
          defaultTimezone: true,
          defaultLocale: true,
          projects: {
            where: { status: "active" },
            orderBy: [{ name: "asc" }, { code: "asc" }],
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              _count: {
                select: {
                  contacts: true,
                  calendarItems: true,
                  openLoops: true,
                },
              },
            },
          },
        },
      }),
      prisma.constructionContact.findMany({
        where: { workspaceId: input.workspaceId, status: "active" },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        take: 200,
        select: {
          id: true,
          displayName: true,
          companyName: true,
          role: true,
          normalizedPhone: true,
          normalizedEmail: true,
          preferredLanguage: true,
          project: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.constructionCalendarItem.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          verificationState: true,
          project: { select: { id: true, code: true, name: true } },
          contact: { select: { id: true, displayName: true } },
        },
      }),
      prisma.constructionOpenLoop.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          status: true,
          dueAt: true,
          nextResponsibleRole: true,
          nextAction: true,
          stateVersion: true,
          project: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.constructionAction.findMany({
        where: {
          workspaceId: input.workspaceId,
          status: { in: ["proposed", "approved"] },
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          type: true,
          status: true,
          dueAt: true,
          version: true,
          workspaceId: true,
          payloadHash: true,
          payload: true,
          approvalRequired: true,
          approvedVersion: true,
          approvedPayloadHash: true,
          approvedAt: true,
          simulatedDeliveryCount: true,
          project: { select: { id: true, code: true, name: true } },
          contact: { select: { id: true, displayName: true } },
          sourceMessage: {
            select: {
              id: true,
              channel: true,
              direction: true,
              receivedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      constructionReceivablesForRole({
        userId: input.userId,
        workspaceId: input.workspaceId,
        role,
      }),
    ]);

  if (!workspace) {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }

  return {
    schemaVersion: CONSTRUCTION_SHARED_API_VERSION,
    generatedAt: new Date().toISOString(),
    workspace: {
      ...workspace,
      role,
    },
    permissions,
    projects: workspace.projects,
    contacts: contacts.map((contact) =>
      financialsVisible
        ? contact
        : {
            id: contact.id,
            displayName: contact.displayName,
            companyName: contact.companyName,
            role: contact.role,
            preferredLanguage: contact.preferredLanguage,
            project: contact.project,
          },
    ),
    calendar: calendarItems.map((item) =>
      financialsVisible
        ? item
        : {
            id: item.id,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            timezone: item.timezone,
            verificationState: item.verificationState,
            project: item.project,
            contact: item.contact,
          },
    ),
    openLoops: openLoops.map((loop) =>
      financialsVisible
        ? loop
        : {
            id: loop.id,
            status: loop.status,
            dueAt: loop.dueAt,
            nextResponsibleRole: loop.nextResponsibleRole,
            stateVersion: loop.stateVersion,
            project: loop.project,
          },
    ),
    actions: actions.map((action) =>
      financialsVisible
        ? projectOwnerConstructionAction(action)
        : {
            id: action.id,
            type: action.type,
            status: action.status,
            dueAt: action.dueAt,
            version: action.version,
            project: action.project,
            contact: action.contact,
          },
    ),
    receivables,
  };
}

