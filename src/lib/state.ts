import "server-only";
import { Prisma, type TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/** The task was not in the expected state — someone else moved it first. */
export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

/**
 * The requested (from, to) pair is not in the transition map. This is a bug in
 * the caller, never a race, and must NOT be presented to a user as "someone
 * else got there first".
 */
export class IllegalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalTransitionError";
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
  // A task is promoted submitted -> pricing_review immediately at creation
  // (see client-tasks.ts), so "submitted" never persists live. But every
  // other reader (admin.ts's approvePricing, the pricing queue queries, the
  // admin UI gate) treats the two as one interchangeable "awaiting pricing"
  // bucket — so "submitted" needs the same outgoing edges as
  // "pricing_review" or the defensive from:["submitted","pricing_review"]
  // union those callers pass gets rejected outright by the strict from-set
  // check below, regardless of the row's real status.
  // "claimed" only for a Standing Capacity submission (src/server/actions/
  // standing-capacity.ts): price is already fixed at the block level, so it
  // skips pricing/quoting/payment and is claimed directly by the account's
  // current assignment, never through the public pool.
  submitted: ["pricing_review", "quoted", "claimed", "cancelled"],
  pricing_review: ["quoted", "cancelled"],
  // Accepting no longer publishes the task: it must be paid for first. The
  // one exception is the operator's own internal practice work, which skips
  // the payment gate structurally (guarded on isInternal in the action).
  quoted: ["awaiting_payment", "open", "declined", "expired", "cancelled"],
  awaiting_payment: ["open", "expired", "cancelled"],
  declined: [],
  open: ["claimed", "expired", "cancelled"],
  // "submitted" here is admin.ts's reassignTask exit for a Standing Capacity
  // task: it must never re-enter the public pool (`open`), so it goes back to
  // waiting-for-routing instead — exactly where a task sits when it is
  // submitted with nobody assigned yet. Every non-standing task still exits
  // through `open`; reassignTask picks the target from the row itself.
  claimed: ["submitted_for_qc", "open", "submitted", "expired", "cancelled"],
  // `open` here is the reassignment exit when the QC rounds are exhausted:
  // the task goes back to the pool for a different worker.
  submitted_for_qc: ["completed", "qc_rejected", "open", "submitted", "cancelled"],
  qc_rejected: ["submitted_for_qc", "open", "submitted", "cancelled"],
  // `submitted_for_qc` is the worker re-delivering after a revision request.
  revision_requested: [
    "claimed",
    "submitted_for_qc",
    "open",
    "submitted",
    "completed",
    "disputed",
    "cancelled",
  ],
  // No longer terminal: the client has a post-delivery window in which to ask
  // for a revision or open a dispute.
  completed: ["revision_requested", "disputed"],
  // rejected -> completed (normal variance, release), rework -> the worker
  // fixes it, upheld -> cancelled (client refunded, worker unpaid).
  disputed: ["completed", "revision_requested", "cancelled"],
  cancelled: [],
  // A late payment needs somewhere to land; re-pooling is always a NEW task.
  expired: ["awaiting_payment", "cancelled"],
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
  /**
   * Unchecked so the compare-and-swap can set foreign-key scalars directly
   * (claimedById, categoryId). Prisma's checked updateMany input excludes any
   * scalar that has a relation, which is exactly what the claim needs to write.
   */
  data?: Prisma.TaskUncheckedUpdateManyInput;
  meta?: Prisma.InputJsonValue;
  /**
   * Extra WHERE conditions folded into the compare-and-swap — e.g. a time
   * bound so an expired quote cannot be accepted by a racing request.
   */
  guard?: Prisma.TaskWhereInput;
  /**
   * Run inside an existing transaction. Required whenever the status change
   * and its side effects (a QC decision, a score recompute, a payout row) must
   * commit together — otherwise a failure between them leaves a task in a
   * state its own supporting rows contradict.
   */
  tx?: Prisma.TransactionClient;
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

  // Strict: ANY illegal pair is a programming error, not something to quietly
  // narrow away. Silently dropping illegal source states hides the bug and
  // produces a "task already moved on" message the operator cannot act on.
  const illegal = from.filter((s) => !isAllowedTransition(s, args.to));
  if (illegal.length > 0) {
    throw new IllegalTransitionError(
      `Illegal transition: ${illegal.join("/")} → ${args.to} is not in the transition map.`
    );
  }
  const legalFrom = from;

  const run = async (tx: Prisma.TransactionClient) => {
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
  };

  // Join the caller's transaction when given one, so the status change and its
  // side effects commit or roll back together.
  return args.tx ? run(args.tx) : prisma.$transaction(run);
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
