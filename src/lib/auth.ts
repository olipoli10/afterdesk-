import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      // RULE: role is NEVER client-assignable. input: false means the value
      // can only ever be set server-side (default CLIENT; VA/ADMIN are set by
      // dedicated server code paths).
      role: {
        type: "string",
        input: false,
        defaultValue: "CLIENT",
      },
    },
  },
  rateLimit: {
    enabled: true,
    // Database-backed: survives restarts and works across serverless instances,
    // unlike the in-memory default.
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 300, max: 5 },
    },
  },
  // No cookieCache: role/status checks must always hit the database so a
  // demoted or suspended account loses access immediately.
});

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "VA" | "ADMIN";
};
