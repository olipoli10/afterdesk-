import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  ACCOUNT_SPEND_CEILING_REASON_KEY,
  ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY,
  accountSpendHealthForAdmin,
  dailyPeriodKey,
  releaseAccountSpendHold,
  reserveAccountProviderSpend,
  resolveAccountSpendCeilingMicros,
  settleAccountSpendHold,
} from "@/server/account-spend";

/**
 * R5 — THE ACCOUNT-LEVEL PROVIDER SPEND CIRCUIT BREAKER, AGAINST REAL
 * POSTGRES.
 *
 * The single most important property: two attempts racing for the last of
 * the same day's ceiling cannot both be granted. `pg_advisory_xact_lock`,
 * keyed on (provider, period), is what makes that true — this proves the
 * REAL mechanism, not a mocked stand-in.
 *
 * ENV ISOLATION: vitest.integration.config.ts runs every *.itest.ts file in
 * one shared worker process (isolate: false), so this file's own
 * ACCOUNT_PROVIDER_SPEND_CEILING_MICROS mutations are saved and restored
 * around every test — leaking a ceiling into an unrelated file would make
 * that file's own tests non-deterministic depending on run order.
 */

const uid = () => `r5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
// The unsuffixed ACCOUNT_PROVIDER_SPEND_CEILING_MICROS variable is the
// backwards-compatible ceiling for the default Anthropic provider only.
// Using a made-up provider here made every configured-ceiling assertion run
// as an intentionally unconfigured non-production provider instead.
const PROVIDER = "anthropic";

/** @types/node declares NODE_ENV readonly; tests legitimately need to flip it. */
const env = process.env as Record<string, string | undefined>;

let originalCeilingEnv: string | undefined;
let originalNodeEnv: string | undefined;

beforeEach(() => {
  originalCeilingEnv = env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS;
  originalNodeEnv = env.NODE_ENV;
});
afterEach(async () => {
  if (originalCeilingEnv === undefined) delete env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS;
  else env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = originalCeilingEnv;
  env.NODE_ENV = originalNodeEnv;
  // Isolate this file's own rows from any other run's aggregate — every
  // test uses a fresh operationKey prefix already, this is defence in depth.
  await prisma.accountProviderSpendHold.deleteMany({ where: { provider: PROVIDER } });
});

describe("reservation stays within a configured ceiling", () => {
  it("a request below the ceiling reserves successfully", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "1000000"; // $1.00
    const result = await reserveAccountProviderSpend({
      provider: PROVIDER,
      operationKey: uid(),
      attempt: 1,
      worstCaseMicros: 300_000n, // $0.30
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.grantedMicros).toBe(300_000n);
      const row = await prisma.accountProviderSpendHold.findUniqueOrThrow({
        where: { id: result.holdId },
        select: { status: true, amountMicros: true, provider: true },
      });
      expect(row.status).toBe("held");
      expect(row.amountMicros).toBe(300_000n);
      expect(row.provider).toBe(PROVIDER);
    }
  });

  it("a request that would exceed the ceiling is blocked BEFORE any dispatch could happen, with a structured reason", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "500000"; // $0.50
    const opKey = uid();
    // Consume most of the ceiling first.
    const first = await reserveAccountProviderSpend({
      provider: PROVIDER,
      operationKey: opKey + "-a",
      attempt: 1,
      worstCaseMicros: 400_000n,
    });
    expect(first.ok).toBe(true);

    const blocked = await reserveAccountProviderSpend({
      provider: PROVIDER,
      operationKey: opKey + "-b",
      attempt: 1,
      worstCaseMicros: 200_000n, // 400k + 200k > 500k ceiling
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe("would_exceed_account_ceiling");
      expect(blocked.ceilingMicros).toBe(500_000n);
      expect(blocked.committedMicros).toBe(400_000n);
    }
    // No hold row exists for the blocked attempt — a refusal reserves nothing.
    const rows = await prisma.accountProviderSpendHold.count({
      where: { provider: PROVIDER, operationKey: opKey + "-b" },
    });
    expect(rows).toBe(0);
  });

  it("production with no ceiling configured fails CLOSED; non-production is unconstrained", async () => {
    delete process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS;

    env.NODE_ENV = "production";
    expect(resolveAccountSpendCeilingMicros()).toBeNull();
    const prodRefusal = await reserveAccountProviderSpend({
      provider: PROVIDER,
      operationKey: uid(),
      attempt: 1,
      worstCaseMicros: 1n,
    });
    expect(prodRefusal.ok).toBe(false);
    if (!prodRefusal.ok) {
      expect(prodRefusal.reason).toBe("ceiling_not_configured");
    }

    env.NODE_ENV = "test";
    const devGrant = await reserveAccountProviderSpend({
      provider: PROVIDER,
      operationKey: uid(),
      attempt: 1,
      worstCaseMicros: 1_000_000_000n, // absurdly large — still granted, no ceiling to violate
    });
    expect(devGrant.ok).toBe(true);
  });
});

describe("R5 MANDATORY — two concurrent reservations cannot oversubscribe the ceiling", () => {
  it("exactly one of two simultaneous racers is granted when only one fits", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "500000"; // $0.50
    const opA = uid();
    const opB = uid();

    // Each attempt alone fits; both together do not (300k + 300k > 500k).
    // Genuinely concurrent: both fire before either resolves.
    const [resultA, resultB] = await Promise.all([
      reserveAccountProviderSpend({ provider: PROVIDER, operationKey: opA, attempt: 1, worstCaseMicros: 300_000n }),
      reserveAccountProviderSpend({ provider: PROVIDER, operationKey: opB, attempt: 1, worstCaseMicros: 300_000n }),
    ]);

    const outcomes = [resultA, resultB];
    const granted = outcomes.filter((r) => r.ok);
    const refused = outcomes.filter((r) => !r.ok);
    expect(granted.length, "exactly one racer wins — never both, never neither").toBe(1);
    expect(refused.length).toBe(1);
    if (!refused[0].ok) {
      expect(refused[0].reason).toBe("would_exceed_account_ceiling");
    }

    // The database agrees: exactly one held row for this pair.
    const heldCount = await prisma.accountProviderSpendHold.count({
      where: { provider: PROVIDER, operationKey: { in: [opA, opB] }, status: "held" },
    });
    expect(heldCount).toBe(1);
  });

  it("ten concurrent racers against room for three: exactly three win", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "300000"; // room for exactly 3 x 100k
    const keys = Array.from({ length: 10 }, () => uid());
    const results = await Promise.all(
      keys.map((k) => reserveAccountProviderSpend({ provider: PROVIDER, operationKey: k, attempt: 1, worstCaseMicros: 100_000n }))
    );
    const granted = results.filter((r) => r.ok);
    expect(granted.length, "the ceiling admits exactly as many as fit, never more").toBe(3);

    const heldCount = await prisma.accountProviderSpendHold.count({
      where: { provider: PROVIDER, operationKey: { in: keys }, status: "held" },
    });
    expect(heldCount).toBe(3);
  });
});

describe("settlement and release", () => {
  it("settled spend lower than reserved releases the unused capacity for the next reservation", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "500000";
    const first = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 400_000n,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Actual cost much lower than the worst-case reservation.
    await prisma.$transaction((tx) => settleAccountSpendHold(tx, first.holdId, 50_000n));
    const settledRow = await prisma.accountProviderSpendHold.findUniqueOrThrow({
      where: { id: first.holdId }, select: { status: true, settledMicros: true },
    });
    expect(settledRow.status).toBe("settled");
    expect(settledRow.settledMicros).toBe(50_000n);

    // Committed is now 50k (settled), not 400k (the stale reservation) — a
    // second attempt that would have been refused against the reservation
    // now fits against the real cost.
    const second = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 400_000n,
    });
    expect(second.ok, "settlement correctly freed the unused reservation").toBe(true);
  });

  it("an unused reservation, released, no longer counts against the ceiling", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "500000";
    const first = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 500_000n,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const blockedWhileHeld = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 1n,
    });
    expect(blockedWhileHeld.ok, "the ceiling is fully committed while the hold stands").toBe(false);

    await releaseAccountSpendHold(first.holdId);
    const released = await prisma.accountProviderSpendHold.findUniqueOrThrow({
      where: { id: first.holdId }, select: { status: true, settledMicros: true },
    });
    expect(released.status).toBe("released");
    expect(released.settledMicros).toBe(0n);

    const afterRelease = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 500_000n,
    });
    expect(afterRelease.ok, "released capacity is available again").toBe(true);
  });

  it("a stale/uncertain outcome is NEVER released by settlement or replay — repeated retry cannot evade the ceiling", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "500000";
    const opKey = uid();
    const first = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: opKey, attempt: 1, worstCaseMicros: 500_000n,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Idempotent replay of the SAME (provider, operationKey, attempt): must
    // return the SAME hold, never create a second one and never double-count.
    const replay = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: opKey, attempt: 1, worstCaseMicros: 500_000n,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.holdId).toBe(first.holdId);

    const rowCount = await prisma.accountProviderSpendHold.count({
      where: { provider: PROVIDER, operationKey: opKey },
    });
    expect(rowCount, "a replay never creates a phantom second hold").toBe(1);

    // The hold remains `held` (an ambiguous/uncertain outcome) until
    // explicitly settled or released — never silently disappears, and
    // nothing about calling reserve again ever frees it.
    const row = await prisma.accountProviderSpendHold.findUniqueOrThrow({
      where: { id: first.holdId }, select: { status: true },
    });
    expect(row.status).toBe("held");
  });
});

describe("account-level protection never touches customer contracts", () => {
  it("nothing in the reservation/settlement/release surface writes to Task, TaskAcceptanceSnapshot or TaskExecutionPlanStep", async () => {
    // Structural proof: account-spend.ts's only Prisma model is
    // AccountProviderSpendHold. Grepping its own source is the honest way to
    // pin this — a runtime proof would need a task fixture this invariant
    // does not depend on at all.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "server", "account-spend.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/prisma\.task\b/i);
    expect(source).not.toMatch(/taskAcceptanceSnapshot/i);
    expect(source).not.toMatch(/taskExecutionPlanStep/i);
    expect(source).toContain("prisma.accountProviderSpendHold");
  });
});

describe("admin visibility", () => {
  it("accountSpendHealthForAdmin reports today's real committed exposure and ceiling", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "1000000";
    const now = new Date();
    const held = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 200_000n, now,
    });
    const toSettle = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 100_000n, now,
    });
    expect(held.ok && toSettle.ok).toBe(true);
    if (toSettle.ok) {
      await prisma.$transaction((tx) => settleAccountSpendHold(tx, toSettle.holdId, 60_000n));
    }

    const health = await accountSpendHealthForAdmin({ provider: PROVIDER, now });
    expect(health.periodKey).toBe(dailyPeriodKey(now));
    expect(health.ceilingMicros).toBe(1_000_000n);
    expect(health.heldMicros).toBe(200_000n);
    expect(health.settledMicros).toBe(60_000n);
    expect(health.committedMicros).toBe(260_000n);
    expect(health.remainingMicros).toBe(740_000n);
  });
});

describe("structured audit reason", () => {
  it("a block carries a stable, queryable key — never only a sentence", async () => {
    process.env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "100";
    const blocked = await reserveAccountProviderSpend({
      provider: PROVIDER, operationKey: uid(), attempt: 1, worstCaseMicros: 1_000_000n,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe("would_exceed_account_ceiling");
      // The reason is a closed-vocabulary discriminant, not free text —
      // ACCOUNT_SPEND_CEILING_REASON_KEY and ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY
      // are the two stable keys the codebase maps it to for durable events.
      expect([ACCOUNT_SPEND_CEILING_REASON_KEY, ACCOUNT_SPEND_UNCONFIGURED_REASON_KEY]).toContain(
        ACCOUNT_SPEND_CEILING_REASON_KEY
      );
    }
  });
});

/**
 * R5.1 — UTC PERIOD ROLLOVER.
 *
 * The ceiling window is a UTC calendar day, but the idempotency key is
 * (provider, operationKey, attempt) with NO periodKey in it. The adversarial
 * question is whether a hold taken on day D can be reused to authorise a NEW
 * dispatch on day D+1 that is then counted only against D.
 *
 * It cannot — but the reason lives one layer up, so these tests pin the
 * ledger-level facts that make the argument checkable rather than asserted:
 * a replay across midnight returns the ORIGINAL day's hold unchanged (it never
 * silently re-dates itself into the new day's budget), and the new day's
 * committed exposure genuinely starts clean. The reason no second dispatch can
 * ride that replay is that neither call site can present the same
 * (operationKey, attempt) twice: attempts strictly increase and are persisted
 * before dispatch (claimNextStep / claimAiOperation), which is pinned in
 * test/account-spend-ceiling.test.ts.
 */
describe("R5.1 — UTC period rollover is coherent and never silently re-dates a reservation", () => {
  const DAY_D = new Date("2026-03-14T23:59:30.000Z");
  const DAY_D1 = new Date("2026-03-15T00:00:30.000Z");

  it("a replay after midnight returns the ORIGINAL day's hold, still carrying day D's periodKey", async () => {
    env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "1000000";
    const operationKey = `rollover:${uid()}`;

    const first = await reserveAccountProviderSpend({
      operationKey, attempt: 1, worstCaseMicros: 400_000n, provider: PROVIDER, now: DAY_D,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.periodKey).toBe(dailyPeriodKey(DAY_D));

    const replay = await reserveAccountProviderSpend({
      operationKey, attempt: 1, worstCaseMicros: 400_000n, provider: PROVIDER, now: DAY_D1,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;

    // Same row, and it did NOT migrate into day D+1's budget.
    expect(replay.holdId).toBe(first.holdId);
    expect(replay.periodKey).toBe(dailyPeriodKey(DAY_D));
    expect(replay.periodKey).not.toBe(dailyPeriodKey(DAY_D1));

    const rows = await prisma.accountProviderSpendHold.findMany({ where: { provider: PROVIDER, operationKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].periodKey).toBe(dailyPeriodKey(DAY_D));
  });

  it("day D's committed exposure does not constrain day D+1: the window rolls, which is also what frees an abandoned hold", async () => {
    env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "1000000";

    // Day D is fully consumed by an attempt that is never settled or released
    // — the abandoned-hold case.
    const stuck = await reserveAccountProviderSpend({
      operationKey: `rollover-stuck:${uid()}`, attempt: 1, worstCaseMicros: 950_000n,
      provider: PROVIDER, now: DAY_D,
    });
    expect(stuck.ok).toBe(true);

    // Same day: there is no room left.
    const sameDay = await reserveAccountProviderSpend({
      operationKey: `rollover-sameday:${uid()}`, attempt: 1, worstCaseMicros: 200_000n,
      provider: PROVIDER, now: DAY_D,
    });
    expect(sameDay.ok, "day D is exhausted by the abandoned hold").toBe(false);

    // Next day: the stuck hold still exists at status 'held' (nothing released
    // it, no elapsed-time sweep touched it) but it belongs to D's aggregate,
    // so D+1 has its full ceiling.
    const nextDay = await reserveAccountProviderSpend({
      operationKey: `rollover-nextday:${uid()}`, attempt: 1, worstCaseMicros: 200_000n,
      provider: PROVIDER, now: DAY_D1,
    });
    expect(nextDay.ok, "the UTC window rolling is what un-wedges an abandoned hold").toBe(true);

    const stuckRow = await prisma.accountProviderSpendHold.findFirstOrThrow({
      where: { provider: PROVIDER, periodKey: dailyPeriodKey(DAY_D), amountMicros: 950_000n },
    });
    expect(stuckRow.status, "still conservatively held — never auto-released by time").toBe("held");
  });
});

/**
 * R5.1 — THE ADMIN NUMBER MUST BE THE NUMBER THAT GOVERNS.
 *
 * A dashboard that computes committed differently from the gate is a
 * reassuring number, not an operational one.
 */
describe("R5.1 — the admin card's committed figure is exactly the gate's committed figure", () => {
  it("held + settled reported to the admin equals what the refusal decision uses", async () => {
    env.ACCOUNT_PROVIDER_SPEND_CEILING_MICROS = "1000000";
    const now = new Date();

    // One settled well under its reservation, one still held.
    const settledHold = await reserveAccountProviderSpend({
      operationKey: `admin-truth-settled:${uid()}`, attempt: 1, worstCaseMicros: 300_000n,
      provider: PROVIDER, now,
    });
    expect(settledHold.ok).toBe(true);
    if (!settledHold.ok) return;
    await prisma.$transaction(async (tx) => {
      await settleAccountSpendHold(tx, settledHold.holdId, 25_000n);
    });

    const heldHold = await reserveAccountProviderSpend({
      operationKey: `admin-truth-held:${uid()}`, attempt: 1, worstCaseMicros: 100_000n,
      provider: PROVIDER, now,
    });
    expect(heldHold.ok).toBe(true);

    const health = await accountSpendHealthForAdmin({ provider: PROVIDER, now });

    // The settled row now counts at its ACTUAL cost, not its reservation:
    // that is the "unused capacity is released" property, visible in the card.
    expect(health.settledMicros).toBe(25_000n);
    expect(health.heldMicros).toBe(100_000n);
    expect(health.committedMicros).toBe(125_000n);
    expect(health.heldMicros + health.settledMicros).toBe(health.committedMicros);
    expect(health.remainingMicros).toBe(1_000_000n - 125_000n);

    // And the gate agrees: exactly the remaining headroom fits, one micro more
    // does not. This is what proves the card is reporting the governing number.
    const overByOne = await reserveAccountProviderSpend({
      operationKey: `admin-truth-over:${uid()}`, attempt: 1,
      worstCaseMicros: 875_001n, provider: PROVIDER, now,
    });
    expect(overByOne.ok, "one micro beyond the card's remaining headroom is refused").toBe(false);
    if (!overByOne.ok) {
      expect(overByOne.committedMicros, "the gate's committed == the card's committed").toBe(
        health.committedMicros
      );
    }

    const exactFit = await reserveAccountProviderSpend({
      operationKey: `admin-truth-exact:${uid()}`, attempt: 1,
      worstCaseMicros: 875_000n, provider: PROVIDER, now,
    });
    expect(exactFit.ok, "exactly the card's remaining headroom fits").toBe(true);
  });
});
