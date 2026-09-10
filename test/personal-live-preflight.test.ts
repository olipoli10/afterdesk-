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
  it("shows the confirmation path as disabled without pretending missing switches are permission grants", () => {
    const result = personalLivePreflight({});
    expect(result.capabilitySwitches.calendarSmsConfirmation).toMatchObject({ status: "DISABLED", executionAuthorized: false });
    expect(result.capabilitySwitches.calendarSmsConfirmation.missingSwitches).toContain("ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED");
    expect(result.databaseEvidenceChecked).toBe(false);
  });
  it("reports only partial configuration when one confirmation switch is absent", () => {
    const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED",
      ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
      ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" };
    expect(personalLivePreflight(env).capabilitySwitches.calendarSmsConfirmation).toMatchObject({ status: "PARTIALLY_REQUESTED",
      missingSwitches: ["ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED"], executionAuthorized: false });
    const result = personalLivePreflight({ ...env, ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true" });
    expect(result.capabilitySwitches.calendarSmsConfirmation.status).toBe("REQUESTED_UNVERIFIED"); expect(result.liveReady).toBe(false);
  });
  it("does not trim or coerce activation literals and never returns an injected value", () => {
    const secret = "synthetic-do-not-echo";
    const env = { ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: secret, ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "TRUE",
      ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON: secret, ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED: " true " };
    const result = personalLivePreflight(env);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.capabilitySwitches.openRouterIntent.status).toBe("DISABLED");
    expect(result.capabilitySwitches.uncertainActionRecovery.status).toBe("DISABLED");
    expect(result.optionalConfiguration.model[0].present).toBe(true);
    expect(result.unresolvedEvidence).toContain("OWNER_MODEL_CONSENT_AND_ENCRYPTED_CREDENTIAL");
  });
  it("does not mutate the supplied environment or claim that requested recovery authorizes an effect", () => {
    const env = Object.freeze({ ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED: "true" });
    expect(personalLivePreflight(env).capabilitySwitches.uncertainActionRecovery).toMatchObject({ status: "REQUESTED_UNVERIFIED", executionAuthorized: false });
    expect(env).toEqual({ ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED: "true" });
  });
});
