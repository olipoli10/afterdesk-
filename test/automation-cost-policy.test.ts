import { describe, expect, it } from "vitest";
import {
  AUTOMATION_COST_POLICIES,
  CURRENT_AUTOMATION_COST_POLICY,
  centsToMicros,
  effectiveConservativeMicros,
  effectiveExpectedMicros,
  attemptsAllowedForStep,
  attemptsUnder,
  microsToCentsCeil,
  policyFor,
  primitiveCostUnder,
} from "@/lib/ai-work-engine/automation-cost-policy";
import {
  allowedCeilingMicros,
  runAutomationPreflight,
  type PreflightStep,
} from "@/lib/ai-work-engine/automation-preflight";
import { approxTokens, worstCaseMicros } from "@/lib/ai-work-engine/metered-call";
import { REGISTRY } from "@/lib/ai-work-engine/registry";
import {
  MAX_DESCRIPTION_CHARS_IN_PROMPT,
  MAX_TARGETS_IN_PROMPT,
} from "@/lib/ai-work-engine/primitives/research";

const step = (over: Partial<PreflightStep> = {}): PreflightStep => ({
  order: 1,
  primitiveId: "research.web_search",
  primitiveVersion: 1,
  automatable: true,
  estimatedAiCostCents: 25,
  ...over,
});

describe("a policy is a historical record, not a mutable setting", () => {
  /**
   * ac1 is pinned BY VALUE. Editing a number here fails this test on purpose:
   * an economic change must add a new version. Accepted contracts no longer
   * read this table (their figures are materialised on the plan steps), so an
   * in-place edit would not break them — it would destroy the provenance, the
   * ability to answer "on what basis was that quote built".
   */
  it("ac1 still says exactly what it said when quotes were built on it", () => {
    expect(AUTOMATION_COST_POLICIES.ac1.perPrimitive["research.web_search"]).toEqual({
      expectedMicros: 500_000,
      maxPerAttemptMicros: 2_000_000,
    });
    expect(AUTOMATION_COST_POLICIES.ac1.perPrimitive["extract.structured_rows"]).toEqual({
      expectedMicros: 250_000,
      maxPerAttemptMicros: 600_000,
    });
    expect(AUTOMATION_COST_POLICIES.ac1.ceilingRule).toEqual({
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000,
    });
  });

  it("prices nothing for a pure primitive, and absence is the statement", () => {
    expect(primitiveCostUnder("ac1", "build.csv")).toBeNull();
    expect(primitiveCostUnder("ac1", "split.exceptions")).toBeNull();
    expect(primitiveCostUnder("ac1", null)).toBeNull();
  });

  it("an unknown version resolves to nothing rather than to a neighbour", () => {
    expect(policyFor("ac_does_not_exist")).toBeNull();
    expect(primitiveCostUnder("ac_does_not_exist", "research.web_search")).toBeNull();
  });

  it("names the version new quotes are built with", () => {
    expect(policyFor(CURRENT_AUTOMATION_COST_POLICY)).not.toBeNull();
  });

  it("ac2 exists as a NEW version, and ac1 was not edited to become it", () => {
    // The rule the whole scheme depends on: a number changes by adding a
    // version. ac1 answering $2.00 forever is what lets anyone reconstruct
    // the basis of a quote built under it.
    expect(AUTOMATION_COST_POLICIES.ac1.perPrimitive["research.web_search"]!.maxPerAttemptMicros)
      .toBe(2_000_000);
    expect(AUTOMATION_COST_POLICIES.ac2.perPrimitive["research.web_search"]!.maxPerAttemptMicros)
      .toBe(3_000_000);
  });

  it("ac2 is pinned by value too, and funding retries did not edit it", () => {
    /**
     * ac3 was added because the ceiling funded one attempt while the runner was
     * allowed two. The tempting fix was to write `maxAttempts: 2` into ac2 —
     * one line, no new version. It would have been a lie about every quote
     * already built on ac2, all of which set money aside for a single try.
     */
    expect(AUTOMATION_COST_POLICIES.ac2.perPrimitive["research.web_search"]).toEqual({
      expectedMicros: 500_000,
      maxPerAttemptMicros: 3_000_000,
    });
    expect(AUTOMATION_COST_POLICIES.ac2.perPrimitive["extract.structured_rows"]).toEqual({
      expectedMicros: 250_000,
      maxPerAttemptMicros: 600_000,
    });
  });

  it("ac3 funds the retries the runner is allowed to make", () => {
    expect(AUTOMATION_COST_POLICIES.ac3.perPrimitive["research.web_search"]).toEqual({
      expectedMicros: 500_000,
      maxPerAttemptMicros: 3_000_000,
      maxAttempts: 2,
    });
    expect(AUTOMATION_COST_POLICIES.ac3.perPrimitive["extract.structured_rows"]).toEqual({
      expectedMicros: 250_000,
      maxPerAttemptMicros: 600_000,
      maxAttempts: 3,
    });
    expect(CURRENT_AUTOMATION_COST_POLICY).toBe("ac3");
  });

  it("a version that never named a retry budget funded exactly ONE attempt", () => {
    /**
     * Not a convenience default. ac1 and ac2 reserved one worst-case attempt
     * per step and nothing more, so one attempt is the FACT about what they
     * paid for. Reading their silence as "however many the registry allows
     * today" would let a deploy spend money those quotes never accounted for.
     */
    expect(attemptsUnder("ac1", "research.web_search")).toBe(1);
    expect(attemptsUnder("ac2", "research.web_search")).toBe(1);
    expect(attemptsUnder("ac3", "research.web_search")).toBe(2);
    expect(attemptsUnder("ac3", "extract.structured_rows")).toBe(3);
    // A primitive the policy does not price funds no attempts, because it
    // reserves no money: the registry alone decides how often it replays.
    expect(attemptsUnder("ac3", "build.csv")).toBe(0);
    expect(attemptsUnder("ac_removed", "research.web_search")).toBe(0);
  });
});

