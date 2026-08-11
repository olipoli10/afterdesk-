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
import {
  MAX_CANDIDATE_URLS_IN_PROMPT,
  MAX_CANDIDATE_URL_CHARS,
  MAX_FIELDS_CHARS_IN_PROMPT,
  MAX_OBJECTIVE_CHARS_IN_PROMPT,
} from "@/lib/ai-work-engine/primitives/fetch";
import {
  WEB_FETCH_ENVELOPE,
  absoluteWorstCaseMicros,
} from "@/lib/ai-work-engine/web-fetch-envelope";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";

const step = (over: Partial<PreflightStep> = {}): PreflightStep => ({
  order: 1,
  primitiveId: "research.web_search",
  primitiveVersion: 1,
  automatable: true,
  estimatedAiCostCents: 25,
  dependsOnOrder: [],
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
    // ac3 also never priced a fetch: web.fetch postdates it, and a quote
    // built on ac3 must keep funding zero attempts of it forever.
    expect(attemptsUnder("ac3", "web.fetch")).toBe(0);
  });

  it("ac4 prices web.fetch and copies research and extract forward unchanged", () => {
    /**
     * The research and extract rows are pinned EQUAL to ac3's on purpose: a
     * research+extract-only mandate must quote to the cent under ac4 what it
     * quoted under ac3, so the only observable change is that a plan may now
     * carry a fetch step.
     */
    expect(AUTOMATION_COST_POLICIES.ac4.perPrimitive["research.web_search"]).toEqual(
      AUTOMATION_COST_POLICIES.ac3.perPrimitive["research.web_search"]
    );
    expect(AUTOMATION_COST_POLICIES.ac4.perPrimitive["extract.structured_rows"]).toEqual(
      AUTOMATION_COST_POLICIES.ac3.perPrimitive["extract.structured_rows"]
    );
    /**
     * The fetch row is probe arithmetic (see the ac4 comment): ONE funded
     * attempt because the provider's content bound exempts binary content,
     * so a disguised binary is the one overrun a retry must not repeat; a
     * cap above the measured residual; an expected figure that is derived,
     * doubled and explicitly uncalibrated until beta2 measures it.
     */
    expect(AUTOMATION_COST_POLICIES.ac4.perPrimitive["web.fetch"]).toEqual({
      expectedMicros: 300_000,
      maxPerAttemptMicros: 4_000_000,
      maxAttempts: 1,
    });
    expect(CURRENT_AUTOMATION_COST_POLICY).toBe("ac4");
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

  it("a maximal bounded fetch call fits under the ac4 cap AT THE SCHEMA MAXIMA", () => {
    /**
     * Computed against the zod schema's MAXIMA, not its defaults, because the
     * bounds are per-step params rather than code constants: the largest
     * values the schema will freeze are the largest values an accepted
     * contract can carry, and the cap must cover exactly those. Raising
     * either maximum without a new policy version fails here on purpose.
     */
    const maxParams = parsePrimitiveParams("web.fetch", {
      maxFetches: 3,
      maxContentTokens: 10_000,
    });
    expect(maxParams).not.toBe(null);
    expect(parsePrimitiveParams("web.fetch", { maxFetches: 4 })).toBe(null);
    expect(parsePrimitiveParams("web.fetch", { maxContentTokens: 10_001 })).toBe(null);

    const cap = BigInt(
      AUTOMATION_COST_POLICIES.ac4.perPrimitive["web.fetch"]!.maxPerAttemptMicros
    );
    // The largest prompt the bounds allow: system + labels + defanged brief
    // fields at their caps + the full candidate list at the URL length cap.
    const maximalChars =
      2_000 +
      MAX_OBJECTIVE_CHARS_IN_PROMPT +
      MAX_FIELDS_CHARS_IN_PROMPT +
      MAX_CANDIDATE_URLS_IN_PROMPT * (MAX_CANDIDATE_URL_CHARS + 5);
    const worst = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 4_000,
      approxInputTokens: approxTokens("x".repeat(maximalChars)),
      maxSearches: 0,
      maxFetches: 3,
      maxFetchContentTokens: 10_000,
    });
    expect(BigInt(worst)).toBeLessThanOrEqual(cap);
    // The headroom above the TEXT worst case is not the safety argument any
    // more — the absolute-ceiling theorem below is — but it stays pinned:
    // a cap sitting on the text bound would have no room to also be above
    // the theorem's figure.
    expect(BigInt(worst) * 4n).toBeLessThanOrEqual(cap);
  });

  it("THE ABSOLUTE PROVIDER CEILING IS PROVED: settled above held cannot happen under this contract", () => {
    /**
     * The release-gate theorem, pinned as arithmetic. A fetched binary
     * escapes max_content_tokens (probe-proved), so no per-document figure
     * bounds an attempt. What bounds it is physics plus one documented rule:
     *
     *   - no loop iteration can be inferred — and therefore billed as model
     *     input — beyond the model's context window;
     *   - iterations are bounded by maxFetches + 1, because failed fetches
     *     count against max_uses (documented) and a model pass happens only
     *     after a tool result (our runner never continues a pause_turn).
     *
     * So the absolute billable exposure of ONE invocation is at most
     * (F+1) iterations, each at the full window, priced at the model's
     * DEAREST per-token rate (cache-write exceeds input on every model),
     * plus the full output allowance per iteration. Note what is NOT
     * assumed: nothing here treats a context overflow as free — tokens
     * beyond the window simply cannot run.
     *
     * This number must sit UNDER ac4's frozen per-attempt hold, because the
     * runner reserves exactly that hold: with the theorem holding, a settle
     * above the hold is mathematically impossible under the supported
     * contract, and the settle-over-hold card on /admin/reliability is a
     * canary watching for the impossible — never the mechanism by which we
     * discover the estimate was too low.
     *
     * The envelope is pinned FIELD BY FIELD, because the theorem is only
     * true of this exact implementation: changing any field is a deliberate
     * re-proof, not a tweak. The window and rates are the platform
     * documentation's, read 2026-08-11; web_fetch_20260209 with
     * allowed_callers ["direct"] was verified live on this model the same day
     * (probe round 3).
     */
    expect(WEB_FETCH_ENVELOPE).toEqual({
      primitiveVersion: 1,
      provider: "anthropic",
      model: "claude-haiku-4-5",
      toolType: "web_fetch_20260209",
      contextWindowTokens: 200_000,
      maxOutputTokens: 4_000,
      maxFetchesCeiling: 3,
      // $2/MTok: the 1-HOUR cache-write rate, dearest in Haiku 4.5's whole
      // row ($1 base, $1.25 5m-write, $2 1h-write, $0.10 read, $5 output).
      // The reachable maximum here is $1.25 (no extended TTL is set), so the
      // bound is priced ABOVE what this call can actually incur.
      worstInputRateMicrosPerMillion: 2_000_000,
      outputRateMicrosPerMillion: 5_000_000,
    });
    // The envelope describes the capability version the vocabulary declares.
    expect(WEB_FETCH_ENVELOPE.primitiveVersion).toBe(PLAN_PRIMITIVES["web.fetch"]);

    const holdMicros = BigInt(
      AUTOMATION_COST_POLICIES.ac4.perPrimitive["web.fetch"]!.maxPerAttemptMicros
    );
    const ceiling = absoluteWorstCaseMicros(WEB_FETCH_ENVELOPE, 3);

    // 4 iterations x (200,000 x $2/M + 4,000 x $5/M) = 4 x $0.42 = $1.68,
    // against a $4.00 hold: proved, with margin for a revised window or rate.
    expect(ceiling).toBe(1_680_000n);
    expect(ceiling).toBeLessThanOrEqual(holdMicros);
    // ONE funded attempt is part of the same proof: the residual cannot
    // recur on a retry the contract does not fund.
    expect(AUTOMATION_COST_POLICIES.ac4.perPrimitive["web.fetch"]!.maxAttempts).toBe(1);
  });

  it("the bound grows with the frozen fetch count, and is never trimmed back into range", () => {
    /**
     * The guard computes the bound from the fetch count the CONTRACT froze,
     * unclamped. A frozen value beyond today's schema — a plan quoted under a
     * future schema, or hand-edited — must make the bound LARGER (and so fail
     * the runtime guard), never be quietly trimmed to the current ceiling.
     */
    expect(absoluteWorstCaseMicros(WEB_FETCH_ENVELOPE, 1)).toBe(840_000n);
    expect(absoluteWorstCaseMicros(WEB_FETCH_ENVELOPE, 3)).toBe(1_680_000n);
    const beyondSchema = absoluteWorstCaseMicros(WEB_FETCH_ENVELOPE, 20);
    expect(beyondSchema).toBeGreaterThan(
      BigInt(AUTOMATION_COST_POLICIES.ac4.perPrimitive["web.fetch"]!.maxPerAttemptMicros)
    );
  });

  it("the fetch worst case is search-shaped: pre-beta callers are unchanged", () => {
    /**
     * The fetch terms default to zero, so every reservation computed before
     * beta1 is byte-identical arithmetic — the ac1-ac3 pins above stay true
     * of the running code, not merely of the table.
     */
    const before = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 12_000,
      approxInputTokens: 5_000,
      maxSearches: 12,
    });
    const withZeroFetch = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 12_000,
      approxInputTokens: 5_000,
      maxSearches: 12,
      maxFetches: 0,
      maxFetchContentTokens: 0,
    });
    expect(withZeroFetch).toBe(before);
  });

  it("a call combining search AND fetch reserves the interleaved bound, not the sum", () => {
    /**
     * No beta1 caller combines the two tools, and the first one that does
     * must not quietly under-reserve: every fetched page can re-enter on
     * every SEARCH turn too, so the safe bound is (searchSet·S + page·F) ×
     * (S+F), which dominates the two separate triangulars.
     */
    const combined = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 4_000,
      approxInputTokens: 1_000,
      maxSearches: 2,
      maxFetches: 2,
      maxFetchContentTokens: 10_000,
    });
    const searchOnly = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 4_000,
      approxInputTokens: 1_000,
      maxSearches: 2,
    });
    const fetchOnly = worstCaseMicros({
      model: "claude-opus-5",
      maxOutputTokens: 4_000,
      approxInputTokens: 1_000,
      maxSearches: 0,
      maxFetches: 2,
      maxFetchContentTokens: 10_000,
    });
    // Strictly MORE than the two calls priced separately, even though the
    // separate figures each count their own prompt and output: the cross
    // terms (pages re-entering on search turns and vice versa) are real
    // input the sum of triangulars never counts.
    expect(combined).toBeGreaterThan(searchOnly + fetchOnly);
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
 * 1E-beta1 — THE DEMOTION RESPECTS THE PLAN'S OWN DEPENDENCY GRAPH.
 *
 * The compiler has always applied topology rule 3 at EXECUTION time: a step
 * whose producer is not automatable is not automatable. The preflight did
 * not, so an economic demotion could leave the QUOTE pricing a machine
 * consumer whose machine producer this very preflight had just removed —
 * the client would pay machine economics for work the compiler was always
 * going to hand to a person. These tests pin the two properties that close
 * that: leaf-most victims first, and a cascade on every demotion.
 */
