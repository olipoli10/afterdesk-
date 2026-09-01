import "server-only";

import { Prisma } from "@prisma-client";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  acceptedConstructionHumanEvidenceResultSchema,
  compileConstructionHumanContract,
  requestConstructionHumanEscalationSchema,
} from "@/lib/construction-operating-assistant-r5/contracts";
import { prisma } from "@/lib/db";
import { admitHumanCut } from "@/lib/ai-work-engine/human-unit-admission";
import { freezeHumanUnitDefinition } from "@/lib/ai-work-engine/human-unit-definition";
import { getSettings } from "@/lib/settings";
import { transitionTask } from "@/lib/state";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";
import { addInvoiceReadinessEvidenceInTransaction } from "@/server/construction-operating-assistant-r0/open-loops";
import { publishHumanWorkUnit, withdrawHumanUnit } from "@/server/human-unit";
import { applyResume } from "@/server/human-unit-resume";

const DATA_CLASS = "business_confidential";

const DATABASE_EVIDENCE_KIND = {
  WRITTEN_APPROVAL: "written_approval",
  PHOTO: "photo",
  DOCUMENT: "document",
} as const;

const REQUIRED_ARTIFACT_KIND = {
  written_approval: "written_approval",
  photo: "photo",
  document: "document",
} as const;

