"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import {
  runIntake,
  aiEnabled,
  AI_MODEL,
  IntakeTooLongError,
  type IntakeDraft,
} from "@/lib/ai";

/** Per-user ceilings. The endpoint spends money on every call. */
const MAX_TURNS_PER_HOUR = 25;
const MAX_TURNS_PER_DAY = 120;
/** Total characters across the whole transcript, not per message. */
const MAX_TRANSCRIPT_CHARS = 24_000;
const MAX_TURNS = 40;

const turnsSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      // Assistant turns may legitimately be short; only the total is bounded.
      content: z.string().max(6000),
    })
  )
  .min(1)
  .max(MAX_TURNS)
  .superRefine((turns, ctx) => {
    const total = turns.reduce((n, t) => n + t.content.length, 0);
    if (total > MAX_TRANSCRIPT_CHARS) {
      ctx.addIssue({ code: "custom", message: "transcript-too-large" });
    }
    // Strict alternation starting and ending with the client. This does not
    // make assistant turns trustworthy (see below) but removes the trivial
    // shapes used to stuff a conversation with fabricated context.
    if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") {
      ctx.addIssue({ code: "custom", message: "bad-shape" });
    }
    for (let i = 0; i < turns.length; i++) {
      if (turns[i].role !== (i % 2 === 0 ? "user" : "assistant")) {
        ctx.addIssue({ code: "custom", message: "bad-shape" });
        break;
      }
    }
  });

export type IntakeActionResult =
  | {
      ok: true;
      reply: string;
      ready: boolean;
      draft: IntakeDraft | null;
    }
  | { ok: false; error: string; kind: "limit" | "too-long" | "shape" | "unavailable" };

/**
 * One turn of the intake conversation.
 *
 * The transcript is client-held and re-sent each turn, so assistant turns are
 * NOT authenticated — a client can fabricate them. That is acceptable here:
 * the client already controls the brief end-to-end (they edit it before
 * submitting, and the plain form bypasses this entirely), and no task reaches
 * a worker without the operator's content review. What the caps below protect
 * is spend, not integrity.
 */
export async function sendIntakeTurn(input: unknown): Promise<IntakeActionResult> {
  const user = await requireRole("CLIENT");

  if (!aiEnabled) {
    return {
      ok: false,
      kind: "unavailable",
      error: "The chat isn't set up yet. Write your task out instead.",
    };
  }

  const parsed = turnsSchema.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.message === "transcript-too-large")
      ? "This conversation has gotten long. Send the brief you have, or start a new one."
      : "That message didn't go through. Try again, or write the task out yourself.";
    return { ok: false, kind: "shape", error: reason };
  }

  const now = Date.now();
  const [lastHour, lastDay] = await Promise.all([
    prisma.aiUsage.count({
      where: { userId: user.id, createdAt: { gte: new Date(now - 3_600_000) } },
    }),
    prisma.aiUsage.count({
      where: { userId: user.id, createdAt: { gte: new Date(now - 86_400_000) } },
    }),
  ]);
  if (lastHour >= MAX_TURNS_PER_HOUR || lastDay >= MAX_TURNS_PER_DAY) {
    return {
      ok: false,
      kind: "limit",
      error:
        "You've sent a lot of messages in a short time. Give it an hour, or write your task out yourself: that always works.",
    };
  }

  try {
    const result = await runIntake(parsed.data);

    await prisma.aiUsage.create({
      data: {
        userId: user.id,
        turnCount: parsed.data.length,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        model: AI_MODEL,
        stopReason: result.usage.stopReason,
      },
    });

    return { ok: true, reply: result.reply, ready: result.ready, draft: result.draft };
  } catch (e) {
    // Still bill-visible even when it fails: record the attempt so a loop of
    // failing calls cannot run uncounted.
    await prisma.aiUsage
      .create({
        data: {
          userId: user.id,
          turnCount: parsed.data.length,
          model: AI_MODEL,
          stopReason: "error",
        },
      })
      .catch(() => {});

    if (e instanceof IntakeTooLongError) {
      return {
        ok: false,
        kind: "too-long",
        error: "That got long. Try summarizing the task in a few sentences.",
      };
    }
    console.error("intake failed", e);
    return {
      ok: false,
      kind: "unavailable",
      error: "The chat is unavailable right now. Write the task out yourself instead.",
    };
  }
}
