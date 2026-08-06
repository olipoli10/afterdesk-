import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QuoteTier } from "@prisma/client";
import {
  aiSuggestionColumns,
  computeClientPriceCents,
  computeInternalCostCents,
  computeVaPayoutCents,
  pertMinutes,
  pricePlan,
  type PricingStepInput,
} from "@/lib/ai-work-engine/pricing";
import { COST_CATALOG } from "@/lib/ai-work-engine/cost-catalog";
import { shouldCritique, type CritiqueTriggerInput } from "@/lib/ai-work-engine/critique";
import { floorConfidenceForCritique, resolveConfidence } from "@/lib/ai-work-engine/confidence";
import { engineSkipsTask } from "@/lib/ai-work-engine";
import { QUOTE_TIERS } from "@/lib/ai-work-engine/schemas";
import {
  clientScopeFromPlanVersion,
  sanitizeClientText,
} from "@/lib/ai-work-engine/client-scope";

/**
 * The Phase 1A nets, mirroring the discipline of price-wall.test.ts and
 * client-timeline.test.ts: every invariant the founder's adjustments demand
 * is pinned here, at the pure-function layer where no database or network
 * is needed to prove it.
 */

const humanStep = (minutes: [number, number, number]): PricingStepInput => ({
  executor: "human",
  estimatedMinutesOptimistic: minutes[0],
  estimatedMinutesLikely: minutes[1],
  estimatedMinutesConservative: minutes[2],
  estimatedAiCostCents: 0,
  estimatedToolUnits: 0,
  tool: null,
});

const aiStep = (aiCostCents: number, toolUnits = 0, tool: string | null = null): PricingStepInput => ({
  executor: "ai",
  estimatedMinutesOptimistic: 0,
  estimatedMinutesLikely: 0,
  estimatedMinutesConservative: 0,
  estimatedAiCostCents: aiCostCents,
  estimatedToolUnits: toolUnits,
  tool,
});

const RATES = { workerHourlyUsd: 15 };

describe("deterministic pricing — the engine that never asks a model", () => {
  it("is deterministic: same inputs, same outputs", () => {
    const steps = [humanStep([60, 120, 240]), aiStep(50, 100, "web_search")];
    expect(pricePlan(steps, RATES)).toEqual(pricePlan(steps, RATES));
  });

  it("RULE 2: mutating margin policy moves the price and never the payout", () => {
    const steps = [humanStep([60, 120, 240])];
    const base = pricePlan(steps, RATES);
    const fatterMargin = {
      ...COST_CATALOG,
      targetGrossMargin: 0.8,
      toolUnitCostCents: { ...COST_CATALOG.toolUnitCostCents },
    };
    const repriced = pricePlan(steps, RATES, fatterMargin);
    expect(repriced.suggestedPriceCents).toBeGreaterThan(base.suggestedPriceCents);
    expect(repriced.suggestedVaPayoutCents).toBe(base.suggestedVaPayoutCents);
  });

  it("RULE 2: the payout is a pure function of human minutes and the rate", () => {
    // An ai step with a huge cost changes the internal cost and the price,
    // but must not move the worker's payout by one cent.
    const humanOnly = [humanStep([30, 60, 90])];
    const withExpensiveAi = [...humanOnly, aiStep(50_000)];
    expect(computeVaPayoutCents(withExpensiveAi, RATES)).toBe(
      computeVaPayoutCents(humanOnly, RATES)
    );
    expect(
      computeInternalCostCents(withExpensiveAi, RATES, COST_CATALOG, "likely")
    ).toBeGreaterThan(computeInternalCostCents(humanOnly, RATES, COST_CATALOG, "likely"));
  });

  it("PERT weights the likely scenario four times", () => {
    expect(pertMinutes({ estimatedMinutesOptimistic: 60, estimatedMinutesLikely: 120, estimatedMinutesConservative: 240 })).toBe(
      (60 + 4 * 120 + 240) / 6
    );
  });

  it("enforces the price floors: never below the minimum price", () => {
    // A trivially small plan still cannot quote below the floor.
    const tiny = [humanStep([1, 2, 3])];
    const priced = pricePlan(tiny, RATES);
    expect(priced.suggestedPriceCents).toBeGreaterThanOrEqual(COST_CATALOG.minimumPriceCents);
  });

  it("enforces the minimum realized margin over internal cost", () => {
    const steps = [humanStep([300, 600, 1200]), aiStep(2000)];
    const priced = pricePlan(steps, RATES);
    const margin =
      (priced.suggestedPriceCents - priced.internalCostConservativeCents) /
      priced.suggestedPriceCents;
    expect(margin).toBeGreaterThanOrEqual(COST_CATALOG.minimumMargin - 0.01);
  });

  it("rounds prices to $5 and payouts to $1 — no false precision", () => {
    const priced = pricePlan([humanStep([47, 93, 187])], RATES);
    expect(priced.suggestedPriceCents % 500).toBe(0);
    expect(priced.priceAtLikelyCents % 500).toBe(0);
    expect(priced.suggestedVaPayoutCents % 100).toBe(0);
  });

  it("the conservative scenario never prices below the likely one", () => {
    const priced = pricePlan([humanStep([60, 120, 300]), aiStep(100)], RATES);
    expect(priced.priceAtConservativeCents).toBeGreaterThanOrEqual(priced.priceAtLikelyCents);
    expect(priced.suggestedPriceCents).toBe(priced.priceAtConservativeCents);
  });

  it("always reports itself uncalibrated in Phase 1A", () => {
    expect(pricePlan([humanStep([10, 20, 30])], RATES).calibration).toBe("uncalibrated");
  });

  it("an unknown tool costs zero instead of crashing, including hostile names", () => {
    for (const tool of ["made_up_tool", "constructor", "__proto__", "toString"]) {
      const priced = pricePlan([aiStep(0, 1000, tool)], RATES);
      // Only the reviewer constant and reserve remain — no tool cost added.
      expect(priced.internalCostLikelyCents).toBe(
        pricePlan([aiStep(0, 0, null)], RATES).internalCostLikelyCents
      );
    }
  });

  it("computeClientPriceCents never reads a payout: signature-level pin", () => {
    // The function takes (internalCostCents, catalog) and nothing else. If a
    // payout parameter is ever added, this arity assertion fails and forces
    // the RULE 2 conversation.
    expect(computeClientPriceCents.length).toBe(2);
    expect(computeVaPayoutCents.length).toBe(2);
  });
});

