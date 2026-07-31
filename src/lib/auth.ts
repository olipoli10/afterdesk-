import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * Google sign-in is enabled only when credentials are configured, so the app
 * runs without them and the button is hidden rather than broken.
 * A Google sign-up always produces a CLIENT account — workers apply through
 * the dedicated form because that flow creates their profile for review.
 */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

// Fail fast: without a secret, Better Auth falls back to a known development
// default — every session cookie guarding admin, pricing and QC would be
// forgeable. A misconfigured deploy must crash at boot, not serve traffic.
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set in production. Refusing to start with the default development secret."
  );
}

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
        /**
         * Without this, Better Auth refuses to link a Google sign-in to an
         * EXISTING local account with the same email unless that local
         * account already has emailVerified: true — surfacing as
         * account_not_linked at /api/auth/error. That default protects
         * against a weak, self-reported OAuth provider hijacking an
         * unverified signup; it does not fit Google, which independently
         * proves the signer-in genuinely controls the inbox — proof at
         * least as strong as our own OTP flow, and stronger than an
         * unverified local signup ever had. trustedProviders: ["google"]
         * is the only social provider configured here, so this is scoped
         * to Google in practice, not a blanket relaxation — revisit if a
         * second, less-trustworthy provider is ever added.
         *
         * A successful link also flips the local account's emailVerified
         * to true (Better Auth's own linkAccount path, not something added
         * here) — proving ownership via Google resolves the local
         * account's stale unverified state as a side effect, it doesn't
         * bypass it.
         */
        account: {
          accountLinking: {
            enabled: true,
            trustedProviders: ["google"],
            requireLocalEmailVerified: false,
          },
        },
      }
    : {}),
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      // Verification is mandatory. Development prints the message locally;
      // production refuses to send without a configured provider.
      sendVerificationOnSignUp: true,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === "forget-password"
            ? "Reset your AfterDesk password"
            : "Your AfterDesk verification code";
        await sendEmail({
          to: email,
          subject,
          text:
            `Your verification code is ${otp}\n\n` +
            `It expires in 10 minutes. If you did not request it, ignore this email.\n\n` +
            `— AfterDesk`,
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
      // Email-SENDING endpoints, throttled hard per IP so that the moment a
      // mail provider is configured they cannot be used to bomb an arbitrary
      // inbox (or burn provider spend). Dormant until RESEND_API_KEY is set.
      "/email-otp/send-verification-otp": { window: 3600, max: 5 },
      "/email-otp/request-password-reset": { window: 3600, max: 5 },
      // Deprecated alias of request-password-reset — still routable, so it
      // gets the same rule.
      "/forget-password/email-otp": { window: 3600, max: 5 },
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
