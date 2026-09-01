import "server-only";

import {
  fieldProjectTimelineSchema,
  localDateKey,
  orderTimelineEvents,
  ownerProjectTimelineSchema,
  type OwnerTimelineEvent,
  type TimelineEvent,
} from "@/lib/construction-operating-assistant-r15/timeline";
import { prisma } from "@/lib/db";
import {
  constructionProjectionRole,
} from "@/server/construction-operating-assistant-r7/gateway";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const evidenceLabel = {
  written_approval: "Approbation écrite ajoutée",
  photo: "Photo du travail ajoutée",
  document: "Document ajouté",
} as const;

const actionLabel = {
  reminder: "Rappel préparé",
  follow_up: "Suivi préparé",
  outbound_message: "Message sortant préparé",
} as const;

export async function projectTimelineForUser(input: {
  userId: string;
  workspaceId: string;
  projectId: string;
  referenceNow?: Date;
}) {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  const role = constructionProjectionRole(membership.role);
  const financialsVisible = role !== "FIELD_WORKER";
  const referenceNow = input.referenceNow ?? new Date();

  const project = await prisma.constructionProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, status: "active" },
    select: {
      id: true,
      code: true,
      name: true,
      workspace: { select: { defaultTimezone: true } },
    },
  });
  if (!project) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");

  const [calendar, loops, evidence, actions, receivables] = await Promise.all([
    prisma.constructionCalendarItem.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        title: true,
        startsAt: true,
        status: true,
        verificationState: true,
        contact: { select: { displayName: true } },
      },
    }),
    prisma.constructionOpenLoop.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        desiredOutcome: true,
        status: true,
        nextResponsibleRole: true,
        nextAction: true,
        createdAt: true,
      },
    }),
    prisma.constructionOpenLoopEvidence.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: { id: true, kind: true, state: true, createdAt: true },
    }),
    prisma.constructionAction.findMany({
      where: { workspaceId: input.workspaceId, projectId: input.projectId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
        contact: { select: { displayName: true } },
      },
    }),
    financialsVisible
      ? prisma.constructionReceivable.findMany({
          where: { workspaceId: input.workspaceId, projectId: input.projectId },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 200,
          select: {
            id: true,
            invoiceReference: true,
            outstandingAmountMinor: true,
            currency: true,
            status: true,
            dueAt: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const common = {
    schemaVersion: 1 as const,
    generatedAt: referenceNow.toISOString(),
    workspaceId: input.workspaceId,
    project: { id: project.id, code: project.code, name: project.name },
    timezone: project.workspace.defaultTimezone,
    localDate: localDateKey(referenceNow, project.workspace.defaultTimezone),
  };
  const localDate = common.localDate;
  const appointmentsToday = calendar.filter(
    (item) => localDateKey(item.startsAt, common.timezone) === localDate,
  ).length;
  const activeLoops = loops.filter(
    (loop) => loop.status !== "closed" && loop.status !== "revoked",
  );
  const pendingEvidence = evidence.filter((item) => item.state === "present_unverified");
  const preparedActions = actions.filter(
    (action) => action.status === "proposed" || action.status === "approved",
  );
  const nextResponsibleRoles = [
    ...new Set(activeLoops.map((loop) => loop.nextResponsibleRole)),
  ].sort();

  const calendarEvents = calendar.map((item) => ({
    id: `calendar:${item.id}`,
    kind: "CALENDAR" as const,
    occurredAt: item.startsAt.toISOString(),
    status: `${item.status}:${item.verificationState}`,
    summary: financialsVisible ? item.title : "Rendez-vous planifié",
    detail: item.contact ? `Avec ${item.contact.displayName}` : null,
    provenance: {
      source: "CANONICAL_DATABASE" as const,
      entityType: "ConstructionCalendarItem" as const,
      entityId: item.id,
    },
  }));
  const loopEvents = loops.map((loop) => ({
    id: `loop:${loop.id}`,
    kind: "OPEN_LOOP" as const,
    occurredAt: loop.createdAt.toISOString(),
    status: loop.status,
    summary: financialsVisible ? loop.desiredOutcome : "Suivi de chantier",
    detail: financialsVisible
      ? `${loop.nextAction} · ${loop.nextResponsibleRole}`
      : `Responsable: ${loop.nextResponsibleRole}`,
    provenance: {
      source: "CANONICAL_DATABASE" as const,
      entityType: "ConstructionOpenLoop" as const,
      entityId: loop.id,
    },
  }));
  const evidenceEvents = evidence.map((item) => ({
    id: `evidence:${item.id}`,
    kind: "EVIDENCE" as const,
    occurredAt: item.createdAt.toISOString(),
    status: item.state,
    summary: evidenceLabel[item.kind],
    detail: item.state === "present_unverified" ? "Vérification encore requise" : null,
    provenance: {
      source: "CANONICAL_DATABASE" as const,
      entityType: "ConstructionOpenLoopEvidence" as const,
      entityId: item.id,
    },
  }));
  const actionEvents = actions.map((item) => ({
    id: `action:${item.id}`,
    kind: "ACTION" as const,
    occurredAt: item.createdAt.toISOString(),
    status: item.status,
    summary: financialsVisible ? actionLabel[item.type] : "Action de suivi",
    detail: item.contact ? `Contact: ${item.contact.displayName}` : null,
    provenance: {
      source: "CANONICAL_DATABASE" as const,
      entityType: "ConstructionAction" as const,
      entityId: item.id,
    },
  }));

  if (!financialsVisible) {
    const events: TimelineEvent[] = orderTimelineEvents([
      ...calendarEvents,
      ...loopEvents,
      ...evidenceEvents,
      ...actionEvents,
    ]).slice(0, 300);
    return fieldProjectTimelineSchema.parse({
      ...common,
      role,
      brief: {
        appointmentsToday,
        openLoops: activeLoops.length,
        evidencePendingVerification: pendingEvidence.length,
        preparedActions: preparedActions.length,
        nextResponsibleRoles,
        nextDecision:
          activeLoops.length > 0
            ? "CHECK_ASSIGNED_WORK"
            : appointmentsToday > 0
              ? "ATTEND_APPOINTMENT"
              : "NO_ACTION",
      },
      events,
    });
  }

  if (receivables.some((item) => item.currency !== "CAD")) {
    throw new Error("TIMELINE_CURRENCY_REFUSED");
  }

  const receivableEvents = receivables.map((item) => ({
    id: `receivable:${item.id}`,
    kind: "RECEIVABLE" as const,
    occurredAt: item.createdAt.toISOString(),
    status: item.status,
    summary: `Compte à recevoir ${item.invoiceReference}`,
    detail: `Échéance ${item.dueAt.toISOString()}`,
    provenance: {
      source: "CANONICAL_DATABASE" as const,
      entityType: "ConstructionReceivable" as const,
      entityId: item.id,
    },
    financial: {
      invoiceReference: item.invoiceReference,
      outstandingAmountMinor: item.outstandingAmountMinor,
      currency: "CAD" as const,
    },
  }));
  const events: OwnerTimelineEvent[] = orderTimelineEvents([
    ...calendarEvents.map((event) => ({ ...event, financial: null })),
    ...loopEvents.map((event) => ({ ...event, financial: null })),
    ...evidenceEvents.map((event) => ({ ...event, financial: null })),
    ...actionEvents.map((event) => ({ ...event, financial: null })),
    ...receivableEvents,
  ]).slice(0, 300);
  const openReceivables = receivables.filter((item) => item.status !== "paid");
  const dueReceivable = openReceivables.some((item) => item.dueAt <= referenceNow);
  return ownerProjectTimelineSchema.parse({
    ...common,
    role,
    brief: {
      appointmentsToday,
      openLoops: activeLoops.length,
      evidencePendingVerification: pendingEvidence.length,
      preparedActions: preparedActions.length,
      nextResponsibleRoles,
      openReceivables: openReceivables.length,
      outstandingAmountMinor: openReceivables.reduce(
        (sum, item) => sum + item.outstandingAmountMinor,
        0,
      ),
      currency: "CAD",
      nextDecision:
        activeLoops.length > 0
          ? "OPEN_LOOP_ACTION"
          : preparedActions.length > 0
            ? "REVIEW_PREPARED_ACTION"
            : dueReceivable
              ? "FOLLOW_UP_RECEIVABLE"
              : appointmentsToday > 0
                ? "ATTEND_APPOINTMENT"
                : "NO_ACTION",
    },
    events,
  });
}