type AdmissionRecord = {
  escalationId: string;
  taskId: string;
  runId: string;
  unitStateId: string;
  unitState: string;
  escalationState: "prepared" | "active" | "resumed" | "withdrawn" | "exhausted" | "paused";
  replayed: boolean;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function lockEscalationKey(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  key: string,
) {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${workspaceId}:construction-human-escalation:${key}`}, 0)
    )::text AS acquired
  `;
}

async function existingAdmission(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  idempotencyKey: string,
  inputHash: string,
): Promise<AdmissionRecord | null> {
  const existing = await tx.constructionHumanEscalation.findUnique({
    where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
    select: {
      id: true,
      taskId: true,
      unitStateId: true,
      inputHash: true,
      state: true,
      unitState: { select: { runId: true, state: true } },
    },
  });
  if (!existing) return null;
  if (existing.inputHash !== inputHash) {
    throw new Error("CONSTRUCTION_HUMAN_ESCALATION_IDEMPOTENCY_CONFLICT");
  }
  return {
    escalationId: existing.id,
    taskId: existing.taskId,
    runId: existing.unitState.runId,
    unitStateId: existing.unitStateId,
    unitState: existing.unitState.state,
    escalationState: existing.state,
    replayed: true,
  };
}

/**
 * Atomically creates the Construction binding and the existing HumanWorkUnit
 * contract. Publishing is retried after commit and is itself idempotent.
 */
export async function requestConstructionHumanEscalation(rawInput: unknown) {
  const input = requestConstructionHumanEscalationSchema.parse(rawInput);
  const inputHash = sha256Canonical(input);
  const settings = await getSettings();
  if (!settings.humanWorkUnitResumeEnabled) {
    throw new Error("CONSTRUCTION_HUMAN_ESCALATION_DISABLED");
  }

  const admitted = admitHumanCut(
    [
      {
        order: 1,
        executor: "human",
        dependsOnOrder: [],
        fixedMinutes: input.acceptedEstimatedMinutes,
        secondsPerUnit: null,
        estimatedMinutesOptimistic: input.acceptedEstimatedMinutes,
        estimatedMinutesLikely: input.acceptedEstimatedMinutes,
        estimatedMinutesConservative: input.acceptedEstimatedMinutes,
      },
    ],
    {
      vaPayoutCents: input.acceptedWorkerPayoutCents,
      estimatedMinutes: input.acceptedEstimatedMinutes,
    },
  );
  if (!admitted.admitted) {
    throw new Error(`CONSTRUCTION_HUMAN_ESCALATION_REFUSED:${admitted.cause}`);
  }

  const created = await prisma.$transaction(
    async (tx): Promise<AdmissionRecord> => {
      await lockEscalationKey(tx, input.workspaceId, input.idempotencyKey);
      const replay = await existingAdmission(
        tx,
        input.workspaceId,
        input.idempotencyKey,
        inputHash,
      );
      if (replay) return replay;

      const membership = await requireActiveConstructionMember(
        tx,
        input.actorId,
        input.workspaceId,
      );
      if (membership.role === "member") throw new ConstructionAccessDenied();

      const loop = await tx.constructionOpenLoop.findFirst({
        where: {
          id: input.openLoopId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          status: { notIn: ["closed", "revoked"] },
        },
        select: {
          id: true,
          stateVersion: true,
          project: { select: { code: true } },
        },
      });
      if (!loop || loop.stateVersion !== input.expectedStateVersion) {
        if (loop)
          throw new Error("CONSTRUCTION_HUMAN_ESCALATION_STALE_STATE_VERSION");
        throw new ConstructionAccessDenied();
      }

      const contract = compileConstructionHumanContract({
        projectCode: loop.project.code,
        evidenceKind: input.evidenceKind,
      });
      const task = await tx.task.create({
        data: {
          clientId: input.actorId,
          title: contract.title,
          description: contract.instructions,
          status: "awaiting_payment",
          tier: "standard",
          currency: input.acceptedCurrency,
          clientPriceCents: input.acceptedClientPriceCents,
          vaPayoutCents: input.acceptedWorkerPayoutCents,
          estimatedMinutes: input.acceptedEstimatedMinutes,
          isInternal: false,
        },
        select: { id: true },
      });
      const plan = await tx.taskExecutionPlanVersion.create({
        data: {
          taskId: task.id,
          version: 1,
          source: "admin_edited",
          editNote: "Deterministic Construction escalation contract.",
          deliverableDescription: contract.instructions,
          assumptions: [],
          exclusions: [
            "No external transport",
            "No inferred approval or payment",
          ],
          internalCostLikelyCents: input.acceptedWorkerPayoutCents,
          internalCostConservativeCents: input.acceptedWorkerPayoutCents,
          suggestedPriceCents: input.acceptedClientPriceCents,
          suggestedVaPayoutCents: input.acceptedWorkerPayoutCents,
          calibration: "uncalibrated",
          expectedAutomationCostMicros: 0n,
          conservativeAutomationCostMicros: 0n,
          automationSpendCeilingMicros: 0n,
          automationCostPolicyVersion:
            "construction-human-escalation-no-automation-v1",
          dataClass: DATA_CLASS,
          dataClassSignals: ["project_code", "worker_evidence"],
        },
        select: { id: true },
      });
      const step = await tx.taskExecutionPlanStep.create({
        data: {
          planVersionId: plan.id,
          order: 1,
          title: contract.title,
          description: contract.instructions,
          executor: "human",
          humanRole: "worker",
          params: {},
          fixedMinutes: input.acceptedEstimatedMinutes,
          secondsPerUnit: null,
          estimatedMinutesOptimistic: input.acceptedEstimatedMinutes,
          estimatedMinutesLikely: input.acceptedEstimatedMinutes,
          estimatedMinutesConservative: input.acceptedEstimatedMinutes,
          estimatedAiCostCents: 0,
          estimatedToolUnits: 0,
          verificationMethod: contract.verificationMethod,
          acceptanceCriteria: contract.acceptanceCriteria,
          riskLevel: "low",
          dependsOnOrder: [],
          humanOutputSchema: toJson(contract.outputSchema),
          humanRequiredArtifactKinds: contract.requiredArtifactKinds,
        },
        select: { id: true },
      });
      const frozen = freezeHumanUnitDefinition({
        planVersionId: plan.id,
        cut: {
          id: step.id,
          order: 1,
          title: contract.title,
          description: contract.instructions,
          verificationMethod: contract.verificationMethod,
          acceptanceCriteria: contract.acceptanceCriteria,
          humanOutputSchema: contract.outputSchema,
          humanRequiredArtifactKinds: contract.requiredArtifactKinds,
          fixedMinutes: input.acceptedEstimatedMinutes,
          secondsPerUnit: null,
          estimatedMinutesOptimistic: input.acceptedEstimatedMinutes,
          estimatedMinutesLikely: input.acceptedEstimatedMinutes,
          estimatedMinutesConservative: input.acceptedEstimatedMinutes,
        },
        acceptedTaskPayoutCents: input.acceptedWorkerPayoutCents,
        acceptedEstimatedMinutes: input.acceptedEstimatedMinutes,
        dataClass: DATA_CLASS,
        declaredInputs: [],
        settings: {
          revisionBound: settings.humanWorkUnitRevisionBound,
          publicationDeadlineHours:
            settings.humanWorkUnitPublicationDeadlineHours,
          submissionDeadlineHours:
            settings.humanWorkUnitSubmissionDeadlineHours,
          claimLeaseHours: settings.humanWorkUnitClaimLeaseHours,
        },
        eligibility: {
          categorySlug: null,
          tier: "standard",
          requireCategoryCertification: false,
          highValueThreshold: settings.highValueThreshold,
          minRatedDeliveries: settings.minRatedDeliveries,
          maxActiveClaims: settings.maxActiveClaims,
        },
      });
      if (!frozen)
        throw new Error("CONSTRUCTION_HUMAN_ESCALATION_CONTRACT_INVALID");

      const snapshot = await tx.taskAcceptanceSnapshot.create({
        data: {
          taskId: task.id,
          planVersionId: plan.id,
          clientPriceCents: input.acceptedClientPriceCents,
          currency: input.acceptedCurrency,
          title: contract.title,
          description: contract.instructions,
          deliverableDescription: contract.instructions,
          assumptions: [],
          exclusions: [
            "No external transport",
            "No inferred approval or payment",
          ],
          revisionWindowHours: settings.revisionWindowHours,
          maxRevisionRounds: settings.maxRevisionRounds,
          disputeWindowHours: settings.disputeWindowHours,
          expectedAutomationCostMicros: 0n,
          conservativeAutomationCostMicros: 0n,
          automationSpendCeilingMicros: 0n,
          automationCostPolicyVersion:
            "construction-human-escalation-no-automation-v1",
          acceptedByUserId: input.actorId,
          dataClass: DATA_CLASS,
        },
        select: { id: true },
      });
      const run = await tx.taskWorkflowRun.create({
        data: {
          snapshotId: snapshot.id,
          taskId: task.id,
          planVersionId: plan.id,
          status: "awaiting_human_unit",
          automatedStepCount: 0,
          humanStepCount: 1,
          runAutomationBudgetMicros: 0n,
          budgetPolicyVersion: "construction-human-escalation-no-automation-v1",
          compiledAt: new Date(),
          steps: {
            create: {
              planStepId: step.id,
              order: 1,
              executionMode: "human",
              status: "handed_to_human",
              handoffReason: "construction_missing_evidence",
            },
          },
        },
        select: { id: true },
      });
      const definition = await tx.humanWorkUnitDefinition.create({
        data: {
          planVersionId: plan.id,
          planStepId: step.id,
          instructions: frozen.instructions,
          declaredInputs: toJson(frozen.declaredInputs),
          outputSchema: toJson(frozen.outputSchema),
          requiredArtifactKinds: frozen.requiredArtifactKinds,
          acceptanceCriteria: frozen.acceptanceCriteria,
          verificationMethod: frozen.verificationMethod,
          eligibility: toJson(frozen.eligibility),
          reviewerAuthority: frozen.reviewerAuthority,
          expectedMinutes: frozen.expectedMinutes,
          revisionBound: frozen.revisionBound,
          publicationDeadlineHours: frozen.publicationDeadlineHours,
          submissionDeadlineHours: frozen.submissionDeadlineHours,
          claimLeaseHours: frozen.claimLeaseHours,
          economicProvenance: toJson(frozen.economicProvenance),
          dataClass: frozen.dataClass,
        },
        select: { id: true, revisionBound: true },
      });
      const unit = await tx.humanWorkUnitRunState.create({
        data: {
          runId: run.id,
          taskId: task.id,
          snapshotId: snapshot.id,
          definitionId: definition.id,
          cutOrder: admitted.cutOrder,
          state: "admitted",
          remainingRevisions: definition.revisionBound,
          transitionSeq: 1,
        },
        select: { id: true, claimGeneration: true, resumeGeneration: true },
      });
      await tx.humanWorkUnitTransition.create({
        data: {
          unitStateId: unit.id,
          seq: 1,
          actorRole: "system",
          fromState: null,
          toState: "admitted",
          cause: "admitted",
          claimGeneration: unit.claimGeneration,
          resumeGeneration: unit.resumeGeneration,
        },
      });
      const escalation = await tx.constructionHumanEscalation.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          openLoopId: input.openLoopId,
          purpose: "obtain_missing_evidence",
          evidenceKind: DATABASE_EVIDENCE_KIND[input.evidenceKind],
          sourceStateVersion: input.expectedStateVersion,
          requestId: input.requestId,
          idempotencyKey: input.idempotencyKey,
          inputHash,
          requestedById: input.actorId,
          taskId: task.id,
          unitStateId: unit.id,
          state: "prepared",
        },
        select: { id: true },
      });
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorId,
        entityType: "human_escalation",
        entityId: escalation.id,
        action: "construction_human_escalation_admitted",
        reasonCode: input.evidenceKind,
        metadata: {
          openLoopId: input.openLoopId,
          taskId: task.id,
          unitStateId: unit.id,
          externalTransportPerformed: false,
        },
      });
      return {
        escalationId: escalation.id,
        taskId: task.id,
        runId: run.id,
        unitStateId: unit.id,
        unitState: "admitted",
        escalationState: "prepared",
        replayed: false,
      };
    },
  );

  return {
    escalationId: created.escalationId,
    taskId: created.taskId,
    unitStateId: created.unitStateId,
    replayed: created.replayed,
    state: created.escalationState.toUpperCase(),
    fundingRequired: created.escalationState === "prepared",
    externalTransportPerformed: false,
  };
}

