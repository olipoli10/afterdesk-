import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { anthropicMockFactory, setSyntheticResponder, providerStats, stageOf } from "@/../test/support/provider-replay";
import { syntheticResponderFor } from "@/../test/support/synthetic-responder";
import { SYNTHETIC_PROFILES } from "@/../test/support/synthetic-plans";
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

/**
 * Params through the SAME parser the compiler uses, and a failure here is a
 * failure of the test's own fixture rather than of the code under test — so it
 * throws with the id rather than handing a primitive a null it cannot read.
 */
async function mustParams(primitiveId: string, raw: Record<string, unknown>) {
  const { parsePrimitiveParams } = await import("@/lib/ai-work-engine/primitive-params");
  const parsed = parsePrimitiveParams(primitiveId, raw);
  if (parsed === null) throw new Error(`the test's own params for ${primitiveId} are invalid`);
  return parsed;
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

describe("every synthetic plan is a plan the real engine would accept", () => {
  /**
   * The cheapest way to not waste a database run. A plan whose steps fail the
   * planner's own schema, or whose params fail their capability's, compiles to
   * human work — and the L3 report would then read as "the engine refused to
   * automate this mandate" when the truth is that the harness wrote a bad
   * plan. Catching that here costs a millisecond and no Postgres.
   */
  it.each(SYNTHETIC_PROFILES.map((p) => [p.id, p] as const))(
    "%s — schema, params, and the step-count bound",
    async (_id, profile) => {
      const { planOutputSchema, classificationOutputSchema, MAX_PLAN_STEPS } = await import(
        "@/lib/ai-work-engine/schemas"
      );
      const { parsePrimitiveParams } = await import("@/lib/ai-work-engine/primitive-params");

      const classification = classificationOutputSchema.safeParse(profile.classification);
      expect(classification.success, JSON.stringify(classification.error?.issues?.[0])).toBe(true);

      // Three manifest refs, which is the most any mandate in the corpus has.
      const plan = profile.plan(["file_1", "file_2", "file_3"]);
      const parsed = planOutputSchema.safeParse(plan);
      expect(parsed.success, JSON.stringify(parsed.error?.issues?.[0])).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.steps.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);

      for (const [i, step] of parsed.data.steps.entries()) {
        if (!step.primitive_id) continue;
        // The step schema decodes the params JSON string for us, so what
        // arrives here is already the object the capability will be handed.
        const raw = step.params ?? {};
        expect(
          parsePrimitiveParams(step.primitive_id, raw),
          `${profile.id} step ${i + 1} (${step.primitive_id}) has params its capability rejects`
        ).not.toBeNull();
        // A dependency must point at a step that exists and comes earlier.
        for (const dep of step.depends_on_order) {
          expect(dep, `${profile.id} step ${i + 1} depends on ${dep}`).toBeGreaterThan(0);
          expect(dep).toBeLessThanOrEqual(i + 1);
        }
      }
    }
  );
});

