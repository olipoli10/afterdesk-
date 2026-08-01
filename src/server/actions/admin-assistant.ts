"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";

export type AdminAssistantResult = { ok: true } | { ok: false; error: string };

const patternSchema = z.object({ clusterKey: z.string().min(1) });

/**
 * Marking a pattern resolved is a note for the admin's own tracking (did
 * this question's volume drop after the Academy doc got fixed) — it never
 * touches AssistantMessage, which stays a plain append-only conversation
 * log regardless of resolution state.
 */
export async function markPatternResolved(input: unknown): Promise<AdminAssistantResult> {
  const admin = await requireRole("ADMIN");
  const parsed = patternSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid pattern." };

  await prisma.assistantPattern.upsert({
    where: { clusterKey: parsed.data.clusterKey },
    create: { clusterKey: parsed.data.clusterKey, resolvedAt: new Date(), resolvedById: admin.id },
    update: { resolvedAt: new Date(), resolvedById: admin.id },
  });

  revalidatePath("/admin/assistant");
  return { ok: true };
}

export async function reopenPattern(input: unknown): Promise<AdminAssistantResult> {
  await requireRole("ADMIN");
  const parsed = patternSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid pattern." };

  await prisma.assistantPattern.upsert({
    where: { clusterKey: parsed.data.clusterKey },
    create: { clusterKey: parsed.data.clusterKey, resolvedAt: null },
    update: { resolvedAt: null, resolvedById: null },
  });

  revalidatePath("/admin/assistant");
  return { ok: true };
}
