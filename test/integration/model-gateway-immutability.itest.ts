import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

async function createLineage() {
  const aiOperationId = id("aiop");
  const policyId = id("policy");
  const routeId = id("route");
  const gatewayOperationId = id("gwop");
  const decisionId = id("decision");
  const holdId = id("hold");
  const routeKey = id("classification_synthetic");
  const policyKey = id("classification_policy");
  const routeHash = `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;
  const policyHash = `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;
  const decisionHash = `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AiOperation" (id, purpose, "operationKey", status, attempts, "createdAt", "updatedAt") VALUES ($1, 'classification', $2, 'reserved', 0, now(), now())`,
    aiOperationId,
    id("opkey")
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayRouteProfile" (id, "routeKey", version, status, "pathKind", "adapterKey", "billingProvider", "endpointKey", "modelKey", "operationTypes", "allowedDataClasses", "privacyPosture", residency, "pricingEvidence", "privacyEvidence", "maxInputTokens", "maxOutputTokens", "canonicalHash", "createdBy", "createdAt", "publishedAt") VALUES ($1,$2,1,'published','direct_provider','synthetic','synthetic','messages','synthetic-classifier',ARRAY['classification'],ARRAY['business_confidential'],'zero_retention',ARRAY['CA'],$3::jsonb,$4::jsonb,10000,4000,$5,'admin:test',now(),now())`,
    routeId,
    routeKey,
    JSON.stringify({ ref: "pricing:test", effectiveAt: "2026-08-19" }),
    JSON.stringify({ ref: "privacy:test", effectiveAt: "2026-08-19", expiresAt: "2027-08-19" }),
    routeHash
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayPolicyVersion" (id, "policyKey", version, "operationType", status, "routeOrder", "fallbackRules", "maxAttempts", "maxTotalCostMicros", "requiredPrivacyPosture", "canonicalHash", "createdBy", "createdAt", "publishedAt") VALUES ($1,$2,1,'classification','published',$3::jsonb,$4::jsonb,1,100000,'zero_retention',$5,'admin:test',now(),now())`,
    policyId,
    policyKey,
    JSON.stringify([{ routeKey, version: 1 }]),
    JSON.stringify({}),
    policyHash
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayOperation" (id,"aiOperationId","tenantId","operationType","requestFingerprint","outputContractHash","dataClass","privacyRequirement","policyVersionId","maxTotalCostMicros",status,"createdAt") VALUES ($1,$2,'tenant:test','classification',$3,$4,'business_confidential','zero_retention',$5,100000,'admitted',now())`,
    gatewayOperationId,
    aiOperationId,
    `sha256:${"c".repeat(64)}`,
    `sha256:${"d".repeat(64)}`,
    policyId
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayDecision" (id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint","decidedAt") VALUES ($1,$2,1,'route_authorized',$3,'initial_route',$4,$5,$6,0,100000,$7,now())`,
    decisionId,
    gatewayOperationId,
    routeId,
    policyHash,
    routeHash,
    `sha256:${"e".repeat(64)}`,
    decisionHash
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AccountProviderSpendHold" (id,provider,"periodKey","operationKey",attempt,"amountMicros",status,"createdAt","updatedAt") VALUES ($1,'synthetic','2026-08-19',$2,1,100000,'held',now(),now())`,
    holdId,
    id("spend")
  );
  return { aiOperationId, policyId, routeId, gatewayOperationId, decisionId, holdId };
}

describe("Model Gateway migration and historical invariants", () => {
  it("creates every foundation table", async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ModelGateway%' ORDER BY table_name`
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "ModelGatewayAttempt",
      "ModelGatewayBreaker",
      "ModelGatewayBreakerEvent",
      "ModelGatewayDecision",
      "ModelGatewayOperation",
      "ModelGatewayPolicyVersion",
      "ModelGatewayRouteProfile",
    ]);
  });

  it("refuses mutation of a published policy or route profile", async () => {
    const lineage = await createLineage();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ModelGatewayPolicyVersion" SET "maxAttempts"=2 WHERE id=$1`,
        lineage.policyId
      )
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ModelGatewayRouteProfile" SET "modelKey"='substituted' WHERE id=$1`,
        lineage.routeId
      )
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses historical rebinding and duplicate attempt ordinals", async () => {
    const lineage = await createLineage();
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ModelGatewayOperation" SET "tenantId"='other-tenant' WHERE id=$1`,
        lineage.gatewayOperationId
      )
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ModelGatewayDecision" (id,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros","decisionFingerprint","decidedAt") SELECT $1,"gatewayOperationId",attempt,disposition,"routeProfileId","reasonClass","policyHash","routeHash","privacyEvidenceHash","breakerGeneration","remainingCostMicros",$2,now() FROM "ModelGatewayDecision" WHERE id=$3`,
        id("duplicate"),
        `sha256:${"0".repeat(64)}`,
        lineage.decisionId
      )
    ).rejects.toThrow();
  });

  it("requires durable decision and unique spend-hold lineage for an attempt", async () => {
    const lineage = await createLineage();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","startedAt") VALUES ($1,$2,$3,'prepared','not_dispatched','not_evaluated',now())`,
        id("bad_attempt"),
        id("missing_decision"),
        lineage.holdId
      )
    ).rejects.toThrow();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","startedAt") VALUES ($1,$2,$3,'prepared','not_dispatched','not_evaluated',now())`,
      id("attempt"),
      lineage.decisionId,
      lineage.holdId
    );
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "ModelGatewayAttempt" (id,"decisionId","accountSpendHoldId",status,"dispatchState","resultContractStatus","startedAt") VALUES ($1,$2,$3,'prepared','not_dispatched','not_evaluated',now())`,
        id("duplicate_attempt"),
        lineage.decisionId,
        lineage.holdId
      )
    ).rejects.toThrow();
  });
});
