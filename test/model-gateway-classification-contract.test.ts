import { describe, expect, it } from "vitest";
import { validateClassificationResponse } from "@/server/model-gateway/evidence";
import { CLASSIFICATION_BASELINE_OUTPUT } from "./fixtures/model-gateway/classification-baseline";

describe("certified classification output contract", () => {
  it("accepts the frozen classification shape and binds content-free evidence", () => {
    const result = validateClassificationResponse(CLASSIFICATION_BASELINE_OUTPUT);
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.value).toEqual(CLASSIFICATION_BASELINE_OUTPUT);
      expect(result.responseEvidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.responseEvidenceRef).not.toContain("supplier");
    }
  });

  it.each([
    ["malformed", "not-json-object"],
    ["semantically invalid", { ...CLASSIFICATION_BASELINE_OUTPUT, objective: "" }],
  ])("rejects %s provider output", (_name, response) => {
    expect(validateClassificationResponse(response)).toMatchObject({
      status: "invalid",
      failureClass: "malformed_provider_response",
    });
  });
});
