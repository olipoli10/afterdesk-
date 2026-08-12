import { describe, expect, it, vi } from "vitest";
import { anthropicMockFactory, setSyntheticResponder, providerStats, stageOf } from "@/../test/support/provider-replay";
import { syntheticResponderFor } from "@/../test/support/synthetic-responder";
import { SYNTHETIC_WORLDS, worldTruth } from "@/../test/support/synthetic-web";
import {
  emptyPayload,
  type ArtifactSpec,
  type InvocationRecord,
  type PrimitiveContext,
  type WorkflowPayload,
} from "@/lib/ai-work-engine/primitives/types";

/**
 * THE ZERO-COST PATH, DRIVEN THROUGH THE REAL PRIMITIVES.
 *
 * The L3 harness needs a database, a workflow run and a cron driver. This file
 * needs none of them: it builds a PrimitiveContext by hand and runs the four
 * provider-facing capabilities plus the pure ones that follow, exactly as
 * file-data-foundation.test.ts does for the file chain.
 *
 * What that proves, in 1.5 seconds and for nothing:
 *
 *   - the synthetic responses are in the provider's real wire shapes, so the
 *     primitives' typed harvests find them;
 *   - extract's `seenUrls` filter drops a source research never recorded;
 *   - split.exceptions' two-source bar produces the split declared BEFORE the
 *     run, from the world, rather than a number the responder wrote;
 *   - the deliverable's row count equals the world's unit count.
 *
 * If this file is red, the L3 corpus cannot pass either — and finding that out
 * here costs nothing and takes no Postgres.
 */

vi.mock("@anthropic-ai/sdk", async () => anthropicMockFactory({ TEST_PROVIDER_MODE: "synthetic" }));
vi.mock("@/lib/settings", () => ({
  getSettings: async () => ({ pricingModel: "claude-opus-5" }),
}));

setSyntheticResponder(syntheticResponderFor);

type Harness = {
  ctx: PrimitiveContext;
  artifacts: ArtifactSpec[];
  invocations: InvocationRecord[];
};

function makeContext(
  brief: PrimitiveContext["brief"],
  input: WorkflowPayload,
  ceilingMicros: bigint
): Harness {
  const artifacts: ArtifactSpec[] = [];
  const invocations: InvocationRecord[] = [];
  return {
    artifacts,
    invocations,
    ctx: {
      taskId: "task_syn",
      runId: "run_syn",
      stepRunId: "step_syn",
      snapshotId: "snap_syn",
      order: 1,
      attempt: 1,
      brief,
      input,
      params: {},
      inputFiles: [],
      costCeilingMicros: ceilingMicros,
      recordInvocation: async (r) => {
        invocations.push(r);
      },
      writeArtifact: async (spec) => {
        artifacts.push(spec);
        return { fileId: `artifact_${artifacts.length}` };
      },
    },
  };
}

/** ac5's per-attempt maxima, so the ceilings here are the real contract's. */
const CEILING = {
  research: 3_000_000n,
  fetch: 4_000_000n,
  extract: 600_000n,
};

describe("the synthetic boundary answers in the provider's own shapes", () => {
  it("a research request is recognised as its stage from its own tools", () => {
    expect(
      stageOf({
        system: [{ type: "text", text: "You research public facts for AfterDesk" }],
        tools: [{ type: "web_search_20260209", name: "web_search" }],
      })
    ).toBe("research");
    expect(
      stageOf({
        system: [{ type: "text", text: "You convert gathered research into structured rows" }],
      })
    ).toBe("extract");
  });

  it("an unroutable request returns null so the mock throws instead of inventing", () => {
    expect(
      syntheticResponderFor(
        { model: "m", messages: [{ role: "user", content: "a brief nobody wrote a world for" }] },
        "research"
      )
    ).toBeNull();
  });
});

