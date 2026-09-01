import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R5 — SOURCE-OF-TRUTH PIN: the account-level ceiling is checked BEFORE
 * every billable dispatch, never after.
 *
 * The mandated order is:
 *   validate accepted execution -> validate per-run allowance
 *     -> reserve account-level allowance -> dispatch live provider -> settle
 *
 * Never: dispatch -> account-level check. This file reads the real source at
 * every call site R5 touches and asserts the ordering textually, the same
 * style as test/worker-after-claim.test.ts and test/human-time-integrity.test.ts
 * — a fast, CI-covered complement to the real-Postgres behavioral proof in
 * test/integration/account-spend-ceiling.itest.ts and the original execution
 * evidence in .scratch/r5-account-spend-ceiling.e2e.ts.
 */

const ROOT = join(__dirname, "..");
// Normalized to LF: workflow-runs.ts is CRLF on disk, and this file's
// multi-line search anchors are written with \n.
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

describe("workflow-run primitives: account-level reservation gates dispatch", () => {
  const source = read("src/server/workflow-runs.ts");

  it("reserveAccountProviderSpend is called, and primitive.run() is invoked strictly after it", () => {
    const reserveIndex = source.indexOf("await reserveAccountProviderSpend(");
    const dispatchIndex = source.indexOf("primitive.run({");
    expect(reserveIndex, "the account-level reservation call exists").toBeGreaterThan(0);
    expect(dispatchIndex, "the dispatch call exists").toBeGreaterThan(0);
    expect(dispatchIndex, "dispatch happens strictly after the account-level reservation").toBeGreaterThan(reserveIndex);
  });

  it("the account-level reservation happens strictly after the per-run reservation, never before it", () => {
    const perRunIndex = source.indexOf("reservation = primitive.billable");
    const accountIndex = source.indexOf("accountHold = await reserveAccountProviderSpend(");
    expect(perRunIndex).toBeGreaterThan(0);
    expect(accountIndex).toBeGreaterThan(0);
    expect(accountIndex, "validate per-run allowance BEFORE account-level allowance").toBeGreaterThan(perRunIndex);
  });

  it("a refusal never falls through to primitive.run(): the refusal branch always continues or breaks", () => {
    const gate = source.slice(
      source.indexOf("accountHold = await reserveAccountProviderSpend("),
      source.indexOf("A RESERVED HOLD THAT NEVER BECAME A CALL")
    );
    expect(gate).toContain("if (!accountHold.ok)");
    expect(gate).toContain("continue;");
    // The refusal branch must not itself contain a call to primitive.run.
    const refusalBranch = gate.slice(gate.indexOf("if (!accountHold.ok)"));
    expect(refusalBranch).not.toContain("primitive.run(");
  });

  it("reuses the SAME frozen worst-case ceiling as the per-run reservation — never a new estimate", () => {
    const gate = source.slice(
      source.indexOf("if (primitive.billable) {\n          accountHold"),
      source.indexOf("A RESERVED HOLD THAT NEVER BECAME A CALL")
    );
    expect(gate).toContain("worstCaseMicros: step.maxCostMicrosPerAttemptAtQuote!");
  });

  it("on refusal, releases the per-run hold and demotes to the EXISTING human-handoff mechanism — never a second fallback system", () => {
    const gate = source.slice(
      source.indexOf("if (!accountHold.ok) {"),
      source.indexOf("A RESERVED HOLD THAT NEVER BECAME A CALL")
    );
    expect(gate).toContain("releaseHold(reservation.holdId)");
    expect(gate).toContain("handOffStepToHuman(");
    // Never a bespoke pause/notify system for this specific reason.
    expect(gate).not.toContain("new PrismaClient");
  });

  it("settlement of the account-level hold happens inside the SAME transaction as the per-run hold and the invocation row", () => {
    const txBody = source.slice(
      source.indexOf("await prisma.$transaction(async (tx) => {\n                  await tx.taskToolInvocation.create("),
      source.indexOf("Split at the point of record")
    );
    expect(txBody).toContain("settleAccountSpendHold(tx,");
    expect(txBody).toContain("settleHold(tx,");
  });

  it("does not mutate accepted contract economics: no assignment to clientPriceCents or vaPayoutCents anywhere in the account-level gate", () => {
    const gate = source.slice(
      source.indexOf("R5 — THE ACCOUNT-LEVEL CIRCUIT BREAKER, AFTER THE PER-RUN GATE"),
      source.indexOf("A RESERVED HOLD THAT NEVER BECAME A CALL")
    );
    expect(gate).not.toMatch(/clientPriceCents\s*[:=]/);
    expect(gate).not.toMatch(/vaPayoutCents\s*[:=]/);
  });
});

