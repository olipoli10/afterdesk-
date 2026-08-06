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