describe("the frozen ceiling actually covers the runtime worst case", () => {
  /**
   * THE TEST THAT WOULD HAVE CAUGHT ac1.
   *
   * ac1's $2.00 was the search-loop arithmetic with NO room for the prompt,
   * and the prompt embedded the client's description. A long brief pushed the
   * runtime estimate past the frozen cap, so meteredCall refused before
   * dispatch, the refusal classified as `unknown` and retried, and the run
   * paused for no reason but the length of its own description.
   *
   * The prompt is bounded now, and this pins the two halves together: the
   * largest prompt research can build must still fit under what the policy
   * lets one attempt reserve.
   */
  it("a maximal bounded prompt still fits under the ac2 research cap", () => {
    const cap = BigInt(
      AUTOMATION_COST_POLICIES.ac2.perPrimitive["research.web_search"]!.maxPerAttemptMicros
    );
    // The largest prompt the bounds allow: system + brief fields + the target
    // list at its cap + the truncated description.
    const maximalChars =
      2_000 + 2_200 + MAX_TARGETS_IN_PROMPT * 120 + MAX_DESCRIPTION_CHARS_IN_PROMPT;
    const worst = worstCaseMicros({
      model: "claude-opus-5", // the dearest tier, which is also the default
      maxOutputTokens: 12_000,
      approxInputTokens: approxTokens("x".repeat(maximalChars)),
      maxSearches: 12,
    });
    expect(BigInt(worst)).toBeLessThanOrEqual(cap);
  });

  it("would have FAILED against the ac1 cap, which is why ac2 exists", () => {
    const oldCap = BigInt(
      AUTOMATION_COST_POLICIES.ac1.perPrimitive["research.web_search"]!.maxPerAttemptMicros
    );
    const maximalChars =
      2_000 + 2_200 + MAX_TARGETS_IN_PROMPT * 120 + MAX_DESCRIPTION_CHARS_IN_PROMPT;
    const worst = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 12_000,
      approxInputTokens: approxTokens("x".repeat(maximalChars)),
      maxSearches: 12,
    });
    expect(BigInt(worst)).toBeGreaterThan(oldCap);
  });

  it("extract fits under its cap too", () => {
    const cap = BigInt(
      AUTOMATION_COST_POLICIES.ac2.perPrimitive["extract.structured_rows"]!.maxPerAttemptMicros
    );
    // Two 60k-character slices, no search loop.
    const worst = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 16_000,
      approxInputTokens: approxTokens("x".repeat(122_000)),
      maxSearches: 0,
    });
    expect(BigInt(worst)).toBeLessThanOrEqual(cap);
  });
});

