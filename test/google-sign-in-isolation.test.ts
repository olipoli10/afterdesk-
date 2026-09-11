import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newGoogleConsent } from "../src/server/personal-assistant/google-client";
import { isGoogleSignInOptedIn } from "../src/lib/auth-google";

const capture = vi.hoisted(() => ({ betterAuth: vi.fn((options: unknown) => ({ options })) }));
vi.mock("better-auth", () => ({ betterAuth: capture.betterAuth }));
vi.mock("better-auth/plugins", () => ({ emailOTP: vi.fn(() => ({ id: "synthetic-email-otp" })) }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn(() => ({ id: "synthetic-adapter" })) }));
vi.mock("@better-auth/expo", () => ({ expo: vi.fn(() => ({ id: "synthetic-expo" })) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(() => { throw new Error("UNEXPECTED_EMAIL"); }) }));

const calendarEnvironment = {
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority",
  ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED",
  GOOGLE_CLIENT_ID: "synthetic-calendar-client",
  GOOGLE_CLIENT_SECRET: "synthetic-calendar-secret",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback",
  BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetModules();
  capture.betterAuth.mockClear();
  for (const [key, value] of Object.entries(calendarEnvironment)) vi.stubEnv(key, value);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ENDVERA_GOOGLE_SIGN_IN_ENABLED", undefined);
  vi.stubEnv("ENDVERA_EMAIL_PROVIDER_ENABLED", "DISABLED");
});
afterEach(() => { vi.unstubAllEnvs(); });

async function inspectAuth() {
  const auth = await import("../src/lib/auth");
  expect(capture.betterAuth).toHaveBeenCalledTimes(1);
  return { googleEnabled: auth.googleEnabled, options: capture.betterAuth.mock.calls[0][0] };
}

describe("Google Calendar credentials do not opt in to Better Auth sign-in", () => {
  it.each([undefined, "", "DISABLED", "false", "true", "enabled", "ENABLED ", " ENABLED", "1", "ON"])(
    "the pure intent gate refuses non-exact token %s", value => {
      expect(isGoogleSignInOptedIn({ ENDVERA_GOOGLE_SIGN_IN_ENABLED: value })).toBe(false);
    });
  it("accepts only explicit sign-in intent without treating it as full capability authority", () => {
    expect(isGoogleSignInOptedIn({ ENDVERA_GOOGLE_SIGN_IN_ENABLED: "ENABLED" })).toBe(true);
    expect(isGoogleSignInOptedIn(calendarEnvironment)).toBe(false);
  });
  it.each([undefined, "DISABLED", "true"])("omits social login and Google linking for opt-in %s", async value => {
    vi.stubEnv("ENDVERA_GOOGLE_SIGN_IN_ENABLED", value);
    const actual = await inspectAuth();
    expect(actual.googleEnabled).toBe(false);
    expect(actual.options).not.toHaveProperty("socialProviders");
    expect(actual.options).not.toHaveProperty("account");
  });

  it("preserves the existing intended provider and anti-hijack settings after explicit opt-in", async () => {
    vi.stubEnv("ENDVERA_GOOGLE_SIGN_IN_ENABLED", "ENABLED");
    const actual = await inspectAuth();
    expect(actual.googleEnabled).toBe(true);
    expect(actual.options).toHaveProperty("socialProviders", { google: {
      clientId: calendarEnvironment.GOOGLE_CLIENT_ID, clientSecret: calendarEnvironment.GOOGLE_CLIENT_SECRET,
    } });
    expect(actual.options).toHaveProperty("account.accountLinking", {
      enabled: true, trustedProviders: ["google"], requireLocalEmailVerified: true,
    });
    expect(actual.options).toHaveProperty("emailAndPassword", { enabled: true, minPasswordLength: 10, autoSignIn: true });
    expect(actual.options).toHaveProperty("user.additionalFields.role", { type: "string", input: false, defaultValue: "CLIENT" });
  });

  it.each(["ENDVERA_EXTERNAL_TRANSPORT_ENABLED", "ENDVERA_GOOGLE_OAUTH_ENABLED",
    "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_EXTERNAL_OWNER_REF", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])(
    "does not bypass the existing requirement %s with a sign-in opt-in", async key => {
      vi.stubEnv("ENDVERA_GOOGLE_SIGN_IN_ENABLED", "ENABLED");
      vi.stubEnv(key, "");
      const actual = await inspectAuth();
      expect(actual.googleEnabled).toBe(false);
      expect(actual.options).not.toHaveProperty("socialProviders");
    });

  it("leaves Calendar consent enabled with only its callback while sign-in stays absent", async () => {
    const actual = await inspectAuth();
    const consent = newGoogleConsent(calendarEnvironment, "READ_ONLY", Date.parse("2026-09-11T00:00:00Z"));
    const url = new URL(consent.authorizationUrl);
    expect(url.searchParams.get("redirect_uri")).toBe(calendarEnvironment.GOOGLE_REDIRECT_URI);
    expect(consent.scopes).toEqual(["openid", "https://www.googleapis.com/auth/calendar.events.readonly"]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(actual.googleEnabled).toBe(false);
    expect(actual.options).not.toHaveProperty("socialProviders");
  });
});
