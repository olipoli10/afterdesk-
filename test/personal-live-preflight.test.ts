import { describe, expect, it } from "vitest";
import { personalLivePreflight } from "../scripts/personal-live-preflight.mjs";

describe("personal live configuration projection", () => {
  it("reports missing configuration without confusing presence with live proof", () => {
    const result = personalLivePreflight({}, Date.parse("2026-09-09T00:00:00Z"));
    expect(result.status).toBe("CONFIGURATION_REQUIRED");
    expect(result.liveReady).toBe(false);
    expect(result.missing).toContain("TWILIO_AUTH_TOKEN");
  });
  it("never serializes provided credentials or unknown environment fields", () => {
    const secret = "synthetic-secret-value-for-leak-test";
    const result = personalLivePreflight({ TWILIO_AUTH_TOKEN: secret, DATABASE_URL: secret, ANOTHER_SECRET: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("ANOTHER_SECRET");
  });
  it("does not activate solely because all environment names are present", () => {
    const initial = personalLivePreflight({});
    const env = Object.fromEntries(initial.missing.map((name: string) => [name, "synthetic"]));
    Object.assign(env, { BETTER_AUTH_URL: "https://endvera.example", ENDVERA_TWILIO_SMS_WEBHOOK_URL: "https://endvera.example/sms", GOOGLE_REDIRECT_URI: "https://endvera.example/callback", ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-09-10T00:00:00Z" });
    const result = personalLivePreflight(env, Date.parse("2026-09-09T00:00:00Z"));
    expect(result.status).toBe("CONFIGURATION_PRESENT_UNVERIFIED");
    expect(result.liveReady).toBe(false);
  });
});
