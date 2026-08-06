import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The money queue's recovery guarantee, pinned at the source level because
 * vitest has no database and the behaviour is a WHERE clause, not a function.
 *
 * The defect this protects against was real and silent: processMoneyIntents
 * selected only `queued` and `failed` rows, so an intent a crashed runner had
 * already moved to `processing` was invisible to every later run. A Stripe
 * capture or a client refund could sit stranded forever with nothing raised
 * to the operator.
 */

const source = readFileSync(join(__dirname, "..", "src/server/money-intents.ts"), "utf8");
const migration = readFileSync(
  join(__dirname, "..", "prisma/migrations/20260806160000_money_intent_lease/migration.sql"),
  "utf8"
);

describe("money intents recover from a crashed runner", () => {
  it("selects processing rows whose lease has expired, not just queued and failed", () => {
    expect(source).toContain('status: "processing", leaseExpiresAt: { lt: now }');
  });

  it("re-asserts the same predicate in the claim, so two runners cannot both win", () => {
    // The claim must repeat the recovery condition; claiming on id alone
    // would let two runners each take the same expired lease.
    const claimBlock = source.slice(source.indexOf("const claimed ="), source.indexOf("if (claimed.count === 0)"));
    expect(claimBlock).toContain('status: { in: ["queued", "failed"] }');
    expect(claimBlock).toContain('status: "processing"');
    expect(claimBlock).toContain("leaseExpiresAt: { lt: new Date() }");
    expect(claimBlock).toContain("attempts: { increment: 1 }");
  });

  it("stamps a lease when claiming and releases it on failure", () => {
    expect(source).toContain("leaseExpiresAt: new Date(Date.now() + LEASE_MS)");
    expect(source).toContain("leaseExpiresAt: null");
  });

  it("still caps attempts, so recovery cannot become an infinite retry loop", () => {
    expect(source).toContain("attempts: { lt: MAX_ATTEMPTS }");
    expect(source).toMatch(/const MAX_ATTEMPTS = \d+/);
  });

  it("reports recovered rows separately from completed ones", () => {
    // An operator reading the cron response must be able to tell a normal
    // drain from one that had to reclaim stranded work.
    expect(source).toContain("recovered");
    expect(source).toContain("return { completed, failed, manual, recovered };");
  });

  it("keeps passing the provider idempotency key on every Stripe call", () => {
    // Replaying after a lease expiry is only safe because Stripe deduplicates
    // on this key. If a call ever loses it, recovery becomes double-charging.
    const calls = source.match(/idempotencyKey: intent\.idempotencyKey/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the lease migration is additive", () => {
  it("adds two nullable columns and an index, and drops nothing", () => {
    expect(migration).toContain('ALTER TABLE "MoneyIntent" ADD COLUMN "leaseExpiresAt"');
    expect(migration).toContain('ALTER TABLE "MoneyIntent" ADD COLUMN "lockedAt"');
    expect(migration).toContain('CREATE INDEX "MoneyIntent_leaseExpiresAt_idx"');
    expect(migration).not.toMatch(/DROP TABLE|DROP INDEX|DROP COLUMN|RENAME TO|NOT NULL/);
  });
});
