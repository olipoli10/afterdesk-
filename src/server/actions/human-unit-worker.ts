"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedVa } from "@/lib/authz";
import { submitHumanUnitCandidate } from "@/server/human-unit";
import { stopAllOpenSessions } from "@/server/work-sessions";

export type HumanUnitRefusalCode =
  | "not_available"
  | "stale_generation"
  | "not_eligible"
  | "schema_invalid"
  | "duplicate"
  | "self_review"
  | "lifecycle_exit"
  | "paused";

export type HumanUnitResult =
  | { ok: true }
  | { ok: false; error: string; code: HumanUnitRefusalCode };

const submitSchema = z.object({
  taskId: z.string(),
  claimGeneration: z.number().int().min(0),
  result: z.unknown(),
  fileIds: z.array(z.string()).max(20).default([]),
});

const SUBMIT_ERRORS = {
  not_available: "This human work unit is not available to submit.",
  stale_generation: "This assignment changed. Reload before submitting again.",
  not_eligible: "You are no longer eligible to submit this human work unit.",
  schema_invalid: "The result does not match the required output.",
  duplicate: "This result was already submitted.",
  lifecycle_exit: "This task has already ended and cannot accept a result.",
} as const;

/**
 * Worker boundary for transaction T5. Authentication is deliberately the
 * first executable statement: malformed input cannot be used to probe this
 * action without first passing the live approved-worker gate.
 */
export async function submitHumanUnitResult(
  input: unknown
): Promise<HumanUnitResult> {
  const worker = await requireApprovedVa();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: SUBMIT_ERRORS.schema_invalid,
      code: "schema_invalid",
    };
  }

  const outcome = await submitHumanUnitCandidate({
    taskId: parsed.data.taskId,
    actorId: worker.id,
    claimGeneration: parsed.data.claimGeneration,
    payload: parsed.data.result,
    fileIds: parsed.data.fileIds,
  });
  if (!outcome.submitted) {
    return {
      ok: false,
      error: SUBMIT_ERRORS[outcome.cause],
      code: outcome.cause,
    };
  }

  // These hooks intentionally run only after T5 committed. A timer failure can
  // never roll a durable candidate back or leave the unit in a split state.
  await stopAllOpenSessions(parsed.data.taskId, worker.id, new Date());
  revalidatePath(`/va/tasks/${parsed.data.taskId}`);
  revalidatePath("/va/tasks");
  return { ok: true };
}
