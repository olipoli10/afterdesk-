import { describe, expect, it } from "vitest";
import {
  AUTOMATION_COST_POLICIES,
  CURRENT_AUTOMATION_COST_POLICY,
  centsToMicros,
  effectiveConservativeMicros,
  effectiveExpectedMicros,
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
    expect(CURRENT_AUTOMATION_COST_POLICY).toBe("ac2");
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

  it("bounds the allowance by both the share and the absolute cap", () => {
    const rule = AUTOMATION_COST_POLICIES.ac1.ceilingRule;
    // A $10 mandate: 40% of $10 is $4, below the $20 cap, so the SHARE binds.
    expect(allowedCeilingMicros(1_000, rule)).toBe(4_000_000n);
    // A $1,000,000 mandate: 40% would be enormous, so the CAP binds. Both
    // bounds apply and the smaller always wins.
    expect(allowedCeilingMicros(100_000_000, rule)).toBe(BigInt(rule.absoluteCapMicros));
  });
});