describe("W8's own plan, executed step by step, reaches its ground truth", () => {
  /**
   * THE REPLAY THE ORDER ASKED FOR, WITHOUT A DATABASE.
   *
   * The measurement above drives a chain written by hand, which proves the
   * capabilities and proves nothing about the PLAN the L3 harness will feed
   * the runner. So this one reads W8's actual synthetic plan, resolves each
   * step through the REGISTRY the runner uses, and threads the payload the way
   * processWorkflowRuns does. If the plan and the capabilities ever disagree,
   * this is red before any Postgres is involved.
   */
  it("105 rows out of 40 + 35 + 30, at zero cost", async () => {
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    const { consolidationFixtures } = await import("../.scratch/l3-fixtures");
    const { planOutputSchema } = await import("@/lib/ai-work-engine/schemas");

    const files = consolidationFixtures();
    const frozen = files.map((f, i) => ({
      fileId: `file_${i + 1}`,
      fileName: f.fileName,
      sizeBytes: f.bytes.byteLength,
      sha256: createHash("sha256").update(f.bytes).digest("hex"),
      read: async () => f.bytes,
    }));

    const profile = SYNTHETIC_PROFILES.find((p) => p.id === "W8");
    const parsed = planOutputSchema.safeParse(profile?.plan(["file_1", "file_2", "file_3"]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const brief: PrimitiveContext["brief"] = {
      title: "Consolidate three regional supplier lists",
      description: "Three files, different column names, one list out.",
      quantity: "105",
      objective: "consolidate",
      geography: [],
      requiredFields: ["company", "website", "email", "city"],
      quantityInterpreted: 105,
    };

    let payload: WorkflowPayload = emptyPayload(105, ["company", "website", "email", "city"]);
    const artifacts: ArtifactSpec[] = [];
    const ran: string[] = [];

    for (const step of parsed.data.steps) {
      if (!step.primitive_id) continue;
      const primitive = REGISTRY[step.primitive_id as keyof typeof REGISTRY];
      expect(primitive, `${step.primitive_id} is not in the registry`).toBeDefined();
      const h = makeContext(brief, payload, 0n);
      h.ctx.params = await mustParams(step.primitive_id, step.params ?? {});
      h.ctx.inputFiles = frozen;
      h.ctx.writeArtifact = async (spec) => {
        artifacts.push(spec);
        return { fileId: `artifact_${artifacts.length}` };
      };
      const out = await primitive.run(h.ctx);
      payload = out.payload;
      ran.push(step.primitive_id);
    }

    expect(ran).toEqual([
      "ingest.csv",
      "ingest.csv",
      "ingest.csv",
      "data.schema_map",
      "data.schema_map",
      "data.concat",
      "split.exceptions",
      "build.csv",
    ]);

    const candidate = artifacts.find((a) => a.name === "candidate");
    expect(candidate).toBeDefined();
    const csv = (candidate as ArtifactSpec).body.toString("utf8");
    const rows = csv.split("\n").filter((l) => l.trim().length > 0).length - 1;
    expect(rows).toBe(105);
    expect(csv.split("\n")[0].split(",")).toEqual(["company", "website", "email", "city"]);

    // Not one row invented and not one dropped: the ground truth is the sum of
    // the three files' own declared counts.
    const declared = files.reduce((n, f) => n + Number(f.truth.dataRows), 0);
    expect(rows).toBe(declared);
  });
});

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

describe("W8 — what consolidating three files can actually produce today", () => {
  /**
   * THE GROUND TRUTH, MEASURED BEFORE THE DATABASE RUN.
   *
   * W8's declared truth is 105 rows: three regional supplier lists of 40, 35
   * and 30, mapped onto shared column names and combined. The vocabulary's
   * only two-datasets-in-one-out capability is `data.join`, and a join is not
   * a union — it matches keys and returns the left side.
   *
   * This test does not assert the number it would like. It asserts the number
   * the engine produces, so the gap is a measurement in the repository rather
   * than a surprise in a report.
   */
  it("REFUSES rather than silently handing over the second file", async () => {
    /**
     * THE HOSTILE REPRODUCTION OF THE P0, KEPT AND INVERTED.
     *
     * This test used to assert the defect: ingest file one into `main`, file
     * two into `src2`, ask for `main`, receive file TWO. Thirty-five rows
     * where forty were ingested, no step failed, and a deliverable built from
     * the wrong source that nobody could tell apart from a correct one.
     *
     * It now asserts the fix, in the shape that matters: the engine does not
     * return the other file, and it does not return the right one either —
     * there is no way to know which was meant, so it REFUSES and says why.
     * Both datasets are still intact and still reachable BY NAME, which is
     * the second half of the assertion: the fix is a refusal to guess, not a
     * loss of data.
     */
    const { consolidationFixtures } = await import("../.scratch/l3-fixtures");
    const { runIngestCsv, runDataDedupe } = await import("@/lib/ai-work-engine/primitives/files");

    const files = consolidationFixtures();
    const frozen = files.map((f, i) => ({
      fileId: `file_${i + 1}`,
      fileName: f.fileName,
      sizeBytes: f.bytes.byteLength,
      sha256: createHash("sha256").update(f.bytes).digest("hex"),
      read: async () => f.bytes,
    }));
    const brief: PrimitiveContext["brief"] = {
      title: "Consolidate three regional supplier lists",
      description: "Three files, one list out.",
      quantity: "105",
      objective: "consolidate",
      geography: [],
      requiredFields: ["company", "website", "email", "city"],
      quantityInterpreted: 105,
    };

    let payload: WorkflowPayload = emptyPayload(105, ["company", "website", "email", "city"]);
    for (const [i, name] of ["main", "src2"].entries()) {
      const h = makeContext(brief, payload, 0n);
      h.ctx.params = await mustParams("ingest.csv", {
        fileId: `file_${i + 1}`,
        datasetName: name,
      });
      h.ctx.inputFiles = frozen;
      payload = (await runIngestCsv(h.ctx)).payload;
    }
    // 40 rows went into `main`. 35 then went into `src2`. Both are intact.
    expect(payload.datasets?.main?.length).toBe(40);
    expect(payload.datasets?.src2?.length).toBe(35);
    expect(payload.workingDataset).toBe("src2");

    const ask = async (dataset: string) => {
      const h = makeContext(brief, payload, 0n);
      h.ctx.params = await mustParams("data.dedupe", {
        dataset,
        keyFields: ["company"],
        strategy: "exact",
        keep: "first",
      });
      return runDataDedupe(h.ctx);
    };

    // `main` has two candidate meanings here, so it has none.
    await expect(ask("main")).rejects.toThrow(/ambiguous/);

    // And naming either one gets exactly that one. No data was lost; only the
    // guess was removed.
    expect((await ask("src2")).summary.rowsOut).toBe(35);
  });

  it("stacks all three into 105 rows, and a join would still give 40", async () => {
    const { consolidationFixtures } = await import("../.scratch/l3-fixtures");
    // build.csv resolves to runBuildCsvV2 in the registry — the params-aware
    // one that honours `dataset`. Using the v1 pure function here would be
    // measuring a code path the runner does not take.
    const { runIngestCsv, runDataSchemaMap, runDataJoin, runDataConcat, runBuildCsvV2 } =
      await import("@/lib/ai-work-engine/primitives/files");

    const files = consolidationFixtures();
    const declaredTotal = files.reduce((n, f) => n + Number(f.truth.dataRows), 0);
    expect(declaredTotal).toBe(105);

    const frozen = files.map((f, i) => ({
      fileId: `file_${i + 1}`,
      fileName: f.fileName,
      sizeBytes: f.bytes.byteLength,
      sha256: createHash("sha256").update(f.bytes).digest("hex"),
      read: async () => f.bytes,
    }));

    const brief: PrimitiveContext["brief"] = {
      title: "Consolidate three regional supplier lists",
      description: "Three files, different column names, one list out.",
      quantity: "105",
      objective: "consolidate",
      geography: [],
      requiredFields: ["company", "website", "email", "city"],
      quantityInterpreted: 105,
    };

    const step = async (
      primitiveId: string,
      rawParams: Record<string, unknown>,
      input: WorkflowPayload,
      run: (ctx: PrimitiveContext) => Promise<{ payload: WorkflowPayload; summary: Record<string, unknown> }>
    ) => {
      const h = makeContext(brief, input, 0n);
      h.ctx.params = await mustParams(primitiveId, rawParams);
      h.ctx.inputFiles = frozen;
      const out = await run(h.ctx);
      return { ...out, artifacts: h.artifacts };
    };

    /**
     * Named `src1`, NOT `main`, because of the defect the previous test pins:
     * `main` always resolves to the working set, so a first file ingested
     * under that name is silently replaced by the second. This is the best a
     * competent plan can do with the vocabulary as it stands, and it is what
     * the number below therefore measures.
     */
    let payload: WorkflowPayload = emptyPayload(105, ["company", "website", "email", "city"]);
    for (const [i, name] of ["src1", "src2", "src3"].entries()) {
      const out = await step(
        "ingest.csv",
        { fileId: `file_${i + 1}`, datasetName: name },
        payload,
        runIngestCsv
      );
      payload = out.payload;
    }
    payload = (
      await step(
        "data.schema_map",
        {
          dataset: "src2",
          mapping: [
            { from: "Company Name", to: "company" },
            { from: "Web Site", to: "website" },
            { from: "E-mail", to: "email" },
            { from: "Town", to: "city" },
          ],
          unmapped: "drop",
          into: "src2",
        },
        payload,
        runDataSchemaMap
      )
    ).payload;
    payload = (
      await step(
        "data.schema_map",
        {
          dataset: "src3",
          mapping: [
            { from: "supplier", to: "company" },
            { from: "domain", to: "website" },
            { from: "contact_email", to: "email" },
            { from: "location", to: "city" },
          ],
          unmapped: "drop",
          into: "src3",
        },
        payload,
        runDataSchemaMap
      )
    ).payload;
    /**
     * THE CAPABILITY THAT ANSWERS THE MANDATE'S ACTUAL QUESTION.
     *
     * One step, three datasets, stacked. The measurement that motivated it is
     * kept below: the same three files through `data.join` still come out as
     * 40, so the two capabilities remain distinguishable by their results and
     * not only by their names.
     */
    const stacked = await step(
      "data.concat",
      { datasets: ["src1", "src2", "src3"], columns: "union", into: "combined" },
      payload,
      runDataConcat
    );
    expect(stacked.summary.rowsOut).toBe(105);
    expect(stacked.summary.datasetsIn).toBe(3);
    expect(stacked.summary.perDataset).toBe("src1:40,src2:35,src3:30");
    // The three files were mapped onto the same four column names, so the
    // union is those four and nothing was invented to fill a gap.
    expect(stacked.summary.columnsOut).toBe(4);

    const built = await step(
      "build.csv",
      { dataset: "combined", columns: [] },
      stacked.payload,
      runBuildCsvV2
    );
    const csv = built.artifacts[0].body.toString("utf8");
    const rows = csv.split("\n").filter((l) => l.trim().length > 0).length - 1;
    expect(rows).toBe(declaredTotal);
    expect(rows).toBe(105);
    expect(csv.split("\n")[0].split(",")).toEqual(["company", "website", "email", "city"]);

    /**
     * AND THE ALARM STAYS. A left join on the same three sets still returns
     * the left side's 40 rows — unchanged by this commit, and pinned here so
     * that "concat exists now" can never be mistaken for "join was fixed".
     */
    let joined = payload;
    for (const right of ["src2", "src3"]) {
      joined = (
        await step(
          "data.join",
          {
            left: "src1",
            right,
            leftKey: "company",
            rightKey: "company",
            type: "left",
            onConflict: "prefer_left",
            into: "src1",
          },
          joined,
          runDataJoin
        )
      ).payload;
    }
    expect(joined.datasets?.src1?.length).toBe(40);
  });
});