describe("Phase 1A (classify/plan/critique): account-level reservation gates dispatch, and stays DB-free at the stage-function level", () => {
  const index = read("src/lib/ai-work-engine/index.ts");
  const classify = read("src/lib/ai-work-engine/classify.ts");
  const plan = read("src/lib/ai-work-engine/plan.ts");
  const critique = read("src/lib/ai-work-engine/critique.ts");

  it("index.ts reserves account-level spend before calling runClassification/runPlanGeneration/runCritique", () => {
    for (const [reserveVar, runCall] of [
      ["classifyAccountHold = await reserveAccountProviderSpend(", "classified = await runClassification("],
      ["planAccountHold = await reserveAccountProviderSpend(", "planned = await runPlanGeneration("],
      ["critiqueAccountHold = await reserveAccountProviderSpend(", "critiqued = await runCritique("],
    ] as const) {
      const reserveIndex = index.indexOf(reserveVar);
      const runIndex = index.indexOf(runCall);
      expect(reserveIndex, `${reserveVar} exists`).toBeGreaterThan(0);
      expect(runIndex, `${runCall} exists`).toBeGreaterThan(0);
      expect(runIndex, `${runCall} happens strictly after ${reserveVar}`).toBeGreaterThan(reserveIndex);
    }
  });

  it("a refusal throws BEFORE the real call, inside the same try the ordinary provider-failure path uses", () => {
    for (const marker of ["classifyAccountHold.ok", "planAccountHold.ok", "critiqueAccountHold.ok"]) {
      const branch = index.slice(index.indexOf(`if (!${marker})`), index.indexOf(`if (!${marker})`) + 700);
      expect(branch).toContain("throw new AccountSpendCeilingError(");
    }
  });

  it("R5.1 — a Phase 1A refusal records the durable structured fact BEFORE it throws, so the admin blocked count can see it", () => {
    for (const marker of ["classifyAccountHold.ok", "planAccountHold.ok", "critiqueAccountHold.ok"]) {
      const start = index.indexOf(`if (!${marker})`);
      const branch = index.slice(start, start + 700);
      const recordIndex = branch.indexOf("recordAccountSpendBlocked(");
      const throwIndex = branch.indexOf("throw new AccountSpendCeilingError(");
      expect(recordIndex, `${marker} records the block`).toBeGreaterThan(0);
      expect(throwIndex, `${marker} still throws`).toBeGreaterThan(0);
      expect(throwIndex, `${marker} records BEFORE throwing`).toBeGreaterThan(recordIndex);
    }
  });

  it("classify.ts, plan.ts and critique.ts import NO Prisma/DB module — the account-level reservation lives in the orchestrator, not in the stage functions", () => {
    for (const [name, source] of [
      ["classify.ts", classify],
      ["plan.ts", plan],
      ["critique.ts", critique],
    ] as const) {
      expect(source, `${name} must not import the account-spend module`).not.toContain("@/server/account-spend");
      expect(source, `${name} must not import the Prisma client`).not.toContain("@/lib/db");
      expect(source, `${name} still exports its pure worst-case estimator`).toMatch(/export function \w*ReservationMicros/);
    }
  });

  it("test/synthetic-provider.test.ts (the fast test calling runCritique directly) needs no Prisma mock — confirms the DB-free property survived", () => {
    const synthTest = read("test", "synthetic-provider.test.ts");
    expect(synthTest).not.toContain("vi.mock(\"@/lib/db\"");
    expect(synthTest).toContain("runCritique(");
  });
});

