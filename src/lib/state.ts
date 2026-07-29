import "server-only";
import { Prisma, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

/**
 * The canonical transition map — mirrors the spec exactly. transitionTask
 * refuses any (from, to) pair absent from this table, so no caller can invent
 * a transition by passing the wrong `from`.
 *
 * Terminal states (declined, completed, cancelled) map to []. `expired` is not
 * terminal: the admin can re-pool or cancel it.
 */
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  submitted: ["pricing_review", "cancelled"],
  pricing_review: ["quoted", "cancelled"],
  quoted: ["open", "declined", "expired", "cancelled"],
  declined: [],
  open: ["claimed", "expired", "cancelled"],
  claimed: ["submitted_for_qc", "open", "expired", "cancelled"],
  submitted_for_qc: ["completed", "qc_rejected", "cancelled"],
  qc_rejected: ["submitted_for_qc", "open", "cancelled"],
  revision_requested: ["claimed", "open", "completed", "cancelled"],
  completed: ["revision_requested"],
  cancelled: [],
  expired: ["open", "cancelled"],
};

export function isAllowedTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

type TransitionArgs = {
  taskId: string;
  /** Allowed current state(s) — the compare part of the compare-and-swap. */
  from: TaskStatus | TaskStatus[];
  to: TaskStatus;
  /** Short machine-readable action name written to the audit log. */
  action: string;
  actorId?: string;
  reason?: string;
  /** Extra Task columns to set atomically with the status change. */
  data?: Prisma.TaskUpdateManyMutationInput;
  meta?: Prisma.InputJsonValue;
  /**
   * Extra WHERE conditions folded into the compare-and-swap — e.g. a time
   * bound so an expired quote cannot be accepted by a racing request.
   */
  guard?: Prisma.TaskWhereInput;
};

/**
 * The ONLY way task status changes. Compare-and-swap guarded (updateMany with
 * the expected current status in the WHERE clause) so concurrent actors —
 * double-clicks, two tabs, two VAs claiming — cannot corrupt state, and the
 * audit event is written in the same transaction as the change.
 *
 * Returns only { id, status }: never the full Task row, which would carry both
 * prices and both identities into any caller that returns it to the browser.
 *
 * Throws TransitionError when the task is not in the expected state (someone
 * else moved it first) or when the transition is not in ALLOWED_TRANSITIONS.
 */
export async function transitionTask(
  args: TransitionArgs
): Promise<{ id: string; status: TaskStatus }> {
  const from = Array.isArray(args.from) ? args.from : [args.from];

  const illegal = from.filter((s) => !isAllowedTransition(s, args.to));
  if (illegal.length === from.length) {
    throw new TransitionError(
      `Illegal transition: ${from.join("/")} → ${args.to} is not in the transition map.`
    );
  }
  // Only keep the legal source states; a caller passing a mixed list gets the
  // legal subset rather than a silent illegal write.
  const legalFrom = from.filter((s) => isAllowedTransition(s, args.to));

  return prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({
      where: { id: args.taskId },
      select: { status: true },
    });
    if (!current) throw new TransitionError("Task not found.");

    const result = await tx.task.updateMany({
      where: { ...args.guard, id: args.taskId, status: { in: legalFrom } },
      data: { ...args.data, status: args.to },
    });
    if (result.count === 0) {
      throw new TransitionError(
        `Task is no longer in the expected state (expected ${legalFrom.join("/")}, found ${current.status}).`
      );
    }

    await tx.taskEvent.create({
      data: {
        taskId: args.taskId,
        fromStatus: current.status,
        toStatus: args.to,
        action: args.action,
        actorId: args.actorId,
        reason: args.reason,
        meta: args.meta,
      },
    });

    return { id: args.taskId, status: args.to };
  });
}

/** Audit entry for non-transition actions (creation, uploads, edits). */
export async function logTaskEvent(entry: {
  taskId: string;
  action: string;
  actorId?: string;
  reason?: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.taskEvent.create({ data: entry });
}
