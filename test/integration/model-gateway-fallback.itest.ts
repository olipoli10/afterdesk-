import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { authorizeGatewayFallback } from "@/server/model-gateway/operations";
import { admitGatewayClassification } from "@/server/model-gateway/operations";
import { CLASSIFICATION_BASELINE_INPUT } from "../fixtures/model-gateway/classification-baseline";
import { createGatewayFoundationFixture } from "../support/model-gateway-db";

describe("Model Gateway fallback concurrency and ceiling", () => {
  it("creates only one separately reserved fallback and never exceeds the logical ceiling", async () => {
    const fixture = await createGatewayFoundationFixture({ fallback: { errorClass: "rate_limit", secondRoute: true }, maxAttempts: 2 });
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId, logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId, taskId: "task-fixture", policyId: fixture.policyId,
      dataClass: "business_confidential", privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT, maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    await prisma.accountProviderSpendHold.update({ where: { id: admission.attempt.accountSpendHoldId }, data: { status: "settled", settledMicros: 1_000n } });
    await prisma.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='failed',"dispatchState"='settled',"errorClass"='rate_limit',"finishedAt"=now() WHERE id=$1`, admission.attempt.id);
    const [first, second] = await Promise.all([
      authorizeGatewayFallback({ admission, errorClass: "rate_limit" }),
      authorizeGatewayFallback({ admission, errorClass: "rate_limit" }),
    ]);
    expect([first.status, second.status].filter((status) => status === "authorized")).toHaveLength(1);
    const holds = await prisma.accountProviderSpendHold.findMany({ where: { operationKey: fixture.operationKey } });
    const exposure = holds.reduce((sum, hold) => sum + (hold.status === "settled" ? (hold.settledMicros ?? 0n) : hold.status === "held" ? hold.amountMicros : 0n), 0n);
    expect(exposure).toBeLessThanOrEqual(100_000n);
  });
});
