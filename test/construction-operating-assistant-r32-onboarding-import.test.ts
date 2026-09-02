import { describe, expect, it } from "vitest";
import {
  onboardingCockpitSchema,
  onboardingCommandSchema,
  rejectFieldOnboardingLeaks,
} from "@/lib/construction-operating-assistant-r32/contracts";
import { parseOnboardingImport } from "@/lib/construction-operating-assistant-r32/parser";

const bytes = (value: string) => Buffer.from(value, "utf8");

describe("R32 onboarding and bounded import", () => {
  it("parses a deterministic closed contact preview without retaining raw CSV", () => {
    const parsed = parseOnboardingImport({ kind: "CONTACTS_CSV", csvBytes: bytes("display_name,role,phone,email,project_code\nMarc,Fournisseur,+1 555 555 0184,MARC@EXAMPLE.INVALID,LAVAL-001\n") });
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ state: "READY", normalizedProposal: { displayName: "Marc", role: "Fournisseur", normalizedPhone: "+15555550184", normalizedEmail: "marc@example.invalid", projectCode: "LAVAL-001" } });
    expect(parsed.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(parsed.previewFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(parsed)).not.toContain("MARC@EXAMPLE.INVALID");
  });

  it("refuses unknown, repeated, missing and oversized CSV contracts", () => {
    expect(() => parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: bytes("code,name,secret\nLAVAL-001,Laval,x\n") })).toThrow("ONBOARDING_IMPORT_UNKNOWN_COLUMN");
    expect(() => parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: bytes("code,code,name\nA,A,Laval\n") })).toThrow();
    expect(() => parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: bytes("code,address\nA,Laval\n") })).toThrow("ONBOARDING_IMPORT_REQUIRED_COLUMN_MISSING");
    expect(() => parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: new Uint8Array(1_048_577) })).toThrow("ONBOARDING_IMPORT_TOO_LARGE");
  });

  it("bounds 500 rows and assigns closed invalid reasons", () => {
    const body = Array.from({ length: 500 }, (_, i) => `P-${i + 1},Projet ${i + 1}`).join("\n");
    expect(parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: bytes(`code,name\n${body}\n`) }).rows).toHaveLength(500);
    const tooMany = `${body}\nP-501,Projet 501\n`;
    expect(() => parseOnboardingImport({ kind: "PROJECTS_CSV", csvBytes: bytes(`code,name\n${tooMany}`) })).toThrow("ONBOARDING_IMPORT_ROW_LIMIT");
    const invalid = parseOnboardingImport({ kind: "CONTACTS_CSV", csvBytes: bytes("display_name,role,phone,email\nMarc,,x,not-an-email\n") }).rows[0];
    expect(invalid.state).toBe("INVALID");
    expect(invalid.reasonCodes).toEqual(["MISSING_REQUIRED_VALUE", "INVALID_PHONE", "INVALID_EMAIL"]);
  });

  it("keeps decisions exact and refuses arbitrary merge or match IDs", () => {
    const base = { schemaVersion: 1 as const, commandId: crypto.randomUUID(), workspaceId: "workspace-a", action: "DECIDE_IMPORT_ROW" as const, batchId: "batch-a", rowId: "row-a", expectedBatchVersion: 1 };
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "SKIP" }).success).toBe(true);
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "CREATE_NEW" }).success).toBe(true);
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "USE_EXISTING", matchedCanonicalId: "contact-a" }).success).toBe(true);
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "USE_EXISTING" }).success).toBe(false);
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "MERGE", matchedCanonicalId: "contact-a" }).success).toBe(false);
    expect(onboardingCommandSchema.safeParse({ ...base, decision: "SKIP", matchedCanonicalId: "contact-a" }).success).toBe(false);
  });

  it("exposes an independent minimal field projection", () => {
    const field = { schemaVersion: 1 as const, generatedAt: "2026-09-02T10:00:00.000Z", role: "FIELD_WORKER" as const, workspace: { id: "workspace-a", name: "Construction Laval" }, assignedProjects: [], nextAction: "WAIT_FOR_ASSIGNMENT", providerObserved: false as const, externalEffectCount: 0 as const };
    expect(onboardingCockpitSchema.parse(field)).toEqual(field);
    for (const leak of [{ contacts: [] }, { activeBatch: {} }, { normalizedPhone: "+15555550184" }, { rowCount: 10 }, { duplicateCandidates: [] }]) {
      expect(() => rejectFieldOnboardingLeaks(leak)).toThrow("ONBOARDING_FIELD_PROJECTION_LEAK_REFUSED");
    }
  });
});
