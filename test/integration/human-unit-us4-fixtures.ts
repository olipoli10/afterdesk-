import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createTask, createWorker } from "./fixtures";

export const US4_OUTPUT_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
};

export async function createUs4Admin(label = "admin") {
  return prisma.user.create({
    data: {
      name: `US4 ${label}`,
      email: `us4-${label}-${randomUUID()}@it.local`,
      role: "ADMIN",
    },
    select: { id: true },
  });
}

export async function createUs4Unit(options?: {
  state?: string;
  taskStatus?: string;
  workerId?: string;
  claimGeneration?: number;
  eligibility?: Record<string, unknown>;
  declaredInputs?: unknown[];
  dataClass?: string;
  tier?: "standard" | "high_value";
}) {
  const unitState = options?.state ?? "claimed";
  const isPublished = unitState === "published";
  const worker = options?.workerId
    ? { id: options.workerId }
    : await createWorker();
  const task = await createTask({
    status: options?.taskStatus ?? (isPublished ? "open" : "claimed"),
    claimedById: isPublished ? null : worker.id,
    clientPriceCents: 98_765,
    vaPayoutCents: 4_321,
  });
  if (options?.tier) {
    await prisma.task.update({ where: { id: task.id }, data: { tier: options.tier } });
  }
  const plan = await prisma.taskExecutionPlanVersion.create({
    data: {
      taskId: task.id,
      version: 1,
      source: "ai_generated" as never,
      deliverableDescription: "US4 projection",
      assumptions: [],
      exclusions: [],
      internalCostLikelyCents: 2_000,
      internalCostConservativeCents: 3_000,
      suggestedPriceCents: 98_765,
      suggestedVaPayoutCents: 4_321,
      calibration: "calibrated" as never,
      dataClass: options?.dataClass ?? "business_confidential",
      dataClassSignals: ["US4 fixture"],
    },
    select: { id: true },
  });
  const producer = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: plan.id,
      order: 1,
      title: "Prepare declared artifact",
      description: "fixture producer",
      executor: "ai" as never,
      params: {},
      estimatedMinutesOptimistic: 1,
      estimatedMinutesLikely: 1,
      estimatedMinutesConservative: 1,
      verificationMethod: "schema_check",
      acceptanceCriteria: ["prepared"],
      riskLevel: "low" as never,
      dependsOnOrder: [],
    },
    select: { id: true },
  });
  const cut = await prisma.taskExecutionPlanStep.create({
    data: {
      planVersionId: plan.id,
      order: 2,
      title: "Perform declared work",
      description: "fixture human step",
      executor: "human" as never,
      humanRole: "worker" as never,
      params: {},
      fixedMinutes: 30,
      estimatedMinutesOptimistic: 10,
      estimatedMinutesLikely: 20,
      estimatedMinutesConservative: 30,
      verificationMethod: "independent_admin_review",
      acceptanceCriteria: ["Matches the declared standard"],
      riskLevel: "low" as never,
      dependsOnOrder: [1],
      humanOutputSchema: US4_OUTPUT_SCHEMA,
      humanRequiredArtifactKinds: [],
    },
    select: { id: true },
  });
  const snapshot = await prisma.taskAcceptanceSnapshot.create({
    data: {
      taskId: task.id,
      planVersionId: plan.id,
      clientPriceCents: 98_765,
      currency: "USD",
      title: "SECRET CLIENT TITLE",
      description: "SECRET RAW CONTRACT DESCRIPTION",
      revisionWindowHours: 72,
      maxRevisionRounds: 2,
      disputeWindowHours: 48,
      acceptedByUserId: task.clientId,
      automationSpendCeilingMicros: 88_888n,
      dataClass: options?.dataClass ?? "business_confidential",
    },
    select: { id: true },
  });
  const run = await prisma.taskWorkflowRun.create({
    data: {
      snapshotId: snapshot.id,
      taskId: task.id,
      planVersionId: plan.id,
      status: "awaiting_human_unit" as never,
      runAutomationBudgetMicros: 77_777n,
      steps: {
        create: [
          {
            planStepId: producer.id,
            order: 1,
            executionMode: "automated" as never,
            status: "done" as never,
            inputSummary: { credential: "NEVER PROJECT" },
          },
          {
            planStepId: cut.id,
            order: 2,
            executionMode: "human" as never,
            status: "handed_to_human" as never,
            handoffReason: "SECRET STEP INTERNAL",
          },
        ],
      },
    },
    select: { id: true },
  });
  const definition = await prisma.humanWorkUnitDefinition.create({
    data: {
      planVersionId: plan.id,
      planStepId: cut.id,
      instructions: "Use only the declared inputs.",
      declaredInputs: (options?.declaredInputs ?? []) as Prisma.InputJsonValue,
      outputSchema: US4_OUTPUT_SCHEMA,
      requiredArtifactKinds: [],
      acceptanceCriteria: ["Matches the declared standard"],
      verificationMethod: "independent_admin_review",
      eligibility: (options?.eligibility ?? {
          categorySlug: null,
          tier: options?.tier ?? "standard",
          requireCategoryCertification: false,
          highValueThreshold: 4.5,
          minRatedDeliveries: 3,
          maxActiveClaims: 3,
        }) as Prisma.InputJsonValue,
      reviewerAuthority: "admin",
      expectedMinutes: 20,
      revisionBound: 2,
      publicationDeadlineHours: 72,
      submissionDeadlineHours: 48,
      claimLeaseHours: 24,
      economicProvenance: { clientPriceCents: "NEVER PROJECT" },
      dataClass: options?.dataClass ?? "business_confidential",
    },
    select: { id: true },
  });
  const generation = options?.claimGeneration ?? 1;
  const unit = await prisma.humanWorkUnitRunState.create({
    data: {
      runId: run.id,
      taskId: task.id,
      snapshotId: snapshot.id,
      definitionId: definition.id,
      cutOrder: 2,
      state: unitState as never,
      ...(["accepted", "resumed"].includes(unitState)
        ? { acceptedAt: new Date() }
        : {}),
      claimGeneration: isPublished ? 0 : generation,
      transitionSeq: 1,
      remainingRevisions: 2,
      claimedById: isPublished ? null : worker.id,
      claimedAt: isPublished ? null : new Date(),
      publishedAt: isPublished ? new Date() : null,
      submissionDeadlineAt: new Date(Date.now() + 48 * 3_600_000),
    },
    select: { id: true },
  });
  await prisma.humanWorkUnitTransition.create({
    data: {
      unitStateId: unit.id,
      seq: 1,
      actorId: isPublished ? null : worker.id,
      actorRole: (isPublished ? "system" : "worker") as never,
      toState: unitState as never,
      cause: isPublished ? "published" : "claimed",
      claimGeneration: isPublished ? 0 : generation,
      resumeGeneration: 0,
      assignmentEstablished: isPublished ? null : true,
    },
  });
  return { worker, task, plan, snapshot, run, definition, unit, claimGeneration: isPublished ? 0 : generation };
}
