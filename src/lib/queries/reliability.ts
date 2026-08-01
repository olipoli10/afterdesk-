import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * Published reliability rates (/ledger). Every number is computed live from
 * real rows — never entered by hand — and each one is independently
 * withheld until MIN_SAMPLE data points exist, same honesty rule as the
 * money counters (public-stats.ts): a rate over 3 tasks is noise, not proof.
 * settings.reliabilityPublic is a per-metric admin toggle on top of that —
 * if the number is bad, hiding it is a deliberate admin choice the audit
 * trail can show, not something a threshold quietly does for them.
 *
 * All three exclude the operator's own internal practice tasks (isInternal),
 * same rule as every other public figure in this codebase.
 */
const MIN_SAMPLE = 20;

export type ReliabilityStats = {
  onTimeRate: number | null; // 0-1, or null if withheld/disabled
  qcPassRate: number | null;
  disputeRate: number | null;
};

export const reliabilityStats = cache(async (): Promise<ReliabilityStats> => {
  try {
    const settings = await getSettings();

    const [onTime, qc, dispute] = await Promise.all([
      settings.reliabilityPublic.onTime
        ? prisma.task.findMany({
            where: {
              isInternal: false,
              firstCompletedAt: { not: null },
              clientDeadlineUtc: { not: null },
            },
            select: { firstCompletedAt: true, clientDeadlineUtc: true },
          })
        : null,
      settings.reliabilityPublic.qcPass
        ? prisma.submission.groupBy({
            by: ["qcStatus"],
            where: { qcStatus: { in: ["approved", "rejected"] }, task: { isInternal: false } },
            _count: true,
          })
        : null,
      settings.reliabilityPublic.dispute
        ? Promise.all([
            prisma.task.count({ where: { isInternal: false, firstCompletedAt: { not: null } } }),
            prisma.dispute.count({ where: { task: { isInternal: false } } }),
          ])
        : null,
    ]);

    const onTimeRate =
      onTime && onTime.length >= MIN_SAMPLE
        ? onTime.filter((t) => t.firstCompletedAt! <= t.clientDeadlineUtc!).length / onTime.length
        : null;

    let qcPassRate: number | null = null;
    if (qc) {
      const approved = qc.find((r) => r.qcStatus === "approved")?._count ?? 0;
      const rejected = qc.find((r) => r.qcStatus === "rejected")?._count ?? 0;
      const total = approved + rejected;
      qcPassRate = total >= MIN_SAMPLE ? approved / total : null;
    }

    let disputeRate: number | null = null;
    if (dispute) {
      const [deliveredCount, disputeCount] = dispute;
      disputeRate = deliveredCount >= MIN_SAMPLE ? disputeCount / deliveredCount : null;
    }

    return { onTimeRate, qcPassRate, disputeRate };
  } catch {
    // Same rule as public-stats.ts: a DB hiccup must never 500 a public page.
    return { onTimeRate: null, qcPassRate: null, disputeRate: null };
  }
});
