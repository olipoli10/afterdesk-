import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { closeStaleWorkSessions } from "@/server/work-sessions";
import {
  closeExpiredRepeatWindows,
  recomputeStaleOperationalActuals,
} from "@/server/operational-actuals";
import { deleteObject } from "@/lib/storage";
import { transitionTask, TransitionError } from "@/lib/state";
import { getSettings } from "@/lib/settings";
import { releaseHeldFunds } from "@/lib/escrow";
import { upsertClosedJobLog } from "@/lib/closed-job-log";
import { lockStandingAccount, rollForwardPeriods } from "@/lib/standing-period";
import { releaseToPoolWithoutAutomation } from "@/server/workflow-runs";

/**
 * Time-driven state changes. The authenticated maintenance endpoint runs these
 * on a schedule, and operator/client surfaces also run the critical checks
 * opportunistically. They are idempotent and safe to call often.
 */

/** Unattached uploads older than this are reaped. */
const ORPHAN_FILE_TTL_HOURS = 24;

/**
 * Moves `quoted` tasks past their expiry to `expired`. Pass a taskId to check
 * just one (before a client action); omit it to sweep all of them.
 */
export async function expireStaleQuotes(taskId?: string): Promise<number> {
  const stale = await prisma.task.findMany({
    where: {
      ...(taskId ? { id: taskId } : {}),
      status: "quoted",
      quoteExpiresAt: { lt: new Date() },
    },
    select: { id: true, isInternal: true },
  });

  let expired = 0;
  for (const task of stale) {
    try {
      await transitionTask({
        taskId: task.id,
        from: "quoted",
        to: "expired",
        action: "quote_expired",
        data: { expiredAt: new Date() },
        // Re-check under the CAS: the client may have accepted a moment ago.
        guard: { quoteExpiresAt: { lt: new Date() } },
      });
      if (!task.isInternal) {
        await upsertClosedJobLog(prisma, task.id, { outcome: "lost", lostReasonCategory: "expired" });
      }
      expired++;
    } catch (e) {
      if (!(e instanceof TransitionError)) throw e;
      // Someone moved it first — nothing to do.
    }
  }
  return expired;
}

export async function expireStalePayments(): Promise<number> {
  const stale = await prisma.task.findMany({
    where: { status: "awaiting_payment", paymentDueAt: { lt: new Date() } },
    select: { id: true, isInternal: true },
    take: 200,
  });
  let expired = 0;
  for (const task of stale) {
    try {
      await transitionTask({
        taskId: task.id,
        from: "awaiting_payment",
        to: "expired",
        action: "payment_window_expired",
        data: { expiredAt: new Date() },
        guard: { paymentDueAt: { lt: new Date() } },
      });
      if (!task.isInternal) {
        await upsertClosedJobLog(prisma, task.id, { outcome: "lost", lostReasonCategory: "expired" });
      }
      expired++;
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
    }
  }
  return expired;
}

/**
 * Escrow auto-release: a completed task whose dispute window closed with no
 * dispute ever opened. Releases the worker's payout and enqueues the
 * client's capture, via the same releaseHeldFunds helper decideDispute's
 * "rejected" outcome uses (src/lib/escrow.ts) — the two are the only ways
 * a one-off task's held money ever moves.
 *
 * Filtered on Payout.status: "owed" rather than a task-level flag: once
 * released, the payout row itself is the record that this already ran, so a
 * task a dispute already resolved (payout no longer "owed") is naturally
 * skipped here without needing to touch disputeWindowEndsAt at all.
 */
export async function releaseDisputeWindowFunds(): Promise<number> {
  const due = await prisma.task.findMany({
    where: {
      status: "completed",
      disputeWindowEndsAt: { lt: new Date() },
      payouts: { some: { status: "owed" } },
    },
    select: { id: true },
    take: 200,
  });
  let released = 0;
  for (const task of due) {
    try {
      await prisma.$transaction((tx) => releaseHeldFunds(tx, task.id));
      released++;
    } catch (error) {
      // A single task's payment/payout row in an unexpected shape must not
      // stop the rest of the batch from releasing — matches purgeExpiredTaskFiles'
      // per-item isolation below.
      console.error("releaseDisputeWindowFunds failed for task", task.id, error);
    }
  }
  return released;
}

/**
 * Deletes uploads that were never attached to a task (client abandoned the
 * form). Blob first, row second, so a row never points at missing data.
 */