describe.each(SYNTHETIC_WORLDS.map((w) => [w.id, w] as const))(
  "%s runs research -> fetch -> extract -> normalize -> split -> build for nothing",
  (_id, world) => {
    it("reaches a deliverable whose numbers were declared before the run", async () => {
      const { runResearchWebSearch } = await import("@/lib/ai-work-engine/primitives/research");
      const { runWebFetch } = await import("@/lib/ai-work-engine/primitives/fetch");
      const { runExtractStructuredRows } = await import("@/lib/ai-work-engine/primitives/extract");
      const { runNormalizeContactFields, runSplitExceptions, runBuildCsv } = await import(
        "@/lib/ai-work-engine/primitives/pure"
      );

      const declared = worldTruth(world);
      const brief: PrimitiveContext["brief"] = {
        title: `L3 ${world.id}`,
        // The routing phrase, exactly as the mandate's own brief carries it.
        description: `A client brief mentioning ${world.match} and nothing else of note.`,
        quantity: String(declared.units),
        objective: `Find records: ${world.match}`,
        geography: [],
        requiredFields: world.fields,
        quantityInterpreted: declared.units,
      };

      /* ── research ── */
      const seed: WorkflowPayload = { ...emptyPayload(declared.units, world.fields) };
      const research = makeContext(brief, seed, CEILING.research);
      const afterResearch = await runResearchWebSearch(research.ctx);
      const evidence = afterResearch.payload.rows.flatMap((r) => r.evidence ?? []);
      expect(evidence.length).toBe(declared.distinctUrls);
      expect(research.invocations[0].searchCount).toBeGreaterThan(0);
      // The evidence artifact an operator can audit the mandate against.
      expect(research.artifacts.map((a) => a.name)).toContain("research-evidence");

      /* ── fetch ── */
      const fetchCtx = makeContext(
        brief,
        { ...afterResearch.payload, requestedFields: world.fields },
        CEILING.fetch
      );
      fetchCtx.ctx.params = { maxFetches: 3, maxContentTokens: 10_000 };
      const afterFetch = await runWebFetch(fetchCtx.ctx);
      expect(afterFetch.summary.fetchesUsable).toBe(3);
      // Every fetched page was one the primitive itself offered.
      expect(afterFetch.summary.offCandidateDropped ?? 0).toBe(0);

      /* ── extract ── */
      const extractCtx = makeContext(brief, afterFetch.payload, CEILING.extract);
      const afterExtract = await runExtractStructuredRows(extractCtx.ctx);
      expect(afterExtract.summary.rowsOut).toBe(declared.units);
      /**
       * THE FILTER, EXERCISED. The responder attaches one plausible url that
       * research never recorded; the engine must drop it. A zero here would
       * mean the guard was never put to the question.
       */
      expect(afterExtract.summary.unseenSourcesDropped).toBe(1);

      /* ── the pure tail ── */
      const normalized = await runNormalizeContactFields(
        makeContext(brief, afterExtract.payload, 0n).ctx
      );
      const split = await runSplitExceptions(makeContext(brief, normalized.payload, 0n).ctx);

      /**
       * The measurement this whole file exists for: the verified/needs-review
       * split is computed by split.exceptions in code, from the two-source
       * bar, and it must land on the numbers the world declared before the run.
       */
      expect(split.summary.verified).toBe(declared.expectedVerified);
      expect(split.summary.needsReview).toBe(declared.expectedNeedsReview);
      expect(split.summary.notFound).toBe(0);
      expect(split.summary.missingRows).toBe(0);

      const build = makeContext(brief, split.payload, 0n);
      await runBuildCsv(build.ctx);
      const artifact = build.artifacts.find((a) => a.name === "candidate");
      expect(artifact).toBeDefined();
      const csv = (artifact as ArtifactSpec).body.toString("utf8");
      const dataRows = csv.split("\n").filter((l) => l.trim().length > 0).length - 1;
      expect(dataRows).toBe(declared.units);
      // Every requested column, plus its sources column, is present.
      for (const f of world.fields) expect(csv.split("\n")[0]).toContain(f);
    });
  }
);

describe("nothing in this path can spend", () => {
  it("the provider layer reports synthetic mode and a budget it never touched", () => {
    const ps = providerStats();
    expect(ps.mode).toBe("synthetic");
    expect(ps.synthetic).toBeGreaterThan(0);
    expect(ps.budget.calls).toBe(0);
    expect(ps.budget.spentMicros).toBe(0);
    expect(ps.recorded).toBe(0);
    expect(ps.uncapitalised).toEqual([]);
  });
});
