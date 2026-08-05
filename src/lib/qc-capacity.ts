import "server-only";
import { prisma } from "@/lib/db";
import type { Settings } from "@/lib/settings";

/**
 * THE WRITTEN TRIGGER FOR A REVIEWER ROLE.
 *
 * Every quality-control action in this codebase is gated on
 * `requireRole("ADMIN")` — approveDeliverable and rejectDeliverable in
 * admin-qc.ts, every resolution in admin-resolutions.ts. There are exactly
 * three roles (CLIENT, VA, ADMIN in schema.prisma), so there is no such thing
 * as a reviewer who is not also a full operator.
 *
 * The consequence is easy to miss while volume is low and expensive to
 * discover at volume: workers scale, review does not. Total platform
 * throughput is capped at the number of deliveries one operator can read in a
 * day, and a recurring commitment ("we handle up to N files a week") is a
 * promise made against that one person's hours. Selling recurring volume
 * before a second reviewer exists is selling the operator's calendar.
 *
 * So the trigger is recorded here, in code, decided cold rather than during
 * the week it starts hurting:
 *
 *   WHEN a delivery has been waiting for review longer than qcBufferHours,
 *   AND that is not a one-off (it recurs across a normal working week),
 *   THEN a REVIEWER role separate from ADMIN is the next thing built,
 *   BEFORE any further recurring volume is sold.
 *
 * The threshold is qcBufferHours and nothing else on purpose. It is not a
 * number picked for this alarm: it is the buffer every client-facing date is
 * already computed from (vaDeadlineUtc = clientDeadlineUtc - qcBufferHours,
 * see schedule.ts). The platform has therefore already declared, in the only
 * place that matters, how long it believes a review takes. A queue that
 * routinely exceeds it is not a busy week, it is the delivery schedule
 * quietly becoming fiction — the client's promised date was derived from a
 * review that is no longer happening in that window.
 *
 * Deliberately not measured here: queue depth. A deep queue cleared the same
 * morning is a good day; a queue of two that sits overnight is the capacity
 * ceiling. Waiting time is the honest signal and it needs no invented
 * constant to interpret.
 */
export type QcCapacity = {
  /** Deliveries sitting in the QC queue right now. */
  waiting: number;
  /** Hours the oldest unreviewed delivery has waited, or null when clear. */
  oldestWaitHours: number | null;
  /** The threshold it is measured against, echoed for the UI. */
  bufferHours: number;
  /** True once the oldest wait has passed qcBufferHours. */
  breached: boolean;
};

export async function qcCapacity(settings: Settings): Promise<QcCapacity> {
  // Counted from the submission rather than the task so the clock starts when
  // the worker actually delivered, not when the task was created. The
  // supersede rule in submitDeliverable guarantees at most one pending
  // submission per task, so this cannot double-count a re-delivery.
  const [waiting, oldest] = await Promise.all([
    prisma.task.count({ where: { status: "submitted_for_qc" } }),
    prisma.submission.aggregate({
      where: { qcStatus: "pending", task: { status: "submitted_for_qc" } },
      _min: { submittedAt: true },
    }),
  ]);

  const since = oldest._min.submittedAt;
  const oldestWaitHours =
    since === null ? null : (Date.now() - since.getTime()) / 3_600_000;

  return {
    waiting,
    oldestWaitHours,
    bufferHours: settings.qcBufferHours,
    breached: oldestWaitHours !== null && oldestWaitHours > settings.qcBufferHours,
  };
}