describe("the preflight demotes consumers with their producers", () => {
  it("under ac4, the fetch step dies BEFORE the research that feeds it", () => {
    /**
     * The canonical beta1 chain, priced so exactly one of the two must go:
     * research funds $6.00 (3.00 x 2), fetch funds $4.00 (4.00 x 1). Ranked
     * on spend alone the victim would be research — the producer — leaving a
     * quoted fetch step whose candidate URLs nothing will ever write. Ranked
     * leaf-most-first, fetch goes, research survives, and the plan keeps the
     * half that still works alone.
     */
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1, primitiveId: "research.web_search", estimatedAiCostCents: 10 }),
        step({
          order: 2,
          primitiveId: "web.fetch",
          estimatedAiCostCents: 10,
          dependsOnOrder: [1],
        }),
      ],
      // $16.25 internal -> $6.50 allowed: fits research alone ($6.00), not
      // both ($10.00).
      internalCostCents: 1_625,
      policyVersion: "ac4",
    });
    expect(out.steps.find((s) => s.order === 2)?.demotedForBudget).toBe(true);
    expect(out.steps.find((s) => s.order === 1)?.demotedForBudget).toBe(false);
    expect(out.automationSpendCeilingMicros).toBe(6_000_000n);
    expect(out.demotedCount).toBe(1);
  });

  it("demoting a producer cascades through EVERY transitive consumer, multi-level", () => {
    /**
     * research -> fetch -> extract, squeezed until nothing fits. The victim
     * ranking walks leaf-first, but the property that must hold whatever the
     * order is the INVARIANT: no surviving machine step depends, directly or
     * transitively, on a demoted one.
     */
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1, primitiveId: "research.web_search", estimatedAiCostCents: 10 }),
        step({
          order: 2,
          primitiveId: "web.fetch",
          estimatedAiCostCents: 10,
          dependsOnOrder: [1],
        }),
        step({
          order: 3,
          primitiveId: "extract.structured_rows",
          estimatedAiCostCents: 10,
          dependsOnOrder: [2],
        }),
      ],
      // $2.50 internal -> $1.00 allowed: below even extract's funded $1.80,
      // so everything must go — through three leaf-first iterations, with the
      // final state fully human and the ceiling zero.
      internalCostCents: 250,
      policyVersion: "ac4",
    });
    expect(out.steps.every((s) => s.primitiveId === null)).toBe(true);
    expect(out.automationSpendCeilingMicros).toBe(0n);
    expect(out.demotedCount).toBe(3);
  });

  it("the cascade fires when the RANKING would spare the consumer", () => {
    /**
     * A producer dearer than its consumer at the same depth cannot happen
     * (depth orders them), so force the cascade path directly: two chains,
     * research(1)->fetch(2) and a lone extract(3). Allowance fits exactly
     * one chainless step. fetch is deepest so it goes first; then the next
     * iteration must pick research over extract (dearer), and NOTHING may
     * ever leave fetch machine-quoted while research is human. The invariant
     * checked is on the FINAL state, which is what the client signs.
     */
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1, primitiveId: "research.web_search", estimatedAiCostCents: 10 }),
        step({
          order: 2,
          primitiveId: "web.fetch",
          estimatedAiCostCents: 10,
          dependsOnOrder: [1],
        }),
        step({
          order: 3,
          primitiveId: "extract.structured_rows",
          estimatedAiCostCents: 10,
          dependsOnOrder: [],
        }),
      ],
      // $4.75 internal -> $1.90 allowed: extract's $1.80 fits alone.
      internalCostCents: 475,
      policyVersion: "ac4",
    });
    const byOrder = new Map(out.steps.map((s) => [s.order, s]));
    expect(byOrder.get(3)?.demotedForBudget).toBe(false);
    expect(byOrder.get(1)?.demotedForBudget).toBe(true);
    expect(byOrder.get(2)?.demotedForBudget).toBe(true);
    // The invariant, stated as itself: every surviving machine step's
    // dependencies survived too.
    for (const s of out.steps) {
      if (s.primitiveId === null) continue;
      const declared = [1, 2, 3].includes(s.order)
        ? (s.order === 2 ? [1] : [])
        : [];
      for (const dep of declared) {
        expect(byOrder.get(dep)?.primitiveId).not.toBe(null);
      }
    }
  });

  it("a dependency cycle written by the planner cannot hang the preflight", () => {
    const out = runAutomationPreflight({
      steps: [
        step({
          order: 1,
          primitiveId: "research.web_search",
          estimatedAiCostCents: 10,
          dependsOnOrder: [2],
        }),
        step({
          order: 2,
          primitiveId: "web.fetch",
          estimatedAiCostCents: 10,
          dependsOnOrder: [1],
        }),
      ],
      internalCostCents: 100, // far below anything: both must go, promptly
      policyVersion: "ac4",
    });
    expect(out.steps.every((s) => s.primitiveId === null)).toBe(true);
    expect(out.demotedCount).toBe(2);
  });

  it("a human step mid-chain is walked through but never labelled budget-demoted", () => {
    /**
     * machine(1) -> human(2) -> machine(3): demoting step 1 must cascade to
     * step 3 THROUGH the human step, and the human step itself must come out
     * exactly as it went in — `demotedForBudget` on a step that was always a
     * person's would misreport what this preflight did.
     */
    const out = runAutomationPreflight({
      steps: [
        step({ order: 1, primitiveId: "research.web_search", estimatedAiCostCents: 10 }),
        step({
          order: 2,
          primitiveId: null,
          automatable: false,
          estimatedAiCostCents: 0,
          dependsOnOrder: [1],
        }),
        step({
          order: 3,
          primitiveId: "extract.structured_rows",
          estimatedAiCostCents: 10,
          dependsOnOrder: [2],
        }),
      ],
      // $2.50 -> $1.00 allowed: nothing fits.
      internalCostCents: 250,
      policyVersion: "ac4",
    });
    const byOrder = new Map(out.steps.map((s) => [s.order, s]));
    expect(byOrder.get(1)?.demotedForBudget).toBe(true);
    expect(byOrder.get(3)?.demotedForBudget).toBe(true);
    expect(byOrder.get(2)?.demotedForBudget).toBe(false);
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
describe("the CURRENT policy and the registry agree about attempts", () => {
  /**
   * Retargeted from a hardcoded "ac3" in 1E-beta1, deliberately: the loop's
   * job is to keep TODAY's quotes and TODAY's runner in agreement, so it must
   * follow CURRENT_AUTOMATION_COST_POLICY wherever that points. ac3's own
   * agreement is still pinned below, restricted to the primitives ac3
   * actually priced — history does not get retargeted.
   */
  for (const [id, primitive] of Object.entries(REGISTRY)) {
    if (!primitive.billable) continue;
    it(`${id}: the current policy funds exactly what the registry would attempt`, () => {
      expect(attemptsUnder(CURRENT_AUTOMATION_COST_POLICY, id)).toBe(primitive.maxAttempts);
    });
  }

  it("ac3 still agrees with the registry about the primitives ac3 priced", () => {
    expect(attemptsUnder("ac3", "research.web_search")).toBe(
      REGISTRY["research.web_search"].maxAttempts
    );
    expect(attemptsUnder("ac3", "extract.structured_rows")).toBe(
      REGISTRY["extract.structured_rows"].maxAttempts
    );
  });

  it("is not vacuous: there really are billable primitives to check", () => {
    expect(Object.values(REGISTRY).filter((p) => p.billable).length).toBeGreaterThan(0);
  });
});
