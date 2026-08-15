import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARCHITECTURE PIN — CROSS-CLIENT CONTENT MAY NOT REACH AI OR ANYONE'S SCREEN.
 *
 * Deliberately its own file rather than an entry in price-wall.test.ts. That
 * suite guards RULE 2: two independent prices, enforced by role-shaped Prisma
 * selects that never project the other side's column. This is a different
 * invariant with a different failure mode — content from one client crossing
 * into another client's processing — and filing it under the price wall would
 * blur what each test is actually protecting.
 *
 * ── WHAT THIS PROTECTS ──
 *
 * `findSimilarPricedTasks` used to select `title` and `description` from other
 * clients' tasks and the planner serialised them into an Anthropic prompt. That
 * is fixed, in SQL, and pinned against real Postgres by
 * test/integration/client-isolation.itest.ts.
 *
 * `exceptionMetricsForAdmin` is the one function left whose RETURN VALUE mixes
 * free text from several clients into a single object: its `byField` map
 * aggregates unresolved field names — the clients' own words — across every
 * mandate on the platform. It has no caller today, which is precisely why it
 * needs a guard rather than a comment: an unwired function that already
 * aggregates across clients is one import away from becoming a live path, and
 * the person who adds that import will not be thinking about this.
 *
 * ── WHY AN ALLOWLIST, NOT A BLOCKLIST ──
 *
 * Listing the forbidden surfaces would protect today's AI modules and miss
 * tomorrow's. Admin pages are the only place this data belongs, so admin pages
 * are the only place allowed to reach it. A new pricing module, a new
 * primitive, a new client screen: all covered on the day they are written,
 * without anyone remembering this file exists.
 */

const SRC = join(__dirname, "..", "src");

/** The module holding cross-client telemetry, matched by path and by symbol. */
const RESTRICTED_MODULE = "exception-metrics";
const RESTRICTED_SYMBOL = "exceptionMetricsForAdmin";

/**
 * The only surfaces that may import it. Operator dashboards, and nothing else.
 *
 * Widening this is a real decision: anything added here gets to see field names
 * belonging to clients other than the one whose screen is being rendered. If a
 * future admin SERVER ACTION needs the data, add its exact path and say why —
 * do not relax the rule to "anything called admin".
 */
const ALLOWED_IMPORTERS = [
  join("src", "app", "admin"),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/** True when the file is one of the surfaces permitted to import the module. */
function isAllowed(file: string): boolean {
  const rel = relative(join(__dirname, ".."), file);
  return ALLOWED_IMPORTERS.some((prefix) => rel.startsWith(prefix + sep) || rel === prefix);
}

describe("cross-client telemetry cannot reach AI, provider or client-facing code", () => {
  const files = walk(SRC);

  it("the pin is not vacuous — the module and its export still exist", () => {
    // A rename would otherwise silently switch this whole suite off: every
    // assertion below would pass against a codebase that no longer contains
    // the thing being restricted.
    const source = readFileSync(
      join(SRC, "lib", "queries", "exception-metrics.ts"),
      "utf8"
    );
    expect(source).toContain(`export async function ${RESTRICTED_SYMBOL}`);
    expect(files.length).toBeGreaterThan(100);
  });

  it("is imported by nothing outside the admin surface", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(join("lib", "queries", "exception-metrics.ts"))) continue;
      const source = readFileSync(file, "utf8");
      const importsModule =
        new RegExp(`from\\s+["'][^"']*${RESTRICTED_MODULE}["']`).test(source) ||
        new RegExp(`import\\(\\s*["'][^"']*${RESTRICTED_MODULE}["']`).test(source);
      const namesSymbol = source.includes(RESTRICTED_SYMBOL);
      if ((importsModule || namesSymbol) && !isAllowed(file)) {
        offenders.push(relative(join(__dirname, ".."), file));
      }
    }
    expect(
      offenders,
      [
        `${RESTRICTED_SYMBOL} aggregates client-defined field names across DIFFERENT clients.`,
        "It is admin telemetry only. It must never become context for planning, pricing,",
        "classification, critique, execution, a provider payload, or anything a client or",
        "worker can see.",
        "",
        "If an operator surface genuinely needs it, add that exact path to",
        "ALLOWED_IMPORTERS in this file and record why. If an AI or client-facing module",
        "needs the underlying signal, it needs a different source: a per-task read, or an",
        "aggregate that carries no client wording.",
        "",
        `Offending files:\n${offenders.join("\n")}`,
      ].join("\n")
    ).toEqual([]);
  });

  it("the module still states the restriction at its export", () => {
    // The import guard is the enforcement; this sentence is what tells the next
    // reader why, at the moment they are looking at the function itself.
    const source = readFileSync(
      join(SRC, "lib", "queries", "exception-metrics.ts"),
      "utf8"
    );
    expect(source).toContain("Never use as AI/provider/client context.");
  });
});

