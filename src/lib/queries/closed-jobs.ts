import "server-only";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export async function closedJobLogList() {
  return prisma.closedJobLog.findMany({
    orderBy: { closedAt: "desc" },
    take: 200,
    select: {
      id: true,
      taskId: true,
      outcome: true,
      marginCents: true,
      lostReasonCategory: true,
      closedAt: true,
      task: { select: { title: true, category: { select: { name: true } } } },
    },
  });
}

export async function closedJobLogDetail(id: string) {
  const job = await prisma.closedJobLog.findUnique({
    where: { id },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          description: true,
          clientPriceCents: true,
          vaPayoutCents: true,
          claimedById: true,
          claimedBy: { select: { name: true } },
          category: { select: { name: true } },
          createdAt: true,
        },
      },
    },
  });
  if (!job) return null;

  // Reference-only, per the schema's own doc comment — never copied into
  // ClosedJobLog itself. Both queried live via the foreign keys that
  // already exist (taskId, claimedById), not any new junction table.
  const [events, conversations, examAttempts] = await Promise.all([
    prisma.taskEvent.findMany({
      where: { taskId: job.taskId },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, fromStatus: true, toStatus: true, reason: true, createdAt: true },
    }),
    prisma.assistantMessage.findMany({
      where: { taskId: job.taskId, role: "user" },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true, category: true, createdAt: true },
    }),
    job.task.claimedById
      ? prisma.examAttempt.findMany({
          where: { userId: job.task.claimedById },
          orderBy: { createdAt: "desc" },
          select: { courseSlug: true, score: true, total: true, passed: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return { job, events, conversations, examAttempts };
}

export type CategoryStat = {
  categoryName: string;
  won: number;
  lost: number;
  avgMarginCents: number | null;
  avgQcRounds: number;
  lostReasons: { category: string; count: number }[];
  botConversationCount: number;
};

/**
 * The context fed to the Sonnet analysis prompt — per-category aggregates,
 * never individual task rows (see the anonymity discipline in
 * closed-job-analysis.ts). A category below settings.closedJobAnalysisMinPerCategory
 * is dropped entirely rather than included with a caveat, so the model
 * never has the option to comment on a near-empty bucket.
 */
export async function closedJobCategoryStats(): Promise<{ total: number; categories: CategoryStat[] }> {
  const settings = await getSettings();
  const rows = await prisma.closedJobLog.findMany({
    select: {
      outcome: true,
      marginCents: true,
      qcRoundsAtClose: true,
      lostReasonCategory: true,
      taskId: true,
      task: { select: { categoryId: true, category: { select: { name: true } } } },
    },
  });
  const total = rows.length;

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.task.category?.name ?? "Uncategorized";
    byCategory.set(key, [...(byCategory.get(key) ?? []), row]);
  }

  const categories: CategoryStat[] = [];
  for (const [categoryName, categoryRows] of byCategory) {
    if (categoryRows.length < settings.closedJobAnalysisMinPerCategory) continue;
    const won = categoryRows.filter((r) => r.outcome === "won").length;
    const lost = categoryRows.filter((r) => r.outcome === "lost").length;
    const margins = categoryRows
      .filter((r): r is typeof r & { marginCents: number } => r.marginCents != null)
      .map((r) => r.marginCents);
    const avgMarginCents =
      margins.length > 0 ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null;
    const avgQcRounds =
      Math.round(
        (categoryRows.reduce((a, r) => a + r.qcRoundsAtClose, 0) / categoryRows.length) * 10
      ) / 10;
    const reasonCounts = new Map<string, number>();
    for (const r of categoryRows) {
      if (!r.lostReasonCategory) continue;
      reasonCounts.set(r.lostReasonCategory, (reasonCounts.get(r.lostReasonCategory) ?? 0) + 1);
    }
    categories.push({
      categoryName,
      won,
      lost,
      avgMarginCents,
      avgQcRounds,
      lostReasons: [...reasonCounts.entries()].map(([category, count]) => ({ category, count })),
      botConversationCount: 0, // filled in below
    });
  }

  // Bot-conversation volume per category, via Task.categoryId — a second
  // pass rather than a join, since AssistantMessage has no direct category
  // link (its own `category` field is the ASSISTANT's topic tag, a
  // different axis from the task's business category).
  const taskIdsByCategory = new Map<string, string[]>();
  for (const [categoryName, categoryRows] of byCategory) {
    if (categoryRows.length < settings.closedJobAnalysisMinPerCategory) continue;
    taskIdsByCategory.set(categoryName, categoryRows.map((r) => r.taskId));
  }
  const allTaskIds = [...taskIdsByCategory.values()].flat();
  if (allTaskIds.length > 0) {
    const counts = await prisma.assistantMessage.groupBy({
      by: ["taskId"],
      where: { taskId: { in: allTaskIds }, role: "user" },
      _count: { _all: true },
    });
    const countByTaskId = new Map(counts.map((c) => [c.taskId, c._count._all]));
    for (const stat of categories) {
      const taskIds = taskIdsByCategory.get(stat.categoryName) ?? [];
      stat.botConversationCount = taskIds.reduce((sum, id) => sum + (countByTaskId.get(id) ?? 0), 0);
    }
  }

  return { total, categories };
}
