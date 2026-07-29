import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * Google sign-in is enabled only when credentials are configured, so the app
 * runs without them and the button is hidden rather than broken.
 * A Google sign-up always produces a CLIENT account — assistants apply through
 * the dedicated form because that flow creates their profile and entry test.
 */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
  },
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        },
      }
    : {}),
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      // OFF until a mail provider is configured — otherwise sign-up sends a
      // code nobody receives. Set RESEND_API_KEY, flip this to true, and
      // restore the gate in src/lib/authz.ts → requireUser to re-enable.
      sendVerificationOnSignUp: false,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === "forget-password"
            ? "Reset your Second Shift password"
            : "Your Second Shift verification code";
        await sendEmail({
          to: email,
          subject,
          text:
            `Your verification code is ${otp}\n\n` +
            `It expires in 10 minutes. If you did not request it, ignore this email.\n\n` +
            `— Second Shift`,
        });
      },
    }),
  ],
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
      "/email-otp/verify-email": { window: 300, max: 10 },
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
  emailVerified: boolean;
};
