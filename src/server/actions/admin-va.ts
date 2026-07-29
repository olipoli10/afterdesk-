"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import { logAdminEvent } from "@/lib/audit";

export type AdminVaResult = { ok: true } | { ok: false; error: string };

const decisionSchema = z.object({
  vaUserId: z.string(),
  reason: z.string().trim().max(2000).optional(),
});

/** Opens the pool to a worker. */
export async function approveVa(input: unknown): Promise<AdminVaResult> {
  const admin = await requireRole("ADMIN");
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: parsed.data.vaUserId },
    select: { status: true },
  });
  if (!profile) return { ok: false, error: "Worker not found." };

  await prisma.vaProfile.update({
    where: { userId: parsed.data.vaUserId },
    data: { status: "approved", suspendedAt: null, suspensionReason: null, rejectedAt: null },
  });
  await logAdminEvent({
    actorId: admin.id,
    entity: "VaProfile",
    entityId: parsed.data.vaUserId,
    action: "approve",
    before: { status: profile.status },
    after: { status: "approved" },
  });

  revalidatePath("/admin/workers");
  return { ok: true };
}

/** Rejects a worker. Starts the retake cooldown. */
export async function rejectVa(input: unknown): Promise<AdminVaResult> {
  const admin = await requireRole("ADMIN");
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: parsed.data.vaUserId },
    select: { status: true },
  });
  if (!profile) return { ok: false, error: "Worker not found." };

  await prisma.vaProfile.update({
    where: { userId: parsed.data.vaUserId },
    data: { status: "rejected", rejectedAt: new Date() },
  });
  await logAdminEvent({
    actorId: admin.id,
    entity: "VaProfile",
    entityId: parsed.data.vaUserId,
    action: "reject",
    before: { status: profile.status },
    after: { status: "rejected", reason: parsed.data.reason ?? null },
  });

  revalidatePath("/admin/workers");
  return { ok: true };
}

const suspendSchema = z.object({
  vaUserId: z.string(),
  reason: z.string().trim().min(3).max(2000),
});

/**
 * Suspends a worker and revokes their live sessions, so the change takes
 * effect on their next request rather than whenever a session happens to
 * expire. Tasks already in their hands are left alone — releasing those is a
 * separate, deliberate admin decision per task.
 */
export async function suspendVa(input: unknown): Promise<AdminVaResult> {
  const admin = await requireRole("ADMIN");
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A reason is required to suspend." };

  const profile = await prisma.vaProfile.findUnique({
    where: { userId: parsed.data.vaUserId },
    select: { status: true },
  });
  if (!profile) return { ok: false, error: "Worker not found." };

  await prisma.$transaction([
    prisma.vaProfile.update({
      where: { userId: parsed.data.vaUserId },
      data: {
        status: "suspended",
        suspendedAt: new Date(),
        suspensionReason: parsed.data.reason,
      },
    }),
    prisma.session.deleteMany({ where: { userId: parsed.data.vaUserId } }),
  ]);
  await logAdminEvent({
    actorId: admin.id,
    entity: "VaProfile",
    entityId: parsed.data.vaUserId,
    action: "suspend",
    before: { status: profile.status },
    after: { status: "suspended", reason: parsed.data.reason },
  });

  revalidatePath("/admin/workers");
  return { ok: true };
}