/**
 * ARCHITECTURE PIN — HUMAN WORK UNIT CONTENT IS NOT MODEL CONTEXT.
 *
 * The nine HumanWorkUnit tables hold the most sensitive material this feature
 * touches: `HumanWorkUnitCandidate.payload` is what a worker actually submitted,
 * `HumanWorkUnitAcceptance.resultPayload` is the frozen accepted result, and
 * `HumanWorkUnitDefinition.instructions`/`declaredInputs` are copied from one
 * client's accepted contract. All of it belongs to exactly one mandate.
 *
 * Two boundaries are pinned here, both for the same reason the file above
 * exists: the failure is silent, and the person who breaks it will not be
 * thinking about this file.
 *
 * 1. NO PROVIDER-FACING MODULE MAY NAME THESE TABLES. A prompt builder that can
 *    reach a candidate payload is one convenience import away from serialising
 *    another client's work into a model call. That is exactly how
 *    `findSimilarPricedTasks` leaked, and it is fixed the same way: the
 *    generation and critique modules simply may not see the data.
 *
 * 2. NO UNIT AUDIT ACTION MAY JOIN THE CLIENT TIMELINE. The audit mirror writes
 *    `TaskEvent` rows, and the client timeline renders `TaskEvent` through an
 *    ALLOWLIST. That allowlist is the whole reason "adding an event to the audit
 *    log can never, by itself, publish it" is true, so it is pinned rather than
 *    trusted.
 *
 * These are STATIC pins. The runtime authority rules — who may claim, submit,
 * review, or read a candidate — are enforced by `where` clauses and by the
 * database invariants proven in `test/integration/human-unit-schema-invariants.itest.ts`.
 * A static pin cannot prove tenancy; it prevents the class of mistake where
 * data reaches a surface that should never have been able to ask for it.
 */

const HUMAN_UNIT_MODELS = [
  "HumanWorkUnitDefinition",
  "HumanWorkUnitRunState",
  "HumanWorkUnitCandidate",
  "HumanWorkUnitCandidateFile",
  "HumanWorkUnitReviewDecision",
  "HumanWorkUnitAcceptance",
  "HumanWorkUnitResumeRecord",
  "HumanWorkUnitTransition",
  "HumanWorkUnitAlert",
] as const;

/** Prisma client accessor for a model: `HumanWorkUnitCandidate` -> `humanWorkUnitCandidate`. */
const accessorOf = (model: string) => model[0].toLowerCase() + model.slice(1);

/**
 * Modules that build model input or reach a provider. None of them has any
 * business naming a HumanWorkUnit table.
 *
 * `compile.ts` is deliberately NOT here: the compiler decides admission and must
 * read the plan, but it is pure and takes its inputs as arguments — it never
 * opens the database itself. If that ever changes, this list is where the
 * argument gets had.
 */
const PROVIDER_FACING_MODULES = [
  join("src", "lib", "ai-work-engine", "index.ts"),
  join("src", "lib", "ai-work-engine", "classify.ts"),
  join("src", "lib", "ai-work-engine", "plan.ts"),
  join("src", "lib", "ai-work-engine", "critique.ts"),
  join("src", "lib", "ai-work-engine", "pricing.ts"),
  join("src", "lib", "ai-work-engine", "intake-framing.ts"),
  join("src", "lib", "ai-work-engine", "metered-call.ts"),
  join("src", "lib", "pricing-ai.ts"),
  join("src", "lib", "assistant-ai.ts"),
  join("src", "lib", "closed-job-analysis.ts"),
];

