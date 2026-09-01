import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { founderAnswersSchema, FOUNDER_RETEST_STEPS, R3_MESSAGES } from "../src/components/construction-assistant-v1/founder-retest/contract";
import { interpretConstructionMessage } from "../src/lib/construction-assistant-v1/interpreter";
import { validateRetestContract } from "../specs/079-construction-assistant-v1-r3-corrected-founder-retest/scripts/retest-contract";

const root = process.cwd();

describe("Construction Assistant V1 R3 founder retest contract", () => {
  it("accepts the frozen closed contract", () => {
    const value = JSON.parse(readFileSync(path.join(root, "specs/079-construction-assistant-v1-r3-corrected-founder-retest/fixtures/retest-contract.json"), "utf8"));
    expect(validateRetestContract(value)).toEqual(value);
  });

  it("keeps exactly nine sequential founder steps and the exact messages", () => {
    expect(FOUNDER_RETEST_STEPS.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(FOUNDER_RETEST_STEPS[0].message).toBe(R3_MESSAGES.clearAppointment);
    expect(FOUNDER_RETEST_STEPS[3].message).toBe(R3_MESSAGES.inbound);
    expect(FOUNDER_RETEST_STEPS[5].message).toBe(R3_MESSAGES.outbound);
  });

  it("rejects unknown founder fields and cannot accept technical success", () => {
    const base = {
      clarificationUnderstandabilityRating: 5,
      approvalComprehensionRating: 5,
      actionabilityRating: 5,
      founderCorrectionCount: 0,
      nextDecisionIdentified: "yes",
      manualContextRestatementCount: 0,
      comment: "",
    };
    expect(founderAnswersSchema.safeParse(base).success).toBe(true);
    expect(founderAnswersSchema.safeParse({ ...base, technicalPass: true }).success).toBe(false);
  });

  it("keeps the route, action and component explicitly temporary and local-only", () => {
    const page = readFileSync(path.join(root, "src/app/client/construction-retest/page.tsx"), "utf8");
    const action = readFileSync(path.join(root, "src/server/actions/construction-assistant-v1-r3-retest.ts"), "utf8");
    expect(page).toContain('process.env.NODE_ENV === "production"');
    expect(page).toContain('ENDVERA_R3_FOUNDER_RETEST !== "ENABLED"');
    expect(action).toContain('requireRole("CLIENT")');
    expect(action).toContain("R3_DATABASE_NOT_DISPOSABLE_LOCAL");
    expect(action).not.toMatch(/fetch\(|axios|twilio/i);
  });

  it("does not add a stateless or ChatGPT comparative control", () => {
    const feature = readFileSync(path.join(root, "specs/079-construction-assistant-v1-r3-corrected-founder-retest/spec.md"), "utf8");
    expect(feature).toContain("No stateless or live ChatGPT comparison");
    expect(feature).not.toContain("observableAdvantageRating");
  });

  it("files the exact non-consequential Laval update without inventing an action", () => {
    const result = interpretConstructionMessage(R3_MESSAGES.inbound, {
      referenceNow: "2026-08-31T13:00:00.000Z",
      locale: "fr-CA",
      timezone: "America/Toronto",
      projects: [{ id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" }],
      contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
    });
    expect(result).toMatchObject({ intent: "UNSUPPORTED", projectId: "project-laval" });
    expect(result.outboundDraft).toBeNull();
    expect(result.clarification?.reason).toBe("UNSUPPORTED_REQUEST");
  });
});
