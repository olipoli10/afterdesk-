import "server-only";
import { prisma } from "@/lib/db";

/**
 * Grouping by pattern rather than a flat conversation list — the whole
 * point per the founder's spec (15 workers asking the same thing this week
 * should read as one row with a 15x count, not 15 identical rows to
 * scroll past). No ML: clusterKey (src/server/actions/va-assistant.ts's
 * computeClusterKey) is a plain lowercase/punctuation-stripped/first-8-words
 * key computed at write time, and this groups on it directly.
 */
export type AssistantPatternRow = {
  clusterKey: string;
  count: number;
  category: string | null;
  exampleQuestion: string;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

export async function assistantPatterns(): Promise<AssistantPatternRow[]> {
  const grouped = await prisma.assistantMessage.groupBy({
    by: ["clusterKey"],
    where: { role: "user", clusterKey: { not: null } },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  if (grouped.length === 0) return [];

  const keys = grouped.map((g) => g.clusterKey as string);
  const [examples, resolutions] = await Promise.all([
    // One representative row per key (most recent) for the question text
    // and category — groupBy itself can't return an arbitrary sample column.
    prisma.assistantMessage.findMany({
      where: { role: "user", clusterKey: { in: keys } },
      orderBy: { createdAt: "desc" },
      select: { clusterKey: true, content: true, category: true },
      distinct: ["clusterKey"],
    }),
    prisma.assistantPattern.findMany({
      where: { clusterKey: { in: keys } },
      select: { clusterKey: true, resolvedAt: true },
    }),
  ]);
  const exampleByKey = new Map(examples.map((e) => [e.clusterKey, e]));
  const resolvedByKey = new Map(resolutions.map((r) => [r.clusterKey, r.resolvedAt]));

  return grouped
    .map((g) => {
      const key = g.clusterKey as string;
      const example = exampleByKey.get(key);
      return {
        clusterKey: key,
        count: g._count._all,
        category: example?.category ?? null,
        exampleQuestion: example?.content ?? key,
        lastSeenAt: g._max.createdAt as Date,
        resolvedAt: resolvedByKey.get(key) ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export async function assistantCostSummary(): Promise<{
  callsToday: number;
  callsThisWeek: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
}> {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [callsToday, callsThisWeek, totals] = await Promise.all([
    prisma.assistantMessage.count({ where: { role: "user", createdAt: { gte: startOfDay } } }),
    prisma.assistantMessage.count({ where: { role: "user", createdAt: { gte: startOfWeek } } }),
    prisma.assistantMessage.aggregate({
      where: { role: "assistant" },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
    }),
  ]);

  return {
    callsToday,
    callsThisWeek,
    totalInputTokens: totals._sum.inputTokens ?? 0,
    totalOutputTokens: totals._sum.outputTokens ?? 0,
    totalCacheReadTokens: totals._sum.cacheReadTokens ?? 0,
  };
}
