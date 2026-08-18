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
         * requireLocalEmailVerified: true — deliberately reversed from an
         * earlier version of this config. The earlier reasoning ("Google
         * independently proves the signer-in controls the inbox, so an
         * unverified local match is safe to auto-link") is true as far as
         * it goes, but it answers the wrong question: it's about whether
         * TODAY's Google sign-in is legitimate, not about who set up the
         * pre-existing local row being linked into.
         *
         * The attack this closes: an attacker signs up locally with a
         * victim's email (never verifies it — they don't control that
         * inbox) and sets a password. Nothing stops that signup; requireUser
         * only blocks an unverified session from reaching product surfaces,
         * it doesn't block account creation. Later the real victim signs
         * in with Google. With auto-linking on an unverified match, Better
         * Auth links into the attacker's row and flips it to verified — but
         * link-account (node_modules/better-auth/dist/oauth2/link-account.mjs)
         * never touches the row's existing password credential. The
         * attacker's password still works on what the victim now believes
         * is their own, freshly-verified account: a pre-account-hijack, not
         * a false alarm Google's verification would catch.
         *
         * The cost of this fix: a victim in that exact scenario now hits
         * account_not_linked at /api/auth/error on their first Google
         * sign-in instead of being silently merged — worse UX in a rare
         * case, but fail-closed and it surfaces a signal instead of quietly
         * handing over an account with a spare credential still live.
         */
        account: {
          accountLinking: {
            enabled: true,
            trustedProviders: ["google"],
            requireLocalEmailVerified: true,
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
            ? "Reset your Endvera password"
            : "Your Endvera verification code";
        await sendEmail({
          to: email,
          subject,
          text:
            `Your verification code is ${otp}\n\n` +
            `It expires in 10 minutes. If you did not request it, ignore this email.\n\n` +
            `— Endvera`,
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
  session: {
    // The portal is the product; the marketing pages around it are just the
    // cover. A worker or client who has to type their password back in every
    // few days experiences that as the portal being unreliable, not as a
    // security feature — so this is deliberately long, and slides forward
    // (updateAge) on every active week rather than counting down from
    // sign-in, meaning a regular user is effectively never logged out.
    // Default (7 days, no slide reset until a full day passes) was the
    // Better Auth default, chosen for nothing specific to this product.
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the 30-day window on any use after a day
  },
});

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "VA" | "ADMIN";
  emailVerified: boolean;
};