/**
 * Activates a prepared unit only after a separately-authorized payment path
 * has created a durable authorized/received Payment for the same task. This
 * function never captures money and never calls a provider.
 */
export async function activateFundedConstructionHumanEscalation(input: {
  escalationId: string;
  actorId: string;
  workspaceId: string;
  paymentId: string;
}) {
  const activation = await prisma.$transaction(async (tx) => {
    await lockEscalationKey(tx, input.workspaceId, input.escalationId);
    const membership = await requireActiveConstructionMember(
      tx,
      input.actorId,
      input.workspaceId,
    );
    if (membership.role === "member") throw new ConstructionAccessDenied();

    const escalation = await tx.constructionHumanEscalation.findFirst({
      where: { id: input.escalationId, workspaceId: input.workspaceId },
      select: {
        id: true,
        state: true,
        taskId: true,
        unitState: { select: { runId: true } },
        task: {
          select: {
            status: true,
            clientPriceCents: true,
            currency: true,
          },
        },
      },
    });
    if (!escalation) throw new ConstructionAccessDenied();
    if (escalation.state === "active") {
      return { runId: escalation.unitState.runId, replayed: true };
    }
    if (escalation.state !== "prepared") {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_PREPARED");
    }
    if (
      escalation.task.status !== "awaiting_payment" ||
      escalation.task.clientPriceCents == null
    ) {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_FUNDING_STATE_INVALID");
    }

    const payment = await tx.payment.findFirst({
      where: {
        id: input.paymentId,
        taskId: escalation.taskId,
        status: { in: ["authorized", "received"] },
      },
      select: { id: true, amountCents: true, currency: true, status: true },
    });
    if (!payment) {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_FUNDING_NOT_AUTHORIZED");
    }
    if (
      payment.currency !== escalation.task.currency ||
      payment.amountCents < escalation.task.clientPriceCents
    ) {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_FUNDING_INSUFFICIENT");
    }

    await transitionTask({
      tx,
      taskId: escalation.taskId,
      from: "awaiting_payment",
      to: "ai_processing",
      action: "construction_human_escalation_funded",
      actorId: input.actorId,
      data: { paymentDueAt: null },
      meta: { paymentId: payment.id, paymentStatus: payment.status },
    });
    await tx.constructionHumanEscalation.update({
      where: { id: escalation.id },
      data: { state: "active" },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorId,
      entityType: "human_escalation",
      entityId: escalation.id,
      action: "construction_human_escalation_activated",
      reasonCode: payment.status,
      metadata: {
        paymentId: payment.id,
        externalTransportPerformed: false,
      },
    });
    return { runId: escalation.unitState.runId, replayed: false };
  });

  const published = await publishHumanWorkUnit(activation.runId);
  if (!published.published && published.cause !== "already_published") {
    throw new Error(
      `CONSTRUCTION_HUMAN_ESCALATION_PUBLISH_REFUSED:${published.cause}`,
    );
  }
  return {
    activated: true,
    replayed: activation.replayed || published.cause === "already_published",
    externalTransportPerformed: false,
  };
}

