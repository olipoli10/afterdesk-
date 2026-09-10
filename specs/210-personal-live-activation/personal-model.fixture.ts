import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { enqueuePersonalSms } from "@/server/personal-assistant/sms-inbox";
import { PERSONAL_MODEL_AUTHORITY, type PersonalModelRateConfiguration } from "@/server/model-gateway/personal-intent/budget-policy";

// Fixtures have no external credibility: fake rate/privacy evidence is created
// ONLY after validating the disposable local database identity.
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function requirePersonalDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  const name = process.env.ENDVERA_210_DATABASE_NAME ?? "";
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(name) || url.pathname !== `/${name}`) {
    throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
  }
}

export async function personalModelFixture() {
  requirePersonalDisposableDatabase();
  const now = new Date();
  const user = await prisma.user.create({ data: { name: "Synthetic model owner", email: `model-wrapper-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  const workspaceId = (await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic model wrapper" })).workspaceId;
  const from = `+1500${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
  const identity = await prisma.constructionCommunicationIdentity.create({ data: { workspaceId, userId: user.id, channel: "sms", normalizedAddress: from, verified: true, permissions: ["COMMAND"], status: "active" } });
  const accountSid = `AC${randomUUID().replaceAll("-", "")}`;
  const sms = await prisma.constructionConnectorAccount.create({ data: {
    workspaceId, provider: "endvera_sms", createdByUserId: user.id, status: "connected", connectedAt: now,
    credentialRef: "synthetic-reference-not-a-secret", externalAccountKeyHash: hash(accountSid),
    grants: { create: { capability: "sms_inbound", status: "active", grantedAt: now, requestedScopes: ["sms_inbound"], grantedScopes: ["sms_inbound"] } },
  } });
  const body = "Qu’est-ce que j’ai demain?";
  const source = { accountSid, messageSid: `SM${randomUUID().replaceAll("-", "")}`, from, to: "+15005550006", body };
  const { operationId } = await enqueuePersonalSms({ ...source, contentHash: hash(JSON.stringify(source)) });
  const model = await prisma.constructionConnectorAccount.create({ data: {
    workspaceId, provider: "openrouter", createdByUserId: user.id, status: "connected", connectedAt: now,
    credentialRef: "synthetic-reference-never-resolved", externalAccountKeyHash: hash(`synthetic-model-${workspaceId}`),
    grants: { create: { capability: "personal_model_inference", status: "active", grantedAt: now,
      requestedScopes: ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`],
      grantedScopes: ["personal_data:inference", `authority:${PERSONAL_MODEL_AUTHORITY}`] } },
  }, include: { grants: true } });
  const rate: PersonalModelRateConfiguration = {
    authorityId: PERSONAL_MODEL_AUTHORITY, model: "synthetic/model", providerEndpoint: "synthetic-endpoint", reviewedAt: now.toISOString(),
    totalContextTokens: 32768, maxOutputTokens: 512, inputUsdMicrosPerMillionTokens: 1_000_000,
    outputUsdMicrosPerMillionTokens: 2_000_000, additionalUsdMicrosPerCall: 0, cadMicrosPerUsd: 1_500_000,
    headroomBasisPoints: 1000, ceilingCadMicros: 20_000_000, perCallCeilingCadMicros: 100_000,
  };
  const routeKey = "personal-intent-openrouter-candidate-v1";
  const routeVersion = Math.floor(Math.random() * 1_000_000_000) + 1;
  const privacy = {
    adapterKey: "openrouter-personal-intent-candidate", allowedDataClasses: ["personal_data"], billingProvider: "openrouter",
    certificationOwner: "SYNTHETIC_TEST_NOT_PROVIDER_CERTIFICATION", effectiveAt: now.toISOString(), endpointKey: rate.providerEndpoint,
    expiresAt: new Date(now.getTime() + 600_000).toISOString(), intermediary: "openrouter", modelKey: rate.model,
    operationTypes: ["personal_intent_candidate_v1"], pathKind: "gateway_mediated", privacyPosture: "zero_retention", residency: [], tenancyMode: "route_isolated",
  };
  const route = await prisma.modelGatewayRouteProfile.create({ data: {
    routeKey, version: routeVersion, status: "published", pathKind: privacy.pathKind, adapterKey: privacy.adapterKey,
    billingProvider: "openrouter", intermediary: "openrouter", endpointKey: rate.providerEndpoint, modelKey: rate.model,
    operationTypes: privacy.operationTypes, allowedDataClasses: privacy.allowedDataClasses, privacyPosture: "zero_retention", residency: [],
    privacyEvidence: privacy, pricingEvidence: { syntheticOnly: true }, maxInputTokens: rate.totalContextTokens, maxOutputTokens: rate.maxOutputTokens,
    canonicalHash: `sha256:${hash(randomUUID())}`, createdBy: "synthetic-test", publishedAt: now,
  } });
  const policy = await prisma.modelGatewayPolicyVersion.create({ data: {
    policyKey: "personal-intent-v1", version: Math.floor(Math.random() * 1_000_000_000), status: "published", operationType: "personal_intent_candidate_v1",
    routeOrder: [{ routeKey, version: routeVersion }], fallbackRules: [], maxAttempts: 1, maxTotalCostMicros: 1_000_000n,
    requiredPrivacyPosture: "zero_retention", canonicalHash: `sha256:${hash(randomUUID())}`, createdBy: "synthetic-test", publishedAt: now,
  } });
  return { now, userId: user.id, workspaceId, identityId: identity.id, smsAccountId: sms.id, modelAccountId: model.id, modelGrantId: model.grants[0].id,
    sourceOperationId: operationId, body, rate, policy, route,
    subject: { kind: "personal_assistant_operation" as const, workspaceId, operationId } };
}