/**
 * R5.1 — THE FINDING THIS FILE EXISTS TO KEEP CLOSED.
 *
 * Every metered provider client must be built with `maxRetries: 0`. The SDK's
 * own retry issues a SECOND billable POST under the SAME accounting identity
 * (one AccountProviderSpendHold, one attempt number, one usage row), and the
 * hold then settles at the LAST response's cost — so one reservation funds two
 * charges and the reserved worst case is handed back to the day's ceiling.
 * The Messages API has no idempotency key, so nothing downstream can undo it.
 *
 * research.ts/extract.ts/fetch.ts always followed this rule; classify.ts,
 * plan.ts and critique.ts did not, which is exactly the gap R5.1 found once R5
 * had put them under an account-level reservation. Retrying belongs to the
 * claim layer, where each attempt gets its own reservation.
 */
describe("R5.1 — no metered provider client may let the SDK retry behind the ledger's back", () => {
  const METERED_CLIENTS = [
    // R5.2 — the three surfaces this lot brought under the breaker. They were
    // absent from this list while it claimed to cover "every metered client".
    "src/lib/ai.ts",
    "src/lib/assistant-ai.ts",
    "src/lib/closed-job-analysis.ts",
    "src/lib/ai-work-engine/classify.ts",
    "src/lib/ai-work-engine/plan.ts",
    "src/lib/ai-work-engine/critique.ts",
    "src/lib/ai-work-engine/primitives/research.ts",
    "src/lib/ai-work-engine/primitives/extract.ts",
    "src/lib/ai-work-engine/primitives/fetch.ts",
  ];

  for (const rel of METERED_CLIENTS) {
    it(`${rel} builds its Anthropic client with maxRetries: 0`, () => {
      const source = read(rel);
      const constructions = source.match(/new Anthropic\(\{[^}]*\}\)/g) ?? [];
      expect(constructions.length, "the file builds at least one Anthropic client").toBeGreaterThan(0);
      for (const c of constructions) {
        expect(c, `${rel}: ${c}`).toContain("maxRetries: 0");
        expect(c, `${rel} must never re-enable SDK retries: ${c}`).not.toMatch(/maxRetries:\s*[1-9]/);
      }
    });
  }
});

/**
 * R5.1 — a reservation is given back ONLY when non-dispatch is known. The
 * runner's own deadline races the primitive as a whole, so it can fire while a
 * provider POST is still open; releasing there would return a real charge's
 * room to the ceiling.
 */
describe("R5.1 — the runner's own timeout never releases a reservation", () => {
  const source = read("src/server/workflow-runs.ts");

  it("the outer deadline throws a distinguishable error rather than a bare Error", () => {
    expect(source).toContain("class StepTimeoutError");
    expect(source).toContain("reject(new StepTimeoutError(label, ms))");
  });

  it("both releases in the catch are gated on the failure NOT being that deadline", () => {
    const catchBlock = source.slice(
      source.indexOf("const classified = classifyProviderError(error);"),
      source.indexOf("const message = classified.message;")
    );
    expect(catchBlock).toContain("error instanceof StepTimeoutError");
    // Neither release may fire without the guard.
    for (const call of ["releaseHold(reservation.holdId)", "releaseAccountSpendHold(accountHold.holdId)"]) {
      const idx = catchBlock.indexOf(call);
      expect(idx, `${call} is present in the catch`).toBeGreaterThan(0);
      const guardLine = catchBlock.slice(catchBlock.lastIndexOf("if (", idx), idx);
      expect(guardLine, `${call} is guarded by !mayHaveDispatched`).toContain("!mayHaveDispatched");
    }
  });
});

