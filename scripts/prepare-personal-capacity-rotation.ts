/** Local-only preparation for the explicitly authorized owner repair. Reads the
 * existing local preparation helper, not credentials. Publication is separate. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { preparePersonalModelOperatorArtifact } from "../src/server/model-gateway/personal-intent/operator-preparation";
import { inspectPersonalModelIngressConfiguration } from "../src/server/model-gateway/personal-intent/operator-ingress-contract";
import { inspectPersonalModelSetupManifest } from "../src/server/model-gateway/personal-intent/operator-setup";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const original = JSON.parse(execFileSync(process.execPath, ["--require", "./scripts/register-server-only.cjs", "--import", "tsx",
    "scripts/prepare-personal-capacity-baseline.ts"], { encoding: "utf8", maxBuffer: 65536 }));
  const ingress = inspectPersonalModelIngressConfiguration(JSON.stringify(original));
  const prior = inspectPersonalModelSetupManifest(JSON.parse(ingress.configuration.manifestUtf8));
  const configuration = structuredClone(prior.manifest.artifact.configuration) as Record<string, any>;
  if (configuration.route.version !== 3 || configuration.rateConfiguration.model !== "openai/gpt-5.6-luna"
    || configuration.rateConfiguration.providerEndpoint !== "azure") throw new Error("ROTATION_SOURCE_MISMATCH");
  const now = new Date();
  const url = "https://openrouter.ai/api/v1/endpoints/zdr";
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("ROTATION_PUBLIC_REVIEW_UNAVAILABLE");
  const catalog = await response.json();
  const rows = catalog.data.filter((row: any) => row.model_id === "openai/gpt-5.6-luna-pro" && row.tag === "azure");
  if (rows.length !== 1) throw new Error("ROTATION_ENDPOINT_AMBIGUOUS");
  const endpoint = rows[0];
  if (endpoint.status !== 0 || endpoint.context_length < 32768 || endpoint.pricing.prompt !== "0.0000002"
    || endpoint.pricing.completion !== "0.0000012"
    || !["max_completion_tokens", "structured_outputs", "response_format"].every(p => endpoint.supported_parameters.includes(p))) {
    throw new Error("ROTATION_ENDPOINT_REVIEW_MISMATCH");
  }
  const review = { sourceUrl: url, retrievedAt: now.toISOString(), model: endpoint.model_id, provider: "azure",
    status: endpoint.status, pricing: endpoint.pricing, supportedParameters: endpoint.supported_parameters,
    zeroRetentionCatalogMember: true, existingProviderAndResidencyUnchanged: true };
  const document = { reviewRef: "CODEX_OWNER_AUTHORIZED_CAPACITY_REPAIR_20260912", contentHash: `sha256:${hash(JSON.stringify(review))}` };
  const fxReview = { source: "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1",
    observationDate: "2026-09-11", observedUsdCad: 1.3866, cadMicrosPerUsd: 1_400_000, headroomBasisPoints: 1000,
    reviewedAt: "2026-09-12T20:57:00Z", note: "Rounded upward; provider/payment fees and FX headroom retained" };
  const newModel = "openai/gpt-5.6-luna-pro";
  configuration.rateConfiguration.model = newModel;
  configuration.rateConfiguration.cadMicrosPerUsd = fxReview.cadMicrosPerUsd;
  // The same total budget and conservative rates; 2048 bounds reasoning + output
  // and stays within the already existing answer-adapter maximum.
  configuration.rateConfiguration.maxOutputTokens = 2048;
  configuration.privacyEvidence.modelKey = newModel;
  configuration.operatorReview.rates = document;
  configuration.operatorReview.privacy = document;
  configuration.operatorReview.fxAndFees = { reviewRef: "BOC_20260911_WITH_CONSERVATIVE_HEADROOM",
    contentHash: `sha256:${hash(JSON.stringify(fxReview))}` };
  configuration.operatorReview.reviewerRef = "CODEX_OWNER_AUTHORIZED_CAPACITY_REPAIR_20260912";
  configuration.answer.operatorReview.compatibility = document;
  configuration.answer.operatorReview.privacy = document;
  configuration.answer.operatorReview.reviewerRef = configuration.operatorReview.reviewerRef;
  configuration.privacyEvidence.certificationOwner = configuration.operatorReview.reviewerRef;
  configuration.answer.privacyEvidence.certificationOwner = configuration.operatorReview.reviewerRef;
  configuration.route.id = `personal-intent-route-${randomUUID()}`; configuration.route.version = 4;
  configuration.policy.id = `personal-intent-policy-${randomUUID()}`; configuration.policy.version = 4;
  configuration.answer.route.id = `personal-answer-route-${randomUUID()}`; configuration.answer.route.version = 4;
  configuration.answer.policy.id = `personal-answer-policy-${randomUUID()}`; configuration.answer.policy.version = 4;
  const artifact = preparePersonalModelOperatorArtifact({ enabled: true, configuration }, now);
  if (artifact.status !== "PREPARED_NOT_PUBLISHED") throw new Error("ROTATION_ARTIFACT_REFUSED");
  const setupId = randomUUID();
  const manifest = { ...prior.manifest, setupId, artifact };
  const manifestUtf8 = JSON.stringify(manifest);
  const value = { ...original, setupRef: setupId, manifestUtf8, manifestSha256: hash(manifestUtf8),
    controllerReceiptRef: "CODEX_OWNER_AUTHORIZED_CAPACITY_REPAIR_20260912" };
  const encoded = JSON.stringify(value);
  inspectPersonalModelIngressConfiguration(encoded);
  const mapped = inspectPersonalModelSetupManifest(manifest);
  process.stdout.write(JSON.stringify({ encoded, review, fxReview, route: mapped.route, policy: mapped.policy,
    answer: mapped.answer, manifestHash: mapped.manifestHash, setupId }, (_, value) => typeof value === "bigint" ? value.toString() : value));
}
void main().catch(() => { process.stderr.write("PERSONAL_CAPACITY_ROTATION_PREPARATION_REFUSED\n"); process.exitCode = 1; });
