import {
  compileDecisions,
  HANDOFF_REASONS,
  type CompileGate,
  type CompileStepInput,
} from "@/lib/ai-work-engine/compile";
import { primitiveReadsFiles } from "@/lib/ai-work-engine/primitive-vocabulary";
import type { DataClass } from "@/lib/ai-work-engine/data-class";

/**
 * LOT B — THE PRE-QUOTE COMPILE PREVIEW, PURE HALF.
 *
 * The compiler used to run for the first time AFTER the client had paid,
 * which meant the quote was priced on the plan's intentions and the contract
 * discovered its reality at execution. This module runs the SAME pure
 * `compileDecisions` over the stored plan rows so the pricing screen shows,
 * before any money moves, exactly what would run as machine work and exactly
 * why the rest would not.
 *
 * Nothing here writes, reserves, spends or calls a provider: it is a
 * projection of rows already in the database through a pure function, and the
 * zero-side-effect property is pinned by test. RULE 3 is untouched — the
 * preview informs the admin's price, it never emits one.
 *
 * The badges are deliberately FACTS, not a score. A synthetic "82% confident"
 * number would launder eight distinct verifiable conditions into one
 * unfalsifiable feeling. Each badge below names a condition an operator can
 * check against the plan on the same screen.
 */

export type CompilePreviewStep = {
  order: number;
  title: string;
  executionMode: "automated" | "human";
  primitiveId: string | null;
  handoffReason: string | null;
  demotedForBudget: boolean;
  dependsOnOrder: number[];
};

export type CompilePreview = {
  steps: CompilePreviewStep[];
  automatedCount: number;
  humanCount: number;
  /** Machine share of steps in basis points — integer, no float creep. */
  machineStepShareBps: number;
  badges: string[];
  dataClass: string | null;
  dataClassSignals: string[];
  economics: {
    policyVersion: string | null;
    expectedUsd: string | null;
    conservativeUsd: string | null;
    ceilingUsd: string | null;
  };
};

/** The row shapes the builder needs — a strict subset of the Prisma selects. */
export type PreviewVersionRow = {
  dataClass: string | null;
  dataClassSignals: string[];
  automationCostPolicyVersion: string | null;
  expectedAutomationCostMicros: bigint | null;
  conservativeAutomationCostMicros: bigint | null;
  automationSpendCeilingMicros: bigint | null;
  calibration: string;
  steps: {
    id: string;
    order: number;
    title: string;
    executor: string;
    primitiveId: string | null;
    primitiveVersion: number | null;
    params: unknown;
    dependsOnOrder: number[];
    demotedForBudget: boolean;
  }[];
};

export type PreviewClassificationRow = {
  sensitiveData: boolean;
  requiredAccess: string[];
} | null;

/** Micros → "$1.68" for the operator. Display only — never fed back into math. */
export function previewUsd(micros: bigint | null): string | null {
  if (micros === null) return null;
  const cents = micros / 10_000n + (micros % 10_000n >= 5_000n ? 1n : 0n);
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

/**
 * Worst-first: the badges an operator must not miss come before the merely
 * informative ones. "FILE AUTOMATION" is good news and still listed, because
 * the preview describes what WOULD run, not only what would fail.
 */
export function buildCompilePreview(
  version: PreviewVersionRow,
  classification: PreviewClassificationRow
): CompilePreview {
  const gate: CompileGate = {
    sensitiveData: classification?.sensitiveData ?? false,
    requiredAccessCount: classification?.requiredAccess.length ?? 0,
    ...(version.dataClass ? { dataClass: version.dataClass as DataClass } : {}),
  };
  const inputs: CompileStepInput[] = version.steps.map((s) => ({
    planStepId: s.id,
    order: s.order,
    title: s.title,
    executor: s.executor as CompileStepInput["executor"],
    primitiveId: s.primitiveId,
    primitiveVersion: s.primitiveVersion,
    dependsOnOrder: s.dependsOnOrder,
    params: s.params,
  }));
  const compiled = compileDecisions(inputs, gate);

  const demotedByOrder = new Map(version.steps.map((s) => [s.order, s.demotedForBudget]));
  const dependsByOrder = new Map(version.steps.map((s) => [s.order, s.dependsOnOrder]));
  const steps: CompilePreviewStep[] = compiled.steps.map((s) => ({
    order: s.order,
    title: s.title,
    executionMode: s.executionMode,
    primitiveId: s.primitiveId,
    handoffReason: s.handoffReason,
    demotedForBudget: demotedByOrder.get(s.order) ?? false,
    dependsOnOrder: dependsByOrder.get(s.order) ?? [],
  }));

  const total = steps.length;
  const machineStepShareBps =
    total === 0 ? 0 : Math.round((compiled.automatedStepCount * 10_000) / total);

  const automated = compiled.steps.filter((s) => s.executionMode === "automated");
  const gateForcedHuman =
    gate.sensitiveData || gate.requiredAccessCount > 0
      ? compiled.steps.some(
          (s) =>
            s.handoffReason === HANDOFF_REASONS.sensitive_data ||
            s.handoffReason === HANDOFF_REASONS.required_access
        )
      : false;
  const missingCapability = compiled.steps.some(
    (s) =>
      s.handoffReason === HANDOFF_REASONS.no_primitive ||
      s.handoffReason === HANDOFF_REASONS.unknown_primitive ||
      s.handoffReason === HANDOFF_REASONS.primitive_version_changed
  );
  const demoted = version.steps.some((s) => s.demotedForBudget);
  const usesFetch = automated.some((s) => s.primitiveId === "web.fetch");
  const usesFiles = automated.some(
    (s) => s.primitiveId !== null && primitiveReadsFiles(s.primitiveId)
  );

  const badges: string[] = [];
  if (gateForcedHuman) badges.push("SENSITIVE / HUMAN ONLY");
  if (missingCapability) badges.push("MISSING CAPABILITY");
  if (demoted) badges.push("DEMOTED FOR BUDGET");
  if (machineStepShareBps < 5_000) badges.push("MOSTLY HUMAN");
  if (usesFetch) {
    badges.push("WEB FETCH");
    // web.fetch is 1E-beta1: live in code, zero completed production runs.
    // The badge dies naturally once the workflow has real history — until
    // then, an operator quoting one deserves to know it is a first.
    badges.push("UNPROVEN WORKFLOW");
  }
  if (usesFiles) badges.push("FILE AUTOMATION");
  if (version.calibration === "uncalibrated") badges.push("UNCALIBRATED");

  return {
    steps,
    automatedCount: compiled.automatedStepCount,
    humanCount: compiled.humanStepCount,
    machineStepShareBps,
    badges,
    dataClass: version.dataClass,
    dataClassSignals: version.dataClassSignals,
    economics: {
      policyVersion: version.automationCostPolicyVersion,
      expectedUsd: previewUsd(version.expectedAutomationCostMicros),
      conservativeUsd: previewUsd(version.conservativeAutomationCostMicros),
      ceilingUsd: previewUsd(version.automationSpendCeilingMicros),
    },
  };
}
