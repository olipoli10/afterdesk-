import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { poolForVa, poolTaskForVa } from "@/lib/queries/tasks";
import { createClient, createTask } from "./fixtures";

/**
 * A COMMERCIAL TASK IN THE POOL HAS A KNOWN, POSITIVE PAYOUT.
 *
 * The application already refuses to publish one that does not
 * (handoverBlockedForUnknownPayout in workflow-runs.ts), but that was a
 * convention: the columns are nullable and nothing in the database said no.
 * These tests drive the trigger directly, which is the only way to prove the
 * invariant holds against a write the application layer never saw.
 *
 * The trigger protects the STATE, not just the transition: a task already in
 * the pool must not be able to become invalid afterwards, including by having
 * its exemption flags flipped.
 */

async function setOpenWith(input: {
  vaPayoutCents: number | null;
  estimatedMinutes: number | null;
  isInternal?: boolean;
}) {
  const client = await createClient();
  const task = await createTask({
    clientId: client.id,
    status: "submitted",
    estimatedMinutes: input.estimatedMinutes,
  });
  await prisma.task.update({
    where: { id: task.id },
    data: {
      vaPayoutCents: input.vaPayoutCents,
      estimatedMinutes: input.estimatedMinutes,
      isInternal: input.isInternal ?? false,
    },
  });
  return prisma.task.update({ where: { id: task.id }, data: { status: "open" } });
}

describe("entering the pool", () => {
  it("REFUSES null payout and null minutes", async () => {
    await expect(setOpenWith({ vaPayoutCents: null, estimatedMinutes: null })).rejects.toThrow(
      /positive payout/
    );
  });

  it("REFUSES zero payout and zero minutes", async () => {
    // Zero is a different failure from null and must be refused too: a task
    // worth nothing is not a task a worker can be asked to claim.
    await expect(setOpenWith({ vaPayoutCents: 0, estimatedMinutes: 0 })).rejects.toThrow(
      /positive payout/
    );
  });

  it("REFUSES a positive payout with null minutes", async () => {
    await expect(setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: null })).rejects.toThrow(
      /positive effort estimate/
    );
  });

  it("REFUSES a null payout with positive minutes", async () => {
    await expect(setOpenWith({ vaPayoutCents: null, estimatedMinutes: 60 })).rejects.toThrow(
      /positive payout/
    );
  });

  it("allows the ordinary commercial task", async () => {
    const task = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });
    expect(task.status).toBe("open");
  });
});

describe("the exemptions are real circuits, not decoration", () => {
  it("an internal practice task needs no payout: it is never paid", async () => {
    const task = await setOpenWith({
      vaPayoutCents: null,
      estimatedMinutes: null,
      isInternal: true,
    });
    expect(task.status).toBe("open");
  });

  it("a Standing Capacity task needs no per-task payout: its block covers it", async () => {
    const client = await createClient();
    const account = await prisma.standingCapacityAccount.create({
      data: {
        clientId: client.id,
        status: "active",
        tierHours: 5,
        weeklyClientPriceCents: 12_500,
        weeklyVaPayoutCents: 7_500,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
      select: { id: true },
    });
    const task = await createTask({
      clientId: client.id,
      status: "submitted",
      estimatedMinutes: null,
    });
    await prisma.task.update({
      where: { id: task.id },
      data: { standingCapacityAccountId: account.id, vaPayoutCents: null, estimatedMinutes: null },
    });
    const opened = await prisma.task.update({
      where: { id: task.id },
      data: { status: "open" },
    });
    expect(opened.status).toBe("open");
  });
});

describe("a task already in the pool cannot become invalid afterwards", () => {
  it("REFUSES to null out the payout of an open commercial task", async () => {
    const task = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { vaPayoutCents: null } })
    ).rejects.toThrow(/positive payout/);
  });

  it("REFUSES to zero the minutes of an open commercial task", async () => {
    const task = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { estimatedMinutes: 0 } })
    ).rejects.toThrow(/positive effort estimate/);
  });

  it("REFUSES to drop the exemption while leaving the payout absent", async () => {
    /**
     * The subtle bypass: publish as internal (exempt, no payout needed), then
     * flip isInternal off, leaving a commercial mandate in the pool worth
     * nothing.
     *
     * It turns out an OLDER guard closes this first — `isInternal is frozen
     * after pricing` — which is why either message satisfies this test. That
     * is worth recording rather than papering over: the new guard is the
     * backstop here, not the only thing in the way, and if the older freeze is
     * ever relaxed this test still holds the line.
     */
    const task = await setOpenWith({
      vaPayoutCents: null,
      estimatedMinutes: null,
      isInternal: true,
    });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { isInternal: false } })
    ).rejects.toThrow(/positive payout|frozen after pricing/);
  });

  it("leaves an unrelated update on an open task alone", async () => {
    // The guard must not turn every later write into a failure point.
    const task = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });
    await expect(
      prisma.task.update({ where: { id: task.id }, data: { title: "renamed" } })
    ).resolves.toBeTruthy();
  });
});

/**
 * THE ONE ROW SHAPE THE PAYOUT GUARD LETS THROUGH IS THE ONE THE BOARD MUST
 * NOT SHOW.
 *
 * An internal task is exempt from the payout invariant above precisely because
 * nobody is paid for it. So the exemption that makes the trigger correct also
 * makes an internal task in the pool the worst possible listing: a worker who
 * claimed it would do the work for nothing. The database says the row is legal;
 * the pool query has to say it is not theirs to see.
 *
 * Written directly to the table, bypassing every server action, which is the
 * whole point: this proves the READ refuses it, not that some writer avoided
 * creating it.
 */
describe("an internal task never reaches the worker pool", () => {
  /** Fully eligible, so nothing but isInternal can explain an absence. */
  const eligible = {
    score: 5,
    ratedCount: 100,
    highValueThreshold: 4,
    minRatedDeliveries: 3,
  };

  it("is invisible on the board even though the database accepted it", async () => {
    const internal = await setOpenWith({
      vaPayoutCents: null,
      estimatedMinutes: null,
      isInternal: true,
    });
    // Not vacuous: an ordinary commercial task written the same way IS listed,
    // so an empty result would not pass this test by accident.
    const commercial = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });

    const pool = await poolForVa(eligible);
    const ids = pool.map((t) => t.id);
    expect(ids).toContain(commercial.id);
    expect(ids).not.toContain(internal.id);
  });

  it("is unreachable by its own id, not merely hidden from the list", async () => {
    // Filtering only the list would leave the detail page open to anyone who
    // guessed or kept the URL, which is the same task with an extra step.
    const internal = await setOpenWith({
      vaPayoutCents: null,
      estimatedMinutes: null,
      isInternal: true,
    });
    const commercial = await setOpenWith({ vaPayoutCents: 2_000, estimatedMinutes: 60 });

    expect(await poolTaskForVa(internal.id, eligible)).toBeNull();
    expect(await poolTaskForVa(commercial.id, eligible)).not.toBeNull();
  });
});
