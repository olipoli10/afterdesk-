import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const shared = {
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
  ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority-ref",
  ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner-ref",
};

describe("ENDVERA backend external capability activation gate", () => {
  it("refuses credential presence without explicit transport, capability, authority and owner evidence", () => {
    const decision = externalCapabilityDecision("AI", { ANTHROPIC_API_KEY: "synthetic", AI_MODEL: "synthetic-model" });
    expect(decision.enabled).toBe(false);
    expect(decision.missingRequirements).toEqual(["GLOBAL_TRANSPORT_ENABLED", "AUTHORITY_REFERENCE", "OWNER_REFERENCE", "CAPABILITY_ENABLED"]);
  });

  it("requires exact enabled tokens and returns requirement names only", () => {
    const decision = externalCapabilityDecision("EMAIL", {
      ...shared,
      ENDVERA_EMAIL_PROVIDER_ENABLED: "true",
      RESEND_API_KEY: "must-not-leak",
      EMAIL_FROM: "synthetic@example.invalid",
    });
    expect(decision).toEqual({ capability: "EMAIL", enabled: false, missingRequirements: ["CAPABILITY_ENABLED"] });
    expect(JSON.stringify(decision)).not.toContain("must-not-leak");
  });

  it("enables only a fully satisfied synthetic presence map", () => {
    expect(externalCapabilityDecision("GOOGLE_OAUTH", {
      ...shared,
      ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED",
      GOOGLE_CLIENT_ID: "synthetic-id",
      GOOGLE_CLIENT_SECRET: "synthetic-secret",
    })).toEqual({ capability: "GOOGLE_OAUTH", enabled: true, missingRequirements: [] });
  });

  it("routes historical AI, email and Google entry points through the shared gate", () => {
    expect(read("src/lib/ai.ts")).toContain('isExternalCapabilityEnabled("AI")');
    expect(read("src/lib/email.ts")).toContain('isExternalCapabilityEnabled("EMAIL")');
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain('isExternalCapabilityEnabled("GOOGLE_OAUTH")');
    expect(auth).toContain('isExternalCapabilityEnabled("EMAIL")');
  });

  it("records value-free activation names in the production contract", () => {
    const contract = JSON.parse(read("release/endvera-construction-v1/environment-contract-v3.json"));
    const names = contract.variables.map((variable: { name: string }) => variable.name);
    expect(names).toEqual(expect.arrayContaining(["ENDVERA_EXTERNAL_TRANSPORT_ENABLED", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_EXTERNAL_OWNER_REF", "ENDVERA_AI_PROVIDER_ENABLED", "ENDVERA_EMAIL_PROVIDER_ENABLED", "ENDVERA_GOOGLE_OAUTH_ENABLED"]));
    expect(contract.secretValuesSerializable).toBe(false);
    expect(contract.externalReleaseAuthorized).toBe(false);
  });
});