describe("configuration: production fails closed, never silently unlimited", () => {
  const source = read("src/server/account-spend.ts");

  it("an unconfigured ceiling in production refuses every reservation — the check happens BEFORE any hold is created", () => {
    const fn = source.slice(source.indexOf("export async function reserveAccountProviderSpend"));
    const ceilingCheckIndex = fn.indexOf('if (ceiling === null && isProductionEnvironment())');
    const createIndex = fn.indexOf("tx.accountProviderSpendHold.create(");
    expect(ceilingCheckIndex).toBeGreaterThan(0);
    expect(createIndex).toBeGreaterThan(ceilingCheckIndex);
  });

  it("the ceiling never comes from the model, customer text, an accepted plan or a provider response — only from configuration", () => {
    const resolver = source.slice(
      source.indexOf("export function resolveAccountSpendCeilingMicros"),
      source.indexOf("export function resolveAccountSpendCeilingMicros") + 800
    );
    expect(resolver).toContain("env[CEILING_ENV_VAR]");
    expect(resolver).not.toMatch(/task\.|plan\.|classification\.|response\./);
  });

  it("the atomic guarantee is pg_advisory_xact_lock keyed on (provider, period) inside one transaction — never read-then-write in application code", () => {
    const fn = source.slice(
      source.indexOf("export async function reserveAccountProviderSpend"),
      source.indexOf("export async function settleAccountSpendHold")
    );
    expect(fn).toContain("prisma.$transaction(async (tx) => {");
    expect(fn).toContain("pg_advisory_xact_lock(hashtext(");
    // The lock must be acquired before any read of committed spend.
    const lockIndex = fn.indexOf("pg_advisory_xact_lock");
    const readIndex = fn.indexOf("accountProviderSpendHold.aggregate(");
    expect(lockIndex).toBeGreaterThan(0);
    expect(readIndex).toBeGreaterThan(lockIndex);
  });
});

/**
 * R5.2 — THE NEWLY COVERED SURFACES.
 *
 * Same source-of-truth discipline as the workflow/Phase-1A pins above: the
 * reservation must be textually before the dispatch, and a refusal must return
 * without ever reaching it.
 */
