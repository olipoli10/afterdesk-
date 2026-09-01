import { describe, expect, it } from "vitest";
import {
  acceptedConstructionHumanEvidenceResultSchema,
  compileConstructionHumanContract,
  requestConstructionHumanEscalationSchema,
} from "@/lib/construction-operating-assistant-r5/contracts";

describe("Construction Operating Assistant R5 human escalation contracts", () => {
  const request = {
    schemaVersion: 1 as const,
    requestId: "request-1",
    idempotencyKey: "escalation-1",
    actorId: "owner-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    openLoopId: "loop-1",
    expectedStateVersion: 3,
    purpose: "OBTAIN_MISSING_EVIDENCE" as const,
    evidenceKind: "PHOTO" as const,
    acceptedClientPriceCents: 5_000,
    acceptedWorkerPayoutCents: 2_500,
    acceptedEstimatedMinutes: 30,
    acceptedCurrency: "CAD" as const,
  };

  it("accepts only the closed local evidence escalation request", () => {
    expect(requestConstructionHumanEscalationSchema.parse(request)).toEqual(
      request,
    );
    expect(() =>
      requestConstructionHumanEscalationSchema.parse({
        ...request,
        purpose: "CALL_CLIENT",
      }),
    ).toThrow();
    expect(() =>
      requestConstructionHumanEscalationSchema.parse({
        ...request,
        acceptedClientPriceCents: 2_000,
      }),
    ).toThrow();
    expect(() =>
      requestConstructionHumanEscalationSchema.parse({
        ...request,
        rawPhone: "+15145550184",
      }),
    ).toThrow();
  });

  it("compiles a minimum worker contract with no financial or identity field", () => {
    const contract = compileConstructionHumanContract({
      projectCode: "LAVAL-001",
      evidenceKind: "PHOTO",
    });
    const serialized = JSON.stringify(contract).toLowerCase();

    expect(contract.requiredArtifactKinds).toEqual(["photo"]);
    expect(contract.outputSchema.required).toEqual(["summary"]);
    expect(serialized).not.toContain("1200");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("client");
    expect(serialized).not.toContain("payout");
    expect(serialized).not.toContain("credential");
  });

  it("treats structured conformance as a narrow shape check", () => {
    expect(
      acceptedConstructionHumanEvidenceResultSchema.parse({
        summary: "Photo shows completed work.",
      }),
    ).toEqual({ summary: "Photo shows completed work." });
    expect(() =>
      acceptedConstructionHumanEvidenceResultSchema.parse({
        summary: "Photo shows completed work.",
        approved: true,
      }),
    ).toThrow();
  });
});
