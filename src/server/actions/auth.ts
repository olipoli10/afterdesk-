"use server";

import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const registerVaSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(10).max(200),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Dedicated VA registration path. The role is set here, server-side, and
 * nowhere else — Better Auth's `role` field is input:false, so a signup
 * request can never smuggle a role in. New VAs start with no pool access
 * (VaProfile.status = pending_test).
 */
export async function registerVa(input: unknown): Promise<ActionResult> {
  const parsed = registerVaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fill in all fields (password: 10+ characters)." };
  }
  const { name, email, password } = parsed.data;

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
  } catch (e) {
    if (e instanceof APIError) {
      return { ok: false, error: e.message || "Sign-up failed." };
    }
    throw e;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { ok: false, error: "Sign-up failed." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { role: "VA" } }),
    prisma.vaProfile.create({ data: { userId: user.id } }),
  ]);

  return { ok: true };
}
