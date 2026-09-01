import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { AUTOMATION_COST_POLICIES } from "@/lib/ai-work-engine/automation-cost-policy";

/**
 * MICRO-GATE B — THE BUDGET-PREFLIGHT DEMOTION MECHANISM, PROVEN IN
 * ISOLATION, THROUGH THE REAL PIPELINE.
 *
 * L3 on Neon (2026-08-12, Part E) found that W10 — the L3 corpus's own
 * designated "pricing integrity" / budget-demotion case — no longer
 * demonstrates budget demotion at all. Its plan attaches a file AND uses
 * research.web_search/web.fetch, and src/lib/ai-work-engine/compile.ts's
 * PRE-EXISTING, independent data-class/reach gate (`data_class_forbids_reach`
 * — a mandate with `dataClass=business_confidential` may not run a
 * "provider"-reach primitive, doubly so when it also reads files) marks
 * every one of W10's steps human BEFORE runAutomationPreflight ever sees
 * them as automatable. That gate is correct and untouched by this session's
 * work — but it means NONE of the 12 L3 mandates any longer prove, in an
 * integrated run, that `demotedForBudget` still gets set and still drives
 * suppression. The mechanism was still proven correct in ISOLATION (see
 * test/automation-cost-policy.test.ts, which calls runAutomationPreflight
 * directly), but never through the real pricing/preflight/compiler/preview
 * chain post- the 2026-08-12 pricing-integrity generalisation (Part A),
 * which changed EXACTLY the wiring between compileDecisions and the
 * preflight's `automatable` input.
 *
 * This is the missing case, added SEPARATELY — l3-corpus.ts and W10 are
 * untouched. One mandate:
 *   - dataClass resolves to public_business (no file attached);
 *   - sensitive_data=false, required_access=[] (the mandate-level gate never
 *     fires);
 *   - a four-source research chain (see quadSourcePlan in
 *     test/support/synthetic-plans.ts) whose funded ceiling is $41.80 —
 *     unambiguously over ac5's $32 cap, unlike the three-source shape ac5
 *     was calibrated to just barely accommodate ($31.80).
 *
 * Driven through the REAL runWorkEngine() — real classification, real
 * planning, real compileDecisions, real runAutomationPreflight, real
 * pricing, real persistence, real compilePreviewForAdmin — with only the
 * Anthropic SDK and the embeddings provider replaced by zero-cost synthetic
 * stand-ins, exactly as the L3 harness itself does it.
 */

const runNonce = randomUUID().replace(/-/g, "").slice(0, 10);
const uid = () => `bd${runNonce}${Math.random().toString(36).slice(2, 8)}`;
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
const originalProviderMode = process.env.TEST_PROVIDER_MODE;

// The beforeAll below sets TEST_PROVIDER_MODE=synthetic before this lazy mock
// is evaluated, then restores the caller's environment after the file.
vi.mock("@anthropic-ai/sdk", async () =>
  (await import("../support/provider-replay")).anthropicMockFactory()
);
vi.mock("@/lib/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings")>();
  return {
    ...actual,
    embeddingsEnabled: true,
    embedWithUsage: async () => ({
      vector: Array.from({ length: 1024 }, () => 0.001),
      usage: { provider: "synthetic", model: "synthetic-embed", totalTokens: 0 },
    }),
  };
});

