import "server-only";
import { z } from "zod";
import { canonicalFingerprint } from "../evidence";
import { resolveGatewayPolicy, type GatewayPolicySnapshot, type GatewayRouteSnapshot } from "../policy";
import { requireAdapterDefinition, requireOperationDefinition, requirePolicyKey, requireRouteKey } from "../registry";
import { inspectPersonalModelPilotEnvelope, PERSONAL_MODEL_OUTPUT_CONTRACT_HASH } from "./admission";
import { inspectPersonalModelBudget, PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { PERSONAL_INTENT_ADAPTER_LIMITS } from "./openrouter-adapter";
import { PERSONAL_INTENT_PROMPT_VERSION } from "./prompt";

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,191}$/);
const label = z.string().min(1).max(191).refine(value => value.trim() === value && value.length > 0);
const version = z.number().int().positive().max(2_147_483_647);
const document = z.object({ reviewRef: label, contentHash: hash }).strict();
const reviewSchema = z.object({ reviewerRef: label, reviewedAt: z.string().datetime({ offset: true }),
  rates: document, fxAndFees: document, privacy: document, totalEnvelope: document,
}).strict();
const pilotSchema = z.object({ authorityId: z.literal(PERSONAL_MODEL_AUTHORITY),
  expiresAt: z.literal("2026-10-10T01:18:26Z") }).strict();
const routeSchema = z.object({ id, version, residency: z.array(label).min(1).max(20)
  .refine(values => new Set(values).size === values.length),
  maxInputTokens: z.number().int().positive().max(10_000_000) }).strict();
const policySchema = z.object({ id, version }).strict();
const outerSchema = z.object({ operatorReview: z.unknown(), pilotContext: z.unknown(),
  rateConfiguration: z.unknown(), pilotEnvelopeReview: z.unknown(), privacyEvidence: z.unknown(),
  route: z.unknown(), policy: z.unknown() }).partial().strict();

export const PERSONAL_MODEL_RUNTIME_PREREQUISITES = Object.freeze([
  "REVIEW_DOCUMENT_AUTHENTICITY_NOT_VERIFIED", "CURRENT_RATE_FX_FEES_AND_TOTAL_ENVELOPE_REVIEW",
  "EXACT_ENDPOINT_PRIVACY_AND_STRUCTURED_OUTPUT_COMPATIBILITY_REVIEW",
  "EXISTING_GATEWAY_DRAFT_PUBLICATION_AND_UNIQUE_VERSION_CHECK",
  "CURRENT_OWNER_IDENTITY_AND_EXPLICIT_PERSONAL_MODEL_CONSENT",
  "LOCALLY_ENCRYPTED_CURRENT_OWNER_CREDENTIAL_BINDING",
  "CURRENT_SOURCE_PERMISSION_AND_WORKSPACE_AUTHORITY", "CURRENT_GATEWAY_BREAKERS_CLEAR",
  "CURRENT_USD_ACCOUNT_CEILING_AND_ATOMIC_USD_CAD_RESERVATIONS",
  "EXPLICIT_ENGINE_MODEL_TRANSPORT_AND_GLOBAL_TRANSPORT_ACTIVATION",
] as const);

function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const incomplete = (...missing: string[]) => freeze({ status: "INCOMPLETE" as const,
  executionAuthorized: false as const, publicationAuthorized: false as const, missing });

/** No defaults for reviewed facts. No process env, filesystem, DB or transport calls.
 * This produces a draft, NOT a publication command, permission or certification.
 */
