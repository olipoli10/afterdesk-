import { describe, expect, it } from "vitest";
import { loadPersonalModelState, personalModelCommand, personalModelConsentSchema, personalModelCredentialCommand,
  personalModelCredentialResultSchema, personalModelDisconnectedSchema, personalModelReadinessLabel, personalModelStatusSchema } from "../src/lib/personal-model";
const status = { prepared: true, credentialPrepared: true, credentialStorageConfigured: true, consentGranted: true, configured: true,
  transportConfigured: true, readyForAdmission: true, liveObserved: false as const, executionAuthorized: false as const, consentVersion: "personal-model-consent-v1" as const };
describe("mobile model consent and prerequisite-only status", () => {
  it("never labels prerequisite readiness as a working provider", () => {
    expect(personalModelReadinessLabel(status)).toContain("fonctionnement réel à vérifier");
    expect(personalModelReadinessLabel({ ...status, transportConfigured: false })).toContain("transport IA désactivé");
    expect(personalModelReadinessLabel({ ...status, consentGranted: false, readyForAdmission: false })).toContain("autorisation IA est requise");
  });
  it.each(["prepared", "credentialPrepared", "credentialStorageConfigured", "consentGranted", "configured"])("refuses ready state with missing %s prerequisite", key => {
    expect(personalModelStatusSchema.safeParse({ ...status, [key]: false }).success).toBe(false);
  });
  it.each([{ ...status, executionAuthorized: true }, { ...status, liveObserved: true }, { ...status, apiKey: "synthetic" },
    { ...status, consentVersion: "unrecognized" }])("refuses authority/secret/schema drift", value => {
    expect(personalModelStatusSchema.safeParse(value).success).toBe(false);
  });
  it("clears previous state on malformed, rejected or synchronously failed reads", async () => {
    expect((await loadPersonalModelState(() => Promise.resolve(status))).model).toEqual(status);
    for (const read of [() => Promise.resolve({ ready: true }), () => Promise.reject(new Error("Unavailable")), () => { throw new Error("Sync failure"); }]) {
      expect(await loadPersonalModelState(read)).toEqual({ model: null, unavailable: true });
    }
  });
  it("keeps preparation distinct from explicit versioned consent, sending no key, price or claimed user identity", () => {
    expect(personalModelCommand("synthetic-workspace", "PREPARE")).toEqual({ workspaceId: "synthetic-workspace", action: "PREPARE" });
    const consent = personalModelCommand("synthetic-workspace", "CONSENT");
    expect(consent).toEqual({ workspaceId: "synthetic-workspace", action: "CONSENT", confirmation: "personal-model-consent-v1" });
    expect(Object.isFrozen(consent)).toBe(true);
    expect(personalModelCommand("synthetic-workspace", "DISCONNECT")).toEqual({ workspaceId: "synthetic-workspace" });
    expect(() => personalModelCommand("", "PREPARE")).toThrow();
  });
  it("requires exact acknowledgements and never pretends remote OpenRouter revocation", () => {
    expect(personalModelConsentSchema.safeParse({ consentGranted: true, executionAuthorized: false, consentVersion: "personal-model-consent-v1" }).success).toBe(true);
    expect(personalModelConsentSchema.safeParse({ consentGranted: true, executionAuthorized: true, consentVersion: "personal-model-consent-v1" }).success).toBe(false);
    expect(personalModelDisconnectedSchema.safeParse({ disconnected: true, providerGrantRevoked: true }).success).toBe(false);
    expect(personalModelDisconnectedSchema.safeParse({ disconnected: true, providerGrantRevoked: false }).success).toBe(true);
  });
  it("builds a closed one-attempt credential command without claiming provider verification", () => {
    const command = personalModelCredentialCommand("synthetic-workspace", "12345678-1234-4234-8234-123456789abc", "synthetic_key_12345678901234567890");
    expect(command).toEqual({ version: "personal-model-mobile-credential-v1", commandId: "12345678-1234-4234-8234-123456789abc",
      workspaceId: "synthetic-workspace", confirmation: "personal-model-credential-v1", apiKey: "synthetic_key_12345678901234567890" });
    expect(Object.isFrozen(command)).toBe(true);
    expect(() => personalModelCredentialCommand("synthetic-workspace", "not-a-uuid", "synthetic_key_12345678901234567890")).toThrow();
    expect(() => personalModelCredentialCommand("synthetic-workspace", "12345678-1234-4234-8234-123456789abc", "short")).toThrow();
    expect(personalModelCredentialResultSchema.safeParse({ commandId: command.commandId, credentialPrepared: true,
      providerVerified: false, executionAuthorized: false }).success).toBe(true);
    expect(personalModelCredentialResultSchema.safeParse({ commandId: command.commandId, credentialPrepared: true,
      providerVerified: true, executionAuthorized: false }).success).toBe(false);
  });
});
