import "server-only";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { appendConstructionAudit } from "./audit";

export class ConstructionAccessDenied extends Error {
  constructor() {
    super("CONSTRUCTION_RESOURCE_NOT_FOUND");
    this.name = "ConstructionAccessDenied";
  }
}

export async function requireActiveConstructionMember(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await tx.constructionWorkspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });
  if (membership?.status !== "active") throw new ConstructionAccessDenied();
  return membership;
}

export async function initializeConstructionWorkspace(input: {
  userId: string;
  name: string;
  timezone?: string;
  locale?: string;
}) {
  return prisma.$transaction((tx) => initializeConstructionWorkspaceTx(tx, input), { isolationLevel: "Serializable" });
}

export async function initializeConstructionWorkspaceTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; name: string; timezone?: string; locale?: string },
) {
    const existing = await tx.constructionWorkspaceMember.findFirst({
      where: { userId: input.userId, status: "active" },
      select: { workspaceId: true },
    });
    if (existing) return { workspaceId: existing.workspaceId, created: false };

    const workspace = await tx.constructionWorkspace.create({
      data: {
        ownerUserId: input.userId,
        name: input.name,
        defaultTimezone: input.timezone ?? "America/Toronto",
        defaultLocale: input.locale ?? "fr-CA",
        members: {
          create: { userId: input.userId, role: "owner", status: "active" },
        },
      },
      select: { id: true },
    });

    await tx.constructionCommunicationIdentity.createMany({
      data: [
        {
          workspaceId: workspace.id,
          userId: input.userId,
          channel: "portal",
          normalizedAddress: `user:${input.userId}`,
          verified: true,
          permissions: ["REPORT", "ASK", "COMMAND"],
        },
        {
          workspaceId: workspace.id,
          userId: input.userId,
          channel: "sms",
          normalizedAddress: `sim-sms:${input.userId}`,
          verified: true,
          permissions: ["REPORT", "ASK", "COMMAND"],
        },
        {
          workspaceId: workspace.id,
          userId: input.userId,
          channel: "email",
          normalizedAddress: `sim-email:${input.userId}`,
          verified: true,
          permissions: ["REPORT", "ASK", "COMMAND"],
        },
      ],
    });

    await appendConstructionAudit(tx, {
      workspaceId: workspace.id,
      actorUserId: input.userId,
      entityType: "workspace",
      entityId: workspace.id,
      action: "construction_workspace_initialized",
      metadata: { locale: input.locale ?? "fr-CA", timezone: input.timezone ?? "America/Toronto" },
    });
    return { workspaceId: workspace.id, created: true };
}

export async function createConstructionProject(input: {
  userId: string;
  workspaceId: string;
  code: string;
  name: string;
  address?: string;
}) {
  return prisma.$transaction((tx) => createConstructionProjectTx(tx, input), { isolationLevel: "Serializable" });
}

export async function createConstructionProjectTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; workspaceId: string; code: string; name: string; address?: string },
) {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const workspace = await tx.constructionWorkspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { defaultTimezone: true },
    });
    const project = await tx.constructionProject.create({
      data: {
        workspaceId: input.workspaceId,
        code: input.code.trim().toLocaleUpperCase("fr-CA"),
        name: input.name.trim(),
        address: input.address?.trim() || null,
        timezone: workspace.defaultTimezone,
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      entityType: "project",
      entityId: project.id,
      action: "construction_project_created",
      metadata: { code: input.code.trim().toLocaleUpperCase("fr-CA") },
    });
    return project;
}

export async function createConstructionContact(input: {
  userId: string;
  workspaceId: string;
  projectId?: string;
  displayName: string;
  role?: string;
  normalizedPhone?: string;
  normalizedEmail?: string;
}) {
  return prisma.$transaction((tx) => createConstructionContactTx(tx, input), { isolationLevel: "Serializable" });
}

export async function createConstructionContactTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; workspaceId: string; projectId?: string; displayName: string; role?: string; normalizedPhone?: string; normalizedEmail?: string },
) {
    await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    if (input.projectId) {
      const project = await tx.constructionProject.findFirst({
        where: { id: input.projectId, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!project) throw new ConstructionAccessDenied();
    }
    const contact = await tx.constructionContact.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId || null,
        displayName: input.displayName.trim(),
        role: input.role?.trim() || null,
        normalizedPhone: input.normalizedPhone?.trim() || null,
        normalizedEmail: input.normalizedEmail?.trim().toLocaleLowerCase("en-CA") || null,
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      entityType: "contact",
      entityId: contact.id,
      action: "construction_contact_created",
      metadata: { projectScoped: Boolean(input.projectId) },
    });
    return contact;
}

export async function constructionWorkspaceForUser(userId: string) {
  return prisma.constructionWorkspace.findFirst({
    where: { members: { some: { userId, status: "active" } }, status: "active" },
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
          address: true,
          _count: { select: { contacts: true, calendarItems: true } },
        },
      },
    },
  });
}

export async function constructionProjectForUser(userId: string, projectId: string) {
  return prisma.constructionProject.findFirst({
    where: {
      id: projectId,
      workspace: { members: { some: { userId, status: "active" } } },
    },
    select: {
      id: true,
      workspaceId: true,
      code: true,
      name: true,
      address: true,
      timezone: true,
      contacts: {
        where: { status: "active" },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, role: true, normalizedPhone: true, normalizedEmail: true },
      },
      calendarItems: {
        orderBy: { startsAt: "asc" },
        take: 20,
        select: { id: true, title: true, startsAt: true, timezone: true, verificationState: true },
      },
    },
  });
}
