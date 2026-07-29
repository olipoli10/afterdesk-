import "server-only";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { transitionTask, TransitionError } from "@/lib/state";

/**
 * Time-driven state changes. A single-operator product has no worker process,
 * so these run opportunistically: on the admin dashboard/queue load and before
 * any client action on a quote. They are idempotent and safe to call often.
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

  let deleted = 0;
  for (const file of orphans) {
    await deleteObject(file.storageKey);
    await prisma.file.delete({ where: { id: file.id } }).catch(() => {});
    deleted++;
  }
  return deleted;
}

/** Both sweeps, for the admin surfaces to call on load. */
export async function runOperatorSweeps(): Promise<void> {
  await expireStaleQuotes();
  await reapOrphanFiles();
}
