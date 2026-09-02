import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  fieldGoldenWorkflowProjectionSchema,
  ownerGoldenWorkflowProjectionSchema,
  type GoldenWorkflowActionCode,
  type GoldenWorkflowBlockerCode,
  type GoldenWorkflowProjection,
  type GoldenWorkflowRoute,
  type GoldenWorkflowStep,
} from "@/lib/construction-operating-assistant-r33/contracts";
import { EXTERNAL_CAPABILITY_CODES, GOLDEN_WORKFLOW_REGISTRY } from "@/lib/construction-operating-assistant-r33/registry";
import { prisma } from "@/lib/db";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

type Readiness = {
  hasProject: boolean;
  hasContact: boolean;
  hasAssignment: boolean;
  hasWorkIntent: boolean;
  hasSchedule: boolean;
  hasEvidence: boolean;
  hasFollowUp: boolean;
  invoiceReady: boolean;
  hasPreparedAction: boolean;
  hasApprovedAction: boolean;
  hasHistory: boolean;
};

function action(code: GoldenWorkflowActionCode, route: GoldenWorkflowRoute) {
  return { code, route, copyKey: `action.${code}` };
}

function completionFor(step: GoldenWorkflowStep, readiness: Readiness, field: boolean) {
  if (field) {
    if (step === "PLAN_WORK") return readiness.hasSchedule;
    if (step === "COLLECT_PROOF") return readiness.hasEvidence;
    if (step === "REVIEW_HISTORY") return false;
    return false;
  }
  const map: Record<GoldenWorkflowStep, boolean> = {
    GET_STARTED: readiness.hasProject && readiness.hasContact,
    CAPTURE_WORK: readiness.hasWorkIntent,
    PLAN_WORK: readiness.hasSchedule,
    COLLECT_PROOF: readiness.hasEvidence,
    FOLLOW_UP: readiness.hasFollowUp,
    READY_TO_INVOICE: readiness.invoiceReady,
    APPROVE_ACTION: readiness.hasApprovedAction,
    REVIEW_HISTORY: false,
  };
  return map[step];
}

function blockerFor(step: GoldenWorkflowStep, readiness: Readiness, field: boolean): GoldenWorkflowBlockerCode | null {
  if (field && !readiness.hasAssignment) return "ASSIGNMENT_REQUIRED";
  if (step === "GET_STARTED") return !readiness.hasProject ? "PROJECT_REQUIRED" : !readiness.hasContact ? "CONTACT_REQUIRED" : null;
  const entry = GOLDEN_WORKFLOW_REGISTRY.find((candidate) => candidate.step === step);
  if (!entry?.blocker) return null;
  if (step === "APPROVE_ACTION" && readiness.hasPreparedAction) return null;
  return entry.blocker;
}

export function deriveGoldenWorkflow(input: {
  readiness: Readiness;
  field: boolean;
}) {
  const registry = GOLDEN_WORKFLOW_REGISTRY.filter((entry) => !input.field || entry.fieldAllowed);
  const firstIncomplete = registry.findIndex((entry) => !completionFor(entry.step, input.readiness, input.field));
  const currentIndex = firstIncomplete === -1 ? registry.length - 1 : firstIncomplete;
  const steps = registry.map((entry, index) => {
    const complete = completionFor(entry.step, input.readiness, input.field);
    const isCurrent = index === currentIndex;
    const blocker = isCurrent ? blockerFor(entry.step, input.readiness, input.field) : null;
    return {
      step: entry.step,
      order: entry.order,
      status: complete ? "COMPLETE" as const : isCurrent ? (blocker ? "BLOCKED" as const : "CURRENT" as const) : "NOT_STARTED" as const,
      titleKey: entry.titleKey,
      bodyKey: entry.bodyKey,
      blockers: blocker ? [{ code: blocker, severity: "ACTION_REQUIRED" as const, copyKey: `blocker.${blocker}`, resolutionRoute: entry.route }] : [],
      route: entry.route,
    };
  });
  const current = registry[currentIndex];
  const primaryAction = input.field && !input.readiness.hasAssignment
    ? action("VIEW_ASSIGNMENTS", "JOBS")
    : action(current.action, current.route);
  return {
    steps,
    completedCount: steps.filter((step) => step.status === "COMPLETE").length,
    totalCount: steps.length,
    currentStep: current.step,
    primaryAction,
  };
}

function roleOf(role: "owner" | "admin" | "member") {
  return role === "owner" ? "OWNER" as const : role === "admin" ? "OFFICE_MANAGER" as const : "FIELD_WORKER" as const;
}