describe("the budget-preflight demotion mechanism, isolated, through the real pipeline", () => {
  let taskId: string;

  beforeAll(async () => {
    // aiEnabled is frozen when @/lib/ai is imported. Give this synthetic-only
    // integration test an explicit non-secret sentinel before the work-engine
    // module graph loads; without it runWorkEngine returns before persisting
    // classification or plan evidence. The SDK itself remains mocked below.
    process.env.ANTHROPIC_API_KEY = "synthetic-integration-no-network";
    process.env.TEST_PROVIDER_MODE = "synthetic";

    // Importing ai-work-engine's index.ts is what actually evaluates the
    // mocked "@anthropic-ai/sdk" module for the first time (it is statically
    // imported by classify.ts/plan.ts/critique.ts) and installs the
    // provider-replay module's stats/budget state — providerStats() throws
    // "not installed" if called before this. Same order l3.e2e.ts uses.
    const { runWorkEngine } = await import("@/lib/ai-work-engine");
    const { setSyntheticResponder, providerStats } = await import("../support/provider-replay");
    const { syntheticResponderFor } = await import("../support/synthetic-responder");
    setSyntheticResponder(syntheticResponderFor);

    const opening = providerStats();
    if (opening.mode === "live") {
      throw new Error("[budget-demotion] refusing to start: provider layer is in LIVE mode.");
    }

    const client = await prisma.user.create({
      data: { name: "Budget Demo Client", email: `bd-client-${uid()}@it.local`, role: "CLIENT" },
      select: { id: true },
    });
    await prisma.taskCategory.upsert({
      where: { slug: "research-list-building" },
      create: {
        slug: "research-list-building",
        name: "Research & list building",
        disputeCriteria: "Delivered rows match the agreed columns; sources cited; exceptions listed.",
        active: true,
        sortOrder: 1,
      },
      update: {},
      select: { id: true },
    });
    const task = await prisma.task.create({
      data: {
        clientId: client.id,
        // Carries the synthetic profile's own routing phrase — see
        // BUDGET-DEMOTION-PURE in test/support/synthetic-plans.ts.
        title: "Compare these companies across four independent sources",
        description:
          "I need a quadruple-sourced comparison of 40 companies: company name and one key metric, each " +
          "corroborated across four independent public sources before you include it. No client files — " +
          "everything here is public web research. CSV back, with a source per field.",
        quantity: "40 companies",
        status: "submitted" as never,
      },
      select: { id: true },
    });
    taskId = task.id;

    await runWorkEngine(task.id, { runKey: `budget-demo-${uid()}` });
  });

  afterAll(() => {
    if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalProviderMode === undefined) delete process.env.TEST_PROVIDER_MODE;
    else process.env.TEST_PROVIDER_MODE = originalProviderMode;
  });

  it("resolves public_business with no sensitivity/access flag — the mandate-level gate never fires", async () => {
    const classification = await prisma.taskAiClassification.findUniqueOrThrow({
      where: { taskId },
      select: { sensitiveData: true, requiredAccess: true },
    });
    expect(classification.sensitiveData).toBe(false);
    expect(classification.requiredAccess).toEqual([]);

    const planVersion = await prisma.taskExecutionPlanVersion.findFirstOrThrow({
      where: { taskId },
      orderBy: { version: "desc" },
      select: { dataClass: true },
    });
    expect(planVersion.dataClass).toBe("public_business");
  });

  it("ac5's ceiling is 50% / $32, and ac4 is untouched at 40% / $20 — the numbers this test's premise depends on", () => {
    expect(AUTOMATION_COST_POLICIES.ac5.ceilingRule).toEqual({
      maxShareOfInternalCostBps: 5_000,
      absoluteCapMicros: 32_000_000,
    });
    expect(AUTOMATION_COST_POLICIES.ac4.ceilingRule).toEqual({
      maxShareOfInternalCostBps: 4_000,
      absoluteCapMicros: 20_000_000,
    });
  });

  it("at least one step was demoted for budget, and demotedForBudget is the ONLY humanisation reason present", async () => {
    const planVersion = await prisma.taskExecutionPlanVersion.findFirstOrThrow({
      where: { taskId },
      orderBy: { version: "desc" },
      select: {
        id: true,
        automationCostPolicyVersion: true,
        steps: {
          orderBy: { order: "asc" },
          select: {
            order: true,
            executor: true,
            primitiveId: true,
            demotedForBudget: true,
            estimatedMinutesLikely: true,
          },
        },
      },
    });
    expect(planVersion.automationCostPolicyVersion).toBe("ac5");

    const demoted = planVersion.steps.filter((s) => s.demotedForBudget);
    expect(demoted.length).toBeGreaterThan(0);

    // Every step whose primitive was taken away (primitiveId nulled, the
    // frozen shape a demoted step is written in) must be ONE OF THE DEMOTED
    // ones. The one step that was ALWAYS human ("Resolve the conflicts",
    // planned executor:"human" with real minutes from the start) is excluded
    // — it never had a primitive to lose, and its humanity has nothing to do
    // with this mechanism.
    const primitivelessButNotDemoted = planVersion.steps.filter(
      (s) => s.executor !== "human" && s.primitiveId === null && !s.demotedForBudget
    );
    expect(primitivelessButNotDemoted).toEqual([]);

    // And the converse: no step OTHER than the demoted ones and the
    // always-human one lost its primitive. If this failed, some OTHER gate
    // (sensitivity, access, missing capability, data-class/reach) would be
    // confounding the result the same way it now does for W10.
    const humanisedForAnyReason = planVersion.steps.filter(
      (s) => s.executor !== "human" && s.primitiveId === null
    );
    expect(humanisedForAnyReason.length).toBe(demoted.length);
  });

  it("the compile preview shows DEMOTED FOR BUDGET and no other humanisation badge", async () => {
    const { compilePreviewForAdmin } = await import("@/lib/queries/plan");
    const preview = await compilePreviewForAdmin(taskId);
    expect(preview).not.toBeNull();
    expect(preview!.badges).toContain("DEMOTED FOR BUDGET");
    expect(preview!.badges).toContain("HUMAN COST UNKNOWN — PRICE MANUALLY");
    expect(preview!.badges).not.toContain("SENSITIVE / HUMAN ONLY");
    expect(preview!.badges).not.toContain("MISSING CAPABILITY");
    // FIRST, same as every other suppression case: the badge that
    // invalidates the numbers beside it must not read as a footnote.
    expect(preview!.badges[0]).toBe("HUMAN COST UNKNOWN — PRICE MANUALLY");
  });

  it("aiSuggestedPriceCents is null — the demoted steps carry no human-cost estimate, so the price is suppressed", async () => {
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { aiSuggestedPriceCents: true, aiSuggestedVaPayoutCents: true, aiEstimatedMinutes: true },
    });
    expect(task.aiSuggestedPriceCents).toBeNull();
    expect(task.aiSuggestedVaPayoutCents).toBeNull();
    expect(task.aiEstimatedMinutes).toBeNull();
  });

  it("zero live provider calls, $0 spent", async () => {
    const { providerStats } = await import("../support/provider-replay");
    const stats = providerStats();
    expect(stats.mode).not.toBe("live");
    expect(stats.budget.calls).toBe(0);
    expect(stats.budget.spentMicros).toBe(0);
    expect(stats.uncapitalised).toEqual([]);
  });
});
