/**
 * MAY THE MACHINE STOP HERE, EXACTLY ONCE?
 *
 * Pure code, no model, no database, no clock — this runs after a client has
 * accepted a plan, and a signed contract is never reinterpreted by a model.
 * The same discipline `topology.ts` states for itself, for the same reason.
 *
 * A human work unit is admitted only when the plan has exactly one human step
 * and the whole plan passes THROUGH it: everything else is either work the cut
 * depends on, or work that depends on the cut. Anything running beside it would
 * mean the machine kept going while a person was mid-judgment, which is the one
 * promise this feature exists to keep.
 *
 * Nothing here throws. The caller is the compiler, running against a mandate
 * someone has already paid for: an exception there is an outage, while a
 * refusal is a mandate that stays fully human — exactly how the platform worked
 * before any of this existed.
 */

export type AdmissionStep = {
  order: number;
  executor: "ai" | "human" | "deterministic_code";
  dependsOnOrder: number[];
  /** The cut's frozen effort provenance. Null means UNKNOWN, never zero. */
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
  estimatedMinutesOptimistic: number;
  estimatedMinutesLikely: number;
  estimatedMinutesConservative: number;
};

export type AdmissionEconomics = {
  vaPayoutCents: number | null;
  estimatedMinutes: number | null;
};

export type AdmissionRefusalCause =
  | "unsupported_topology"
  | "malformed_topology"
  | "unmapped_economics";

export type AdmissionVerdict =
  | { admitted: true; cutOrder: number }
  | { admitted: false; cause: AdmissionRefusalCause };

const EXECUTORS = new Set(["ai", "human", "deterministic_code"]);

const malformed = { admitted: false, cause: "malformed_topology" } as const;
const unsupported = { admitted: false, cause: "unsupported_topology" } as const;
const unmappedEconomics = { admitted: false, cause: "unmapped_economics" } as const;

const isOrder = (v: unknown): v is number => Number.isInteger(v);

/**
 * Structural validation covers only what the GRAPH is made of: the order, the
 * executor and the edges. The economic columns are deliberately not checked
 * here — a missing `fixedMinutes` is a real, expected, nameable condition with
 * its own cause, and reporting it as a malformed plan would send an operator to
 * fix the wrong thing (FR-053).
 */
function isWellFormedStep(value: unknown): value is AdmissionStep {
  if (typeof value !== "object" || value === null) return false;
  const step = value as Record<string, unknown>;
  if (!isOrder(step.order)) return false;
  if (typeof step.executor !== "string" || !EXECUTORS.has(step.executor)) return false;
  if (!Array.isArray(step.dependsOnOrder)) return false;
  return step.dependsOnOrder.every(isOrder);
}

/**
 * Kahn's algorithm. It answers both graph questions at once and it is
 * iterative, so a plan with a long chain cannot exhaust the stack and a plan
 * with a cycle cannot hang: the queue simply drains early and the count comes
 * up short. `resolveTopology` reaches the same guarantee with an explicit
 * in-progress set; this is at least as defensive (contracts/runtime-internal.md §1).
 */
function isAcyclic(steps: AdmissionStep[]): boolean {
  const indegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();
  for (const step of steps) {
    indegree.set(step.order, 0);
    dependents.set(step.order, []);
  }
  for (const step of steps) {
    for (const dep of step.dependsOnOrder) {
      indegree.set(step.order, (indegree.get(step.order) ?? 0) + 1);
      dependents.get(dep)!.push(step.order);
    }
  }

  const queue: number[] = [];
  for (const [order, degree] of indegree) if (degree === 0) queue.push(order);

  let settled = 0;
  while (queue.length > 0) {
    const order = queue.pop()!;
    settled += 1;
    for (const dependent of dependents.get(order)!) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }
  return settled === steps.length;
}

/** Every order reachable from `start` by following `edges`, excluding `start`. */
function reachableFrom(start: number, edges: Map<number, number[]>): Set<number> {
  const seen = new Set<number>();
  const stack = [...(edges.get(start) ?? [])];
  while (stack.length > 0) {
    const order = stack.pop()!;
    if (seen.has(order)) continue;
    seen.add(order);
    for (const next of edges.get(order) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

/** R-05 clause 3, and the identical predicate `handoverBlockedForUnknownPayout` applies. */
const isKnownPositive = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function admitHumanCut(
  steps: AdmissionStep[],
  economics: AdmissionEconomics
): AdmissionVerdict {
  // ---- Shape. An unparseable plan is a refusal, never an error.
  if (!Array.isArray(steps)) return malformed;
  if (!steps.every(isWellFormedStep)) return malformed;

  const orders = steps.map((s) => s.order);
  // Duplicate orders make the graph unaddressable: an edge to a repeated order
  // has no single destination, so no closure over it would mean anything.
  if (new Set(orders).size !== steps.length) return malformed;

  const known = new Set(orders);
  for (const step of steps) {
    for (const dep of step.dependsOnOrder) {
      // A dependency on a step that does not exist cannot be proven satisfied.
      if (!known.has(dep)) return malformed;
    }
  }

  if (!isAcyclic(steps)) return malformed;

  /**
   * Precedence is deliberate: malformed outranks unsupported. The
   * ancestor/descendant closure is undefined on a graph with a cycle or a
   * dangling edge, so reporting `unsupported_topology` from one would assert
   * the result of a computation that was never valid.
   */

  // ---- Topology (FR-003). Exactly one human step, and the plan passes through it.
  const humanSteps = steps.filter((s) => s.executor === "human");
  if (humanSteps.length !== 1) return unsupported;

  const cut = humanSteps[0];

  const dependsOn = new Map<number, number[]>();
  const dependedOnBy = new Map<number, number[]>();
  for (const step of steps) {
    dependsOn.set(step.order, []);
    dependedOnBy.set(step.order, []);
  }
  for (const step of steps) {
    for (const dep of step.dependsOnOrder) {
      dependsOn.get(step.order)!.push(dep);
      dependedOnBy.get(dep)!.push(step.order);
    }
  }

  // Ancestors: reachable from the cut by following its dependencies.
  const ancestors = reachableFrom(cut.order, dependsOn);
  // Descendants: the steps from which the cut is reachable — the same walk on
  // the reversed graph.
  const descendants = reachableFrom(cut.order, dependedOnBy);

  for (const step of steps) {
    if (step.order === cut.order) continue;
    if (!ancestors.has(step.order) && !descendants.has(step.order)) {
      // A parallel branch crossing the cut rather than passing through it.
      return unsupported;
    }
  }

  // ---- Economics (FR-035, research R-05). Four booleans over frozen columns.
  //
  // Expected minutes and the three PERT columns are NOT read. FR-035 forbids
  // computing adequacy from an estimate: the estimate is the planner's opinion,
  // the payout is the client's signed contract, and the two are never compared
  // here. This is also not a pricing check — an hourly floor belongs to the
  // existing payout path.
  if (!isKnownPositive(cut.fixedMinutes)) return unmappedEconomics;

  if (typeof economics !== "object" || economics === null) return unmappedEconomics;
  if (!isKnownPositive(economics.vaPayoutCents)) return unmappedEconomics;
  if (!isKnownPositive(economics.estimatedMinutes)) return unmappedEconomics;

  return { admitted: true, cutOrder: cut.order };
}
