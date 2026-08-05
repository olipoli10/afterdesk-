"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/authz";
import { prisma } from "@/lib/db";

const registerVaSchema = z.object({
  name: z.string().trim().min(2).max(100),
  // Normalized: the role promotion below must target exactly the row that
  // signUpEmail just created, and email casing must never route it elsewhere.
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
  experienceSummary: z.string().trim().min(40).max(2000),
  specialties: z.string().trim().min(10).max(500),
  weeklyAvailability: z.string().trim().min(3).max(200),
  // http(s) only — this is stored and later rendered as a clickable link on
  // the admin's "Open work sample" review, so javascript:/data: URLs would
  // be stored-XSS, not just a validation nicety.
  portfolioUrl: z
    .union([z.literal(""), z.string().trim().url({ protocol: /^https?$/ }).max(500)])
    .optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Dedicated VA registration path. The role is set here, server-side, and
 * nowhere else — Better Auth's `role` field is input:false, so a signup
 * request can never smuggle a role in. New VAs start with no pool access
 * (VaProfile.status = pending_test).
 *
 * The target row is resolved from the id returned by signUpEmail — never by
 * re-querying user input — and the update is additionally guarded on
 * role: "CLIENT" so this path can never promote (or demote) a pre-existing
 * account. On failure the half-created account is removed rather than left
 * usable as a CLIENT.
 */
export async function registerVa(input: unknown): Promise<ActionResult> {
  // Server actions never pass through Better Auth's HTTP rate-limit
  // route (/api/auth/*), so this path gets the same database-backed
  // throttle the "/sign-up/email" custom rule gives the client signup:
  // 5 attempts per 5 minutes per IP.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const allowed = await consumeRateLimit(`action:register-va:${ip}`, {
    window: 300,
    max: 5,
  });
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const parsed = registerVaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fill in all fields (password: 10+ characters)." };
  }
  const {
    name,
    email,
    password,
    experienceSummary,
    specialties,
    weeklyAvailability,
    portfolioUrl,
  } = parsed.data;

  let createdUserId: string;
  try {
    const result = await auth.api.signUpEmail({ body: { email, password, name } });
    if (!result?.user?.id) {
      // Includes Better Auth's synthetic duplicate response — no user created.
      return { ok: false, error: "Sign-up failed. Try signing in instead." };
    }
    createdUserId = result.user.id;
  } catch (e) {
    if (e instanceof APIError) {
      return { ok: false, error: e.message || "Sign-up failed." };
    }
    throw e;
  }

  try {
    await prisma.$transaction([
      // role: "CLIENT" in the WHERE clause — refuses to touch anything else.
      prisma.user.update({
        where: { id: createdUserId, role: "CLIENT" },
        data: { role: "VA" },
      }),
      prisma.vaProfile.create({
        data: {
          userId: createdUserId,
          experienceSummary,
          specialties,
          weeklyAvailability,
          portfolioUrl: portfolioUrl || null,
          applicationSubmittedAt: new Date(),
        },
      }),
    ]);
  } catch {
    // Fail closed: never leave a usable account whose role does not match the
    // flow that created it.
    await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    return { ok: false, error: "Sign-up failed. Please try again." };
  }

  return { ok: true };
}
