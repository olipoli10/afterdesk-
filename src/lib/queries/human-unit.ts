import "server-only";

import { Prisma, type HumanWorkUnitState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { VA_FILE_ACCESS_STATUSES } from "@/lib/status";
import { ACTIVE_CLAIM_STATUSES } from "@/lib/worker-eligibility";
import {
  DATA_CLASSES,
  isAtLeastAsRestrictive,
  type DataClass,
} from "@/lib/ai-work-engine/data-class";

const ACTIVE_UNIT_STATES = [
  "claimed",
  "submitted",
  "in_review",
  "revision_requested",
] as const satisfies readonly HumanWorkUnitState[];

const TERMINAL_UNIT_STATES = [
  "accepted",
  "resumed",
  "exhausted",
  "withdrawn",
  "paused",
] as const satisfies readonly HumanWorkUnitState[];

type FrozenEligibility = {
  categorySlug: string | null;
  tier: string;
  requireCategoryCertification: boolean;
  highValueThreshold: number;
  minRatedDeliveries: number;
  maxActiveClaims: number;
};

type DeclaredInput = {
  kind: "payload_field" | "snapshot_file" | "artifact";
  ref: string;
  label: string;
  dataClass: DataClass;
};

export type WorkerDeclaredInput = {
  label: string;
  kind: DeclaredInput["kind"];
  value?: string;
  fileRef?: {
    id: string;
    fileName: string;
    sizeBytes: number;
    mime?: string;
  };
};

export type WorkerUnitView =
  | {
      kind: "unit";
      instructions: string;
      declaredInputs: WorkerDeclaredInput[];
      outputSchema: unknown;
      requiredArtifactKinds: string[];
      acceptanceCriteria: string[];
      remainingRevisions: number;
      submissionDeadlineAt: Date | null;
      state: (typeof ACTIVE_UNIT_STATES)[number];
      readOnly: boolean;
      latestOwnCandidate: { payload: unknown; status: string } | null;
      revisionInstructions: string | null;
    }
  | {
      kind: "status";
      status: "accepted" | "resuming" | "running" | "paused" | "completed";
      nextAction: "wait_for_resume" | "wait_for_completion" | "contact_support" | "none";
    };

function parseEligibility(value: unknown): FrozenEligibility | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (
    !(e.categorySlug === null || typeof e.categorySlug === "string") ||
    typeof e.tier !== "string" ||
    typeof e.requireCategoryCertification !== "boolean" ||
    typeof e.highValueThreshold !== "number" ||
    !Number.isFinite(e.highValueThreshold) ||
    typeof e.minRatedDeliveries !== "number" ||
    !Number.isInteger(e.minRatedDeliveries) ||
    e.minRatedDeliveries < 0 ||
    typeof e.maxActiveClaims !== "number" ||
    !Number.isInteger(e.maxActiveClaims) ||
    e.maxActiveClaims < 1
  ) return null;
  return e as FrozenEligibility;
}

function parseDeclaredInputs(value: unknown): DeclaredInput[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: DeclaredInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const input = item as Record<string, unknown>;
    if (
      !["payload_field", "snapshot_file", "artifact"].includes(String(input.kind)) ||
      typeof input.ref !== "string" ||
      typeof input.label !== "string" ||
      typeof input.dataClass !== "string" ||
      !(DATA_CLASSES as readonly string[]).includes(input.dataClass)
    ) return null;
    parsed.push(input as DeclaredInput);
  }
  return parsed;
}

function terminalStatus(state: (typeof TERMINAL_UNIT_STATES)[number]): Extract<WorkerUnitView, { kind: "status" }> {
  switch (state) {
    case "accepted":
      return { kind: "status", status: "accepted", nextAction: "wait_for_resume" };
    case "resumed":
      return { kind: "status", status: "running", nextAction: "wait_for_completion" };
    case "paused":
      return { kind: "status", status: "paused", nextAction: "contact_support" };
    case "exhausted":
    case "withdrawn":
      return { kind: "status", status: "completed", nextAction: "none" };
  }
}

