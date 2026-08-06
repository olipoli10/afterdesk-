import { currentPrimitiveVersion } from "@/lib/ai-work-engine/schemas";

/**
 * WHICH STEPS THE MACHINE MAY RUN. Pure code, no model, no database — this is
 * the function the compiler uses after a client has accepted a plan, and a
 * signed contract is never reinterpreted by a model.
 *
 * A step is automatable only if ALL of these hold:
 *   1. its executor is not "human";
 *   2. it names a primitive the registry currently implements AT THE PINNED
 *      VERSION (a primitive whose behaviour changed since the plan was
 *      accepted is a different primitive as far as that contract is
 *      concerned);
 *   3. every step it transitively depends on is itself automatable.
 *
 * Rule 3 is the demotion rule and it is what keeps the promised topology true
 * at execution time: machine work that sits behind a person's judgment cannot
 * run before that judgment exists, so it becomes part of the human package.
 * The prompt asks the planner for the right shape; this function does not
 * trust it.
 *
 * Nothing here throws and nothing is ever "invalid": the worst case is that
 * every step comes back human, which is exactly how the platform worked
 * before any of this existed.
 */

export type TopologyStep = {
  order: number;
  executor: "ai" | "human" | "deterministic_code";
  primitiveId: string | null;
  /** The version frozen onto the step when the plan version was written. */
  primitiveVersion: number | null;
  dependsOnOrder: number[];
};

export type TopologyDecision = {
  order: number;
  automatable: boolean;
  /** Why not, for the admin console. Null when automatable. */
  reason:
    | null
    | "human_step"
    | "no_primitive"
    | "unknown_primitive"
    | "primitive_version_changed"
    | "depends_on_human";
};

export type Topology = {
  decisions: TopologyDecision[];
  automatableOrders: number[];
  humanOrders: number[];
  /** True when a machine step was demoted purely by rule 3. */
  demotedOrders: number[];
};

/**
 * Resolution order matters for the reason string: we report the FIRST reason
 * that applies, checking the step's own properties before its dependencies,
 * so "this is a human step" never gets reported as "it depends on a human".
 */
function ownReason(step: TopologyStep): TopologyDecision["reason"] {
  if (step.executor === "human") return "human_step";
  if (step.primitiveId === null) return "no_primitive";
  const current = currentPrimitiveVersion(step.primitiveId);
  if (current === null) return "unknown_primitive";
  if (step.primitiveVersion !== current) return "primitive_version_changed";
  return null;
}

export function resolveTopology(steps: TopologyStep[]): Topology {
  const byOrder = new Map(steps.map((s) => [s.order, s]));
  const decided = new Map<number, TopologyDecision["reason"]>();

  /**
   * Depth-first with an explicit in-progress set: a plan is data the model
   * wrote, so a dependency cycle is possible and must not hang the compiler.
   * A step inside a cycle cannot be proven independent of human judgment, so
   * it is treated as depending on one.
   */
  const inProgress = new Set<number>();
  const resolve = (order: number): TopologyDecision["reason"] => {
    const cached = decided.get(order);
    if (cached !== undefined) return cached;
    if (inProgress.has(order)) return "depends_on_human";

    const step = byOrder.get(order);
    // A dependency on a step that does not exist cannot be proven satisfied.
    if (!step) return "depends_on_human";

    const own = ownReason(step);
    if (own !== null) {
      decided.set(order, own);
      return own;
    }

    inProgress.add(order);
    let reason: TopologyDecision["reason"] = null;
    for (const dep of step.dependsOnOrder) {
      if (dep === order) {
        reason = "depends_on_human";
        break;
      }
      if (resolve(dep) !== null) {
        reason = "depends_on_human";
        break;
      }
    }
    inProgress.delete(order);
    decided.set(order, reason);
    return reason;
  };

  const decisions: TopologyDecision[] = steps.map((s) => {
    const reason = resolve(s.order);
    return { order: s.order, automatable: reason === null, reason };
  });

  return {
    decisions,
    automatableOrders: decisions.filter((d) => d.automatable).map((d) => d.order),
    humanOrders: decisions.filter((d) => !d.automatable).map((d) => d.order),
    demotedOrders: decisions
      .filter((d) => d.reason === "depends_on_human")
      .map((d) => d.order),
  };
}
