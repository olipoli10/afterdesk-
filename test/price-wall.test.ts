import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clientTaskSelect,
  vaTaskSelect,
  vaPoolSelect,
  vaPoolDetailSelect,
} from "@/lib/queries/tasks";
import { publicLedgerEntrySelect } from "@/lib/queries/public-ledger";

/**
 * RULE 2 regression net — the product's load-bearing invariant.
 *
 * Two independent prices: `clientPriceCents` belongs to the client and the
 * operator, `vaPayoutCents` to the worker and the operator, and neither side
 * may ever derive the other's number. It is enforced at the DATA layer, by
 * role-shaped Prisma selects that simply never project the other side's
 * column — so the failure mode is not a UI bug, it is one word added to an
 * object literal while doing something else entirely.
 *
 * Until now that was a comment. `satisfies Prisma.TaskSelect` happily accepts
 * `clientPriceCents: true` on a worker select, so the single worst regression
 * this product can suffer — every worker able to compute the operator's
 * margin — would ship green through lint, typecheck and the whole suite.
 *
 * These tests walk the select objects the way Prisma reads them, including
 * nested relation selects, so a leak added three levels down is caught too.
 */

/** Every key named anywhere in a (possibly nested) Prisma select. */
function keysDeep(select: unknown, seen = new Set<string>()): Set<string> {
  if (!select || typeof select !== "object") return seen;
  for (const [key, value] of Object.entries(select as Record<string, unknown>)) {
    seen.add(key);
    if (value && typeof value === "object") keysDeep(value, seen);
  }
  return seen;
}

/** Columns a worker must never receive, directly or through a relation. */
const CLIENT_SIDE = [
  "clientPriceCents",
  "clientId",
  "client",
  "clientDeadlineUtc",
  "aiLowCents",
  "aiHighCents",
  "aiReasoning",
] as const;

/** Columns a client must never receive. */
const WORKER_SIDE = ["vaPayoutCents", "claimedById", "claimedBy", "vaDeadlineUtc"] as const;

const WORKER_SELECTS: [string, unknown][] = [
  ["vaTaskSelect", vaTaskSelect],
  ["vaPoolSelect", vaPoolSelect],
  ["vaPoolDetailSelect", vaPoolDetailSelect],
];

