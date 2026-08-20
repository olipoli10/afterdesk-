import "server-only";
import type { Prisma } from "@prisma-client";

/**
 * Closing a worker's Standing Capacity assignments when they lose the pool.
 *
 * Three paths suspend a worker — suspendVa (admin-va.ts), the score floor and
 * the consecutive-rejection floor (both admin-qc.ts) — and none of them used
 * to touch StandingCapacityAssignment. A suspended worker therefore stayed
 * the account's assignee: currentAssignee kept routing the client's tasks to
 * them, the client's minutes kept being decremented, and the worker could
 * neither open the task (their session was revoked) nor release it. Nothing
 * swept it up, and nobody was told.
 *
 * This lives outside src/server/actions because that file is "use server":
 * every export there becomes a client-callable server action, and this must
 * not be one.
 *
 * WHY CLOSE RATHER THAN JUST FILTER ON STATUS. Filtering inside
 * currentAssignee alone would leave the row active in the database while
 * routing quietly skipped it — the admin dashboard reads activeTo, not the
 * worker's status, so it would still show the suspended worker as assigned.
 * That is the same read-disagrees-with-write shape D3 just fixed. Closing the
 * row makes the account genuinely unassigned, which is what it is.
 * currentAssignee ALSO checks the status, as a second line: if a future
 * suspension path forgets to call this, routing still refuses.
 *
 * Returns the accounts left without an assignee so the caller can raise them.
 * An account that silently stops being served is exactly the failure this
 * codebase keeps producing; the caller is expected to notify.
 */
export async function closeStandingAssignmentsForWorker(
  tx: Prisma.TransactionClient,
  workerId: string,
  reason: string
): Promise<string[]> {
  const active = await tx.standingCapacityAssignment.findMany({
    where: { workerId, activeTo: null },
    select: { id: true, accountId: true },
  });
  if (active.length === 0) return [];

  await tx.standingCapacityAssignment.updateMany({
    where: { id: { in: active.map((a) => a.id) } },
    data: { activeTo: new Date() },
  });

  const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (admins.length > 0) {
    // One notification per (admin, account). The account id is in the body on
    // purpose: Notification can point at a task but has no column for an
    // account, and "a standing capacity account has no worker" is useless to
    // an operator who cannot tell which one.
    await tx.notification.createMany({
      data: admins.flatMap((admin) =>
        active.map((assignment) => ({
          userId: admin.id,
          type: "standing_capacity_unassigned",
          title: "A standing capacity account has no worker",
          body: `Account ${assignment.accountId} lost its assigned worker (${reason}). New tasks on it will sit unrouted until someone is assigned.`,
        }))
      ),
    });
  }

  return active.map((a) => a.accountId);
}