/**
 * Minimum worker projection for one current fenced assignment.
 *
 * This intentionally performs more than one SQL statement: eligibility is a
 * frozen JSON contract, so its values must be read before they can become SQL
 * predicates. Every authorization decision is nevertheless a WHERE predicate
 * in the same SERIALIZABLE transaction; no fetched forbidden row is filtered
 * into safety afterwards.
 */
export async function humanUnitForWorker(input: {
  taskId: string;
  workerId: string;
  claimGeneration: number;
}): Promise<WorkerUnitView | null> {
  return prisma.$transaction(async (tx) => {
    const preflight = await tx.humanWorkUnitRunState.findFirst({
      where: {
        taskId: input.taskId,
        claimedById: input.workerId,
        claimGeneration: input.claimGeneration,
        state: { in: [...ACTIVE_UNIT_STATES, ...TERMINAL_UNIT_STATES] },
        task: { claimedById: input.workerId },
        claimedBy: { is: { vaProfile: { is: { status: "approved" } } } },
      },
      select: {
        id: true,
        state: true,
        definitionId: true,
        snapshotId: true,
        definition: { select: { eligibility: true, declaredInputs: true, dataClass: true } },
      },
    });
    if (!preflight) return null;

    const eligibility = parseEligibility(preflight.definition.eligibility);
    const declared = parseDeclaredInputs(preflight.definition.declaredInputs);
    if (!eligibility || !declared) return null;
    if (!(DATA_CLASSES as readonly string[]).includes(preflight.definition.dataClass)) return null;
    const definitionClass = preflight.definition.dataClass as DataClass;
    if (declared.some((entry) => !isAtLeastAsRestrictive(definitionClass, entry.dataClass))) return null;

    const activeOtherTasks = await tx.task.count({
      where: {
        id: { not: input.taskId },
        claimedById: input.workerId,
        status: { in: [...ACTIVE_CLAIM_STATUSES] },
      },
    });
    if (activeOtherTasks >= eligibility.maxActiveClaims) return null;

    const binding = await tx.$queryRaw<Array<{ ok: number }>>`
      SELECT 1 AS ok
      FROM "HumanWorkUnitRunState" u
      JOIN "Task" t ON t.id = u."taskId"
      JOIN "TaskAcceptanceSnapshot" s
        ON s.id = u."snapshotId" AND s."taskId" = u."taskId"
      JOIN "HumanWorkUnitDefinition" d ON d.id = u."definitionId"
      JOIN "TaskExecutionPlanVersion" p
        ON p.id = d."planVersionId" AND p."taskId" = u."taskId"
      WHERE u.id = ${preflight.id}
        AND u."taskId" = ${input.taskId}
        AND u."claimedById" = ${input.workerId}
        AND u."claimGeneration" = ${input.claimGeneration}
        AND t."claimedById" = ${input.workerId}
        AND s.id = ${preflight.snapshotId}
        AND d.id = ${preflight.definitionId}
      LIMIT 1
    `;
    if (binding.length !== 1) return null;

    if ((TERMINAL_UNIT_STATES as readonly string[]).includes(preflight.state)) {
      const terminal = await tx.humanWorkUnitRunState.findFirst({
        where: {
          id: preflight.id,
          taskId: input.taskId,
          claimedById: input.workerId,
          claimGeneration: input.claimGeneration,
          state: { in: [...TERMINAL_UNIT_STATES] },
          task: {
            claimedById: input.workerId,
            status: { in: [...VA_FILE_ACCESS_STATUSES] },
            tier: eligibility.tier === "high_value" ? "high_value" : "standard",
            submissions: { none: { vaId: input.workerId, qcStatus: "rejected" } },
          },
          claimedBy: {
            is: {
              vaProfile: {
                is: {
                  status: "approved",
                  ...(eligibility.tier === "high_value"
                    ? {
                        scoreCache: { gte: eligibility.highValueThreshold },
                        ratedCount: { gte: eligibility.minRatedDeliveries },
                      }
                    : {}),
                },
              },
              ...(eligibility.requireCategoryCertification && eligibility.categorySlug
                ? { certifications: { some: { courseSlug: eligibility.categorySlug } } }
                : {}),
            },
          },
          definitionId: preflight.definitionId,
          snapshotId: preflight.snapshotId,
        },
        // Terminal workers get status only. Definition inputs and candidate
        // content are not selected into this lifecycle window at all.
        select: { state: true },
      });
      return terminal
        ? terminalStatus(terminal.state as (typeof TERMINAL_UNIT_STATES)[number])
        : null;
    }

    const unit = await tx.humanWorkUnitRunState.findFirst({
      where: {
        id: preflight.id,
        taskId: input.taskId,
        claimedById: input.workerId,
        claimGeneration: input.claimGeneration,
        state: { in: [...ACTIVE_UNIT_STATES] },
        task: {
          claimedById: input.workerId,
          status: { in: [...VA_FILE_ACCESS_STATUSES] },
          tier: eligibility.tier === "high_value" ? "high_value" : "standard",
          submissions: { none: { vaId: input.workerId, qcStatus: "rejected" } },
        },
        claimedBy: {
          is: {
            vaProfile: {
              is: {
                status: "approved",
                ...(eligibility.tier === "high_value"
                  ? {
                      scoreCache: { gte: eligibility.highValueThreshold },
                      ratedCount: { gte: eligibility.minRatedDeliveries },
                    }
                  : {}),
              },
            },
            ...(eligibility.requireCategoryCertification && eligibility.categorySlug
              ? { certifications: { some: { courseSlug: eligibility.categorySlug } } }
              : {}),
          },
        },
        definitionId: preflight.definitionId,
        snapshotId: preflight.snapshotId,
      },
      select: {
        state: true,
        remainingRevisions: true,
        submissionDeadlineAt: true,
        runId: true,
        snapshotId: true,
        definition: {
          select: {
            instructions: true,
            declaredInputs: true,
            outputSchema: true,
            requiredArtifactKinds: true,
            acceptanceCriteria: true,
            dataClass: true,
          },
        },
        candidates: {
          where: { submittedById: input.workerId, claimGeneration: input.claimGeneration },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: {
            payload: true,
            status: true,
            decision: { select: { revisionInstructions: true } },
          },
        },
      },
    });
    if (!unit) return null;

    const resolved: WorkerDeclaredInput[] = [];
    for (const entry of declared) {
      if (entry.kind === "payload_field") {
        resolved.push({ label: entry.label, kind: entry.kind, value: entry.ref });
        continue;
      }
      if (entry.kind === "snapshot_file") {
        const file = await tx.taskAcceptanceSnapshotFile.findFirst({
          where: {
            snapshotId: unit.snapshotId,
            OR: [{ id: entry.ref }, { fileId: entry.ref }],
          },
          select: { fileId: true, fileName: true, sizeBytes: true },
        });
        if (!file) return null;
        resolved.push({
          label: entry.label,
          kind: entry.kind,
          fileRef: { id: file.fileId, fileName: file.fileName, sizeBytes: file.sizeBytes },
        });
        continue;
      }
      const artifact = await tx.file.findFirst({
        where: {
          taskId: input.taskId,
          workflowRunId: unit.runId,
          kind: "artifact",
          purgedAt: null,
          artifactVisibility: { in: ["worker_after_claim", "deliverable_candidate"] },
          workflowStepRun: { order: Number(entry.ref.replace(/^step:/, "")) },
        },
        select: { id: true, fileName: true, sizeBytes: true, mime: true },
      });
      if (!artifact) return null;
      resolved.push({ label: entry.label, kind: entry.kind, fileRef: artifact });
    }

    const own = unit.candidates[0] ?? null;
    return {
      kind: "unit",
      instructions: unit.definition.instructions,
      declaredInputs: resolved,
      outputSchema: unit.definition.outputSchema,
      requiredArtifactKinds: unit.definition.requiredArtifactKinds,
      acceptanceCriteria: unit.definition.acceptanceCriteria,
      remainingRevisions: unit.remainingRevisions,
      submissionDeadlineAt: unit.submissionDeadlineAt,
      state: unit.state as (typeof ACTIVE_UNIT_STATES)[number],
      readOnly: unit.state === "submitted" || unit.state === "in_review",
      latestOwnCandidate: own ? { payload: own.payload, status: own.status } : null,
      revisionInstructions: own?.decision?.revisionInstructions ?? null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