export async function withdrawConstructionHumanEscalation(input: {
  escalationId: string;
  actorId: string;
  workspaceId: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockEscalationKey(tx, input.workspaceId, input.escalationId);
    const membership = await requireActiveConstructionMember(
      tx,
      input.actorId,
      input.workspaceId,
    );
    if (membership.role === "member") throw new ConstructionAccessDenied();
    const escalation = await tx.constructionHumanEscalation.findFirst({
      where: { id: input.escalationId, workspaceId: input.workspaceId },
      select: { id: true, taskId: true, state: true },
    });
    if (!escalation) throw new ConstructionAccessDenied();
    if (escalation.state === "withdrawn")
      return { withdrawn: true, replayed: true };
    if (!["prepared", "active"].includes(escalation.state))
      return { withdrawn: false, replayed: false };

    const task = await tx.task.findUniqueOrThrow({
      where: { id: escalation.taskId },
      select: { status: true },
    });
    await transitionTask({
      tx,
      taskId: escalation.taskId,
      from: task.status,
      to: "cancelled",
      action: "construction_human_escalation_withdrawn",
      actorId: input.actorId,
      reason: input.reason.trim().slice(0, 1_000),
      data: {
        cancelledAt: new Date(),
        cancelReason: input.reason.trim().slice(0, 1_000),
      },
    });
    await withdrawHumanUnit(tx, {
      taskId: escalation.taskId,
      cause: "lifecycle_exit",
      actorId: input.actorId,
    });
    await tx.constructionHumanEscalation.update({
      where: { id: escalation.id },
      data: { state: "withdrawn", withdrawnAt: new Date() },
    });
    await appendConstructionAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorId,
      entityType: "human_escalation",
      entityId: escalation.id,
      action: "construction_human_escalation_withdrawn",
      reasonCode: "OWNER_OR_ADMIN_WITHDRAWAL",
      metadata: { externalTransportPerformed: false },
    });
    return { withdrawn: true, replayed: false };
  });
}

