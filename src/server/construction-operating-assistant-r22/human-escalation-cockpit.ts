import "server-only";

import {
  fieldHumanEscalationCockpitSchema,
  humanEscalationCommandResultSchema,
  humanEscalationCommandSchema,
  humanEscalationCockpitSchema,
  mapHumanEscalationOwnerState,
  ownerHumanEscalationCockpitSchema,
  type HumanEscalationCockpit,
  type HumanEscalationCommandResult,
} from "@/lib/construction-operating-assistant-r22/contracts";
import { prisma } from "@/lib/db";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";
import { economicCockpitForUser } from "@/server/construction-operating-assistant-r21/economic-engine";
import {
  applyAcceptedConstructionHumanEscalation,
  requestConstructionHumanEscalation,
  withdrawConstructionHumanEscalation,
} from "@/server/construction-operating-assistant-r5/escalations";

export class HumanEscalationCockpitConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "HumanEscalationCockpitConflict";
  }
}

function conflictFrom(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const mappings: Array<[string, string]> = [
    ["CONSTRUCTION_HUMAN_ESCALATION_STALE_STATE_VERSION", "STALE_STATE_VERSION"],
    ["CONSTRUCTION_HUMAN_ESCALATION_IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["CONSTRUCTION_HUMAN_ESCALATION_DISABLED", "HUMAN_ESCALATION_DISABLED"],
    ["CONSTRUCTION_HUMAN_ESCALATION_CONTRACT_INVALID", "INVALID_CONTRACT"],
    ["CONSTRUCTION_HUMAN_ESCALATION_NOT_PREPARED", "CONCURRENT_STATE_CHANGE"],
    ["CONSTRUCTION_HUMAN_ESCALATION_LOOP_CLOSED", "RESUME_REFUSED"],
  ];
  for (const [needle, code] of mappings) {
    if (message.includes(needle)) throw new HumanEscalationCockpitConflict(code);
  }
  throw error;
}

function publicEvidenceKind(kind: string) {
  if (kind === "written_approval") return "WRITTEN_APPROVAL" as const;
  if (kind === "photo") return "PHOTO" as const;
  if (kind === "document") return "DOCUMENT" as const;
  throw new HumanEscalationCockpitConflict("INVALID_EVIDENCE");
}

function requiredMissingKind(kind: "WRITTEN_APPROVAL" | "PHOTO" | "DOCUMENT") {
  return kind === "WRITTEN_APPROVAL"
    ? "WRITTEN_APPROVAL" as const
    : "SUPPORTING_EVIDENCE" as const;
}

export async function humanEscalationCockpitForUser(input: {
  userId: string;
  workspaceId: string;
  now?: Date;
}): Promise<HumanEscalationCockpit> {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  const generatedAt = (input.now ?? new Date()).toISOString();
  if (membership.role === "member") {
    return humanEscalationCockpitSchema.parse(
      fieldHumanEscalationCockpitSchema.parse({
        schemaVersion: 1,
        generatedAt,
        workspaceId: input.workspaceId,
        role: "FIELD_WORKER",
        eligibleLoops: [],
        escalations: [],
        financialDataVisible: false,
        externalTransportPerformed: false,
      }),
    );
  }

  const [economic, rows] = await Promise.all([
    economicCockpitForUser({
      userId: input.userId,
      workspaceId: input.workspaceId,
      now: input.now,
    }),
    prisma.constructionHumanEscalation.findMany({
      where: { workspaceId: input.workspaceId },
      select: {
        id: true,
        projectId: true,
        openLoopId: true,
        purpose: true,
        evidenceKind: true,
        sourceStateVersion: true,
        state: true,
        acceptanceId: true,
        acceptedResultHash: true,
        appliedAt: true,
        project: { select: { code: true, name: true } },
        task: { select: { clientPriceCents: true, currency: true } },
        unitState: {
          select: {
            state: true,
            remainingRevisions: true,
            publicationDeadlineAt: true,
            submissionDeadlineAt: true,
            acceptance: { select: { id: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
  ]);
  if (economic.role === "FIELD_WORKER") throw new ConstructionAccessDenied();

  const activeLoopIds = new Set(
    rows
      .filter((row) => !["withdrawn", "exhausted"].includes(row.state))
      .map((row) => row.openLoopId),
  );
  const eligibleLoops = economic.invoiceReadiness
    .filter((loop) =>
      loop.status === "WAITING_FOR_EVIDENCE" &&
      !activeLoopIds.has(loop.loopId) &&
      (loop.missing.includes("WRITTEN_APPROVAL") ||
        loop.missing.includes("SUPPORTING_EVIDENCE")),
    )
    .map((loop) => ({
      loopId: loop.loopId,
      projectId: loop.projectId,
      projectCode: loop.projectCode,
      projectName: loop.projectName,
      stateVersion: loop.stateVersion,
      missingEvidenceKinds: loop.missing.filter(
        (value): value is "WRITTEN_APPROVAL" | "SUPPORTING_EVIDENCE" =>
          value === "WRITTEN_APPROVAL" || value === "SUPPORTING_EVIDENCE",
      ),
      nextAction: loop.nextAction,
    }));

  const escalations = rows.map((row) => {
    if (row.purpose !== "obtain_missing_evidence") {
      throw new HumanEscalationCockpitConflict("INVALID_CONTRACT");
    }
    if (!row.task.clientPriceCents || row.task.currency !== "CAD") {
      throw new HumanEscalationCockpitConflict("INVALID_CONTRACT");
    }
    const projected = mapHumanEscalationOwnerState({
      escalationState: row.state,
      unitState: row.unitState.state,
      acceptancePresent: Boolean(row.unitState.acceptance),
      applied: Boolean(row.appliedAt),
    });
    return {
      escalationId: row.id,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      openLoopId: row.openLoopId,
      purpose: "OBTAIN_MISSING_EVIDENCE" as const,
      evidenceKind: publicEvidenceKind(row.evidenceKind),
      state: projected.state,
      nextResponsibleRole: projected.nextResponsibleRole,
      nextAction: projected.nextAction,
      deadlineAt:
        row.unitState.submissionDeadlineAt?.toISOString() ??
        row.unitState.publicationDeadlineAt?.toISOString() ??
        null,
      remainingRevisions: row.unitState.remainingRevisions,
      sourceStateVersion: row.sourceStateVersion,
      acceptedClientPriceCents: row.task.clientPriceCents,
      acceptedCurrency: "CAD" as const,
      acceptanceId: row.acceptanceId ?? row.unitState.acceptance?.id ?? null,
      acceptedResultHash: row.acceptedResultHash,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      fundingRequired: projected.fundingRequired,
      externalTransportPerformed: false as const,
    };
  });

  return humanEscalationCockpitSchema.parse(
    ownerHumanEscalationCockpitSchema.parse({
      schemaVersion: 1,
      generatedAt,
      workspaceId: input.workspaceId,
      role: membership.role === "owner" ? "OWNER" : "OFFICE_MANAGER",
      eligibleLoops,
      escalations,
      externalTransportPerformed: false,
    }),
  );
}

export async function processHumanEscalationCommand(input: {
  userId: string;
  command: unknown;
}): Promise<HumanEscalationCommandResult> {
  const command = humanEscalationCommandSchema.parse(input.command);
  try {
    const membership = await requireActiveConstructionMember(
      prisma,
      input.userId,
      command.workspaceId,
    );
    if (membership.role === "member") throw new ConstructionAccessDenied();

    if (command.action === "PREPARE") {
      const prepareInput = {
        schemaVersion: 1 as const,
        requestId: command.requestId,
        idempotencyKey: command.idempotencyKey,
        actorId: input.userId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        openLoopId: command.openLoopId,
        expectedStateVersion: command.expectedStateVersion,
        purpose: command.purpose,
        evidenceKind: command.evidenceKind,
        acceptedClientPriceCents: command.acceptedClientPriceCents,
        acceptedWorkerPayoutCents: command.acceptedWorkerPayoutCents,
        acceptedEstimatedMinutes: command.acceptedEstimatedMinutes,
        acceptedCurrency: command.acceptedCurrency,
      };
      const existing = await prisma.constructionHumanEscalation.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: command.workspaceId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: { id: true },
      });
      if (existing) {
        const replay = await requestConstructionHumanEscalation(prepareInput);
        return humanEscalationCommandResultSchema.parse({
          schemaVersion: 1,
          commandId: command.commandId,
          workspaceId: command.workspaceId,
          action: command.action,
          escalationId: replay.escalationId,
          state: "PREPARED",
          replayed: replay.replayed,
          fundingRequired: true,
          externalTransportPerformed: false,
        });
      }
      const cockpit = await humanEscalationCockpitForUser({
        userId: input.userId,
        workspaceId: command.workspaceId,
      });
      if (cockpit.role === "FIELD_WORKER") throw new ConstructionAccessDenied();
      const eligible = cockpit.eligibleLoops.find(
        (loop) =>
          loop.loopId === command.openLoopId &&
          loop.projectId === command.projectId,
      );
      if (!eligible) {
        const current = await prisma.constructionOpenLoop.findFirst({
          where: {
            id: command.openLoopId,
            workspaceId: command.workspaceId,
            projectId: command.projectId,
          },
          select: { stateVersion: true },
        });
        if (current && current.stateVersion !== command.expectedStateVersion) {
          throw new HumanEscalationCockpitConflict("STALE_STATE_VERSION");
        }
        throw new HumanEscalationCockpitConflict("LOOP_NOT_ELIGIBLE");
      }
      if (eligible.stateVersion !== command.expectedStateVersion) {
        throw new HumanEscalationCockpitConflict("STALE_STATE_VERSION");
      }
      if (!eligible.missingEvidenceKinds.includes(requiredMissingKind(command.evidenceKind))) {
        throw new HumanEscalationCockpitConflict("INVALID_EVIDENCE");
      }
      const prepared = await requestConstructionHumanEscalation(prepareInput);
      return humanEscalationCommandResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        action: command.action,
        escalationId: prepared.escalationId,
        state: "PREPARED",
        replayed: prepared.replayed,
        fundingRequired: true,
        externalTransportPerformed: false,
      });
    }

    const withdrawn = await withdrawConstructionHumanEscalation({
      escalationId: command.escalationId,
      actorId: input.userId,
      workspaceId: command.workspaceId,
      reason: command.reason,
    });
    if (!withdrawn.withdrawn) {
      throw new HumanEscalationCockpitConflict("CONCURRENT_STATE_CHANGE");
    }
    return humanEscalationCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      escalationId: command.escalationId,
      state: "WITHDRAWN",
      replayed: withdrawn.replayed,
      fundingRequired: false,
      externalTransportPerformed: false,
    });
  } catch (error) {
    if (
      error instanceof HumanEscalationCockpitConflict ||
      error instanceof ConstructionAccessDenied
    ) {
      throw error;
    }
    return conflictFrom(error);
  }
}

export async function recoverHumanEscalationsForOperator(input: {
  userId: string;
  workspaceId: string;
  limit?: number;
}) {
  const membership = await requireActiveConstructionMember(
    prisma,
    input.userId,
    input.workspaceId,
  );
  if (membership.role === "member") throw new ConstructionAccessDenied();
  const candidates = await prisma.constructionHumanEscalation.findMany({
    where: {
      workspaceId: input.workspaceId,
      state: "active",
      appliedAt: null,
    },
    select: {
      id: true,
      unitState: { select: { acceptance: { select: { id: true } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(input.limit ?? 50, 100)),
  });
  let recovered = 0;
  for (const candidate of candidates) {
    if (!candidate.unitState.acceptance) continue;
    const result = await applyAcceptedConstructionHumanEscalation(candidate.id);
    if (result.applied && !result.replayed) recovered += 1;
  }
  return {
    recovered,
    cockpit: await humanEscalationCockpitForUser(input),
    externalTransportPerformed: false as const,
  };
}