describe("the JSON schemas stay inside the structured-outputs subset", () => {
  // Found the hard way in the first live run: the API 400s on maxItems.
  // The zod layer carries every bound; the wire schemas must never regrow
  // keywords the subset rejects.
  it("no minItems/maxItems anywhere in the wire schemas", async () => {
    const { CLASSIFICATION_JSON_SCHEMA, PLAN_JSON_SCHEMA, CRITIQUE_JSON_SCHEMA } = await import(
      "@/lib/ai-work-engine/schemas"
    );
    for (const schema of [CLASSIFICATION_JSON_SCHEMA, PLAN_JSON_SCHEMA, CRITIQUE_JSON_SCHEMA]) {
      const wire = JSON.stringify(schema);
      expect(wire).not.toContain("maxItems");
      expect(wire).not.toContain("minItems");
      // enum lists must not carry null — nullability is anyOf/type-union.
      expect(wire).not.toContain("null]},{");
      expect(wire).not.toMatch(/"enum":\[[^\]]*null/);
    }
  });
});

describe("the engine's default quote passes the hourly floor it was priced at", () => {
  // Live incident: aiEstimatedMinutes carried the TOTAL plan minutes
  // (worker + AI + scripts), so approvePricing's payout-per-hour floor
  // rejected the engine's own pre-filled suggestion ($90 over 410 min =
  // $13.17/h < $15/h). The suggestion must be human minutes, floored, so
  // payout ÷ minutes ≥ rate by construction.
  it("suggested payout over suggested minutes never dips under the rate", () => {
    const mixes: PricingStepInput[][] = [
      [humanStep([150, 200, 280]), humanStep([80, 115, 160]), humanStep([20, 35, 55]), aiStep(500, 100, "web_search")],
      [humanStep([1, 1, 1])],
      [humanStep([5, 7, 13]), humanStep([59, 60, 61])],
      [humanStep([0, 0, 0]), aiStep(100)],
      [humanStep([37, 41, 43]), humanStep([11, 17, 23]), humanStep([2, 3, 5])],
    ];
    for (const steps of mixes) {
      const priced = pricePlan(steps, RATES);
      if (priced.estimatedHumanMinutesPertTotal === 0) continue;
      const hourly =
        priced.suggestedVaPayoutCents / 100 / (priced.estimatedHumanMinutesPertTotal / 60);
      expect(hourly).toBeGreaterThanOrEqual(RATES.workerHourlyUsd);
    }
  });

  it("fractional worker rates keep the suggested combo approvable (integer-cents floor)", () => {
    // Adversarial review: at $15.25/h a 181-minute step rounded the payout
    // DOWN below minutes × rate; at $15.75/h an EXACT $147.00 payout failed
    // the old float-division check. Pin both flavors against the same
    // integer-cents comparison approvePricing now uses.
    const cases: Array<{ rate: number; steps: PricingStepInput[] }> = [
      { rate: 15.25, steps: [humanStep([181, 181, 181])] },
      { rate: 16.75, steps: [humanStep([43, 43, 43])] },
      { rate: 15.75, steps: [humanStep([560, 560, 560])] },
      { rate: 15.05, steps: [humanStep([150, 200, 280]), humanStep([80, 115, 160])] },
      { rate: 15.25, steps: [humanStep([5, 7, 13]), aiStep(500, 100, "web_search")] },
    ];
    for (const { rate, steps } of cases) {
      const priced = pricePlan(steps, { workerHourlyUsd: rate });
      const minutes = priced.estimatedHumanMinutesPertTotal;
      if (minutes === 0) continue;
      const minHourlyCents = Math.round(rate * 100);
      expect(priced.suggestedVaPayoutCents * 60).toBeGreaterThanOrEqual(minHourlyCents * minutes);
    }
  });

  it("a plan with zero human minutes suggests NO payout and NO minutes, not $0 over 0", () => {
    // Adversarial review: an all-AI/script plan pre-filled the admin form
    // with a $0-over-0-minutes combo approvePricing can never accept. The
    // shared mapper nulls both so the form pre-fills nothing instead.
    const priced = pricePlan([aiStep(500, 100, "web_search")], RATES);
    const cols = aiSuggestionColumns(priced);
    expect(cols.aiSuggestedVaPayoutCents).toBeNull();
    expect(cols.aiEstimatedMinutes).toBeNull();
    expect(cols.aiSuggestedPriceCents).toBeGreaterThan(0);

    const withHuman = aiSuggestionColumns(pricePlan([humanStep([30, 60, 90])], RATES));
    expect(withHuman.aiSuggestedVaPayoutCents).toBeGreaterThan(0);
    expect(withHuman.aiEstimatedMinutes).toBeGreaterThan(0);
  });

  it("the human-minutes suggestion excludes ai and script minutes", () => {
    const priced = pricePlan(
      [
        humanStep([60, 60, 60]),
        {
          ...aiStep(0),
          estimatedMinutesOptimistic: 500,
          estimatedMinutesLikely: 500,
          estimatedMinutesConservative: 500,
        },
      ],
      RATES
    );
    expect(priced.estimatedHumanMinutesPertTotal).toBe(60);
  });
});