async function lockedAcceptedEscalation(
  tx: Prisma.TransactionClient,
  escalationId: string,
) {
  await tx.$queryRaw`
    SELECT "id" FROM "ConstructionHumanEscalation"
    WHERE "id" = ${escalationId}
    FOR UPDATE
  `;
  return tx.constructionHumanEscalation.findUnique({
    where: { id: escalationId },
    select: {
      id: true,
      workspaceId: true,
      openLoopId: true,
      evidenceKind: true,
      state: true,
      requestedById: true,
      appliedAt: true,
      acceptedResultHash: true,
      unitState: {
        select: {
          state: true,
          acceptance: {
            select: {
              id: true,
              resultPayload: true,
              resultSha256: true,
              candidate: {
                select: {
                  files: {
                    select: {
                      artifactKind: true,
                      fileId: true,
                      file: { select: { sha256: true, scanStatus: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      openLoop: { select: { stateVersion: true, status: true } },
    },
  });
}

/** Applies one immutable accepted candidate to Construction exactly once. */
export async function applyAcceptedConstructionHumanEscalation(
  escalationId: string,
) {
  const preflight = await prisma.constructionHumanEscalation.findUnique({
    where: { id: escalationId },
    select: {
      unitStateId: true,
      appliedAt: true,
      unitState: { select: { acceptance: { select: { id: true } } } },
    },
  });
  if (!preflight) throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_FOUND");
  if (preflight.appliedAt) return { applied: true, replayed: true };
  if (!preflight.unitState.acceptance) {
    throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_ACCEPTED");
  }
  const resumed = await applyResume(preflight.unitStateId);
  if (!resumed.resumed && resumed.cause !== "already_resumed") {
    const durableResume = await prisma.humanWorkUnitResumeRecord.findUnique({
      where: { unitStateId: preflight.unitStateId },
      select: { id: true },
    });
    if (!durableResume) {
      throw new Error(
        `CONSTRUCTION_HUMAN_ESCALATION_RESUME_REFUSED:${resumed.cause}`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const escalation = await lockedAcceptedEscalation(tx, escalationId);
    if (!escalation) throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_FOUND");
    if (escalation.appliedAt) return { applied: true, replayed: true };
    if (escalation.state !== "active") {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_ACTIVE");
    }
    if (["closed", "revoked"].includes(escalation.openLoop.status)) {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_LOOP_CLOSED");
    }
    const acceptance = escalation.unitState.acceptance;
    if (!acceptance)
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_NOT_ACCEPTED");
    const acceptedResult = acceptedConstructionHumanEvidenceResultSchema.parse(
      acceptance.resultPayload,
    );
    const acceptedHash = sha256Canonical(acceptedResult);
    if (acceptedHash !== acceptance.resultSha256) {
      throw new Error("CONSTRUCTION_HUMAN_ESCALATION_ACCEPTANCE_HASH_MISMATCH");
    }
    const artifactKind = REQUIRED_ARTIFACT_KIND[escalation.evidenceKind];
    const acceptedFile = acceptance.candidate.files.find(
      (entry) =>
        entry.artifactKind === artifactKind &&
        entry.file.scanStatus === "clean" &&
        typeof entry.file.sha256 === "string",
    );
    if (!acceptedFile?.file.sha256) {
      throw new Error(
        "CONSTRUCTION_HUMAN_ESCALATION_ACCEPTED_ARTIFACT_MISSING",
      );
    }

    const applied = await addInvoiceReadinessEvidenceInTransaction(tx, {
      schemaVersion: 1,
      eventId: `human-unit-acceptance:${acceptance.id}`,
      userId: escalation.requestedById,
      workspaceId: escalation.workspaceId,
      loopId: escalation.openLoopId,
      expectedStateVersion: escalation.openLoop.stateVersion,
      kind:
        escalation.evidenceKind === "written_approval"
          ? "WRITTEN_APPROVAL"
          : escalation.evidenceKind === "photo"
            ? "PHOTO"
            : "DOCUMENT",
      state: "VERIFIED",
      sourceRef: `human-unit-file:${acceptedFile.fileId}`,
      contentHash: acceptedFile.file.sha256,
    });
    await tx.constructionHumanEscalation.update({
      where: { id: escalation.id },
      data: {
        state: "resumed",
        acceptanceId: acceptance.id,
        acceptedResultHash: acceptedHash,
        appliedAt: new Date(),
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: escalation.workspaceId,
      actorUserId: escalation.requestedById,
      entityType: "human_escalation",
      entityId: escalation.id,
      action: "construction_human_escalation_result_applied",
      reasonCode: escalation.evidenceKind,
      metadata: {
        acceptanceId: acceptance.id,
        acceptedResultHash: acceptedHash,
        evidenceFileId: acceptedFile.fileId,
        externalTransportPerformed: false,
      },
    });
    return {
      applied: true,
      replayed: applied.replayed,
      decision: applied.decision,
      summary: acceptedResult.summary,
    };
  });
}

/** Replays durable accepted intent after a process crash. */
export async function recoverPendingConstructionHumanEscalations(limit = 50) {
  const pending = await prisma.constructionHumanEscalation.findMany({
    where: {
      state: "active",
      appliedAt: null,
      unitState: { state: { in: ["admitted", "accepted", "resumed"] } },
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      id: true,
      unitState: {
        select: {
          state: true,
          runId: true,
          acceptance: { select: { id: true } },
        },
      },
    },
  });
  let recovered = 0;
  for (const entry of pending) {
    if (entry.unitState.state === "admitted") {
      const published = await publishHumanWorkUnit(entry.unitState.runId);
      if (published.published) recovered += 1;
      continue;
    }
    if (entry.unitState.acceptance) {
      await applyAcceptedConstructionHumanEscalation(entry.id);
      recovered += 1;
    }
  }
  return recovered;
}
