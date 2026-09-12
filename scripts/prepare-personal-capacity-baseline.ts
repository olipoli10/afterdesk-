import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { preparePersonalModelOperatorArtifact } from "@/server/model-gateway/personal-intent/operator-preparation";
import { inspectPersonalModelIngressConfiguration } from "@/server/model-gateway/personal-intent/operator-ingress-contract";

const sha = (value: string) => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
const byteSha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const now = new Date();
const end = new Date(now.getTime() + 14 * 60_000);
const reviewedAt = now.toISOString();
const pilotExpiresAt = "2026-10-10T01:18:26Z";
const authorityId = "ENDVERA-PERSONAL-20260910-100CAD";
const workspaceId = "cmtrm2ljb0003i5ucritxdsy4";
const ownerUserId = "cmtrm2l2t0000i5ucbyzqyf0z";
const reviewerRef = "OLIVIER_AUTHORIZED_LIVE_ACTIVATION_20260912";
const residency = ["US", "IE"];
const document = (reviewRef: string, evidence: unknown) => ({
  reviewRef,
  contentHash: sha(JSON.stringify(evidence)),
});
const rates = document("OPENROUTER_LUNA_RATES_20260911", {
  source: "https://openrouter.ai/openai/gpt-5.6-luna-20260709",
  model: "openai/gpt-5.6-luna",
  inputUsdPerMillionTokens: 0.2,
  outputUsdPerMillionTokens: 1.2,
  reviewedAt,
});
const fxAndFees = document("BANK_OF_CANADA_USDCAD_20260910", {
  source: "https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/",
  usdCad: 1.3822,
  additionalUsdMicrosPerCall: 0,
  headroomBasisPoints: 1000,
  reviewedAt,
});
const privacy = document("OPENROUTER_ZDR_PROVIDER_ROUTING_20260911", {
  sources: [
    "https://openrouter.ai/docs/features/zdr",
    "https://openrouter.ai/docs/guides/routing/provider-selection",
    "https://openrouter.ai/docs/api/api-reference/providers/list-providers",
  ],
  providerEndpoint: "azure",
  dataCollection: "deny",
  zdr: true,
  residency,
  reviewedAt,
});
const totalEnvelope = document("ENDVERA_PERSONAL_100CAD_ENVELOPE_20260911", {
  authorityId,
  modelCeilingCadMicros: 20_000_000,
  nonModelExposureCeilingCadMicros: 80_000_000,
  totalCeilingCadMicros: 100_000_000,
  reviewedAt,
});
const compatibility = document("OPENROUTER_LUNA_STRUCTURED_OUTPUT_REVIEW_20260911", {
  sources: [
    "https://openrouter.ai/openai/gpt-5.6-luna-20260709",
    "https://openrouter.ai/docs/guides/features/structured-outputs",
  ],
  model: "openai/gpt-5.6-luna",
  structuredOutputs: true,
  tools: true,
  reviewedAt,
});
const promptAndOutputContract = document("ENDVERA_PERSONAL_ANSWER_CONTRACT_677B28B4", {
  sourceHead: head,
  routeKey: "personal-answer-openrouter-v1",
  promptVersion: "personal-answer-system-v1",
  reviewedAt,
});

const privacyEvidence = (adapterKey: string, modelKey: string, operationType: string) => ({
  adapterKey,
  allowedDataClasses: ["personal_data"],
  billingProvider: "openrouter",
  certificationOwner: reviewerRef,
  effectiveAt: reviewedAt,
  endpointKey: "azure",
  expiresAt: pilotExpiresAt,
  intermediary: "openrouter",
  modelKey,
  operationTypes: [operationType],
  pathKind: "gateway_mediated",
  privacyPosture: "zero_retention",
  residency,
  tenancyMode: "route_isolated",
});

const rateConfiguration = {
  authorityId,
  model: "openai/gpt-5.6-luna",
  providerEndpoint: "azure",
  reviewedAt,
  totalContextTokens: 32768,
  maxOutputTokens: 512,
  inputUsdMicrosPerMillionTokens: 200_000,
  outputUsdMicrosPerMillionTokens: 1_200_000,
  additionalUsdMicrosPerCall: 0,
  cadMicrosPerUsd: 1_382_200,
  headroomBasisPoints: 1000,
  ceilingCadMicros: 20_000_000,
  perCallCeilingCadMicros: 100_000,
};
const configuration = {
  operatorReview: { reviewerRef, reviewedAt, rates, fxAndFees, privacy, totalEnvelope },
  pilotContext: { authorityId, expiresAt: pilotExpiresAt },
  rateConfiguration,
  pilotEnvelopeReview: {
    authorityId,
    reviewRef: "ENDVERA_PERSONAL_100CAD_ENVELOPE_20260911",
    reviewedAt,
    nonModelExposureCeilingCadMicros: 80_000_000,
    totalCeilingCadMicros: 100_000_000,
  },
  privacyEvidence: privacyEvidence(
    "openrouter-personal-intent-candidate",
    "openai/gpt-5.6-luna",
    "personal_intent_candidate_v1",
  ),
  route: { id: `personal-intent-route-${randomUUID()}`, version: 3, residency, maxInputTokens: 32768 },
  policy: { id: `personal-intent-policy-${randomUUID()}`, version: 3 },
  answer: {
    operatorReview: { reviewerRef, reviewedAt, compatibility, privacy, promptAndOutputContract },
    privacyEvidence: privacyEvidence(
      "openrouter-personal-answer-candidate",
      "openrouter/auto",
      "personal_answer_candidate_v1",
    ),
    route: { id: `personal-answer-route-${randomUUID()}`, version: 3, residency, maxInputTokens: 32768 },
    policy: { id: `personal-answer-policy-${randomUUID()}`, version: 3 },
  },
};
const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration }, now);
if (artifact.status !== "PREPARED_NOT_PUBLISHED" || !("answerSetup" in artifact)) {
  throw new Error(`PERSONAL_OPENROUTER_INGRESS_NOT_PREPARED:${JSON.stringify(artifact)}`);
}
const setupId = randomUUID();
const manifest = {
  version: "personal-model-operator-setup-v1",
  setupId,
  expectedHead: head,
  expectedSchemaCatalogSha256: "a9ebecf12c010c42090b01c64c5683e275fcf779c432467a56eb06ad5e2a1f93",
  authorityId,
  pilotExpiresAt,
  workspaceId,
  ownerUserId,
  artifact,
};
const manifestUtf8 = JSON.stringify(manifest);
const ingress = {
  version: "personal-model-operator-ingress-configuration-v1",
  mode: "ENABLED",
  setupRef: setupId,
  notBefore: reviewedAt,
  expiresAt: end.toISOString(),
  manifestUtf8,
  manifestSha256: byteSha(manifestUtf8),
  expectedSourceHead: head,
  expectedSchemaCatalogSha256: manifest.expectedSchemaCatalogSha256,
  controllerReceiptRef: "OLIVIER_AUTHORIZED_LIVE_ACTIVATION_20260912_ROUTE_CORRECTION",
  targetProfile: "PERSONAL_PILOT",
};
const encoded = JSON.stringify(ingress);
if (Buffer.byteLength(encoded, "utf8") > 32_768) {
  throw new Error(`PERSONAL_OPENROUTER_INGRESS_TOO_LARGE:${Buffer.byteLength(encoded, "utf8")}`);
}
inspectPersonalModelIngressConfiguration(encoded);
process.stdout.write(encoded);