describe("a policy cost is a FLOOR, never an override", () => {
  it("raises a plan estimate that is below the policy", () => {
    // 0.25$ planned, 0.75$ policy -> 0.75$.
    expect(effectiveExpectedMicros(centsToMicros(25), 750_000n)).toBe(750_000n);
  });

  it("KEEPS a plan estimate that is above the policy", () => {
    /**
     * The planner read a brief the policy never saw. Lowering its number to a
     * generic average would underprice exactly the jobs that are hardest,
     * which is the opposite of what a floor is for.
     */
    expect(effectiveExpectedMicros(centsToMicros(130), 750_000n)).toBe(1_300_000n);
  });

  it("applies the same rule to the conservative scenario", () => {
    expect(effectiveConservativeMicros(centsToMicros(25), 2_000_000n)).toBe(2_000_000n);
    expect(effectiveConservativeMicros(centsToMicros(300), 2_000_000n)).toBe(3_000_000n);
  });

  it("leaves the plan alone when the policy prices nothing", () => {
    expect(effectiveExpectedMicros(centsToMicros(40), null)).toBe(400_000n);
  });
});

describe("cents and micros convert in integer arithmetic only", () => {
  it("round trips without a float on the money path", () => {
    expect(centsToMicros(1)).toBe(10_000n);
    expect(centsToMicros(0)).toBe(0n);
    expect(centsToMicros(-5)).toBe(0n);
    expect(microsToCentsCeil(10_000n)).toBe(1);
    // Rounded UP: an under-reported cost is the one that drifts.
    expect(microsToCentsCeil(1n)).toBe(1);
    expect(microsToCentsCeil(19_999n)).toBe(2);
  });
});

