import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createSyntheticAdapter } from "@/server/model-gateway/adapters/synthetic";
import { dispatchGatewayAttempt } from "@/server/model-gateway/dispatch";
import { admitGatewayClassification } from "@/server/model-gateway/operations";
import { CLASSIFICATION_BASELINE_INPUT } from "../fixtures/model-gateway/classification-baseline";
import { createGatewayFoundationFixture } from "../support/model-gateway-db";

describe("Model Gateway spend state", () => {
  it("releases a hold only for conclusive non-dispatch", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId, logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId, taskId: "task-fixture", policyId: fixture.policyId,
      dataClass: "business_confidential", privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT, maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    const adapter = createSyntheticAdapter({
      endpointKey: "different-endpoint", modelKey: "synthetic-classifier",
      transport: async () => { throw new Error("transport must not be called"); },
    });
    await dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal });
    await expect(prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).resolves.toMatchObject({ status: "released", settledMicros: 0n });
  });

  it("retains the full reservation when dispatch outcome is unknown", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId, logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId, taskId: "task-fixture", policyId: fixture.policyId,
      dataClass: "business_confidential", privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT, maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages", modelKey: "synthetic-classifier",
      transport: async () => { throw new Error("connection dropped"); },
    });
    await dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal });
    await expect(prisma.accountProviderSpendHold.findUniqueOrThrow({ where: { id: admission.attempt.accountSpendHoldId } })).resolves.toMatchObject({ status: "held", settledMicros: null });
  });

  it("never invokes transport after its unique hold is no longer held", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId, logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId, taskId: "task-fixture", policyId: fixture.policyId,
      dataClass: "business_confidential", privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT, maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    await prisma.accountProviderSpendHold.update({ where: { id: admission.attempt.accountSpendHoldId }, data: { status: "released", settledMicros: 0n } });
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages", modelKey: "synthetic-classifier",
      transport: async () => { calls += 1; return { response: {}, inputTokens: 1, outputTokens: 1 }; },
    });
    await expect(dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal }))
      .resolves.toEqual({ status: "refused", reasonClass: "ineligible_route" });
    expect(calls).toBe(0);
  });
});
