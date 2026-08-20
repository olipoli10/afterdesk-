import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const uid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const hash = () => `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`;

export type GatewayFoundationFixture = {
  aiOperationId: string;
  operationKey: string;
  tenantId: string;
  policyId: string;
  policyHash: string;
  routeId: string;
  routeHash: string;
};

export async function createGatewayFoundationFixture(): Promise<GatewayFoundationFixture> {
  const aiOperationId = uid("aiop");
  const operationKey = uid("classification");
  const tenantId = uid("tenant");
  const policyId = uid("policy");
  const policyKey = uid("policy_key");
  const policyHash = hash();
  const routeId = uid("route");
  const routeKey = uid("route_key");
  const routeHash = hash();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AiOperation" (id,purpose,"operationKey",status,attempts,"createdAt","updatedAt") VALUES ($1,'classification',$2,'reserved',0,now(),now())`,
    aiOperationId,
    operationKey
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'published','direct_provider','synthetic','synthetic','messages','synthetic-classifier',ARRAY['classification'],ARRAY['business_confidential'],'zero_retention',ARRAY['CA'],$3::jsonb,$4::jsonb,10000,4000,$5,'admin:test',now(),now())`,
    routeId,
    routeKey,
    JSON.stringify({ ref: "pricing:test", effectiveAt: "2026-08-19" }),
    JSON.stringify({ ref: "privacy:test", effectiveAt: "2026-08-19", expiresAt: "2027-08-19" }),
    routeHash
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'classification','published',$3::jsonb,'{}'::jsonb,1,100000,'zero_retention',$4,'admin:test',now(),now())`,
    policyId,
    policyKey,
    JSON.stringify([{ routeKey, version: 1 }]),
    policyHash
  );
  return { aiOperationId, operationKey, tenantId, policyId, policyHash, routeId, routeHash };
}

export async function createGatewaySpendHold(input: {
  provider: string;
  operationKey: string;
  attempt: number;
  amountMicros?: bigint;
}): Promise<{ id: string }> {
  const id = uid("hold");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AccountProviderSpendHold" (id,provider,"periodKey","operationKey",attempt,"amountMicros",status,"createdAt","updatedAt") VALUES ($1,$2,'2026-08-19',$3,$4,$5,'held',now(),now())`,
    id,
    input.provider,
    input.operationKey,
    input.attempt,
    input.amountMicros ?? 100_000n
  );
  return { id };
}
