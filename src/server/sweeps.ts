import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { transitionTask, TransitionError } from "@/lib/state";
import { getSettings } from "@/lib/settings";

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
    select: { id: true },
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
    select: { id: true },
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
      expired++;
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
    }
  }
  return expired;
}

/**
 * Deletes uploads that were never attached to a task (client abandoned the
 * form). Blob first, row second, so a row never points at missing data.
 */
export async function reapOrphanFiles(): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHAN_FILE_TTL_HOURS * 3600 * 1000);
  const orphans = await prisma.file.findMany({
    where: { taskId: null, createdAt: { lt: cutoff } },
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
    } catch (e) {
      console.error("[sweeps] operator sweep failed:", e);
    }
  });
}
