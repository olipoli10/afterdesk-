import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createTask, createWorker } from "./fixtures";

/**
 * R4 — HUMAN TIME INTEGRITY, THE TRACKED REGRESSION PROOF.
 *
 * The behavior this file exists to protect: submitDeliverable
 * (src/server/actions/va-tasks.ts) refuses a worker who never opened a timed
 * TaskWorkSession, so a claimed task can no longer complete with
 * workerActiveSeconds left null (operational-actuals.ts's MISSING_WORKER_TIME).
 *
 * R4's original execution evidence — the full pipeline through pricing,
 * acceptance, QC, and computeTaskOperationalActual — lives in
 * .scratch/r4-human-time-integrity.e2e.ts and is kept as-is; it is gitignored
 * and does not run in the tracked suite. THIS file is the durable, tracked
 * regression: same production code, same real Postgres transactions, a
 * narrower fixture (a directly-claimed task, no pricing pipeline needed for
 * this specific invariant), run through test/integration's established
 * convention (real DB via vitest.integration.config.ts, authz mocked exactly
 * as artifact-claim-isolation.itest.ts and commercial-firewall.itest.ts
 * already do it in this same directory).
 */

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, requireApprovedVa: vi.fn() };
});
// submitDeliverable revalidates paths and schedules after() work; neither
// exists outside a Next request context, and neither is what this proves.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const { requireApprovedVa } = await import("@/lib/authz");
const { submitDeliverable } = await import("@/server/actions/va-tasks");
const { startWorkerSession } = await import("@/server/actions/work-sessions");

async function asWorker<T>(workerId: string, fn: () => Promise<T>): Promise<T> {
  vi.mocked(requireApprovedVa).mockResolvedValue({ id: workerId, role: "VA" } as never);
  return fn();
}

async function claimedTask(input?: { vaPayoutCents?: number; clientPriceCents?: number; estimatedMinutes?: number }) {
  const worker = await createWorker();
  const task = await createTask({
    status: "claimed",
    claimedById: worker.id,
    vaPayoutCents: input?.vaPayoutCents,
    clientPriceCents: input?.clientPriceCents,
    estimatedMinutes: input?.estimatedMinutes,
  });
  return { worker, task };
}

describe("a normal worker cannot submit with zero valid work sessions", () => {
  it("refuses the submission and the task stays exactly where it was", async () => {
    const { worker, task } = await claimedTask();

    const result = await asWorker(worker.id, () =>
      submitDeliverable({ taskId: task.id, note: "Done, but I never started the timer." })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain("start your timer");

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } });
    expect(after.status, "pre-submission state 1").toBe("claimed");
    expect(
      await prisma.taskWorkSession.count({ where: { taskId: task.id } }),
      "no session was fabricated by the refusal"
    ).toBe(0);
    expect(
      await prisma.submission.count({ where: { taskId: task.id } }),
      "no Submission row was created"
    ).toBe(0);
  });
});

describe("once a valid worker session exists, normal submission remains allowed", () => {
  it("start -> submit succeeds, and payout/price are exactly what the task carried before", async () => {
    const { worker, task } = await claimedTask({ vaPayoutCents: 2500, clientPriceCents: 9900 });

    const started = await asWorker(worker.id, () => startWorkerSession(task.id));
    expect(started.ok, "startWorkerSession must succeed").toBe(true);

    const result = await asWorker(worker.id, () =>
      submitDeliverable({ taskId: task.id, note: "Confirmed by hand." })
    );
    expect(result.ok, `submitDeliverable must succeed: ${!result.ok ? result.error : ""}`).toBe(true);

    const after = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { status: true, vaPayoutCents: true, clientPriceCents: true },
    });
    expect(after.status).toBe("submitted_for_qc");
    // Item 4: this gate measures time, it does not reprice anything.
    expect(after.vaPayoutCents).toBe(2500);
    expect(after.clientPriceCents).toBe(9900);
  });

  it("finalizes the still-open session as part of submission, never leaving it orphaned", async () => {
    const { worker, task } = await claimedTask();
    const started = await asWorker(worker.id, () => startWorkerSession(task.id));
    if (!started.ok || !started.session) throw new Error("unreachable");

    const before = await prisma.taskWorkSession.findUniqueOrThrow({
      where: { id: started.session.id },
      select: { status: true },
    });
    expect(before.status, "open going into submission").toBe("active");

    const result = await asWorker(worker.id, () => submitDeliverable({ taskId: task.id, note: "done" }));
    expect(result.ok).toBe(true);

    const after = await prisma.taskWorkSession.findUniqueOrThrow({
      where: { id: started.session.id },
      select: { status: true, endedAt: true, accumulatedSeconds: true },
    });
    expect(after.status, "finalized by the same submission call").toBe("completed");
    expect(after.endedAt).not.toBeNull();
    expect(after.accumulatedSeconds).toBeGreaterThanOrEqual(0);
  });

  it("a retried submit after success is refused and does not double-count the session's time", async () => {
    const { worker, task } = await claimedTask();
    const started = await asWorker(worker.id, () => startWorkerSession(task.id));
    if (!started.ok || !started.session) throw new Error("unreachable");
    const sessionId = started.session.id;

    const first = await asWorker(worker.id, () => submitDeliverable({ taskId: task.id, note: "first" }));
    expect(first.ok, `first submit must succeed: ${!first.ok ? first.error : ""}`).toBe(true);

    const afterFirst = await prisma.taskWorkSession.findUniqueOrThrow({
      where: { id: sessionId }, select: { accumulatedSeconds: true, status: true },
    });

    const second = await asWorker(worker.id, () => submitDeliverable({ taskId: task.id, note: "retry" }));
    expect(second.ok, "a retry after success must be refused, not silently re-accepted").toBe(false);

    const afterSecond = await prisma.taskWorkSession.findUniqueOrThrow({
      where: { id: sessionId }, select: { accumulatedSeconds: true, status: true },
    });
    expect(afterSecond.status).toBe(afterFirst.status);
    expect(afterSecond.accumulatedSeconds, "never re-finalized, never double-counted").toBe(
      afterFirst.accumulatedSeconds
    );
    expect(
      await prisma.taskWorkSession.count({ where: { taskId: task.id, userId: worker.id } }),
      "no phantom second session"
    ).toBe(1);
  });
});
