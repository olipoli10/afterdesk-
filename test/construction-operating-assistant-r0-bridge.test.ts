import { describe, expect, it } from "vitest";
import { interpretConstructionMessage } from "../src/lib/construction-assistant-v1/interpreter";

const context = {
  referenceNow: "2026-09-01T13:00:00.000Z",
  locale: "fr-CA" as const,
  timezone: "America/Toronto",
  projects: [
    { id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" },
    { id: "project-longueuil", code: "LONG-001", name: "Cuisine Longueuil" },
  ],
  contacts: [],
};

describe("Construction Operating Assistant R0 conversation bridge", () => {
  it("proposes a typed work-finished command for one exact project", () => {
    const result = interpretConstructionMessage(
      "Travail terminé pour l'extra électrique de Rénovation Laval, 1 200 $. Le client dit que c'est approuvé.",
      context,
    );

    expect(result).toMatchObject({
      intent: "REPORT_WORK_FINISHED",
      projectId: "project-laval",
      openLoopDraft: {
        billingBasis: "CHANGE_ORDER",
        amountMinor: 120000,
        currency: "CAD",
        completion: true,
        approvalState: "APPROVED",
      },
    });
    expect(result.openLoopDraft?.workDescription).toContain("extra électrique");
    expect(result.openLoopDraft).not.toHaveProperty("verificationState");
  });

  it("keeps an absent amount and approval explicitly unknown", () => {
    const result = interpretConstructionMessage(
      "Travail terminé pour l'extra de Rénovation Laval.",
      context,
    );

    expect(result.openLoopDraft).toMatchObject({
      amountMinor: null,
      completion: true,
      approvalState: "UNKNOWN",
    });
  });

  it("requires clarification before any consequential write when the project is absent", () => {
    const result = interpretConstructionMessage("Travail terminé pour l'extra électrique, 1 200 $.", context);

    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification).toMatchObject({ reason: "PROJECT_NOT_FOUND" });
    expect(result.openLoopDraft).toBeNull();
  });

  it("does not coerce an ambiguous comma amount into canonical money", () => {
    const result = interpretConstructionMessage(
      "Travail terminé pour l'extra de Rénovation Laval, montant 1,200 $.",
      context,
    );

    expect(result.intent).toBe("REPORT_WORK_FINISHED");
    expect(result.openLoopDraft?.amountMinor).toBeNull();
  });
});