describe("string caps are abuse guards, not style hints", () => {
  // Live incident: a 300-char zod cap silently killed an entire critique —
  // the model wrote honest flags longer than the cap. Pin that realistic
  // long-form output survives every stage schema.
  it("a 1000-char critique flag validates", async () => {
    const { critiqueOutputSchema } = await import("@/lib/ai-work-engine/schemas");
    const longFlag = "the plan underestimates per-record verification time because ".repeat(17);
    expect(longFlag.length).toBeGreaterThan(1000);
    const result = critiqueOutputSchema.safeParse({
      missing_steps: [longFlag],
      wrong_tool_flags: [],
      time_risk_flags: [longFlag],
      security_risk_flags: [longFlag],
      overall_assessment: longFlag,
      severity: "major",
    });
    expect(result.success).toBe(true);
  });

  it("a 1000-char plan assumption validates", async () => {
    const { planOutputSchema } = await import("@/lib/ai-work-engine/schemas");
    const long = "the client provides a spreadsheet whose column order is preserved ".repeat(16);
    const result = planOutputSchema.safeParse({
      deliverable_description: long.slice(0, 1900),
      assumptions: [long],
      exclusions: [long],
      steps: [
        {
          title: "Research",
          description: long.slice(0, 3900),
          executor: "human",
          human_role: "worker",
          tool: "manual",
          estimated_minutes_optimistic: 10,
          estimated_minutes_likely: 20,
          estimated_minutes_conservative: 30,
          estimated_ai_cost_cents: 0,
          estimated_tool_units: 0,
          verification_method: long.slice(0, 1900),
          acceptance_criteria: [long.slice(0, 900)],
          risk_level: "low",
          risk_note: null,
          depends_on_order: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("the plan edit's write-time guards (source pins)", () => {
  // Both are transactional behaviors vitest cannot execute without a
  // database; pin their presence in the source so a refactor that drops
  // either fails loudly. Found by adversarial review:
  // (1) the status check was read-only, so approvePricing could commit
  //     between check and write and the edit stacked a version on a live
  //     quote — the lock must be re-asserted by the updateMany predicate;
  // (2) a stale-base save (tab opened before someone else's edit) silently
  //     superseded the newer version — only the head may be edited.
  it("re-asserts the edit lock at write time and refuses non-head bases", () => {
    const source = readFileSync(
      join(__dirname, "..", "src/server/actions/admin-plan.ts"),
      "utf8"
    );
    expect(source).toMatch(/updateMany\(\{\s*\n?\s*where: \{ id: taskId, status: \{ in: \["submitted", "pricing_review"\] \} \}/);
    expect(source).toContain("base.version !== latest.version");
  });
});

describe("the edit form accepts everything the generator may produce", () => {
  // Found live: the edit action had its own duplicated string caps, tighter
  // than the generation caps, so re-saving an UNCHANGED ai-written plan
  // failed validation and the plan was uneditable. Round-trip invariant:
  // generation-max content must pass the edit schema.
  it("generation-cap-length content round-trips through editPlanInputSchema", async () => {
    const { editPlanInputSchema } = await import("@/lib/ai-work-engine/schemas");
    const s = (n: number) => "x".repeat(n);
    const result = editPlanInputSchema.safeParse({
      taskId: "t1",
      baseVersionId: "v1",
      editNote: s(500),
      deliverableDescription: s(2000),
      assumptions: [s(1500)],
      exclusions: [s(1500)],
      steps: [
        {
          title: s(500),
          description: s(4000),
          executor: "human",
          humanRole: "worker",
          tool: s(200),
          estimatedMinutesOptimistic: 10,
          estimatedMinutesLikely: 20,
          estimatedMinutesConservative: 30,
          estimatedAiCostCents: 0,
          estimatedToolUnits: 0,
          verificationMethod: s(2000),
          acceptanceCriteria: [s(1000)],
          riskLevel: "low",
          riskNote: s(2000),
          dependsOnOrder: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("still refuses a human step without a role", async () => {
    const { editStepInputSchema } = await import("@/lib/ai-work-engine/schemas");
    const result = editStepInputSchema.safeParse({
      title: "t",
      description: "d",
      executor: "human",
      humanRole: null,
      tool: null,
      estimatedMinutesOptimistic: 1,
      estimatedMinutesLikely: 2,
      estimatedMinutesConservative: 3,
      estimatedAiCostCents: 0,
      estimatedToolUnits: 0,
      verificationMethod: "v",
      acceptanceCriteria: [],
      riskLevel: "low",
      riskNote: null,
      dependsOnOrder: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("a failed critique never masquerades as an untriggered one", () => {
  // Live incident: the first critique died on max_tokens (adaptive thinking
  // spent the whole 8000 budget before any JSON) and the admin reasoning
  // said "not triggered" — hiding that a wanted safety check was missing.
  it("index.ts distinguishes the two states; critique.ts kept the plan-sized budget", () => {
    const index = readFileSync(join(__dirname, "..", "src/lib/ai-work-engine/index.ts"), "utf8");
    expect(index).toContain("triggered but failed");
    expect(index).toContain("Critique: not triggered.");
    const critique = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/critique.ts"),
      "utf8"
    );
    expect(critique).toContain("MAX_TOKENS = 16_000");
  });
});

describe("no AI SDK in the deterministic half — the absence is the mechanism", () => {
  const root = join(__dirname, "..");
  for (const file of ["src/lib/ai-work-engine/pricing.ts", "src/lib/ai-work-engine/cost-catalog.ts"]) {
    it(`${file} imports no model SDK`, () => {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toMatch(/@anthropic-ai\/sdk|from "openai"|from 'openai'/);
    });
  }
});

describe("Level-1 auto quoting is structurally impossible (adjustment 5)", () => {
  it("the engine vocabulary has exactly assisted and manual", () => {
    expect([...QUOTE_TIERS].sort()).toEqual(["assisted", "manual"]);
  });

  it("the DATABASE enum agrees — no auto value exists to store", () => {
    expect(Object.values(QuoteTier).sort()).toEqual(["assisted", "manual"]);
  });
});

describe("shouldCritique — conditional, never systematic (adjustment 1)", () => {
  const calm: CritiqueTriggerInput = {
    classification: {
      confidence: "high",
      sensitive_data: false,
      required_access: [],
      missing_information: [],
      quote_tier: "assisted",
    },
    categoryHasDisputeCriteria: true,
    hasHighRiskStep: false,
    internalCostConservativeCents: COST_CATALOG.critiqueCostThresholdCents - 1,
  };

  it("does NOT fire on the boring, well-precedented, low-stakes brief", () => {
    expect(shouldCritique(calm)).toBe(false);
  });

  const triggers: [string, Partial<CritiqueTriggerInput> | Partial<CritiqueTriggerInput["classification"]>][] = [
    ["low confidence", { confidence: "low" }],
    ["sensitive data", { sensitive_data: true }],
    ["required access", { required_access: ["their CRM"] }],
    ["missing information", { missing_information: ["What counts as qualified?"] }],
    ["manual tier", { quote_tier: "manual" }],
  ];
  for (const [name, patch] of triggers) {
    it(`fires on ${name} alone`, () => {
      expect(
        shouldCritique({ ...calm, classification: { ...calm.classification, ...patch } })
      ).toBe(true);
    });
  }

  it("fires on an unknown category (no written standard)", () => {
    expect(shouldCritique({ ...calm, categoryHasDisputeCriteria: false })).toBe(true);
  });

  it("fires on a high-risk step", () => {
    expect(shouldCritique({ ...calm, hasHighRiskStep: true })).toBe(true);
  });

  it("fires at the cost threshold", () => {
    expect(
      shouldCritique({
        ...calm,
        internalCostConservativeCents: COST_CATALOG.critiqueCostThresholdCents,
      })
    ).toBe(true);
  });
});

describe("confidence floors", () => {
  it("zero reference tasks floors to low regardless of self-report", () => {
    expect(resolveConfidence("high", 0)).toBe("low");
    expect(resolveConfidence("garbage", 5)).toBe("low");
    expect(resolveConfidence("high", 3)).toBe("high");
  });

  it("a major or blocking critique floors confidence to low", () => {
    expect(floorConfidenceForCritique("high", "major")).toBe("low");
    expect(floorConfidenceForCritique("medium", "blocking")).toBe("low");
    expect(floorConfidenceForCritique("high", "minor")).toBe("high");
    expect(floorConfidenceForCritique("high", "none")).toBe("high");
    expect(floorConfidenceForCritique("high", null)).toBe("high");
  });
});

describe("the engine skips what it must never bill for", () => {
  it("skips Standing Capacity tasks", () => {
    expect(engineSkipsTask({ standingCapacityAccountId: "acc_1", isInternal: false })).toBe(true);
  });
  it("skips internal practice tasks", () => {
    expect(engineSkipsTask({ standingCapacityAccountId: null, isInternal: true })).toBe(true);
  });
  it("runs on a normal client task", () => {
    expect(engineSkipsTask({ standingCapacityAccountId: null, isInternal: false })).toBe(false);
  });
});

describe("the client scope projection — the only path to a client's eyes", () => {
  it("removes em-dashes and en-dashes from every string (house copy rule)", () => {
    expect(sanitizeClientText("scope — the works — done")).toBe("scope, the works, done");
    expect(sanitizeClientText("10–50 employees")).toBe("10, 50 employees");
    expect(sanitizeClientText("plain text stays")).toBe("plain text stays");
  });

  it("caps runaway strings, but never below the zod generation caps", () => {
    // The cap is the emergency brake, zod is the bound: at 300 it truncated
    // a live contract assumption mid-word on the quote page AND in the
    // snapshot. It must sit at or above every generation cap (1500/2000).
    expect(sanitizeClientText("a".repeat(5000)).length).toBe(2000);
    expect(sanitizeClientText("a".repeat(1500))).toBe("a".repeat(1500));
  });

  it("is an allowlist: a poisoned object leaks nothing", () => {
    const scope = clientScopeFromPlanVersion({
      deliverableDescription: "A verified list of 200 firms",
      assumptions: ["Public sources only"],
      exclusions: [],
      internalCostLikelyCents: 12345,
      suggestedVaPayoutCents: 9999,
      workerName: "Marie D.",
      email: "marie@example.com",
    });
    expect(scope).not.toBeNull();
    const printed = JSON.stringify(scope);
    expect(printed).not.toContain("12345");
    expect(printed).not.toContain("9999");
    expect(printed).not.toContain("Marie");
    expect(printed).not.toContain("example.com");
  });

  it("returns null on anything malformed instead of a partial render", () => {
    for (const raw of [null, undefined, 42, "text", {}, { deliverableDescription: "" }, { deliverableDescription: 7 }]) {
      expect(clientScopeFromPlanVersion(raw)).toBeNull();
    }
  });

  it("drops non-string members from the lists", () => {
    const scope = clientScopeFromPlanVersion({
      deliverableDescription: "ok",
      assumptions: ["real", 42, null, { evil: true }, "  "],
      exclusions: "not-an-array",
    });
    expect(scope?.assumptions).toEqual(["real"]);
    expect(scope?.exclusions).toEqual([]);
  });
});
