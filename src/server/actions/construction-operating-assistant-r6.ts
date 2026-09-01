"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import {
  recordConstructionReceivablePaymentSchema,
  recordConstructionReceivableSchema,
  scheduleConstructionFollowUpSchema,
} from "@/lib/construction-operating-assistant-r6/contracts";
import {
  recordConstructionReceivable,
  recordConstructionReceivablePayment,
  scheduleConstructionFollowUp,
} from "@/server/construction-operating-assistant-r6/receivables";

function bindAuthenticatedActor(rawInput: unknown, actorId: string) {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return rawInput;
  }
  return { ...rawInput, actorId };
}

function refreshConstructionReceivables() {
  revalidatePath("/client/projects");
  revalidatePath("/client/inbox");
  revalidatePath("/client/calendar");
}

export async function createConstructionReceivable(rawInput: unknown) {
  const user = await requireRole("CLIENT");
  const input = recordConstructionReceivableSchema.parse(
    bindAuthenticatedActor(rawInput, user.id),
  );
  const result = await recordConstructionReceivable(input);
  refreshConstructionReceivables();
  return result;
}

export async function applyConstructionReceivablePayment(rawInput: unknown) {
  const user = await requireRole("CLIENT");
  const input = recordConstructionReceivablePaymentSchema.parse(
    bindAuthenticatedActor(rawInput, user.id),
  );
  const result = await recordConstructionReceivablePayment(input);
  refreshConstructionReceivables();
  return result;
}

export async function createConstructionFollowUp(rawInput: unknown) {
  const user = await requireRole("CLIENT");
  const input = scheduleConstructionFollowUpSchema.parse(
    bindAuthenticatedActor(rawInput, user.id),
  );
  const result = await scheduleConstructionFollowUp(input);
  refreshConstructionReceivables();
  return result;
}
