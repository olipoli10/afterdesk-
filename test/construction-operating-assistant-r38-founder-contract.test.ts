import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HUMAN_STATEMENT,
  humanObservationInputSchema,
  assertLoopbackHost,
  parseFounderObservationFormData,
  parseFounderStepFormData,
} from "@/server/construction-operating-assistant-r38/founder-test";

const root = process.cwd();
const fixture = JSON.parse(
  readFileSync(
    path.join(root, "specs/196-r38-founder-full-loop-preparation/fixtures/observation-contract.json"),
    "utf8",
  ),
);

describe("Construction Operating Assistant R38 observation contract", () => {
  it("freezes the one-session, server-measured, synthetic-only contract", () => {
    expect(fixture).toMatchObject({
      founderObservationSource: "REAL_HUMAN_SEAL",
      humanSealRequired: true,
      sealedObservationEditable: false,
      maximumFounderSessions: 1,
      founderTokenSingleUse: true,
      loopbackOnly: true,
      testRouteEnabledByDefault: false,
      technicalMetricsSource: "POSTGRESQL_SERVER",
      materialPolicy: "SYNTHETIC_ONLY",
      externalProviderInvocationLimit: 0,
    });
    expect(HUMAN_STATEMENT).toBe("OLIVIER_COMPLETED_THIS_LOCAL_SESSION_AND_THE_RATINGS_ARE_HIS_OWN");
  });

  it("accepts only founder judgments and rejects unknown or technical client fields", () => {
    const valid = {
      founderCorrectionCount: "0",
      manualContextRestatementCount: "0",
      missingEvidenceClarityRating: "4",
      contradictionClarityRating: "4",
      nextActorClarityRating: "4",
      actionabilityRating: "4",
      confidenceBeforeInvoicingRating: "4",
      wouldUseBeforeInvoicing: "yes",
      economicValueExplanation: "Évite de facturer sans preuve.",
      activeVisibleMilliseconds: "1000",
      hiddenOrInactiveMilliseconds: "0",
      humanConfirmation: "confirmed",
    };
    expect(humanObservationInputSchema.safeParse(valid).success).toBe(true);
    expect(humanObservationInputSchema.safeParse({ ...valid, canonicalOpenLoopCount: "1" }).success).toBe(false);
    expect(humanObservationInputSchema.safeParse({ ...valid, unknown: "x" }).success).toBe(false);
  });

  it("ignores React server-action metadata while keeping only R38 fields", () => {
    const step = new FormData();
    step.set("action", "START");
    step.set("$ACTION_REF_1", "framework-only");
    expect(parseFounderStepFormData(step)).toEqual({ action: "START" });

    const observation = new FormData();
    for (const [key, value] of Object.entries({
      founderCorrectionCount: "0",
      manualContextRestatementCount: "0",
      missingEvidenceClarityRating: "4",
      contradictionClarityRating: "4",
      nextActorClarityRating: "4",
      actionabilityRating: "4",
      confidenceBeforeInvoicingRating: "4",
      wouldUseBeforeInvoicing: "yes",
      economicValueExplanation: "Évite une facture sans preuve.",
      activeVisibleMilliseconds: "1000",
      hiddenOrInactiveMilliseconds: "0",
      humanConfirmation: "confirmed",
      "$ACTION_KEY": "framework-only",
    })) observation.set(key, value);
    expect(parseFounderObservationFormData(observation)).toMatchObject({
      founderCorrectionCount: 0,
      wouldUseBeforeInvoicing: true,
      humanConfirmation: "confirmed",
    });
  });

  it("accepts only loopback hosts", () => {
    expect(() => assertLoopbackHost("127.0.0.1:3011")).not.toThrow();
    expect(() => assertLoopbackHost("localhost:3011")).not.toThrow();
    expect(() => assertLoopbackHost("example.com")).toThrow("COA_R1_NON_LOOPBACK_REFUSED");
  });

  it("keeps the route disabled by default and human sealing gated", () => {
    const service = readFileSync(
      path.join(root, "src/server/construction-operating-assistant-r38/founder-test.ts"),
      "utf8",
    );
    expect(service).toContain('ENDVERA_R38_FOUNDER_TEST_MODE !== "ENABLED"');
    expect(service).toContain('ENDVERA_R38_HUMAN_OBSERVATION !== "OLIVIER_PRESENT"');
    expect(service).toContain("COA_R1_SECOND_FOUNDER_SESSION_REFUSED");
    expect(service).toContain("flag: \"wx\"");
  });
});