export async function reapOrphanFiles(): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHAN_FILE_TTL_HOURS * 3600 * 1000);
  const orphans = await prisma.file.findMany({
    // Machine-produced artifacts are attached to their task at creation, so
    // they are never orphans. The explicit exclusion is belt and braces: a
    // sweep that reaped a run's own candidate file mid-flight would delete
    // the very thing a worker is about to be handed.
    where: { taskId: null, kind: { not: "artifact" }, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: 200,
  });

  // Concurrent in small chunks: a 200-file backlog must not become 400
  // sequential round-trips. Per file the order stays blob first, row second,
  // so a row never points at missing data; one file's failure never blocks
  // the rest (it is retried on the next sweep).
  const CHUNK_SIZE = 10;
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += CHUNK_SIZE) {
    const chunk = orphans.slice(i, i + CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map(async (file) => {
        await deleteObject(file.storageKey);
        await prisma.file.delete({ where: { id: file.id } }).catch(() => {});
      })
    );
    deleted += results.filter((r) => r.status === "fulfilled").length;
  }
  return deleted;
}

/** Purges attached files after the published retention period. */
export async function purgeExpiredTaskFiles(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
  const tasks = await prisma.task.findMany({
    where: {
      filesPurgedAt: null,
      status: { in: ["completed", "cancelled", "declined", "expired"] },
      OR: [
        { firstCompletedAt: { lt: cutoff } },
        { firstCompletedAt: null, updatedAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      files: {
        where: { purgedAt: null },
        select: { id: true, storageKey: true },
      },
    },
    take: 50,
  });

  let purged = 0;
  let failedTasks = 0;
  for (const task of tasks) {
    const results = await Promise.allSettled(
      task.files.map((file) => deleteObject(file.storageKey))
    );
    const rejected = results.flatMap((result, i) =>
      result.status === "rejected" ? [{ file: task.files[i], reason: result.reason }] : []
    );
    if (rejected.length > 0) {
      failedTasks += 1;
      for (const { file, reason } of rejected) {
        console.error(
          `[sweeps] purgeExpiredTaskFiles: failed to delete ${file.storageKey} (file ${file.id}, task ${task.id}):`,
          reason
        );
      }
      continue;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const result = await tx.file.updateMany({
        where: { id: { in: task.files.map((file) => file.id) }, purgedAt: null },
        data: { purgedAt: now },
      });
      await tx.task.update({
        where: { id: task.id },
        data: { filesPurgedAt: now },
      });
      // An overlapping sweep may have already purged these files; only log
      // the event when this run is the one that actually changed anything.
      if (result.count > 0) {
        await tx.taskEvent.create({
          data: {
            taskId: task.id,
            action: "retention_files_purged",
            meta: { files: result.count, retentionDays: settings.retentionDays },
          },
        });
      }
    });
    purged += task.files.length;
  }

  // One notification per sweep run, not per failed task — a real outage can
  // hit every eligible task in the same run, and an admin needs to know
  // storage deletion is broken, not read the same alert 50 times.
  if (failedTasks > 0) {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "file_purge_failed",
          title:
            failedTasks === 1
              ? "A task's files failed to purge"
              : `${failedTasks} tasks' files failed to purge`,
          body: "Storage deletion errored during the retention sweep; the files are still held past their promised purge date. See server logs for the exact error.",
        })),
      });
    }
  }

  return purged;
}

/**
 * Rolls a Standing Capacity account into its next 7-day period once the
 * current one has ended: resets minutesUsedThisPeriod to 0 and advances the
 * window by exactly one week from the old boundary (not from "now"), so a
 * sweep that runs late never shrinks the next period. Payment collection is
 * separate and admin-tracked (StandingCapacityPayment) — this does not gate
 * rollover on a period actually being paid; an admin who wants to stop an
 * unpaying account uses setStandingCapacityStatus to pause it instead.
 */
export async function advanceStandingCapacityPeriods(): Promise<number> {
  const due = await prisma.standingCapacityAccount.findMany({
    where: { status: "active", currentPeriodEnd: { lt: new Date() } },
    select: { id: true },
    take: 100,
  });
  let advanced = 0;
  for (const accountId of due.map((a) => a.id)) {
    // Each account rolls in its own locked transaction, taking the same lock
    // submitStandingTask takes. The reset used to be an unconditional write
    // outside any lock: a submission committing between this sweep's SELECT
    // and its UPDATE had its minutes wiped — replayed, 300 minutes of booked
    // work vanished and the client got the block back for free. Now a
    // submission and a rollover cannot interleave at all; whichever holds the
    // lock finishes first, and the other reads the result.
    const rolled = await prisma.$transaction(async (tx) => {
      await lockStandingAccount(tx, accountId);
      const account = await tx.standingCapacityAccount.findUnique({
        where: { id: accountId },
        select: {
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          minutesUsedThisPeriod: true,
        },
      });
      // Re-checked under the lock: the account may have been paused, or
      // already rolled by a submission that reached it first.
      if (!account || account.status !== "active") return false;
      const now = new Date();
      if (account.currentPeriodEnd > now) return false;
      await rollForwardPeriods(tx, accountId, account, now);
      return true;
    });
    if (rolled) advanced += 1;
  }
  return advanced;
}

