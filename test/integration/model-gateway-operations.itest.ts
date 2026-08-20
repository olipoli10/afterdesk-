import { describe, expect, it } from "vitest";
import {
  createGatewayFoundationFixture,
  createGatewaySpendHold,
} from "../support/model-gateway-db";
import {
  bindGatewayOperation,
  createGatewayAttempt,
  persistGatewayDecision,
  withModelGatewayTransaction,
} from "@/server/model-gateway/operations";

const fingerprint = (char: string) => `sha256:${char.repeat(64)}`;

describe("Model Gateway transactional repository primitives", () => {
  it("converges replay on one immutable operation, decision and attempt", async () => {
    const fixture = await createGatewayFoundationFixture();
    const hold = await createGatewaySpendHold({
      provider: "synthetic",
      operationKey: fixture.operationKey,
      attempt: 1,
    });

    const first = await withModelGatewayTransaction(async (tx) => {
      const operation = await bindGatewayOperation(tx, {
        aiOperationId: fixture.aiOperationId,
        tenantId: fixture.tenantId,
        operationType: "classification",
        requestFingerprint: fingerprint("1"),
        outputContractHash: fingerprint("2"),
        dataClass: "business_confidential",
        privacyRequirement: "zero_retention",
        policyVersionId: fixture.policyId,
        maxTotalCostMicros: 100_000n,
      });
      const decision = await persistGatewayDecision(tx, {
        gatewayOperationId: operation.id,
        attempt: 1,
        disposition: "route_authorized",
        routeProfileId: fixture.routeId,
        reasonClass: "initial_route",
        policyHash: fixture.policyHash,
        routeHash: fixture.routeHash,
        privacyEvidenceHash: fingerprint("3"),
        breakerGeneration: 0n,
        remainingCostMicros: 100_000n,
      });
      const attempt = await createGatewayAttempt(tx, {
        decisionId: decision.id,
        accountSpendHoldId: hold.id,
        requestEvidenceRef: fingerprint("4"),
      });
      return { operation, decision, attempt };
    });

    const replay = await withModelGatewayTransaction(async (tx) => {
      const operation = await bindGatewayOperation(tx, {
        aiOperationId: fixture.aiOperationId,
        tenantId: fixture.tenantId,
        operationType: "classification",
        requestFingerprint: fingerprint("1"),
        outputContractHash: fingerprint("2"),
        dataClass: "business_confidential",
        privacyRequirement: "zero_retention",
        policyVersionId: fixture.policyId,
        maxTotalCostMicros: 100_000n,
      });
      const decision = await persistGatewayDecision(tx, {
        gatewayOperationId: operation.id,
        attempt: 1,
        disposition: "route_authorized",
        routeProfileId: fixture.routeId,
        reasonClass: "initial_route",
        policyHash: fixture.policyHash,
        routeHash: fixture.routeHash,
        privacyEvidenceHash: fingerprint("3"),
        breakerGeneration: 0n,
        remainingCostMicros: 100_000n,
      });
      const attempt = await createGatewayAttempt(tx, {
        decisionId: decision.id,
        accountSpendHoldId: hold.id,
        requestEvidenceRef: fingerprint("4"),
      });
      return { operation, decision, attempt };
    });

    expect(replay.operation.id).toBe(first.operation.id);
    expect(replay.decision.id).toBe(first.decision.id);
    expect(replay.attempt.id).toBe(first.attempt.id);
  });

  it("fails closed when a replay changes an immutable binding", async () => {
    const fixture = await createGatewayFoundationFixture();
    const base = {
      aiOperationId: fixture.aiOperationId,
      tenantId: fixture.tenantId,
      operationType: "classification" as const,
      requestFingerprint: fingerprint("5"),
      outputContractHash: fingerprint("6"),
      dataClass: "business_confidential" as const,
      privacyRequirement: "zero_retention" as const,
      policyVersionId: fixture.policyId,
      maxTotalCostMicros: 100_000n,
    };
    await withModelGatewayTransaction((tx) => bindGatewayOperation(tx, base));
    await expect(
      withModelGatewayTransaction((tx) =>
        bindGatewayOperation(tx, { ...base, tenantId: "tenant:other" })
      )
    ).rejects.toThrow("GATEWAY_OPERATION_BINDING_CONFLICT");
  });
});
