import "server-only";
import { Prisma, type WorkSessionPhase, type WorkSessionRole } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * WORK-SESSION CORE — the state machine, with the CLOCK INJECTED. Every
 * public function takes `now` so the integration suite can prove the
 * arithmetic (accumulation, staleness) without sleeping; the server actions
 * pass `new Date()` and nothing else ever calls this with a fabricated time.
 *
 * All timing is SERVER-side. The client's only inputs are the four explicit
 * verbs; no keystroke, mouse, focus or any other activity signal exists
 * anywhere in this file, by design and by mandate.
 *
 * Concurrency is settled in Postgres, not in code:
 *  - ONE open session per (task, user, role) — the partial unique index
 *    TaskWorkSession_one_open_per_actor; two concurrent starts race to a
 *    single winner and the loser adopts the winner's row;
 *  - pause/resume/stop are single atomic UPDATEs whose WHERE carries the
 *    expected status (CAS) and whose arithmetic runs in SQL, so a racing
 *    double-click cannot double-accumulate.
 *
 * Raw SQL note: @updatedAt does not fire on $executeRaw, and the recompute
 * fingerprint watches max(updatedAt) — so every raw UPDATE here sets
 * "updatedAt" explicitly. Dropping that would blind the fingerprint to
 * exactly the mutation class it exists to catch.
 */

const STALE_AFTER_HOURS = 8;
/** One stint's contribution is capped when recovered by the sweep. */
const STALE_STINT_CAP_SECONDS = 4 * 3600;

export type SessionView = {
  id: string;
  status: "active" | "paused" | "completed" | "abandoned";
  accumulatedSeconds: number;
  startedAt: Date;
  lastResumedAt: Date | null;
};

const VIEW_SELECT = {
  id: true,
  status: true,
  accumulatedSeconds: true,
  startedAt: true,
  lastResumedAt: true,
} as const;

export async function openSessionFor(
  taskId: string,
  userId: string,
  role: WorkSessionRole
): Promise<SessionView | null> {
  return prisma.taskWorkSession.findFirst({
    where: { taskId, userId, role, status: { in: ["active", "paused"] } },
    select: VIEW_SELECT,
  });
}

/**
 * Idempotent start: the partial unique index decides the race, and the
 * loser returns the winner's session rather than erroring — a double-click
 * on Start is a fact of life, not a fault.
 */
export async function startSession(input: {
  taskId: string;
  userId: string;
  role: WorkSessionRole;
  phase: WorkSessionPhase;
  workflowRunId?: string | null;
  now: Date;
}): Promise<SessionView> {
  const existing = await openSessionFor(input.taskId, input.userId, input.role);
  if (existing) return existing;
  try {
    return await prisma.taskWorkSession.create({
      data: {
        taskId: input.taskId,
        userId: input.userId,
        role: input.role,
        phase: input.phase,
        workflowRunId: input.workflowRunId ?? null,
        startedAt: input.now,
        lastResumedAt: input.now,
      },
      select: VIEW_SELECT,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await openSessionFor(input.taskId, input.userId, input.role);
      if (winner) return winner;
    }
    throw error;
  }
}

/** CAS pause: only an ACTIVE session owned by this user, arithmetic in SQL. */
export async function pauseSession(sessionId: string, userId: string, now: Date): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "TaskWorkSession"
    SET "status" = 'paused',
        "accumulatedSeconds" = "accumulatedSeconds"
          + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now} - COALESCE("lastResumedAt", "startedAt")))))::int,
        "lastResumedAt" = NULL,
        "updatedAt" = ${now}
    WHERE "id" = ${sessionId} AND "userId" = ${userId} AND "status" = 'active'`;
  return count > 0;
}

export async function resumeSession(sessionId: string, userId: string, now: Date): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "TaskWorkSession"
    SET "status" = 'active', "lastResumedAt" = ${now}, "updatedAt" = ${now}
    WHERE "id" = ${sessionId} AND "userId" = ${userId} AND "status" = 'paused'`;
  return count > 0;
}

/** Stop from either open state; a paused stop adds nothing to the count. */
export async function stopSession(sessionId: string, userId: string, now: Date): Promise<boolean> {
  const count = await prisma.$executeRaw`
    UPDATE "TaskWorkSession"
    SET "accumulatedSeconds" = "accumulatedSeconds"
          + CASE WHEN "status" = 'active'
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now} - COALESCE("lastResumedAt", "startedAt")))))::int
              ELSE 0 END,
        "status" = 'completed',
        "endedAt" = ${now},
        "lastResumedAt" = NULL,
        "updatedAt" = ${now}
    WHERE "id" = ${sessionId} AND "userId" = ${userId} AND "status" IN ('active', 'paused')`;
  return count > 0;
}

/** Every open session this user holds on this task, closed at once (used at submission). */
export async function stopAllOpenSessions(
  taskId: string,
  userId: string,
  now: Date
): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "TaskWorkSession"
    SET "accumulatedSeconds" = "accumulatedSeconds"
          + CASE WHEN "status" = 'active'
              THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now} - COALESCE("lastResumedAt", "startedAt")))))::int
              ELSE 0 END,
        "status" = 'completed',
        "endedAt" = ${now},
        "lastResumedAt" = NULL,
        "updatedAt" = ${now}
    WHERE "taskId" = ${taskId} AND "userId" = ${userId} AND "status" IN ('active', 'paused')`;
}

/**
 * THE STALENESS SWEEP. A session ACTIVE for longer than STALE_AFTER_HOURS is
 * a forgotten tab, not eight hours of work: it is closed as `abandoned`
 * with source `system_recovery`, and the final stint's contribution is
 * CAPPED — recovered time is a bounded estimate, never an open-ended one.
 * A PAUSED session is anchored on its pause instant (updatedAt), not on
 * startedAt: a worker who started at 09:00 and paused at 17:30 is on a
 * break, not abandoned — only a pause older than the window closes, and it
 * closes with nothing added.
 */
export async function closeStaleWorkSessions(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_AFTER_HOURS * 3600 * 1000);
  return prisma.$executeRaw`
    UPDATE "TaskWorkSession"
    SET "accumulatedSeconds" = "accumulatedSeconds"
          + CASE WHEN "status" = 'active'
              THEN LEAST(${STALE_STINT_CAP_SECONDS},
                GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now} - COALESCE("lastResumedAt", "startedAt")))))::int)
              ELSE 0 END,
        "status" = 'abandoned',
        "source" = 'system_recovery',
        "endedAt" = ${now},
        "lastResumedAt" = NULL,
        "updatedAt" = ${now}
    WHERE ("status" = 'active' AND COALESCE("lastResumedAt", "startedAt") < ${cutoff})
       OR ("status" = 'paused' AND "updatedAt" < ${cutoff})`;
}
