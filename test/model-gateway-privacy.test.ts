import { describe, expect, it } from "vitest";
import {
  buildClassificationGatewayRequest,
  minimumClassificationProjection,
} from "@/server/model-gateway/privacy";
import { CLASSIFICATION_BASELINE_INPUT } from "./fixtures/model-gateway/classification-baseline";

describe("classification minimum projection", () => {
  it("copies only the frozen classifier fields and freezes the request", () => {
    const projection = minimumClassificationProjection(CLASSIFICATION_BASELINE_INPUT);
    expect(Object.keys(projection).sort()).toEqual([
      "attachmentLines",
      "categories",
      "description",
      "quantity",
      "title",
    ]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.categories[0])).toBe(true);
    expect(
      minimumClassificationProjection({
        ...CLASSIFICATION_BASELINE_INPUT,
        categories: [{ slug: "general", name: "General", disputeCriteria: null }],
      }).categories[0].disputeCriteria
    ).toBeNull();
    const built = buildClassificationGatewayRequest({
      logicalOperationKey: "engine:task:initial:classify",
      tenantId: "tenant",
      taskId: "task",
      policyKey: "classification-v1",
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      maxTotalCostMicros: 100_000n,
      source: CLASSIFICATION_BASELINE_INPUT,
    });
    expect(Object.isFrozen(built.request)).toBe(true);
    expect(built.request.requestFingerprint).toMatch(/^sha256:/);
  });

  it("refuses an unexpected source field instead of leaking it", () => {
    expect(() =>
      minimumClassificationProjection({
        ...CLASSIFICATION_BASELINE_INPUT,
        secret: "must-not-cross-boundary",
      } as never)
    ).toThrow("CLASSIFICATION_INPUT_CONTAINS_UNAUTHORIZED_FIELDS");
  });
});
