import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { admitGatewayClassification } from "@/server/model-gateway/operations";
import { dispatchGatewayAttempt } from "@/server/model-gateway/dispatch";
import { createSyntheticAdapter } from "@/server/model-gateway/adapters/synthetic";
import { createGatewayFoundationFixture } from "../support/model-gateway-db";
import { CLASSIFICATION_BASELINE_INPUT, CLASSIFICATION_BASELINE_OUTPUT } from "../fixtures/model-gateway/classification-baseline";

describe("Model Gateway classification admission", () => {
  it("persists the decision and spend hold before the first dispatch and converges replay", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;

    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        const before = await prisma.$queryRawUnsafe<Array<{ decisions: bigint; holds: bigint }>>(
          `SELECT (SELECT count(*) FROM "ModelGatewayDecision" WHERE id=$1)::bigint decisions, (SELECT count(*) FROM "AccountProviderSpendHold" WHERE id=$2 AND status='held')::bigint holds`,
          admission.decision.id,
          admission.attempt.accountSpendHoldId
        );
        expect(before[0]).toEqual({ decisions: 1n, holds: 1n });
        return { response: CLASSIFICATION_BASELINE_OUTPUT, inputTokens: 100, outputTokens: 50 };
      },
    });
    const first = await dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal });
    expect(first.status).toBe("succeeded");
    expect(calls).toBe(1);

    const replayAdmission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(replayAdmission.status).toBe("replay");
    expect(calls).toBe(1);
  });

  it("durably refuses an ineligible known policy with zero attempt and zero dispatch", async () => {
    const fixture = await createGatewayFoundationFixture();
    await prisma.$executeRawUnsafe(`UPDATE "ModelGatewayRouteProfile" SET status='retired', "retiredAt"=now() WHERE id=$1`, fixture.routeId);
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(admission).toMatchObject({ status: "refused", reasonClass: "ineligible_route" });
    expect(
      await prisma.$queryRawUnsafe(
        `SELECT a.id FROM "ModelGatewayAttempt" a JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId" WHERE o."aiOperationId"=$1`,
        fixture.aiOperationId
      )
    ).toHaveLength(0);
  });

  it("rechecks exact route eligibility immediately before dispatch", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    await prisma.$executeRawUnsafe(
      `UPDATE "ModelGatewayRouteProfile" SET status='retired',"retiredAt"=now() WHERE id=$1`,
      fixture.routeId
    );
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        return { response: CLASSIFICATION_BASELINE_OUTPUT, inputTokens: 1, outputTokens: 1 };
      },
    });
    await expect(
      dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal })
    ).resolves.toEqual({ status: "refused", reasonClass: "ineligible_route" });
    expect(calls).toBe(0);
    const hold = await prisma.accountProviderSpendHold.findUniqueOrThrow({
      where: { id: admission.attempt.accountSpendHoldId },
      select: { status: true },
    });
    expect(hold.status).toBe("released");
  });

  it("binds malformed output to terminal invalid evidence", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => ({ response: { objective: "" }, inputTokens: 2, outputTokens: 1 }),
    });
    const result = await dispatchGatewayAttempt({
      admission,
      adapter,
      abortSignal: new AbortController().signal,
    });
    expect(result).toEqual({ status: "failed", failureClass: "malformed_provider_response" });
    const [attempt] = await prisma.$queryRawUnsafe<Array<{
      status: string;
      resultContractStatus: string;
      responseEvidenceRef: string | null;
    }>>(
      `SELECT status,"resultContractStatus","responseEvidenceRef" FROM "ModelGatewayAttempt" WHERE id=$1`,
      admission.attempt.id
    );
    expect(attempt).toMatchObject({ status: "failed", resultContractStatus: "invalid" });
    expect(attempt.responseEvidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("checks the authoritative AiOperation fence before any dispatch", async () => {
    const fixture = await createGatewayFoundationFixture();
    const admission = await admitGatewayClassification({
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential",
      privacyRequirement: "zero_retention",
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    });
    expect(admission.status).toBe("authorized");
    if (admission.status !== "authorized") return;
    await prisma.aiOperation.update({
      where: { id: fixture.aiOperationId },
      data: { lockedBy: "successor-fence-token" },
    });
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        return { response: CLASSIFICATION_BASELINE_OUTPUT, inputTokens: 1, outputTokens: 1 };
      },
    });
    await expect(
      dispatchGatewayAttempt({ admission, adapter, abortSignal: new AbortController().signal })
    ).rejects.toThrow("reclaimed by another invocation");
    expect(calls).toBe(0);
  });

  it("allows only one claimant to create the admitted attempt under concurrency", async () => {
    const fixture = await createGatewayFoundationFixture();
    const request = {
      aiOperationId: fixture.aiOperationId,
      logicalOperationKey: fixture.operationKey,
      tenantId: fixture.tenantId,
      taskId: "task-fixture",
      policyId: fixture.policyId,
      dataClass: "business_confidential" as const,
      privacyRequirement: "zero_retention" as const,
      input: CLASSIFICATION_BASELINE_INPUT,
      maxTotalCostMicros: 100_000n,
    };
    const results = await Promise.all([
      admitGatewayClassification(request),
      admitGatewayClassification(request),
    ]);
    expect(results.filter((result) => result.status === "authorized")).toHaveLength(1);
    expect(results.filter((result) => result.status === "busy")).toHaveLength(1);
    const [counts] = await prisma.$queryRawUnsafe<Array<{
      decisions: bigint;
      attempts: bigint;
      holds: bigint;
    }>>(
      `SELECT (SELECT count(*) FROM "ModelGatewayDecision" d JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId" WHERE o."aiOperationId"=$1)::bigint decisions,(SELECT count(*) FROM "ModelGatewayAttempt" a JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" JOIN "ModelGatewayOperation" o ON o.id=d."gatewayOperationId" WHERE o."aiOperationId"=$1)::bigint attempts,(SELECT count(*) FROM "AccountProviderSpendHold" WHERE "operationKey"=$2)::bigint holds`,
      fixture.aiOperationId,
      fixture.operationKey
    );
    expect(counts).toEqual({ decisions: 1n, attempts: 1n, holds: 1n });
  });
});
