"use server";
import { randomUUID } from "node:crypto";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import {
  askAssistant,
  assistantCostMicros,
  assistantEnabled,
  assistantReservationMicros,
  type AssistantTurn,
} from "@/lib/assistant-ai";
import {
  recordAccountSpendBlocked,
  reserveAccountProviderSpend,
  settleAccountSpendHoldDirect,
} from "@/server/account-spend";
import { scrubCheck } from "@/lib/assistant-scrub";
import { containsForbiddenVocabulary } from "@/lib/forbidden-vocabulary";

export type AssistantSendResult =
  | { ok: true; answer: string; requiresHumanReview: boolean }
  | { ok: false; error: string };

const MAX_HISTORY_TURNS = 20;

function computeClusterKey(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

function todayUtcStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const sendSchema = z.object({
  taskId: z.string(),
  message: z.string().trim().min(1).max(2000),
});

/**
 * Every check here runs fresh, on every call — this IS the mechanism that
 * closes the assistant's access the instant a task stops being `claimed`
 * (not a page-load gate, not a cached flag). A task released, delivered,
 * reassigned, or expired between two messages fails this on the very next
 * send, whatever UI state the client still shows.
 */
export async function sendAssistantMessage(input: unknown): Promise<AssistantSendResult> {
  const user = await requireApprovedVa();

  if (!assistantEnabled) {
    return { ok: false, error: "The assistant isn't available right now." };
  }

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a question first." };
  const { taskId, message } = parsed.data;

  // Strictly "claimed" — narrower than the human "Ask a question" gate on
  // purpose (see the founder's spec: the assistant is only ever visible on
  // an actively claimed task, nothing broader).
  const task = await prisma.task.findFirst({
    where: { id: taskId, claimedById: user.id, status: "claimed" },
    select: { id: true },
  });
  if (!task) {
    return {
      ok: false,
      error: "This task is no longer active for you — the assistant closed with it.",
    };
  }

  const settings = await getSettings();
  const messageCountToday = await prisma.assistantMessage.count({
    where: { vaId: user.id, role: "user", createdAt: { gte: todayUtcStart() } },
  });
  if (messageCountToday >= settings.assistantDailyMessageLimit) {
    return {
      ok: false,
      error: "You've hit your question limit for today — come back tomorrow, or use \"Ask a question\" for a human reply.",
    };
  }

  const scrub = scrubCheck(message);
  if (!scrub.ok) return { ok: false, error: scrub.reason };

  // History is scoped to THIS task, not the worker's whole history — a
  // question on one task never carries context from a different task,
  // which matters once a worker has multiple claims open.
  const priorRows = await prisma.assistantMessage.findMany({
    where: { vaId: user.id, taskId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_TURNS,
    select: { role: true, content: true },
  });
  const turns: AssistantTurn[] = [
    ...priorRows.map((r) => ({ role: r.role, content: r.content })),
    { role: "user" as const, content: message },
  ];

  /**
   * R5.2 — THE ACCOUNT-LEVEL SPEND GATE, BEFORE THE CALL LEAVES AFTERDESK.
   *
   * The assistant is AUXILIARY: the worker claims, executes and submits the
   * deliverable without it (nothing in the submit path calls this), so a
   * refusal degrades this one feature and never blocks the actual job. That is
   * why the refusal returns the same shape the disabled-assistant branch above
   * already returns, rather than failing the action.
   *
   * IDENTITY: per-invocation uuid. There is no automatic retry layer here, so
   * one invocation is exactly one dispatch; a stable per-turn key would risk
   * one reservation funding two charges on a double submit.
   */
  const accountHold = await reserveAccountProviderSpend({
    operationKey: `assistant:${taskId}:${user.id}:${randomUUID()}`,
    attempt: 1,
    worstCaseMicros: BigInt(assistantReservationMicros(turns)),
  });
  if (!accountHold.ok) {
    await recordAccountSpendBlocked({
      taskId,
      stage: "va_assistant",
      operationKey: `assistant:${taskId}`,
      attempt: 1,
      refusal: accountHold,
    });
    // The worker is told the assistant is unavailable — never a ceiling, a
    // dollar figure, or the provider's name.
    return { ok: false, error: "The assistant isn't available right now." };
  }

  const result = await askAssistant(turns);
  // A response arrived, so the real cost is known. askAssistant never throws
  // for a provider failure, and it reports zero usage in that case, which
  // settles honestly at zero for a call that produced nothing billable.
  await settleAccountSpendHoldDirect(
    accountHold.holdId,
    BigInt(assistantCostMicros(result.usage))
  );

  const safeAnswer = containsForbiddenVocabulary(result.answer)
    ? "Sorry, I can't phrase that one safely — use \"Ask a question\" for an operator."
    : result.answer;
  const requiresHumanReview = result.requiresHumanReview || safeAnswer !== result.answer;

  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        vaId: user.id,
        taskId,
        role: "user",
        content: message,
        clusterKey: computeClusterKey(message),
        // Copied from the reply rather than left null: the admin pattern
        // view groups on THIS row (it's the one with a clusterKey), so it
        // needs the category directly rather than joining to the paired
        // assistant row for it.
        category: result.category,
      },
    }),
    prisma.assistantMessage.create({
      data: {
        vaId: user.id,
        taskId,
        role: "assistant",
        content: safeAnswer,
        category: result.category,
        requiresHumanReview,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
      },
    }),
  ]);

  revalidatePath("/admin/assistant");
  return { ok: true, answer: safeAnswer, requiresHumanReview };
}

const historySchema = z.object({ taskId: z.string() });

export type AssistantHistoryTurn = { role: "user" | "assistant"; content: string; requiresHumanReview: boolean };

/** Loads prior turns when the widget mounts, scoped to this worker + task. */
export async function assistantHistory(input: unknown): Promise<AssistantHistoryTurn[]> {
  const user = await requireApprovedVa();
  const parsed = historySchema.safeParse(input);
  if (!parsed.success) return [];

  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, claimedById: user.id, status: "claimed" },
    select: { id: true },
  });
  if (!task) return [];

  const rows = await prisma.assistantMessage.findMany({
    where: { vaId: user.id, taskId: parsed.data.taskId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_TURNS,
    select: { role: true, content: true, requiresHumanReview: true },
  });
  return rows.map((r) => ({ role: r.role, content: r.content, requiresHumanReview: r.requiresHumanReview }));
}
