/**
 * WHEN THE MACHINE STEPS ASIDE, SOMEBODY DOES THE WORK — AND SOMEBODY PAYS.
 *
 * NO IMPORTS, the discipline of primitive-vocabulary.ts and
 * automation-cost-policy.ts: the quote path, the admin preview and the tests
 * all read this, and none of them may drag a database or a provider SDK in to
 * ask a question this simple.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO END, AND WHY THE FIRST FIX WAS TOO NARROW ──
 *
 * The economic preflight takes automation away from a step it cannot fund and
 * the step becomes human work. `reprice()` then re-prices the demoted plan —
 * but it changes exactly two fields per demoted step (executor to "human", AI
 * cost to zero) and leaves the MINUTES exactly as the planner wrote them. The
 * planner is instructed to write zero human minutes on a machine step, so the
 * demoted plan is strictly CHEAPER than the raw one, and taking the larger of
 * the two pins the price and the payout to their original figures.
 *
 * Measured on 29 real mandates (2026-08-12): 20 of 20 runs carrying a
 * demotion had their client price AND their internal cost unchanged to the
 * cent, and 115 of 115 demoted steps carried zero planned human minutes.
 *
 * The first version of this module closed exactly that hole, gated on one
 * boolean: `demotedForBudget`. Level 3 on Neon (2026-08-12) found the hole was
 * wider than the gate. Two refusal mandates — one flagged `personal_sensitive`,
 * one needing client-system access — had every step reclassified to human by
 * compile.ts's MANDATE-LEVEL GATE, a code path `demotedForBudget` has never
 * heard of. Both still carried a live, un-suppressed AI-suggested price
 * computed from a plan that assumed several of those steps would run as cheap
 * automation. The badge that is supposed to say "do not trust this number"
 * never fired, because the only thing this module ever asked was "did the
 * BUDGET preflight demote you" — and budget was never the reason.
 *
 * ── THE GENERAL INVARIANT, REPLACING THE BUDGET-SPECIFIC ONE ──
 *
 * The question this module answers is no longer "did the budget preflight
 * demote this step". It is:
 *
 *   Does the step run as HUMAN in the FINAL, FULLY COMPILED plan — for ANY
 *   reason — while carrying no human-cost estimate from when it was priced?
 *
 * "Any reason" is the point. Budget, `personal_sensitive`, required access, a
 * missing or unsupported capability, a topology cascade off a demoted
 * producer, a params validation failure, a future compiler rule nobody has
 * written yet — every one of them takes the same path through this function,
 * because every one of them can produce the identical failure: a plan that
 * priced a step as near-free automation, and a compiled workflow that runs it
 * by hand. The caller supplies WHETHER the step ends up human
 * (`executesAsHuman`, from running the real compiler — not a proxy for it) and
 * WHY (`humanizedReason`, for the audit trail); this module never asks the
 * caller to pre-classify the reason into "the kind that counts".
 *
 * A step already planned as human, with real minutes on it, is unaffected: it
 * satisfies `carriesHumanCost` on its own, so it never appears in
 * `unpricedOrders` whatever `executesAsHuman` says about it.
 *
 * ── WHY THIS REFUSES RATHER THAN ESTIMATES ──
 *
 * The obvious fix is a table: "extraction done by hand costs N seconds per
 * unit". We do not have that number. Nobody has run these steps manually
 * under measurement, and inventing a figure would put a fabricated cost
 * inside a client's contract — the same sin as backfilling economics onto
 * contracts that never had them.
 *
 * So the honest branch is the other one: when a step is humanised — by any
 * mechanism — and nobody costed the person's time it now takes, the engine
 * STOPS SUGGESTING A PRICE. It keeps the plan, keeps the reasoning, keeps
 * every fact the operator needs — and hands the number to the person whose
 * job it is. A suggestion the engine knows is wrong is worse than no
 * suggestion, because it is the one an operator can approve in one click.
 *
 * When the estimate DOES exist — a planner that wrote real minutes on a step,
 * or a future measured fallback table — nothing here fires. This is a
 * fail-closed gate on ignorance, not a ban on humanising a step.
 */

/** The shape both callers reduce to: the quote path from the plan it is about
 *  to write, the admin preview from the rows already stored. */
export type HumanizedStepPricing = {
  order: number;
  /**
   * Whether the step runs as human in the FINAL, FULLY COMPILED plan — after
   * every gate the compiler applies: capability/reach/class/topology
   * (compile.ts), the mandate-level sensitivity/access gate, the economic
   * preflight, and any future compiler rule. The caller runs the real
   * compiler and reports its verdict; this module never re-derives it and
   * never asks "was it budget" — that question is exactly what made the
   * first version of this gate too narrow.
   */
  executesAsHuman: boolean;
  /**
   * Operator-facing: why this step is human. Ignored when `executesAsHuman`
   * is false. Carried through to the audit trail so an operator staring at a
   * suppressed price can see WHICH steps did it and for what reason, not only
   * that something, somewhere, was flagged.
   */
  humanizedReason?: string | null;
  /** The planner's own human-effort figures for the step, as written. */
  estimatedMinutesLikely: number | null;
  estimatedMinutesConservative: number | null;
  fixedMinutes: number | null;
  secondsPerUnit: number | null;
};

export type DemotionPricingVerdict = {
  /** Humanised steps whose human cost nothing in the plan accounts for. */
  unpricedOrders: number[];
  /**
   * True when at least one humanisation carries no human cost at all. The
   * quote path must not suggest a price; the admin prices by hand.
   */
  humanCostUnknown: boolean;
  /**
   * order -> reason, for exactly the unpriced orders. The auditable "which
   * step, and why" an operator needs before they can price this by hand with
   * any confidence, rather than a single mandate-wide "trust me".
   */
  unpricedReasons: Record<number, string>;
};

/**
 * A step carries a human cost when ANY of its effort figures is above zero.
 * Null and zero are the same answer here — "nothing was written" and "nothing
 * was needed" are indistinguishable on a step that a machine was going to do,
 * and the safe reading of an indistinguishable pair is the conservative one.
 */
function carriesHumanCost(s: HumanizedStepPricing): boolean {
  return (
    (s.estimatedMinutesLikely ?? 0) > 0 ||
    (s.estimatedMinutesConservative ?? 0) > 0 ||
    (s.fixedMinutes ?? 0) > 0 ||
    (s.secondsPerUnit ?? 0) > 0
  );
}

export function assessDemotionPricing(steps: HumanizedStepPricing[]): DemotionPricingVerdict {
  const unpriced = steps.filter((s) => s.executesAsHuman && !carriesHumanCost(s));
  return {
    unpricedOrders: unpriced.map((s) => s.order),
    humanCostUnknown: unpriced.length > 0,
    unpricedReasons: Object.fromEntries(
      unpriced.map((s) => [s.order, s.humanizedReason ?? "Handed to a person by the compiler."])
    ),
  };
}

/** The operator-facing sentence. One place, so the screen and the reasoning
 *  line cannot drift into describing the same condition differently. */
export const HUMAN_COST_UNKNOWN_NOTICE =
  "HUMAN COST UNKNOWN — MANUAL PRICING REQUIRED: compiling this plan moved work from machine to human, and the plan carries no human effort estimate for it. No price is suggested; price this mandate by hand.";
