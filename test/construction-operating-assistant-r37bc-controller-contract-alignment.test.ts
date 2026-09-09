import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { R37_CASES } from "@/lib/construction-operating-assistant-r37/cases";
import { evaluateR37Case } from "@/lib/construction-operating-assistant-r37/oracle";
import { buildCorrectedOpenRouterRequest } from "@/lib/construction-operating-assistant-r37bb/contracts";
import { R37BC_CASES } from "@/lib/construction-operating-assistant-r37bc/cases";
import { readSealedGitEvidence } from "./helpers/sealed-git-evidence";

const SEALED_REPORT_PATH = "specs/194-corrected-openrouter-retest/evidence/observed-provider-report.json";
const SEALED_REPORT_SHA256 = "0f94e15c69c32fc1ac7c2162ce0460ea93c6cc581864826d46879dd160ac5649";
const ORIGINAL_REPORT_PATH = "specs/192-openrouter-provider-sandbox/evidence/observed-provider-report.json";
const ORIGINAL_REPORT_SHA256 = "bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3";

describe("R37BC controller contract alignment", () => {
  it("allows the invoice-readiness decision to answer from supplied state", () => {
    expect(R37_CASES[0].allowedCapabilities).toEqual(["CLARIFY"]);
    expect(R37BC_CASES[0].caseVersion).toBe(2);
    expect(R37BC_CASES[0].allowedCapabilities).toContain("ANSWER_FROM_STATE");

    const result = evaluateR37Case(R37BC_CASES[0], {
      answer: "The extra is not ready to invoice because written approval and work proof are missing.",
      citedFactIds: ["F-101", "F-102", "F-103"],
      proposedCapability: "ANSWER_FROM_STATE",
      limitations: ["No external action was performed."],
    });

    expect(result).toEqual({ passed: true, inventedFactCount: 0, reasonCodes: [] });
  });

  it.each(R37BC_CASES)("shows the complete $caseId contract to the bounded controller", (observedCase) => {
    const request = buildCorrectedOpenRouterRequest("openai/gpt-5.4", observedCase);
    const visibleContract = JSON.parse(request.messages[1].content);

    expect(visibleContract.allowedCapabilities).toEqual(observedCase.allowedCapabilities);
    expect(visibleContract.expectedLimitations).toEqual(observedCase.expectedLimitations);
    expect(visibleContract).not.toHaveProperty("requiredAnswerTerms");
    expect(visibleContract).not.toHaveProperty("forbiddenAnswerTerms");
  });

  it("preserves the paid provider observation and its original REWORK adjudication", () => {
    const bytes = readSealedGitEvidence(SEALED_REPORT_PATH);
    const report = JSON.parse(bytes.toString("utf8"));

    expect(createHash("sha256").update(bytes).digest("hex")).toBe(SEALED_REPORT_SHA256);
    expect(report.verdict).toBe("REWORK");
    expect(report.observations[0].oracle.reasonCodes).toEqual([
      "R37_CAPABILITY_NOT_ALLOWED_FOR_CASE",
      "R37_REQUIRED_LIMITATION_MISSING",
    ]);

    const originalBytes = readSealedGitEvidence(ORIGINAL_REPORT_PATH);
    expect(createHash("sha256").update(originalBytes).digest("hex")).toBe(ORIGINAL_REPORT_SHA256);
    expect(JSON.parse(originalBytes.toString("utf8")).verdict).toBe("REWORK");
  });
});