/**
 * Both sweeps, for the admin surfaces to call on load.
 *
 * Deferred via `after()` so the sweep runs once the response has been sent —
 * an orphan/expiry backlog must never sit between the operator and their
 * queue. Consequence: a just-expired quote can appear as `quoted` for one
 * page load; harmless, because every transition (including a client accept)
 * is CAS-guarded and the next load shows the swept state. Individual task
 * actions that need synchronous expiry still call expireStaleQuotes(taskId)
 * directly.
 */
export async function runOperatorSweeps(): Promise<void> {
  after(async () => {
    try {
      await expireStaleQuotes();
      await expireStalePayments();
      await reapOrphanFiles();
      await purgeExpiredTaskFiles();
      await advanceStandingCapacityPeriods();
      await releaseDisputeWindowFunds();
      // ai_processing is the only time-driven state holding a live card
      // authorisation, and until now its ONLY caller was the maintenance
      // cron — a route this repo has already caught silently returning 405
      // for an unknown stretch. Every sibling sweep self-heals on any
      // operator page load; the one state where waiting costs real money
      // must not be the exception.
      await abandonStalledWorkflowRuns();
      // Phase 1C — the intelligence layer's own self-healing, same
      // opportunistic pattern: forgotten timers close with capped seconds,
      // expired repeat windows resolve to an honest false, and any task
      // whose sources moved after its actual gets recomputed.
      await closeStaleWorkSessions();
      await closeExpiredRepeatWindows();
      await recomputeStaleOperationalActuals();
    } catch (e) {
      console.error("[sweeps] operator sweep failed:", e);
    }
  });
}

/** A run allowed to sit this long is abandoned to the human path. */
const STALLED_RUN_HOURS = 6;

/**
 * ai_processing is outside expireStalePayments' reach: that sweep only looks
 * at `awaiting_payment`. Without this one, a run wedged by a provider outage
 * would hold an authorized card indefinitely, and the Stripe authorisation
 * window (about seven days, and not tracked anywhere in this codebase) would
 * quietly run out on a task nobody was watching.
 *
 * The exit is deliberately the generous one: the task goes to the pool with
 * its ORIGINAL quoted payout, not a residual computed from partial work. A
 * worker asked to pick up an abandoned run is doing the whole job.
 */
export async function abandonStalledWorkflowRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALLED_RUN_HOURS * 3600 * 1000);
  const stalled = await prisma.task.findMany({
    where: { status: "ai_processing", updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 50,
  });

  let abandoned = 0;
  for (const task of stalled) {
    try {
      await prisma.taskWorkflowRun.updateMany({
        // `paused` belongs here too. A run paused on an over-budget residual
        // or on step exhaustion is precisely the kind that sits for six
        // hours; leaving it out stamped the task `open` while its run row
        // still read `paused` with no finishedAt, which is a contradiction an
        // operator then has to unpick from the execution panel.
        where: { taskId: task.id, status: { in: ["running", "compiling", "paused"] } },
        data: { status: "abandoned", finishedAt: new Date(), pausedReason: "Stalled; released to the pool." },
      });
      await releaseToPoolWithoutAutomation(task.id, "automated processing stalled");
      abandoned++;
    } catch (error) {
      /**
       * ONE POISONED TASK MUST NOT BLOCK THE BATCH.
       *
       * Rethrowing here aborted the whole loop, so a single task whose
       * Postgres payment guard now refuses `ai_processing -> open` — an
       * authorisation that lapsed or was charged back during the run, which
       * is a real possibility over a multi-hour residency — stranded every
       * other stalled task behind it. purgeExpiredTaskFiles and
       * releaseDisputeWindowFunds both isolate per item; this one now does
       * too, and the failure is logged rather than silently swallowed.
       */
      if (!(error instanceof TransitionError)) {
        console.error("[sweeps] could not release stalled run", { taskId: task.id, error });
      }
    }
  }
  return abandoned;
}
