import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

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
