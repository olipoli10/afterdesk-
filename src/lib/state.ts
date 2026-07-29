import "server-only";
import { Prisma, type Task, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
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
};

/**
 * The ONLY way task status changes. Compare-and-swap guarded (updateMany with
 * the expected current status in the WHERE clause) so concurrent actors —
 * double-clicks, two tabs, two VAs claiming — cannot corrupt state, and the
 * audit event is written in the same transaction as the change.
 *
 * Throws TransitionError when the task is not in the expected state (someone
 * else moved it first).
 */
export async function transitionTask(args: TransitionArgs): Promise<Task> {
  const from = Array.isArray(args.from) ? args.from : [args.from];

  return prisma.$transaction(async (tx) => {
    const current = await tx.task.findUnique({
      where: { id: args.taskId },
      select: { status: true },
    });
    if (!current) throw new TransitionError("Task not found.");

    const result = await tx.task.updateMany({
      where: { id: args.taskId, status: { in: from } },
      data: { ...args.data, status: args.to },
    });
    if (result.count === 0) {
      throw new TransitionError(
        `Task is no longer in the expected state (expected ${from.join("/")}, found ${current.status}).`
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

    return tx.task.findUniqueOrThrow({ where: { id: args.taskId } });
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
