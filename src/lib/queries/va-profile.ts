import "server-only";
import { cache } from "react";
import type { Prisma, TaskTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * One vaProfile read per request. Every worker page gates on this row and
 * several read it twice in the same pass, so without cache() a navigation
 * queried it two or three times.
 *
 * It lives here and not in src/app/va/layout.tsx (where it started) because a
 * layout file may only export `default` and the route-config keys: the
 * webpack type validator emits a `checkFields<Diff<...>>` guard that fails on
 * any extra export, so `next build --webpack` broke on all four importers at
 * once. Turbopack happens to tolerate it; that is a bundler accident, not a
 * contract.
 */
export const vaProfileFor = cache(async (userId: string) =>
  prisma.vaProfile.findUnique({
    where: { userId },
    select: {
      status: true,
      scoreCache: true,
      ratedCount: true,
      tasksCompleted: true,
      tasksAbandoned: true,
      suspensionReason: true,
    },
  })
);

/**
 * Approved workers eligible to see/claim a task of this tier — same
 * threshold claimTask itself checks (src/server/actions/va-tasks.ts) at
 * claim time, mirrored here so a "new task in the pool" notification never
 * tells a worker about a high-value task they cannot actually claim yet.
 */
export async function eligibleVaUserIds(
  db: Prisma.TransactionClient | typeof prisma,
  tier: TaskTier
): Promise<string[]> {
  const settings = await getSettings();
  const profiles = await db.vaProfile.findMany({
    where: {
      status: "approved",
      ...(tier === "high_value"
        ? {
            scoreCache: { gte: settings.highValueThreshold },
            ratedCount: { gte: settings.minRatedDeliveries },
          }
        : {}),
    },
    select: { userId: true },
  });
  return profiles.map((p) => p.userId);
}
