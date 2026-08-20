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
  fallbackRouteId?: string;
};

export async function createGatewayFoundationFixture(input?: {
  fallback?: { errorClass: string; secondRoute: true };
  maxAttempts?: number;
  maxTotalCostMicros?: bigint;
}): Promise<GatewayFoundationFixture> {
  const aiOperationId = uid("aiop");
  const operationKey = uid("classification");
  const tenantId = uid("tenant");
  const policyId = uid("policy");
  const policyKey = uid("policy_key");
  const policyHash = hash();
  const routeId = uid("route");
  const routeKey = uid("route_key");
  const routeHash = hash();
  const fallbackRouteId = input?.fallback?.secondRoute ? uid("route") : undefined;
  const fallbackRouteKey = input?.fallback?.secondRoute ? uid("route_key") : undefined;
  const fallbackRouteHash = input?.fallback?.secondRoute ? hash() : undefined;
  const maxAttempts = input?.maxAttempts ?? 1;
  const maxTotalCostMicros = input?.maxTotalCostMicros ?? 100_000n;

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
  if (fallbackRouteId && fallbackRouteKey && fallbackRouteHash) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ModelGatewayRouteProfile" (id,"routeKey",version,status,"pathKind","adapterKey","billingProvider","endpointKey","modelKey","operationTypes","allowedDataClasses","privacyPosture",residency,"pricingEvidence","privacyEvidence","maxInputTokens","maxOutputTokens","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'published','direct_provider','synthetic','synthetic','messages','synthetic-fallback',ARRAY['classification'],ARRAY['business_confidential'],'zero_retention',ARRAY['CA'],$3::jsonb,$4::jsonb,10000,4000,$5,'admin:test',now(),now())`,
      fallbackRouteId,
      fallbackRouteKey,
      JSON.stringify({ ref: "pricing:fallback", effectiveAt: "2026-08-19" }),
      JSON.stringify({ ref: "privacy:fallback", effectiveAt: "2026-08-19", expiresAt: "2027-08-19" }),
      fallbackRouteHash
    );
  }
  const routeOrder = [{ routeKey, version: 1 }];
  if (fallbackRouteKey) routeOrder.push({ routeKey: fallbackRouteKey, version: 1 });
  const fallbackRules = fallbackRouteKey && input?.fallback
    ? [{ from: { routeKey, version: 1 }, errorClass: input.fallback.errorClass, to: { routeKey: fallbackRouteKey, version: 1 } }]
    : [];
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ModelGatewayPolicyVersion" (id,"policyKey",version,"operationType",status,"routeOrder","fallbackRules","maxAttempts","maxTotalCostMicros","requiredPrivacyPosture","canonicalHash","createdBy","createdAt","publishedAt") VALUES ($1,$2,1,'classification','published',$3::jsonb,$4::jsonb,$5,$6,'zero_retention',$7,'admin:test',now(),now())`,
    policyId,
    policyKey,
    JSON.stringify(routeOrder),
    JSON.stringify(fallbackRules),
    maxAttempts,
    maxTotalCostMicros,
    policyHash
  );
  return { aiOperationId, operationKey, tenantId, policyId, policyHash, routeId, routeHash, fallbackRouteId };
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