export async function goldenWorkflowForUser(input: {
  userId: string;
  workspaceId: string;
  now?: Date;
}): Promise<GoldenWorkflowProjection> {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const field = membership.role === "member";
    const workspace = await tx.constructionWorkspace.findFirst({
      where: { id: input.workspaceId, status: "active" },
      select: { id: true, name: true, defaultTimezone: true, defaultLocale: true },
    });
    if (!workspace) throw new Error("GOLDEN_WORKFLOW_WORKSPACE_NOT_FOUND");

    const assignedProjects = field ? await tx.constructionProject.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "active",
        jobs: { some: { assignments: { some: { assigneeKind: "member", assigneeId: input.userId } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, code: true, name: true },
    }) : [];
    const project = field
      ? assignedProjects[0] ?? null
      : await tx.constructionProject.findFirst({
        where: { workspaceId: input.workspaceId, status: "active" },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true, code: true, name: true },
      });
    const projectFilter = project ? { projectId: project.id } : {};
    const [contactCount, workIntentCount, jobCount, calendarCount, evidenceCount, mediaCount, followUpCount, readyLoopCount, receivableCount, preparedActionCount, approvedActionCount, historyCount, activeExceptionCount] = await Promise.all([
      field ? 0 : tx.constructionContact.count({ where: { workspaceId: input.workspaceId, status: "active" } }),
      tx.constructionInterpretation.count({ where: { workspaceId: input.workspaceId, ...(project ? { message: { projectId: project.id } } : {}) } }),
      tx.constructionJob.count({ where: { workspaceId: input.workspaceId, ...projectFilter, ...(field ? { assignments: { some: { assigneeKind: "member", assigneeId: input.userId } } } : {}) } }),
      tx.constructionCalendarItem.count({ where: { workspaceId: input.workspaceId, ...projectFilter } }),
      tx.constructionOpenLoopEvidence.count({ where: { workspaceId: input.workspaceId, ...projectFilter, state: { in: ["present_unverified", "verified"] } } }),
      tx.constructionMessageMediaReference.count({ where: { workspaceId: input.workspaceId, ...projectFilter } }),
      tx.constructionFollowUp.count({ where: { workspaceId: input.workspaceId, ...projectFilter, ...(field ? { ownerKind: "member", ownerId: input.userId } : {}) } }),
      field ? 0 : tx.constructionOpenLoop.count({ where: { workspaceId: input.workspaceId, ...projectFilter, status: "ready_to_invoice" } }),
      field ? 0 : tx.constructionReceivable.count({ where: { workspaceId: input.workspaceId, ...projectFilter } }),
      field ? 0 : tx.constructionAction.count({ where: { workspaceId: input.workspaceId, ...projectFilter, status: "proposed" } }),
      field ? 0 : tx.constructionAction.count({ where: { workspaceId: input.workspaceId, ...projectFilter, status: { in: ["approved", "simulated_delivered"] } } }),
      tx.constructionAuditEvent.count({ where: { workspaceId: input.workspaceId, ...(project ? { OR: [{ entityId: project.id }, { entityType: { in: ["workspace", "project"] } }] } : {}) } }),
      field ? 0 : tx.constructionHumanEscalation.count({ where: { workspaceId: input.workspaceId, ...projectFilter, state: { in: ["prepared", "active", "paused"] } } }),
    ]);
    const readiness: Readiness = {
      hasProject: Boolean(project),
      hasContact: field ? Boolean(project) : contactCount > 0,
      hasAssignment: !field || assignedProjects.length > 0,
      hasWorkIntent: workIntentCount > 0,
      hasSchedule: jobCount + calendarCount > 0,
      hasEvidence: evidenceCount + mediaCount > 0,
      hasFollowUp: followUpCount > 0,
      invoiceReady: readyLoopCount + receivableCount > 0,
      hasPreparedAction: preparedActionCount > 0,
      hasApprovedAction: approvedActionCount > 0,
      hasHistory: historyCount > 0,
    };
    const derived = deriveGoldenWorkflow({ readiness, field });
    const locale = workspace.defaultLocale === "en-CA" ? "en-CA" as const : "fr-CA" as const;
    const base = {
      schemaVersion: 1 as const,
      registryVersion: 1 as const,
      generatedAt: (input.now ?? new Date()).toISOString(),
      workspace: { id: workspace.id, name: workspace.name, timezone: workspace.defaultTimezone, locale, currency: "CAD" as const },
      project,
      stateFingerprint: sha256Canonical({ workspaceId: workspace.id, role: roleOf(membership.role), project, readiness, currentStep: derived.currentStep, completedCount: derived.completedCount }),
      ...derived,
      secondaryActions: [],
      externalCapabilities: EXTERNAL_CAPABILITY_CODES.map((code) => ({ code, status: "UNAVAILABLE" as const, reasonCode: "PROVIDER_DISABLED_LOCAL" as const })),
      providerObserved: false as const,
      externalEffectCount: 0 as const,
    };
    if (field) return fieldGoldenWorkflowProjectionSchema.parse({ ...base, role: "FIELD_WORKER", assignedProjectCount: assignedProjects.length });
    return ownerGoldenWorkflowProjectionSchema.parse({
      ...base,
      role: roleOf(membership.role),
      activeExceptionCount,
      pendingApprovalCount: preparedActionCount,
      secondaryActions: [
        action("OPEN_PROJECTS", "PROJECTS"),
        ...(activeExceptionCount ? [action("REQUEST_HUMAN_SUPPORT", "HUMAN_SUPPORT")] : []),
      ],
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
