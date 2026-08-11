import { resolveTopology, type TopologyStep } from "@/lib/ai-work-engine/topology";
import {
  EXECUTABLE_PRIMITIVE_MODES,
  PLAN_PRIMITIVES,
  primitiveModeOf,
  primitiveReachOf,
  primitiveReadsFiles,
} from "@/lib/ai-work-engine/primitive-vocabulary";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { reachMayProcess, type DataClass } from "@/lib/ai-work-engine/data-class";

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
  /**
   * The step's frozen params exactly as stored, unparsed. The compiler is the
   * only place they are validated, so that a step whose configuration does not
   * satisfy its capability becomes a person's work BEFORE anything runs rather
   * than throwing halfway through an accepted mandate.
   */
  params?: unknown;
};

export type CompileGate = {
  /** The classification said the mandate touches sensitive data. */
  sensitiveData: boolean;
  /** The classification said the mandate needs access we were granted. */
  requiredAccessCount: number;
  /**
   * The execution data class frozen on the accepted contract (data-class.ts).
   *
   * Absent on every contract accepted before 1E-alpha, and absent means the
   * old two-boolean gate is the whole story — which is exactly right for those
   * mandates, because none of them could read a file.
   */
  dataClass?: DataClass;
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
  /**
   * The params as parsed by the capability's own schema. Null on every human
   * step, including the ones that became human BECAUSE their params did not
   * parse. The runner hands this to the primitive and never re-parses.
   */
  params: Record<string, unknown> | null;
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
  mode_not_executable:
    "The named primitive is not declared READ or PREPARE; only those run automatically.",
  /* ───────────────────────── 1E-alpha reasons ───────────────────────── */
  data_class_forbids_reach:
    "This capability sends its input outside the platform, and this mandate's data may not leave it.",
  provider_step_beside_client_file:
    "The mandate reads a client file, so no step in it may send data to an outside service.",
  invalid_params: "The step's frozen configuration does not satisfy its capability.",
  unknown_reach: "The named primitive does not declare where it sends data.",
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
    gate.sensitiveData || gate.dataClass === "personal_sensitive"
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
      params: null,
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

  /**
   * THE MIXING RULE, and the reason 1E-alpha can read client files at all.
   *
   * The class system says a `provider` capability may only ever see
   * `public_business` data. That is necessary but not sufficient, because a
   * plan can hold both kinds of step: ingest the client's supplier list, then
   * research something on the web. Nothing in a linear topology stops rows
   * from the first reaching the second, and a payload does not carry its class
   * per row.
   *
   * So the rule is drawn at the mandate, coarsely and on purpose: if ANY step
   * in this plan reads a client attachment, then NO step in it may talk to an
   * outside service. The cost is real — a mandate that wanted both loses its
   * research automation to a person — and it is the right trade at this stage,
   * because the alternative is per-row provenance tracking through every
   * transform, which is exactly the kind of cleverness that eventually leaks.
   */
  const mandateReadsFiles = steps.some((s) => primitiveReadsFiles(s.primitiveId));

  const compiled: CompiledStep[] = steps.map((s) => {
    const decision = byOrder.get(s.order);
    /**
     * THE MODE CHECK, WHICH USED TO BE A COMMENT.
     *
     * registry.ts has asserted since 1B that the compiler refuses any step
     * whose primitive is not READ or PREPARE. It never did: this file cannot
     * import REGISTRY (that module is `server-only`, this one is pure by
     * design), so the assertion protected nothing and the first WRITE
     * primitive anyone added would simply have run.
     *
     * PLAN_PRIMITIVE_MODES carries the same fact in an import-free module, so
     * the refusal is real. A primitive whose mode is unknown or outside the
     * executable set becomes human work like every other thing this compiler
     * cannot prove runnable.
     */
    const mode = primitiveModeOf(s.primitiveId);
    const modeAllowed =
      s.primitiveId === null || (mode !== null && EXECUTABLE_PRIMITIVE_MODES.includes(mode));

    /**
     * WHERE THIS STEP SENDS ITS INPUT, checked against what the mandate's data
     * is allowed to have seen. A primitive with no declared reach is refused
     * rather than assumed local: "I do not know who receives this" has to fail
     * the same way as "a provider receives this", or the default becomes the
     * dangerous branch the first time someone adds an id and forgets a table.
     */
    const reach = s.primitiveId === null ? null : primitiveReachOf(s.primitiveId);
    const cls = gate.dataClass ?? "public_business";
    const reachKnown = s.primitiveId === null || reach !== null;
    const reachAllowedForClass = reach === null ? s.primitiveId === null : reachMayProcess(reach, cls);
    const reachAllowedBesideFiles = reach !== "provider" || !mandateReadsFiles;

    // Params are validated here and nowhere else. `null` from the parser is a
    // refusal, never an empty object: see primitive-params.ts.
    const parsedParams = s.primitiveId === null ? null : parsePrimitiveParams(s.primitiveId, s.params);
    const paramsOk = s.primitiveId === null || parsedParams !== null;

    const automatable =
      decision?.automatable === true &&
      modeAllowed &&
      reachKnown &&
      reachAllowedForClass &&
      reachAllowedBesideFiles &&
      paramsOk;

    return {
      planStepId: s.planStepId,
      order: s.order,
      title: s.title,
      primitiveId: s.primitiveId,
      primitiveVersion: s.primitiveVersion,
      executionMode: automatable ? "automated" : "human",
      handoffReason: automatable
        ? null
        : // The topology's own verdict wins when it has one: "not in the
          // registry" and "depends on a human step" are more useful to an
          // operator than a generic mode refusal, and an unknown id has no
          // declared mode by definition. The mode reason is reserved for the
          // case it actually describes: a step the topology WOULD have
          // automated, refused because its primitive is not READ or PREPARE.
          (decision?.reason && HANDOFF_REASONS[decision.reason]) ||
          (!modeAllowed
            ? HANDOFF_REASONS.mode_not_executable
            : !reachKnown
              ? HANDOFF_REASONS.unknown_reach
              : !reachAllowedForClass
                ? HANDOFF_REASONS.data_class_forbids_reach
                : !reachAllowedBesideFiles
                  ? HANDOFF_REASONS.provider_step_beside_client_file
                  : !paramsOk
                    ? HANDOFF_REASONS.invalid_params
                    : HANDOFF_REASONS.no_primitive),
      params: automatable ? parsedParams : null,
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
