"use server";

import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { runIntake, aiEnabled, type IntakeResult } from "@/lib/ai";

const turnsSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(6000),
    })
  )
  .min(1)
  .max(40);

export type IntakeActionResult =
  | { ok: true; result: IntakeResult }
  | { ok: false; error: string };

/**
 * One turn of the intake conversation. The whole transcript is re-sent each
 * time (the model is stateless); length and size are bounded above so a client
 * cannot use this as an unmetered AI endpoint.
 */
export async function sendIntakeTurn(input: unknown): Promise<IntakeActionResult> {
  await requireRole("CLIENT");

  if (!aiEnabled) {
    return { ok: false, error: "The assistant is not configured yet. Use the form instead." };
  }

  const parsed = turnsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That message is too long. Try a shorter one." };
  }

  try {
    const result = await runIntake(parsed.data);
    return { ok: true, result };
  } catch (e) {
    console.error("intake failed", e);
    return {
      ok: false,
      error: "The assistant is unavailable right now. You can write the task out yourself instead.",
    };
  }
}