describe("the preflight decides the ceiling before the quote", () => {
  it("sums one worst-case attempt of each billable step", () => {
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1 }),
        step({ order: 2, primitiveId: "extract.structured_rows" }),
        step({ order: 3, primitiveId: "build.csv" }), // pure, prices nothing
      ],
      internalCostCents: 10_000, // $100 internal -> $40 allowed
      policyVersion: "ac1",
    });
    // 2.00 + 0.60 = 2.60, under the $40 allowance.
    expect(out.conservativeAutomationCostMicros).toBe(2_600_000n);
    expect(out.automationSpendCeilingMicros).toBe(2_600_000n);
    expect(out.demotedCount).toBe(0);
  });

  it("holds the three arithmetic invariants", () => {
    const out = runAutomationPreflight({
      steps: [step({ order: 1 }), step({ order: 2, primitiveId: "extract.structured_rows" })],
      internalCostCents: 10_000,
      policyVersion: "ac1",
    });
    expect(out.expectedAutomationCostMicros).toBeGreaterThanOrEqual(0n);
    expect(out.conservativeAutomationCostMicros).toBeGreaterThanOrEqual(
      out.expectedAutomationCostMicros
    );
    expect(out.automationSpendCeilingMicros).toBeGreaterThanOrEqual(
      out.conservativeAutomationCostMicros
    );
    for (const s of out.steps) {
      if (s.primitiveId !== null) {
        expect(s.maxCostMicrosPerAttemptAtQuote).not.toBeNull();
        expect(s.maxCostMicrosPerAttemptAtQuote!).toBeGreaterThan(0n);
      }
    }
  });

  it("DEMOTES before the quote when the economic rule refuses the risk", () => {
    /**
     * A $3 mandate allows $1.20 of automation exposure. One research attempt
     * alone can cost $2. Demoting here is the whole point: doing it after
     * payment would mean the client paid for automation that then did not run.
     */
    const out = runAutomationPreflight({
      steps: [step({ order: 1 }), step({ order: 2, primitiveId: "extract.structured_rows" })],
      internalCostCents: 300,
      policyVersion: "ac1",
    });
    expect(out.demotedCount).toBeGreaterThan(0);
    // The costliest step goes first: research ($2.00) before extract ($0.60).
    expect(out.steps.find((s) => s.order === 1)?.demotedForBudget).toBe(true);
  });

  it("ends at a fully human plan rather than an unaffordable one", () => {
    const out = runAutomationPreflight({
      steps: [step({ order: 1 }), step({ order: 2, primitiveId: "extract.structured_rows" })],
      internalCostCents: 1, // allows almost nothing
      policyVersion: "ac1",
    });
    expect(out.steps.every((s) => s.primitiveId === null)).toBe(true);
    expect(out.automationSpendCeilingMicros).toBe(0n);
    expect(out.conservativeAutomationCostMicros).toBe(0n);
  });

  it("demotes deterministically: same input, same plan, twice", () => {
    const steps = [
      step({ order: 1 }),
      step({ order: 2, primitiveId: "extract.structured_rows" }),
      step({ order: 3, primitiveId: "research.web_search" }),
    ];
    const a = runAutomationPreflight({ steps, internalCostCents: 800, policyVersion: "ac1" });
    const b = runAutomationPreflight({ steps, internalCostCents: 800, policyVersion: "ac1" });
    expect(a.steps.map((s) => s.demotedForBudget)).toEqual(b.steps.map((s) => s.demotedForBudget));
    // Tie-break: equal cost, the LATER step goes first, so the early pipeline
    // stages everything downstream reads from survive longest.
    expect(a.steps.find((s) => s.order === 3)?.demotedForBudget).toBe(true);
  });

  it("an unknown policy version authorises nothing at all", () => {
    const out = runAutomationPreflight({
      steps: [step()],
      internalCostCents: 100_000,
      policyVersion: "ac_removed",
    });
    expect(out.automationSpendCeilingMicros).toBe(0n);
    expect(out.steps[0].primitiveId).toBeNull();
  });

  /**
   * THE BLOCKER THIS SUITE EXISTS TO PIN.
   *
   * `conservative` and the spend ceiling used to be the same number, so the
   * ceiling funded one attempt per step while the contract allowed two. A
   * transient provider error was classified retryable, the retry was refused
   * for want of budget, and the run paused until the six-hour stall sweep
   * handed the mandate to a person. The two figures are now distinct on
   * purpose, and these tests fail if anything collapses them again.
   */
  it("the ceiling funds EVERY attempt the contract allows, not just the first", () => {
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1 }), // research: $3.00 x 2 attempts
        step({ order: 2, primitiveId: "extract.structured_rows" }), // $0.60 x 3
      ],
      internalCostCents: 10_000, // $100 internal -> $40 allowed
      policyVersion: "ac3",
    });
    // One pass at worst: 3.00 + 0.60.
    expect(out.conservativeAutomationCostMicros).toBe(3_600_000n);
    // Every funded attempt: 3.00x2 + 0.60x3 = 7.80.
    expect(out.automationSpendCeilingMicros).toBe(7_800_000n);
    expect(out.demotedCount).toBe(0);
  });

  it("keeps expected <= conservative <= ceiling, with the ceiling STRICTLY above", () => {
    const out = runAutomationPreflight({
      steps: [step({ order: 1 }), step({ order: 2, primitiveId: "extract.structured_rows" })],
      internalCostCents: 10_000,
      policyVersion: "ac3",
    });
    expect(out.expectedAutomationCostMicros).toBeLessThanOrEqual(
      out.conservativeAutomationCostMicros
    );
    expect(out.conservativeAutomationCostMicros).toBeLessThan(out.automationSpendCeilingMicros);
  });

  it("freezes the attempt count per step, alongside the per-attempt cost", () => {
    const out = runAutomationPreflight({
      steps: [step({ order: 1 }), step({ order: 2, primitiveId: "extract.structured_rows" })],
      internalCostCents: 10_000,
      policyVersion: "ac3",
    });
    expect(out.steps.find((s) => s.order === 1)?.maxAttemptsAtQuote).toBe(2);
    expect(out.steps.find((s) => s.order === 2)?.maxAttemptsAtQuote).toBe(3);
  });

  it("a demoted step carries no attempt budget, because it will not run", () => {
    const out = runAutomationPreflight({
      steps: [step({ order: 1 })],
      internalCostCents: 1,
      policyVersion: "ac3",
    });
    expect(out.steps[0].maxAttemptsAtQuote).toBeNull();
    expect(out.steps[0].maxCostMicrosPerAttemptAtQuote).toBeNull();
  });

  /**
   * The mandate where funding the retries is what causes the demotion. Under
   * the old arithmetic this plan fit and the retry was silently unfunded; now
   * the refusal happens BEFORE the quote, where a refusal is still free.
   */
  it("DEMOTES a plan that fits one attempt each but not the attempts it funds", () => {
    const steps = [step({ order: 1 })]; // research: $3.00 per attempt
    // $10 internal -> $4.00 allowed. One attempt fits; two ($6.00) do not.
    const oneAttempt = runAutomationPreflight({
      steps,
      internalCostCents: 1_000,
      policyVersion: "ac2",
    });
    expect(oneAttempt.demotedCount).toBe(0);

    const funded = runAutomationPreflight({
      steps,
      internalCostCents: 1_000,
      policyVersion: "ac3",
    });
    expect(funded.demotedCount).toBe(1);
    expect(funded.automationSpendCeilingMicros).toBe(0n);
  });

  it("demotes on what a step can actually spend, not on one attempt of it", () => {
    /**
     * The fixture is built so the two rankings choose DIFFERENT victims, which
     * is the only way this test says anything. An earlier version used numbers
     * where both rankings picked the same step, so it passed against the very
     * code it was meant to forbid.
     *
     *   extract  max($2.50 planned, $0.60 policy) = $2.50 x 3 attempts = $7.50
     *   research max($0.10 planned, $3.00 policy) = $3.00 x 2 attempts = $6.00
     *
     * Per ATTEMPT research looks dearer ($3.00 against $2.50), so ranking that
     * way drops research and leaves $7.50 of exposure standing. Per CONTRACT
     * extract is dearer, and dropping it leaves $6.00. Both fit under the
     * $8.00 allowance, so the plan is affordable either way and the only thing
     * being tested is which step survives.
     */
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1, primitiveId: "extract.structured_rows", estimatedAiCostCents: 250 }),
        step({ order: 2, estimatedAiCostCents: 10 }),
      ],
      internalCostCents: 2_000, // $20 internal -> $8.00 allowed
      policyVersion: "ac3",
    });
    expect(out.steps.find((s) => s.order === 1)?.demotedForBudget).toBe(true);
    expect(out.steps.find((s) => s.order === 2)?.demotedForBudget).toBe(false);
    expect(out.automationSpendCeilingMicros).toBe(6_000_000n);
  });

  it("bounds the allowance by both the share and the absolute cap", () => {
    const rule = AUTOMATION_COST_POLICIES.ac1.ceilingRule;
    // A $10 mandate: 40% of $10 is $4, below the $20 cap, so the SHARE binds.
    expect(allowedCeilingMicros(1_000, rule)).toBe(4_000_000n);
    // A $1,000,000 mandate: 40% would be enormous, so the CAP binds. Both
    // bounds apply and the smaller always wins.
    expect(allowedCeilingMicros(100_000_000, rule)).toBe(BigInt(rule.absoluteCapMicros));
  });
});

