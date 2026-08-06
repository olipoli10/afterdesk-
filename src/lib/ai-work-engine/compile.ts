import { resolveTopology, type TopologyStep } from "@/lib/ai-work-engine/topology";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/schemas";

/**
 * PLAN TO WORKFLOW. Entirely deterministic: no model call, no network, no
 * randomness. A contract the client accepted is never reinterpreted.
 *
 * The planner chose `primitive_id` BEFORE the quote, and the code stamped
 * `primitive_version` when the plan version was written. Compilation only
 * checks those two against the registry vocabulary and against the plan's own
 * dependency graph. Anything it cannot prove runnable becomes human work.
 *
 * Fallback is always HUMAN, never an error. The worst case is a plan where
 * every step is a person's, which is exactly how the platform worked before
 * any of this existed. A mandate must never fail to reach a worker because the
 * automation had an opinion about it.
 *
 * (No "server-only": the decision core is pure and unit-tested. The database
 * half lives in src/server/workflow-runs.ts.)
 */

export type CompileStepInput = TopologyStep & {
  planStepId: string;
  title: string;
};

export type CompileGate = {
  /** The classification said the mandate touches sensitive data. */
  sensitiveData: boolean;
  /** The classification said the mandate needs access we were granted. */
  requiredAccessCount: number;
};

export type CompiledStep = {
  planStepId: string;
  order: number;
  title: string;
  primitiveId: string | null;
  primitiveVersion: number | null;
  executionMode: "automated" | "human";
  /** Why it is human. Null when automated. Shown in the admin console. */
  handoffReason: string | null;
};

export type CompiledPlan = {
  steps: CompiledStep[];
  automatedStepCount: number;
  humanStepCount: number;
  /** True when the whole plan is human: nothing to run, go straight to open. */
  fullyHuman: boolean;
};

/**
 * Reasons a step is a person's, in the order they are reported. The gate
 * reasons come first because they are properties of the MANDATE, not of the
 * step: when a brief involves patient records, it does not matter how neatly
 * its steps were planned.
 */
export const HANDOFF_REASONS = {
  sensitive_data: "The mandate involves sensitive data; no automation is authorised on it.",
  required_access: "The mandate needs access to a client system; a person handles it.",
  human_step: "Planned as human work.",
  no_primitive: "No executable primitive was chosen for this step.",
  unknown_primitive: "The named primitive is not in the registry.",
  primitive_version_changed:
    "The primitive changed since this plan was accepted; the accepted behaviour is no longer available.",
  depends_on_human: "Depends on a step a person must do first.",
} as const;

/**
 * THE PURE CORE. Same inputs, same plan, every time.
 */
export function compileDecisions(steps: CompileStepInput[], gate: CompileGate): CompiledPlan {
  /**
   * THE MANDATE-LEVEL GATE, applied before anything else. A brief carrying
   * personal, medical or financial records, or one that needs credentials to
   * a client's system, is not automated in this slice at all. Not "automated
   * carefully" — not automated.
   *
   * The real CRM-migration test mandate lands here: it is flagged sensitive
   * with two required accesses, and its planner output offered five perfectly
   * plausible machine steps that would have piped patient names, addresses
   * and insurance numbers through a model. The planner was not wrong to
   * describe the work; the gate is what makes describing it safe.
   */
  const gateReason =
    gate.sensitiveData
      ? HANDOFF_REASONS.sensitive_data
      : gate.requiredAccessCount > 0
        ? HANDOFF_REASONS.required_access
        : null;

  if (gateReason !== null) {
    const compiled = steps.map((s) => ({
      planStepId: s.planStepId,
      order: s.order,
      title: s.title,
      primitiveId: s.primitiveId,
      primitiveVersion: s.primitiveVersion,
      executionMode: "human" as const,
      handoffReason: gateReason,
    }));
    return {
      steps: compiled,
      automatedStepCount: 0,
      humanStepCount: compiled.length,
      fullyHuman: true,
    };
  }

  const topology = resolveTopology(steps);
  const byOrder = new Map(topology.decisions.map((d) => [d.order, d]));

  const compiled: CompiledStep[] = steps.map((s) => {
    const decision = byOrder.get(s.order);
    const automatable = decision?.automatable === true;
    return {
      planStepId: s.planStepId,
      order: s.order,
      title: s.title,
      primitiveId: s.primitiveId,
      primitiveVersion: s.primitiveVersion,
      executionMode: automatable ? "automated" : "human",
      handoffReason: automatable
        ? null
        : (decision?.reason && HANDOFF_REASONS[decision.reason]) ||
          HANDOFF_REASONS.no_primitive,
    };
  });

  const automatedStepCount = compiled.filter((s) => s.executionMode === "automated").length;
  return {
    steps: compiled,
    automatedStepCount,
    humanStepCount: compiled.length - automatedStepCount,
    fullyHuman: automatedStepCount === 0,
  };
}

/**
 * The vocabulary the compiler will accept, for the admin console and for the
 * test that pins the registry to it. Exported here rather than re-derived so
 * there is one answer to "what can run".
 */
export const COMPILABLE_PRIMITIVE_IDS = Object.keys(PLAN_PRIMITIVES);