describe("R5.2 — every newly covered provider call reserves before it dispatches", () => {
  const SITES = [
    {
      name: "client intake",
      file: "src/server/actions/intake.ts",
      reserve: "await reserveAccountProviderSpend(",
      dispatch: "await runIntake(",
      settle: "settleAccountSpendHoldDirect(",
    },
    {
      name: "worker assistant",
      file: "src/server/actions/va-assistant.ts",
      reserve: "await reserveAccountProviderSpend(",
      dispatch: "await askAssistant(",
      settle: "settleAccountSpendHoldDirect(",
    },
    {
      name: "admin closed-job analysis",
      file: "src/server/actions/admin-closed-jobs.ts",
      reserve: "await reserveAccountProviderSpend(",
      dispatch: "await analyzeClosedJobs(",
      settle: "settleAccountSpendHoldDirect(",
    },
  ];

  for (const site of SITES) {
    it(`${site.name}: reserve -> dispatch -> settle, in that order`, () => {
      const source = read(site.file);
      const r = source.indexOf(site.reserve);
      const d = source.indexOf(site.dispatch);
      const s = source.indexOf(site.settle);
      expect(r, "reserves account-level capacity").toBeGreaterThan(0);
      expect(d, "dispatches").toBeGreaterThan(0);
      expect(d, "dispatch happens strictly AFTER the reservation").toBeGreaterThan(r);
      expect(s, "settles").toBeGreaterThan(0);
      expect(s, "settlement happens after the dispatch").toBeGreaterThan(d);
    });

    it(`${site.name}: a refusal returns without ever reaching the provider`, () => {
      const source = read(site.file);
      const start = source.indexOf("if (!accountHold.ok)");
      expect(start, "has an explicit refusal branch").toBeGreaterThan(0);
      // The refusal branch ends at its closing brace before the dispatch.
      const branch = source.slice(start, source.indexOf(site.dispatch));
      expect(branch).toContain("return");
      expect(branch, "the refusal branch must not dispatch").not.toContain(site.dispatch);
    });
  }

  it("Voyage embeddings reserve BEFORE the POST, and the whole run stops on refusal", () => {
    const index = read("src/lib/ai-work-engine/index.ts");
    const reserveIdx = index.indexOf("provider: VOYAGE_PROVIDER");
    const embedIdx = index.indexOf("embedWithUsage(");
    expect(reserveIdx, "reserves under provider=voyage").toBeGreaterThan(0);
    expect(embedIdx, "calls the embedding provider").toBeGreaterThan(0);
    expect(embedIdx, "the Voyage POST happens strictly after its reservation").toBeGreaterThan(reserveIdx);

    // And it must also precede the FIRST Anthropic reservation, since the
    // embedding is the earliest billable call of the whole pipeline.
    const firstAnthropicReserve = index.indexOf("classifyAccountHold = await reserveAccountProviderSpend(");
    expect(embedIdx).toBeLessThan(firstAnthropicReserve);
    expect(reserveIdx).toBeLessThan(firstAnthropicReserve);
  });

  it("no client- or worker-facing refusal message leaks a ceiling, an amount, or the provider's name", () => {
    for (const file of [
      "src/server/actions/intake.ts",
      "src/server/actions/va-assistant.ts",
      "src/server/actions/admin-closed-jobs.ts",
    ]) {
      const source = read(file);
      // Collect the user-facing strings returned on the refusal path.
      const messages = source.match(/error:\s*"[^"]*"/g) ?? [];
      for (const msg of messages) {
        expect(msg, `${file}: a user-facing message must not name a ceiling`).not.toMatch(
          /ceiling|budget|micros|\$\d|anthropic|voyage|quota/i
        );
      }
    }
  });

  it("the Voyage rate is never hardcoded: it comes from configuration or the call does not happen", () => {
    const embeddings = read("src/lib/embeddings.ts");
    expect(embeddings).toContain("VOYAGE_EMBEDDING_MICROS_PER_MILLION_TOKENS");
    // The historical honesty statement must survive: no invented rate.
    expect(embeddings).toContain("No verified Voyage rate exists in this repo");
    // And the dead, unmetered convenience wrapper is gone.
    expect(embeddings).not.toMatch(/export async function embed\(/);
  });
});

/**
 * R5.2 — SETTLEMENT MUST NOT UNDER-COUNT CACHE WRITES.
 *
 * Found by the completeness critic, after the first R5.2 pass had already been
 * reported as clean: all three newly covered paths set
 * `cache_control: { type: "ephemeral" }` on their system prompt but hardcoded
 * `cacheWriteTokens: 0` in their cost function and never read
 * `cache_creation_input_tokens`. A cache WRITE bills at 1.25x the input rate,
 * so every first-turn call settled its hold BELOW what was actually charged and
 * handed the difference back to the day's ceiling — understatement, the one
 * direction this ledger may never take.
 */
describe("R5.2 — a module that writes the prompt cache must settle the cache write", () => {
  const CACHING_METERED_MODULES = [
    "src/lib/ai.ts",
    "src/lib/assistant-ai.ts",
    "src/lib/closed-job-analysis.ts",
  ];

  for (const rel of CACHING_METERED_MODULES) {
    it(`${rel} reads cache_creation_input_tokens and never hardcodes cacheWriteTokens to 0`, () => {
      const source = read(rel);
      // Only meaningful for modules that actually write the cache.
      expect(source, `${rel} is expected to use an ephemeral cache`).toContain("cache_control");
      expect(
        source,
        `${rel} must read the cache-write token count from the response`
      ).toContain("cache_creation_input_tokens");
      expect(
        source,
        `${rel} must not settle with a hardcoded zero cache-write cost`
      ).not.toMatch(/cacheWriteTokens:\s*0\s*,\s*\n\s*\}\);/);
    });
  }

  it("the live canary harness cannot SDK-retry either — it is the one client that spends real money", () => {
    const harness = read("test/support/provider-replay.ts");
    const constructions = harness
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .match(/new RealAnthropic\(\{[^}]*\}\)/g) ?? [];
    expect(constructions.length, "the live client construction is parseable").toBeGreaterThan(0);
    for (const c of constructions) {
      expect(c, "the live harness client must set maxRetries: 0").toContain("maxRetries: 0");
    }
  });
});