/**
 * THE RULE THE RUNNER OBEYS, TESTED AS BEHAVIOUR.
 *
 * It used to be covered only by source-string pins in workflow-runner.test.ts,
 * which is not coverage: inverting the comparison inside it left every one of
 * those pins matching and the whole suite green, while the code silently
 * promised a retry the contract had not funded.
 */
describe("how many attempts an accepted step may make", () => {
  const research = { billable: true, maxAttempts: 2 };
  const pure = { billable: false, maxAttempts: 3 };

  it("uses the contract's number for a billable step, and only that", () => {
    expect(attemptsAllowedForStep(research, 2)).toBe(2);
  });

  it("does NOT let a lowered registry withdraw an attempt the client paid for", () => {
    // The mirror of the original defect. A deploy that decides research is
    // worth replaying only once must not shorten a contract that funded two:
    // the money is already set aside and the client was quoted on it.
    expect(attemptsAllowedForStep({ billable: true, maxAttempts: 1 }, 2)).toBe(2);
  });

  it("does NOT let a raised registry spend money the contract never funded", () => {
    // The defect itself. The registry said two, the ceiling funded one, and
    // the retry was refused by the budget after the run had already committed
    // to making it.
    expect(attemptsAllowedForStep({ billable: true, maxAttempts: 4 }, 1)).toBe(1);
  });

  it("reads a contract quoted before funded retries as exactly ONE", () => {
    expect(attemptsAllowedForStep(research, null)).toBe(1);
  });

  it("leaves a non-billable step to the registry, which is its only bound", () => {
    // Nothing is reserved for a pure primitive, so no contractual figure
    // exists for it — and none is needed.
    expect(attemptsAllowedForStep(pure, null)).toBe(3);
    expect(attemptsAllowedForStep(pure, 1)).toBe(3);
  });
});

/**
 * The registry states an operational judgement (how often a primitive is worth
 * replaying) and ac3 states a financial one (how many attempts were funded).
 * They are two numbers about the same thing, maintained by hand in two files,
 * and nothing made them agree. A quote funding fewer attempts than the runner
 * would attempt is the original blocker; funding more is money set aside for
 * tries that will never happen.
 */
describe("ac3 and the registry agree about attempts", () => {
  for (const [id, primitive] of Object.entries(REGISTRY)) {
    if (!primitive.billable) continue;
    it(`${id}: the policy funds exactly what the registry would attempt`, () => {
      expect(attemptsUnder("ac3", id)).toBe(primitive.maxAttempts);
    });
  }

  it("is not vacuous: there really are billable primitives to check", () => {
    expect(Object.values(REGISTRY).filter((p) => p.billable).length).toBeGreaterThan(0);
  });
});