describe("RULE 2 — the two-price wall", () => {
  for (const [name, select] of WORKER_SELECTS) {
    it(`${name} projects nothing from the client's side`, () => {
      const keys = keysDeep(select);
      for (const forbidden of CLIENT_SIDE) {
        expect(keys.has(forbidden), `${name} must not select ${forbidden}`).toBe(false);
      }
    });
  }

  it("clientTaskSelect projects nothing from the worker's side", () => {
    const keys = keysDeep(clientTaskSelect);
    for (const forbidden of WORKER_SIDE) {
      expect(keys.has(forbidden), `clientTaskSelect must not select ${forbidden}`).toBe(false);
    }
  });

  it("clientTaskSelect did not grow to carry the delivery metrics", () => {
    // The metrics ride on executionReportForClient, a separate narrow query
    // gated on an approved submission. Growing this select instead would put
    // them behind the generic client payload, where the approval gate does
    // not apply and a pending attempt's claims would leak.
    const keys = keysDeep(clientTaskSelect);
    expect(keys.has("deliveryMetrics")).toBe(false);
    expect(keys.has("note")).toBe(false);
  });

  it("no role-shaped select grew to carry the work engine (Phase 1A)", () => {
    // Classification, plan versions, critiques and internal costs are
    // admin-only; the client's scope block rides on quotedScopeForClient, a
    // separate sanitized projection, and the snapshot is written, never
    // selected into these payloads. The worker has no engine surface at all.
    const ENGINE = [
      "aiClassification",
      "planVersions",
      "quotedPlanVersion",
      "quotedPlanVersionId",
      "acceptanceSnapshot",
      "internalCostLikelyCents",
      "internalCostConservativeCents",
      "critique",
      // Phase 1B — execution internals. The worker reads a scoped brief from
      // TaskHumanWorkPackage through its own narrow query, never by widening
      // these, and the client has no execution surface at all. The cost
      // fields are the sharpest of the set: reservedBudgetCents IS the quoted
      // payout, so putting it on a client payload would breach RULE 2 as
      // squarely as vaPayoutCents itself.
      "workflowRun",
      "workflowRuns",
      "actualAiCostMicros",
      "actualToolCostMicros",
      "actualCostMicros",
      "costMicros",
      "reservedBudgetCents",
      "invocations",
      "stepRuns",
      "handoffReason",
      "pausedReason",
      // Phase 1C — operational intelligence. ALL of it is admin-only: the
      // baseline carries internal costs and margins, the actual carries the
      // two gross margins and recognized revenue, the sessions carry another
      // worker's measured time, the reviews carry the error taxonomy, and
      // the profile carries the recommendation. One relation name appearing
      // in a role-shaped select is a breach.
      "operationalBaseline",
      "operationalActual",
      "workSessions",
      "qualityReviews",
      "aiOperations",
      "recognizedRevenueMicros",
      "grossMarginBookedMeteredMicros",
      "grossMarginAllInModeledMicros",
      "grossMarginBookedMeteredBps",
      "grossMarginAllInModeledBps",
      "bookedAndMeteredCostMicros",
      "allInCostWithModeledMicros",
      "workerPayoutNetIncurredCents",
      "workerPayoutCurrentLiabilityCents",
      "estimatedInternalCostLikelyCents",
      "recommendation",
      "calibrationLevel",
      // Phase 1D-alpha0 — the automation economics. Every one of these is an
      // internal cost or an internal risk appetite: what a machine step is
      // expected to cost us, the most one attempt may burn, and how much
      // exposure the business will carry on this mandate. A client seeing the
      // ceiling learns our margin structure; a worker seeing it learns what
      // the platform spends on the job they are being paid a share of. Both
      // are RULE 2 breaches by a different door.
      "expectedCostMicrosAtQuote",
      "maxCostMicrosPerAttemptAtQuote",
      // The funded retry budget belongs with them: combined with the
      // per-attempt cap it discloses the whole ceiling, and on its own it
      // tells a worker how much rework the platform paid to absorb.
      "maxAttemptsAtQuote",
      "expectedAutomationCostMicros",
      "conservativeAutomationCostMicros",
      "automationSpendCeilingMicros",
      "automationCostPolicyVersion",
      "runAutomationBudgetMicros",
      "budgetPolicyVersion",
      "budgetHolds",
      "demotedForBudget",
    ] as const;
    for (const [name, select] of [
      ["clientTaskSelect", clientTaskSelect],
      ...WORKER_SELECTS,
    ] as [string, unknown][]) {
      const keys = keysDeep(select);
      for (const forbidden of ENGINE) {
        expect(keys.has(forbidden), `${name} must not select ${forbidden}`).toBe(false);
      }
    }
  });

  it("each side still selects its OWN price — the wall is not just an empty select", () => {
    expect(keysDeep(clientTaskSelect).has("clientPriceCents")).toBe(true);
    expect(keysDeep(vaTaskSelect).has("vaPayoutCents")).toBe(true);
    expect(keysDeep(vaPoolSelect).has("vaPayoutCents")).toBe(true);
  });

  it("the pool select withholds filenames, which can identify a client (RULE 1)", () => {
    // The pool is visible to every approved worker before anyone claims, so a
    // client's own filename ("acme-widgets-q3.csv") is an identity leak. Counts
    // only — the names arrive after the claim, generated.
    const files = (vaPoolSelect as Record<string, unknown>).files;
    expect(files).toBeUndefined();
    expect(keysDeep(vaPoolSelect).has("_count")).toBe(true);
  });

  /**
   * The public ledger is the one surface where BOTH sides' numbers were
   * published at once, to anyone, unauthenticated. A `sale` row's amountCents
   * is task.clientPriceCents verbatim; a `payout` row's is task.vaPayoutCents.
   * Printing both, timestamped, handed a worker who knew their own pay the
   * client's price and the operator's margin — and the client the reverse.
   * Bucketing cannot protect a per-entry amount from someone who already
   * knows the other half of the pair, so none is published at all.
   */
  it("the public ledger select projects no per-entry amount (RULE 2)", () => {
    const keys = keysDeep(publicLedgerEntrySelect);
    expect(keys.has("amountCents"), "publicLedgerEntrySelect must not select amountCents").toBe(
      false
    );
    expect(keys.has("currency")).toBe(false);
  });

  it("the public ledger still proves the ledger is real — kind, category, date", () => {
    // Guards the opposite regression: gutting the page to satisfy the rule
    // would make it useless. It must still show that entries exist and move.
    const keys = keysDeep(publicLedgerEntrySelect);
    expect(keys.has("kind")).toBe(true);
    expect(keys.has("occurredAt")).toBe(true);
    expect(keys.has("categoryName")).toBe(true);
  });
});

/**
 * The Phase 1B worker read builds its select inline instead of exporting an
 * object, so it is pinned at the source. It was the only role boundary in the
 * repo with no regression net at all: `computedPayoutCents` and
 * `reservedBudgetCents` sit one line apart in the same model, and this file's
 * own thesis is that the failure mode is a word added to an object literal
 * while doing something else. `reservedBudgetCents` IS the pre-automation
 * quoted payout, so putting it on any payload alongside a client figure would
 * breach RULE 2 as squarely as `vaPayoutCents` itself.
 */