describe("human work unit content cannot become model context", () => {
  const root = join(__dirname, "..");

  it("the pin is not vacuous — all nine models exist in the schema", () => {
    // Without this, a rename would switch every assertion below off silently:
    // they would all pass against a schema that no longer has these tables.
    const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
    for (const model of HUMAN_UNIT_MODELS) {
      expect(schema, `${model} is missing from schema.prisma`).toContain(
        `model ${model} {`
      );
    }
    expect(HUMAN_UNIT_MODELS.length).toBe(9);
  });

  it("the pin is not vacuous — every listed provider-facing module exists", () => {
    for (const rel of PROVIDER_FACING_MODULES) {
      expect(
        statSync(join(root, rel)).isFile(),
        `${rel} is listed as provider-facing but does not exist; fix the list rather than deleting the check`
      ).toBe(true);
    }
  });

  it("no provider-facing module reads a human work unit table", () => {
    const offenders: string[] = [];
    for (const rel of PROVIDER_FACING_MODULES) {
      const source = readFileSync(join(root, rel), "utf8");
      for (const model of HUMAN_UNIT_MODELS) {
        const accessor = accessorOf(model);
        if (
          /**
           * `String.raw` is load-bearing. In an ordinary template literal `\b`
           * is a BACKSPACE character and `\s` is just `s`, so the pattern
           * silently matches nothing and this pin passes while proving nothing.
           *
           * That is not hypothetical: this check shipped that way for a few
           * minutes and was caught only by planting a violation and watching
           * the suite stay green. A guard that never fires is worse than no
           * guard, because it is counted as coverage.
           */
          new RegExp(String.raw`\b(prisma|tx|db)\s*\.\s*${accessor}\b`).test(source) ||
          new RegExp(String.raw`\b${model}\b`).test(source)
        ) {
          offenders.push(`${rel} -> ${model}`);
        }
      }
    }
    expect(
      offenders,
      [
        "A provider-facing module names a HumanWorkUnit table.",
        "",
        "These tables hold one client's submitted work, their accepted result, and",
        "instructions copied from their accepted contract. A module that builds a",
        "prompt must not be able to reach them: that is how cross-client content",
        "ends up in a model call, and it is the exact shape of the",
        "findSimilarPricedTasks leak this file already guards.",
        "",
        "If a generation path genuinely needs a signal from a unit, pass the",
        "specific scalar in as an argument from a caller that already proved",
        "authority. Do not give the prompt builder database reach.",
        "",
        `Offending references:\n${offenders.join("\n")}`,
      ].join("\n")
    ).toEqual([]);
  });

  it("no human work unit audit action is published on the client timeline", () => {
    /**
     * The audit mirror writes `TaskEvent` rows with `human_unit_*` actions. The
     * client timeline renders TaskEvent through CLIENT_TIMELINE_LABELS, an
     * allowlist. If one of these actions were ever added to it, a client would
     * start seeing the internal review loop — who submitted, how many revisions,
     * when it was rejected — which is worker-identifying and none of their
     * business.
     */
    const source = readFileSync(
      join(root, "src", "lib", "queries", "tasks.ts"),
      "utf8"
    );
    const start = source.indexOf("CLIENT_TIMELINE_LABELS");
    expect(start, "CLIENT_TIMELINE_LABELS has moved or been renamed").toBeGreaterThan(-1);
    const whitelist = source.slice(start, source.indexOf("\n};", start));

    const leaked = [...whitelist.matchAll(/human_unit_[a-z_]+/g)].map((m) => m[0]);
    expect(
      leaked,
      [
        "A human_unit_* action is on the client timeline allowlist.",
        "The audit trail records the internal review loop. Publishing it would show",
        "a client the worker's submission history and the reviewer's rejections.",
        "",
        `Leaked actions:\n${leaked.join("\n")}`,
      ].join("\n")
    ).toEqual([]);
  });
});

