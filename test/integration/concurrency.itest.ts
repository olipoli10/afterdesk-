import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  claimAiOperation,
  engineOperationKey,
  reserveAiOperation,
  succeedAiOperation,
  SupersededOperationError,
} from "@/server/ai-operations";
import {
  closeStaleWorkSessions,
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
} from "@/server/work-sessions";
import { createTask } from "./fixtures";

/**
 * THE RACES, run for real: concurrent starts on the partial index,
 * concurrent claims on the CAS, a zombie fenced out by lockedBy, and the
 * session arithmetic under an injected clock — no sleeps anywhere.
 */

describe("AI operations under concurrency", () => {
  it("two concurrent pipeline triggers create ONE logical operation per stage and one claimant", async () => {
    const task = await createTask();
    const key = engineOperationKey(task.id, "initial", "classify");

    // Both triggers reserve (idempotent upsert) and claim, concurrently.
    const [claimA, claimB] = await Promise.all([
      reserveAiOperation({ taskId: task.id, purpose: "classification", operationKey: key }).then(
        () => claimAiOperation(key)
      ),
      reserveAiOperation({ taskId: task.id, purpose: "classification", operationKey: key }).then(
        () => claimAiOperation(key)
      ),
    ]);

    const ops = await prisma.aiOperation.findMany({ where: { taskId: task.id } });
    expect(ops).toHaveLength(1);
    const winners = [claimA, claimB].filter(Boolean);
    expect(winners).toHaveLength(1);
    // The single logical operation ran exactly one attempt so far.
    expect(ops[0].attempts).toBe(1);
  });

  it("a zombie whose lease was reclaimed cannot close the operation over its successor", async () => {
    const task = await createTask();
    const key = engineOperationKey(task.id, "initial", "plan");
    await reserveAiOperation({ taskId: task.id, purpose: "planning", operationKey: key });

    const zombie = await claimAiOperation(key);
    expect(zombie).not.toBeNull();

    // The zombie's lease expires; a successor legitimately reclaims.
    await prisma.aiOperation.update({
      where: { operationKey: key },
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    const successor = await claimAiOperation(key);
    expect(successor).not.toBeNull();
    expect(successor!.attempt).toBe(2);

    // The zombie tries to close: fenced out, business write rolled back.
    await expect(
      succeedAiOperation({
        claim: zombie!,
        taskId: task.id,
        purpose: "planning",
        usage: null,
        writeResult: async (tx) => {
          const row = await tx.taskEvent.create({
            data: { taskId: task.id, action: "zombie_business_write" },
            select: { id: true },
          });
          return { resultKind: "taskEvent", resultId: row.id, value: row };
        },
      })
    ).rejects.toThrow(SupersededOperationError);
    expect(
      await prisma.taskEvent.count({ where: { taskId: task.id, action: "zombie_business_write" } })
    ).toBe(0);

    // The successor closes normally.
    await succeedAiOperation({
      claim: successor!,
      taskId: task.id,
      purpose: "planning",
      usage: {
        model: "claude-opus-5",
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicros: 42,
        stopReason: "end_turn",
      },
      writeResult: async (tx) => {
        const row = await tx.taskEvent.create({
          data: { taskId: task.id, action: "successor_business_write" },
          select: { id: true },
        });
        return { resultKind: "taskEvent", resultId: row.id, value: row };
      },
    });
    const op = await prisma.aiOperation.findUniqueOrThrow({ where: { operationKey: key } });
    expect(op.status).toBe("succeeded");
    // The successor's billed attempt is on record.
    expect(await prisma.aiUsage.count({ where: { operationId: op.id, attempt: 2 } })).toBe(1);
  });

  it("a failed operation is claimable only after its backoff elapses", async () => {
    const task = await createTask();
    const key = engineOperationKey(task.id, "initial", "critique");
    await reserveAiOperation({ taskId: task.id, purpose: "critique", operationKey: key });
    const first = await claimAiOperation(key);
    expect(first).not.toBeNull();
    await prisma.aiOperation.update({
      where: { operationKey: key },
      data: {
        status: "failed",
        lockedBy: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });
    expect(await claimAiOperation(key)).toBeNull();
    await prisma.aiOperation.update({
      where: { operationKey: key },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    const retry = await claimAiOperation(key);
    expect(retry).not.toBeNull();
    expect(retry!.attempt).toBe(2);
  });
});

describe("work sessions: concurrency and clock arithmetic", () => {
  it("two concurrent starts converge on one open session", async () => {
    const task = await createTask();
    const now = new Date();
    const [a, b] = await Promise.all([
      startSession({ taskId: task.id, userId: "w1", role: "worker", phase: "residual_work", now }),
      startSession({ taskId: task.id, userId: "w1", role: "worker", phase: "residual_work", now }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.taskWorkSession.count({ where: { taskId: task.id, userId: "w1" } })
    ).toBe(1);
  });

  it("accumulates exactly the active spans, with an injected clock", async () => {
    const task = await createTask();
    const t0 = new Date("2026-08-07T10:00:00Z");
    const s = await startSession({
      taskId: task.id,
      userId: "w2",
      role: "worker",
      phase: "residual_work",
      now: t0,
    });
    // 10 minutes active → pause.
    expect(await pauseSession(s.id, "w2", new Date("2026-08-07T10:10:00Z"))).toBe(true);
    // A racing second pause is a no-op (CAS on status).
    expect(await pauseSession(s.id, "w2", new Date("2026-08-07T10:11:00Z"))).toBe(false);
    // 30 min paused (counts nothing) → resume → 5 min active → stop.
    expect(await resumeSession(s.id, "w2", new Date("2026-08-07T10:40:00Z"))).toBe(true);
    expect(await stopSession(s.id, "w2", new Date("2026-08-07T10:45:00Z"))).toBe(true);

    const row = await prisma.taskWorkSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.accumulatedSeconds).toBe(15 * 60);
    expect(row.status).toBe("completed");

    // Another user cannot touch it (userId in every WHERE).
    expect(await stopSession(s.id, "intruder", new Date())).toBe(false);
  });

  it("the stale sweep closes forgotten sessions with capped seconds", async () => {
    const task = await createTask();
    const longAgo = new Date(Date.now() - 20 * 3600 * 1000);
    const s = await startSession({
      taskId: task.id,
      userId: "w3",
      role: "worker",
      phase: "residual_work",
      now: longAgo,
    });
    const closed = await closeStaleWorkSessions(new Date());
    expect(closed).toBeGreaterThanOrEqual(1);
    const row = await prisma.taskWorkSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("abandoned");
    expect(row.source).toBe("system_recovery");
    // 20 h elapsed, contribution capped at 4 h — recovered time is a bounded
    // estimate, never an open-ended one.
    expect(row.accumulatedSeconds).toBe(4 * 3600);
  });
});