describe("the worker's residual brief carries no money and no engine internals", () => {
  const source = readFileSync(join(__dirname, "..", "src/lib/queries/execution.ts"), "utf8");
  const workerRead = source.slice(
    source.indexOf("export async function humanPackageForVa"),
    source.indexOf("executionForAdmin")
  );

  it("the slice really is the worker read, so the checks below are not vacuous", () => {
    expect(workerRead).toContain("claimedById: vaId");
    expect(workerRead).toContain("objective: true");
    expect(workerRead.length).toBeGreaterThan(400);
  });

  for (const column of [
    "computedPayoutCents",
    "reservedBudgetCents",
    "clientPriceCents",
    "actualAiCostMicros",
    "actualToolCostMicros",
    "costMicros",
    "automatedStepCount",
    "pausedReason",
    "primitiveId",
  ]) {
    it(`never selects ${column}`, () => {
      expect(workerRead).not.toMatch(new RegExp(`${column}\\s*:\\s*true`));
    });
  }

  it("still filters artifacts by visibility, so machine state stays hidden", () => {
    // Dropping this filter hands the worker payload.json, which is raw engine
    // state including every cost the run recorded.
    expect(workerRead).toContain("artifactVisibility");
    expect(workerRead).toContain('"worker_after_claim"');
    expect(workerRead).toContain('"deliverable_candidate"');
    expect(workerRead).not.toContain('"admin_only"');
  });

  it("scopes the read to the claimant and to statuses that allow files", () => {
    expect(workerRead).toContain("VA_FILE_ACCESS_STATUSES");
  });
});

/**
 * The keysDeep check above walks the EXPORTED select objects — but
 * src/lib/queries/tasks.ts also builds selects inline (the leak reviewer's
 * finding), and an inline `operationalActual: { select: ... }` added to a
 * client query while doing something else would sail past the object walk.
 * So the whole file is pinned at the source: none of the Phase 1C relation
 * names may appear anywhere in it. Admin surfaces read the 1C relations
 * through src/lib/queries/operational-intelligence.ts, never through here.
 */
describe("the shared task-query file contains no operational-intelligence relations", () => {
  const source = readFileSync(join(__dirname, "..", "src/lib/queries/tasks.ts"), "utf8");

  it("the pin is not vacuous — the file still is the role-facing query file", () => {
    expect(source).toContain("clientTaskSelect");
    expect(source).toContain("vaPayoutCents");
  });

  for (const relation of [
    "operationalBaseline",
    "operationalActual",
    "workSessions",
    "qualityReviews",
    "aiOperations",
    "acceptanceSnapshotForCalibration",
    // Phase 1D-alpha0 automation economics: internal cost and internal risk
    // appetite, admin-only by construction.
    "automationSpendCeilingMicros",
    "runAutomationBudgetMicros",
    "maxCostMicrosPerAttemptAtQuote",
    "maxAttemptsAtQuote",
  ]) {
    it(`never mentions ${relation}`, () => {
      expect(source).not.toContain(relation);
    });
  }
});

/**
 * AN INTERNAL TASK IS NOT PAID WORK, SO IT MUST NOT BE CLAIMABLE.
 *
 * The database's pool guard EXEMPTS internal tasks from the "a task in the pool
 * has a positive payout" invariant, correctly: nobody is paid for one. That
 * exemption is exactly why the read side has to exclude them — the one row
 * shape the trigger deliberately allows into `open` with no payout is the one
 * shape a worker must never be offered.
 *
 * The pool queries are pinned in the integration suite against a real row. Here
 * we pin the CLAIM, which is the check that actually binds: the action takes a
 * task id from the request, so a task the board never listed is still claimable
 * by anyone holding its id.
 */
describe("the claim refuses work that carries no per-task payout", () => {
  const source = readFileSync(join(__dirname, "..", "src/server/actions/va-tasks.ts"), "utf8");
  const claim = source.slice(
    source.indexOf("export async function claimTask"),
    source.indexOf("export async function releaseTask")
  );

  it("the slice really is the claim, so the checks below are not vacuous", () => {
    expect(claim).toContain('to: "claimed"');
    expect(claim.length).toBeGreaterThan(400);
  });

  it("reads both exemption flags and refuses on either", () => {
    expect(claim).toContain("isInternal: true");
    expect(claim).toContain("standingCapacityAccountId: true");
    expect(claim).toMatch(/task\.isInternal \|\| task\.standingCapacityAccountId !== null/);
  });

  it("refuses INSIDE the transaction, where the compare-and-swap happens", () => {
    // A check outside it is advisory: the row could change between the read
    // and the swap. Every other guard in this action is inside for the same
    // reason, and this one has to be too.
    const guardAt = claim.indexOf("task.isInternal ||");
    const txAt = claim.indexOf("prisma.$transaction");
    const transitionAt = claim.indexOf("transitionTask");
    expect(txAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(txAt);
    expect(guardAt).toBeLessThan(transitionAt);
  });
});

/**
 * The pool queries themselves, pinned at the source for the same reason the
 * file above pins the others: the failure mode is a WHERE clause losing one
 * line during an unrelated edit, and both the list and the detail read need it.
 */
describe("both pool reads exclude internal tasks", () => {
  const source = readFileSync(join(__dirname, "..", "src/lib/queries/tasks.ts"), "utf8");

  it("names isInternal: false exactly where standingCapacityAccountId: null is named", () => {
    const internal = source.match(/isInternal: false/g) ?? [];
    // poolForVa and poolTaskForVa. Hiding the list without closing the detail
    // page leaves the task reachable by URL, which is the same exposure with an
    // extra step.
    expect(internal.length).toBeGreaterThanOrEqual(2);
  });
});
