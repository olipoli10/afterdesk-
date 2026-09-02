import "server-only";

import { prisma } from "@/lib/db";
import { mapHumanEscalationOwnerState } from "@/lib/construction-operating-assistant-r22/contracts";

export async function constructionSupportPortfolioForAdmin(input: { actorId: string }) {
  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
  if (!actor || actor.role !== "ADMIN") throw new Error("COMMERCIAL_ADMIN_REQUIRED");
  const rows = await prisma.constructionHumanEscalation.findMany({
    where: { state: { in: ["prepared", "active", "resumed", "paused", "exhausted"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      purpose: true,
      evidenceKind: true,
      state: true,
      appliedAt: true,
      createdAt: true,
      workspace: { select: { name: true } },
      project: { select: { code: true, name: true } },
      unitState: { select: { state: true, remainingRevisions: true, acceptance: { select: { id: true } } } },
    },
  });
  return {
    schemaVersion: 1 as const,
    items: rows.map((row) => {
      const state = mapHumanEscalationOwnerState({
        escalationState: row.state,
        unitState: row.unitState.state,
        acceptancePresent: Boolean(row.unitState.acceptance),
        applied: Boolean(row.appliedAt),
      });
      return {
        escalationId: row.id,
        workspaceId: row.workspaceId,
        workspaceName: row.workspace.name,
        projectId: row.projectId,
        projectCode: row.project.code,
        projectName: row.project.name,
        purpose: row.purpose,
        evidenceKind: row.evidenceKind,
        state: state.state,
        nextResponsibleRole: state.nextResponsibleRole,
        nextAction: state.nextAction,
        remainingRevisions: row.unitState.remainingRevisions,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    providerObserved: false as const,
    externalEffectCount: 0 as const,
  };
}
