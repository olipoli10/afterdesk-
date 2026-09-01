"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { prepareConstructionHumanEscalationSchema } from "@/lib/construction-operating-assistant-r5/contracts";
import {
  activateFundedConstructionHumanEscalation,
  requestConstructionHumanEscalation,
  withdrawConstructionHumanEscalation,
} from "@/server/construction-operating-assistant-r5/escalations";

const activateSchema = z
  .object({
    escalationId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    paymentId: z.string().min(1).max(160),
  })
  .strict();

const withdrawSchema = z
  .object({
    escalationId: z.string().min(1).max(160),
    workspaceId: z.string().min(1).max(160),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

function refreshConstructionCockpit() {
  revalidatePath("/client/projects");
  revalidatePath("/client/inbox");
}

export async function prepareConstructionHumanEscalation(rawInput: unknown) {
  const user = await requireRole("CLIENT");
  const input = prepareConstructionHumanEscalationSchema.parse(rawInput);
  const result = await requestConstructionHumanEscalation({
    ...input,
    actorId: user.id,
  });
  refreshConstructionCockpit();
  return result;
}

export async function activateConstructionHumanEscalation(rawInput: unknown) {
  const user = await requireRole("CLIENT");
  const input = activateSchema.parse(rawInput);
  const result = await activateFundedConstructionHumanEscalation({
    ...input,
    actorId: user.id,
  });
  refreshConstructionCockpit();
  return result;
}

export async function withdrawPreparedConstructionHumanEscalation(
  rawInput: unknown,
) {
  const user = await requireRole("CLIENT");
  const input = withdrawSchema.parse(rawInput);
  const result = await withdrawConstructionHumanEscalation({
    ...input,
    actorId: user.id,
  });
  refreshConstructionCockpit();
  return result;
}