export function preparePersonalModelOperatorArtifact(input: Readonly<{ enabled?: boolean; configuration?: unknown }>, now: Date) {
  if (input.enabled !== true) return freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  if (!Number.isFinite(now.getTime())) return incomplete("VALID_REVIEW_CLOCK_REQUIRED");
  let raw: z.infer<typeof outerSchema>;
  try {
    // Bounded JSON-only copy also prevents later caller mutation of reviewed facts.
    const encoded = JSON.stringify(input.configuration);
    if (!encoded || Buffer.byteLength(encoded, "utf8") > 32_768) return incomplete("BOUNDED_OPERATOR_CONFIGURATION_REQUIRED");
    const parsed = outerSchema.safeParse(JSON.parse(encoded));
    if (!parsed.success) return incomplete("CLOSED_OPERATOR_CONFIGURATION_REQUIRED");
    raw = parsed.data;
  } catch { return incomplete("JSON_OPERATOR_CONFIGURATION_REQUIRED"); }
  const review = reviewSchema.safeParse(raw.operatorReview);
  const pilot = pilotSchema.safeParse(raw.pilotContext);
  const routePin = routeSchema.safeParse(raw.route);
  const policyPin = policySchema.safeParse(raw.policy);
  const missing: string[] = [];
  if (!review.success) missing.push("REVIEWER_AND_FOUR_REVIEW_DOCUMENT_HASHES_REQUIRED");
  else if (Date.parse(review.data.reviewedAt) > now.getTime() || now.getTime() - Date.parse(review.data.reviewedAt) > 86_400_000)
    missing.push("CURRENT_OPERATOR_REVIEW_REQUIRED");
  if (!pilot.success) missing.push("CURRENT_EXPLICIT_PILOT_CONTEXT_REQUIRED");
  if (!routePin.success) missing.push("EXACT_ROUTE_VERSION_RESIDENCY_AND_INPUT_LIMIT_REQUIRED");
  if (!policyPin.success) missing.push("EXACT_POLICY_VERSION_REQUIRED");
  if (!raw.privacyEvidence || typeof raw.privacyEvidence !== "object" || Array.isArray(raw.privacyEvidence)) missing.push("EXACT_PRIVACY_EVIDENCE_REQUIRED");
  let budget: ReturnType<typeof inspectPersonalModelBudget>;
  try { budget = inspectPersonalModelBudget(raw.rateConfiguration, now); }
  catch { missing.push("CURRENT_VALID_RATE_FX_FEES_AND_BUDGET_REVIEW_REQUIRED"); }
  if (missing.length || !review.success || !pilot.success || !routePin.success || !policyPin.success) return incomplete(...missing);
  // All below values are explicit operator facts in a local validation context;
  // the temporary enable flag does not mutate or assert actual runtime authority.
  let envelope: ReturnType<typeof inspectPersonalModelPilotEnvelope>;
  try { envelope = inspectPersonalModelPilotEnvelope({ NODE_ENV: "test", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: pilot.data.authorityId, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: pilot.data.expiresAt },
  now, budget!.ceilingCadMicros, raw.pilotEnvelopeReview); }
  catch { return incomplete("CURRENT_VALID_TOTAL_PILOT_ENVELOPE_REVIEW_REQUIRED"); }
  const pinned = budget!;
  if (!/^[A-Za-z0-9._:@/-]{1,160}$/.test(pinned.model) || !/^[A-Za-z0-9._:@/-]{1,160}$/.test(pinned.providerEndpoint)
    || pinned.maxOutputTokens > PERSONAL_INTENT_ADAPTER_LIMITS.completionTokens || routePin.data.maxInputTokens > pinned.totalContextTokens)
    return incomplete("EXACT_ADAPTER_COMPATIBLE_MODEL_ENDPOINT_AND_TOKEN_LIMITS_REQUIRED");
  const operation = requireOperationDefinition("personal_intent_candidate_v1");
  const routeKey = requireRouteKey("personal-intent-openrouter-candidate-v1");
  const adapter = requireAdapterDefinition("openrouter-personal-intent-candidate");
  const policyKey = requirePolicyKey("personal-intent-v1");
  const reviewedHashes = { operatorReview: canonicalFingerprint(review.data), rateConfiguration: pinned.reviewedRateFingerprint,
    privacyEvidence: canonicalFingerprint(raw.privacyEvidence), pilotEnvelope: canonicalFingerprint(envelope),
    pilotContext: canonicalFingerprint(pilot.data), outputContract: PERSONAL_MODEL_OUTPUT_CONTRACT_HASH,
    promptVersion: PERSONAL_INTENT_PROMPT_VERSION };
  const routeContent = { ...routePin.data, routeKey, pathKind: "gateway_mediated", adapterKey: adapter.key,
    billingProvider: "openrouter", intermediary: "openrouter", endpointKey: pinned.providerEndpoint, modelKey: pinned.model,
    operationTypes: [operation.key], allowedDataClasses: ["personal_data"], privacyPosture: "zero_retention",
    privacyEvidence: raw.privacyEvidence as Record<string, unknown>,
    pricingEvidence: { rateConfiguration: raw.rateConfiguration, reviewDocuments: { rates: review.data.rates, fxAndFees: review.data.fxAndFees },
      reviewedRateFingerprint: pinned.reviewedRateFingerprint, authenticityVerified: false },
    maxOutputTokens: pinned.maxOutputTokens, createdBy: review.data.reviewerRef, reviewedHashes };
  const routeHash = canonicalFingerprint(routeContent);
  const policyContent = { ...policyPin.data, policyKey, operationType: operation.key,
    routeOrder: [{ routeKey, version: routePin.data.version }], fallbackRules: [], maxAttempts: 1,
    maxTotalCostMicros: pinned.reservationUsdMicros.toString(), requiredPrivacyPosture: "zero_retention",
    createdBy: review.data.reviewerRef, reviewedHashes, routeHash };
  const policyHash = canonicalFingerprint(policyContent);
  // Existing governance resolver only accepts published snapshots. Simulate that
  // state in memory solely for structural validation; never return these as seeds.
  const route: GatewayRouteSnapshot = { ...routeContent, status: "published", canonicalHash: routeHash };
  const policy: GatewayPolicySnapshot = { ...policyContent, maxTotalCostMicros: pinned.reservationUsdMicros,
    status: "published", canonicalHash: policyHash };
  const probeHash = canonicalFingerprint({ kind: "operator-structural-probe-not-an-admission", reviewedHashes });
  const resolution = resolveGatewayPolicy({ policy, routes: [route], now, request: {
    operationType: "personal_intent_candidate_v1", policyKey, maxTotalCostMicros: pinned.reservationUsdMicros,
    dataClass: "personal_data", privacyRequirement: "zero_retention", outputContractHash: PERSONAL_MODEL_OUTPUT_CONTRACT_HASH,
    subject: { kind: "personal_assistant_operation", operationId: "not-an-operation", workspaceId: "not-a-workspace" },
    tenantId: "not-a-tenant", logicalOperationKey: "operator-preparation-only", requestFingerprint: probeHash,
    contentRef: { kind: "personal_intent_input", id: "operator-preparation-only", fingerprint: probeHash }, createdAt: now,
  } });
  if (resolution.disposition !== "route_authorized") return incomplete(`EXISTING_GATEWAY_${resolution.reasonClass.toUpperCase()}`);
  const body = {
    schemaVersion: 1 as const, status: "PREPARED_NOT_PUBLISHED" as const,
    executionAuthorized: false as const, publicationAuthorized: false as const, externalTransportPerformed: false as const,
    reviewAuthenticityVerified: false as const, providerCompatibilityObserved: false as const,
    structuralValidation: "EXISTING_GATEWAY_RESOLVER_ONLY" as const,
    configuration: raw, reviewedHashes,
    draftRoute: { ...routeContent, canonicalHash: routeHash, status: "draft" as const, publishedAt: null },
    draftPolicy: { ...policyContent, canonicalHash: policyHash, status: "draft" as const, publishedAt: null },
    runtimeConfiguration: { schemaVersion: 1 as const, policyVersionId: policyPin.data.id,
      rateConfiguration: raw.rateConfiguration, pilotEnvelopeReview: envelope },
    disabledSwitches: { ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "false", ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED: "false",
      ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "DISABLED" },
    reservation: { usdMicros: pinned.reservationUsdMicros.toString(), cadMicros: pinned.reservationCadMicros.toString(),
      modelCeilingCadMicros: pinned.ceilingCadMicros.toString(), accounting: "NOT_RESERVED" as const },
    remainingPrerequisites: PERSONAL_MODEL_RUNTIME_PREREQUISITES,
  };
  return freeze({ ...body, artifactHash: canonicalFingerprint(body) });
}

/** Rebuild with today's rules/clock. A matching hash is integrity, not authority. */
export function validatePersonalModelOperatorArtifact(artifact: unknown, now: Date) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return incomplete("OPERATOR_ARTIFACT_REQUIRED");
  try {
    const candidate = artifact as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > 131_072) return incomplete("BOUNDED_OPERATOR_ARTIFACT_REQUIRED");
    const rebuilt = preparePersonalModelOperatorArtifact({ enabled: true, configuration: candidate.configuration }, now);
    if (rebuilt.status !== "PREPARED_NOT_PUBLISHED") return rebuilt;
    if (canonicalFingerprint(candidate) !== canonicalFingerprint(rebuilt)) return incomplete("OPERATOR_ARTIFACT_INTEGRITY_MISMATCH");
    return rebuilt;
  } catch { return incomplete("OPERATOR_ARTIFACT_INTEGRITY_MISMATCH"); }
}
