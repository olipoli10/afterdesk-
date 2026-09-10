import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction } from "@/server/account-spend";
import { loadGatewayBreakerResolution } from "../breakers";
import { canonicalFingerprint } from "../evidence";
import { bindGatewayOperation, createGatewayAttempt, loadGatewayPolicySnapshot, loadGatewayRouteSnapshots, persistGatewayDecision,
  type GatewayAttemptRow, type GatewayDecisionRow, type GatewayOperationRow } from "../operations";
import { claimPersonalAiOperation, reservePersonalAiOperation, type PersonalAiOperationClaim } from "../personal-ai-operations";
import { inspectPersonalGatewaySubject } from "../personal-subject";
import { resolveGatewayPolicy, type GatewayPolicySnapshot, type GatewayRouteSnapshot } from "../policy";
import type { PersonalGatewayOperationRequest, PersonalGatewayOperationSubject } from "../types";
import { inspectPersonalModelBudget, PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { personalIntentProposalSchema } from "./contract";
import { personalIntentMessages, personalIntentResponseFormat } from "./prompt";

export type PersonalModelAuthority = Readonly<{ accountId: string; grantId: string; fingerprint: string }>;
const envelopeReviewSchema = z.object({
  authorityId: z.literal(PERSONAL_MODEL_AUTHORITY), reviewRef: z.string().min(1).max(191),
  reviewedAt: z.string().datetime({ offset: true }), nonModelExposureCeilingCadMicros: z.literal(80_000_000),
  totalCeilingCadMicros: z.literal(100_000_000),
}).strict();
export type PersonalModelPilotEnvelopeReview = Readonly<z.infer<typeof envelopeReviewSchema>>;
export type PersonalIntentAdmission = Readonly<{
  status: "ADMITTED_NOT_DISPATCHED";
  executionAuthorized: false;
  source: Awaited<ReturnType<typeof inspectPersonalGatewaySubject>>;
  modelAuthority: PersonalModelAuthority;
  request: PersonalGatewayOperationRequest;
  budgetPolicy: ReturnType<typeof inspectPersonalModelBudget>;
  claim: PersonalAiOperationClaim;
  operation: GatewayOperationRow;
  decision: GatewayDecisionRow;
  attempt: GatewayAttemptRow;
  policy: GatewayPolicySnapshot;
  route: GatewayRouteSnapshot;
  childOperationId: string;
  pilotEnvelopeReview: PersonalModelPilotEnvelopeReview;
  pilotEnvelopeFingerprint: string;
}>;
export type PersonalIntentAdmissionResult = PersonalIntentAdmission
  | Readonly<{ status: "DISABLED" | "REFUSED"; executionAuthorized: false; reason: string }>;
export type PersonalIntentAdmissionInput = Readonly<{
  subject: PersonalGatewayOperationSubject;
  policyVersionId: string;
  rateConfiguration: unknown;
  pilotEnvelopeReview: unknown;
  enabled?: boolean;
}>;

type Tx = Prisma.TransactionClient;
const uid = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
export const PERSONAL_MODEL_OUTPUT_CONTRACT_HASH = canonicalFingerprint(z.toJSONSchema(personalIntentProposalSchema));

export class PersonalIntentAdmissionRefused extends Error {
  constructor(readonly reason: string) { super(reason); }
}
function refuse(reason: string): never { throw new PersonalIntentAdmissionRefused(reason); }

/** This account is explicit owner consent for AI, not an SMS or Calendar grant. */
async function inspectModelAuthority(tx: Tx, source: PersonalIntentAdmission["source"], now: Date): Promise<PersonalModelAuthority> {
  const rows = await tx.$queryRawUnsafe<Array<{
    accountId: string; accountStatus: string; createdByUserId: string; accountVersion: number;
    accountRevokedAt: Date | null; credentialsPrepared: boolean; credentialRef: string | null; externalAccountKeyHash: string | null;
    grantId: string | null; grantStatus: string | null; grantVersion: number | null;
    grantRevokedAt: Date | null; grantedAt: Date | null; grantedScopes: string[] | null;
  }>>(`SELECT a.id "accountId",a.status "accountStatus",a."createdByUserId",a."stateVersion" "accountVersion",
      a."revokedAt" "accountRevokedAt",a."credentialRef",a."externalAccountKeyHash",(a."credentialRef" IS NOT NULL AND length(a."credentialRef")>0) "credentialsPrepared",
      g.id "grantId",g.status "grantStatus",g."stateVersion" "grantVersion",g."revokedAt" "grantRevokedAt",g."grantedAt",g."grantedScopes"
    FROM "ConstructionConnectorAccount" a LEFT JOIN "ConstructionConnectorGrant" g
      ON g."connectorAccountId"=a.id AND g.capability='personal_model_inference'
    WHERE a."workspaceId"=$1 AND a.provider='openrouter'`, source.subject.workspaceId);
  const row = rows[0];
  if (rows.length !== 1 || !row || row.accountStatus !== "connected" || row.createdByUserId !== source.actorUserId ||
    row.accountRevokedAt !== null || row.credentialsPrepared !== true || !row.grantId || row.grantStatus !== "active" ||
    row.grantRevokedAt !== null || !(row.grantedAt instanceof Date) || !Number.isFinite(row.grantedAt.getTime()) || row.grantedAt.getTime() < Date.parse("2026-09-10T01:18:26Z") ||
    row.grantedAt.getTime() > now.getTime() || !row.grantedScopes?.includes("personal_data:inference") ||
    !row.grantedScopes.includes(`authority:${PERSONAL_MODEL_AUTHORITY}`)) refuse("PERSONAL_MODEL_OWNER_GRANT_REQUIRED");
  return Object.freeze({ accountId: row.accountId, grantId: row.grantId!, fingerprint: canonicalFingerprint({
    workspaceId: source.subject.workspaceId, actorId: source.actorUserId, accountId: row.accountId,
    accountVersion: row.accountVersion, grantId: row.grantId, grantVersion: row.grantVersion,
    credentialRef: row.credentialRef, externalAccountKeyHash: row.externalAccountKeyHash,
    grantedAt: row.grantedAt, grantedScopes: [...row.grantedScopes!].sort(),
  }) });
}

function requireCurrentPilot(env: NodeJS.ProcessEnv, now: Date, modelCeiling: bigint, reviewInput: unknown) {
  if (env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "true" || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY ||
      env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") refuse("PERSONAL_MODEL_PILOT_NOT_ENABLED");
  // Server-reviewed envelope, NOT account-balance/model-supplied billing proof.
  // Reserve the full configured model sub-ceiling alongside other commitments.
  // No historic authority or a model's claimed cost can create this review.
  const parsed = envelopeReviewSchema.safeParse(reviewInput);
  if (!parsed.success) refuse("PERSONAL_MODEL_TOTAL_ENVELOPE_REVIEW_REQUIRED");
  const review = parsed.data;
  const reviewedAt = Date.parse(review.reviewedAt);
  if (!review.reviewRef.trim() || reviewedAt > now.getTime() || now.getTime() - reviewedAt > 86_400_000 ||
    BigInt(review.nonModelExposureCeilingCadMicros) + modelCeiling > BigInt(review.totalCeilingCadMicros)) refuse("PERSONAL_MODEL_TOTAL_ENVELOPE_REVIEW_REQUIRED");
  return Object.freeze(review);
}

async function currentContext(tx: Tx, input: PersonalIntentAdmissionInput, env: NodeJS.ProcessEnv) {
  const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>('SELECT CURRENT_TIMESTAMP AS now');
  if (!clock || !Number.isFinite(clock.now.getTime())) refuse("PERSONAL_MODEL_DATABASE_CLOCK_REQUIRED");
  const budgetPolicy = inspectPersonalModelBudget(input.rateConfiguration, clock.now);
  const pilotEnvelopeReview = requireCurrentPilot(env, clock.now, budgetPolicy.ceilingCadMicros, input.pilotEnvelopeReview);
  const source = await inspectPersonalGatewaySubject(tx, input.subject);
  const modelAuthority = await inspectModelAuthority(tx, source, clock.now);
  if (!/^sha256:[a-f0-9]{64}$/.test(source.input.requestFingerprint)) refuse("PERSONAL_MODEL_FINGERPRINT_INVALID");
  const request: PersonalGatewayOperationRequest = Object.freeze({
    operationType: "personal_intent_candidate_v1", logicalOperationKey: `personal-intent:${source.subject.operationId}:${source.input.requestFingerprint}`,
    tenantId: source.tenantKey, subject: source.subject,
    requestFingerprint: source.input.requestFingerprint, outputContractHash: PERSONAL_MODEL_OUTPUT_CONTRACT_HASH,
    dataClass: "personal_data", privacyRequirement: "zero_retention", policyKey: "personal-intent-v1",
    maxTotalCostMicros: budgetPolicy.reservationUsdMicros,
    contentRef: Object.freeze({ kind: "personal_intent_input", id: source.subject.operationId, fingerprint: source.input.requestFingerprint as `sha256:${string}` }),
    createdAt: new Date(source.receivedAt),
  });
  const policy = await loadGatewayPolicySnapshot(input.policyVersionId, tx);
  const routes = await loadGatewayRouteSnapshots(tx);
  const resolved = resolveGatewayPolicy({ request, policy, routes, now: clock.now });
  if (resolved.disposition !== "route_authorized") refuse(`PERSONAL_MODEL_POLICY_${resolved.reasonClass.toUpperCase()}`);
  const { route } = resolved;
  if (resolved.policy.maxAttempts !== 1 || resolved.policy.fallbackRules.length !== 0 || resolved.policy.routeOrder.length !== 1 ||
      route.routeKey !== "personal-intent-openrouter-candidate-v1" || route.adapterKey !== "openrouter-personal-intent-candidate" ||
      route.pathKind !== "gateway_mediated" || route.billingProvider !== "openrouter" || route.intermediary !== "openrouter" ||
      route.modelKey !== budgetPolicy.model || route.endpointKey !== budgetPolicy.providerEndpoint ||
      route.operationTypes.length !== 1 || route.operationTypes[0] !== request.operationType ||
      route.allowedDataClasses.length !== 1 || route.allowedDataClasses[0] !== "personal_data" ||
      route.maxOutputTokens !== budgetPolicy.maxOutputTokens || route.maxOutputTokens > 8192 ||
      route.maxInputTokens > budgetPolicy.totalContextTokens) refuse("PERSONAL_MODEL_EXACT_ROUTE_REQUIRED");
  const conservativeInputSize = Buffer.byteLength(JSON.stringify({ messages: personalIntentMessages(source.input), response_format: personalIntentResponseFormat() }), "utf8") + 1024;
  if (conservativeInputSize > route.maxInputTokens) refuse("PERSONAL_MODEL_INPUT_LIMIT");
  const breaker = await loadGatewayBreakerResolution({ policy: resolved.policy, route }, tx);
  if (breaker.status !== "clear") refuse("PERSONAL_MODEL_BREAKER_OPEN");
  return { source, modelAuthority, request, budgetPolicy, policy: resolved.policy, route,
    pilotEnvelopeReview, pilotEnvelopeFingerprint: canonicalFingerprint(pilotEnvelopeReview),
    breakerGeneration: breaker.generation, privacyEvidenceHash: resolved.privacyEvidenceHash, now: clock.now };
}

export function personalModelChildRequest(admission: Pick<PersonalIntentAdmission,
  "source" | "modelAuthority" | "budgetPolicy" | "operation" | "policy" | "route" | "pilotEnvelopeFingerprint">) {
  return Object.freeze({ schemaVersion: 1, sourceOperationId: admission.source.subject.operationId,
    requestFingerprint: admission.source.input.requestFingerprint, sourceAuthorityFingerprint: admission.source.authorityFingerprint,
    modelAuthorityFingerprint: admission.modelAuthority.fingerprint, reviewedRateFingerprint: admission.budgetPolicy.reviewedRateFingerprint,
    gatewayOperationId: admission.operation.id, policyHash: admission.policy.canonicalHash, routeHash: admission.route.canonicalHash,
    pilotEnvelopeFingerprint: admission.pilotEnvelopeFingerprint, budgetId: admission.budgetPolicy.budgetId,
    reservedCadMicros: admission.budgetPolicy.reservationCadMicros.toString(), reservedUsdMicros: admission.budgetPolicy.reservationUsdMicros.toString() });
}

/** Existing gateway + current owner/ledger authority; no credential or transport access. */
export async function admitPersonalIntent(input: PersonalIntentAdmissionInput, env: NodeJS.ProcessEnv = process.env): Promise<PersonalIntentAdmissionResult> {
  if (input.enabled !== true || env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED !== "true") {
    return Object.freeze({ status: "DISABLED", executionAuthorized: false, reason: "PERSONAL_MODEL_DISABLED" });
  }
  try {
    return await prisma.$transaction(async tx => {
      const context = await currentContext(tx, input, env);
      const prior = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT id FROM "PersonalAssistantOperation" WHERE "sourcePersonalOperationId"=$1 AND kind=\'personal_model_candidate_v1\'', input.subject.operationId);
      if (prior.length) refuse("PERSONAL_MODEL_ALREADY_ATTEMPTED");
      const reserved = await reservePersonalAiOperation(tx, input.subject);
      const claim = await claimPersonalAiOperation(tx, input.subject);
      if (!claim || claim.operationId !== reserved.operationId || claim.operationKey !== context.request.logicalOperationKey ||
        claim.authorityFingerprint !== context.source.authorityFingerprint) refuse("PERSONAL_MODEL_CLAIM_REFUSED");
      const operation = await bindGatewayOperation(tx, { aiOperationId: claim.operationId, tenantId: context.request.tenantId,
        operationType: context.request.operationType, requestFingerprint: context.request.requestFingerprint,
        outputContractHash: context.request.outputContractHash, dataClass: context.request.dataClass,
        privacyRequirement: context.request.privacyRequirement, policyVersionId: context.policy.id,
        maxTotalCostMicros: context.budgetPolicy.reservationUsdMicros });
      const childRequest = personalModelChildRequest({ ...context, operation });
      const childOperationId = uid("personalmodel");
      const policy = context.budgetPolicy;
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired', policy.budgetId);
      await tx.$executeRawUnsafe(`INSERT INTO "PersonalAssistantBudget" (id,"ceilingCadMicros","reservedCadMicros","expiresAt","createdAt","updatedAt")
        VALUES ($1,$2,0,$3,now(),now()) ON CONFLICT (id) DO NOTHING`, policy.budgetId, policy.ceilingCadMicros, new Date(policy.expiresAt));
      const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantBudget" SET "reservedCadMicros"="reservedCadMicros"+$2,"updatedAt"=now()
        WHERE id=$1 AND "ceilingCadMicros"=$3 AND "expiresAt"=$4 AND "expiresAt">now()
          AND "reservedCadMicros"+$2<="ceilingCadMicros"`, policy.budgetId, policy.reservationCadMicros, policy.ceilingCadMicros, new Date(policy.expiresAt));
      if (changed !== 1) refuse("PERSONAL_MODEL_CAD_BUDGET_REFUSED");
      const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey: claim.operationKey, attempt: 1,
        provider: "openrouter", worstCaseMicros: policy.reservationUsdMicros, now: context.now }, env);
      if (!hold.ok || !hold.created || hold.grantedMicros !== policy.reservationUsdMicros) refuse("PERSONAL_MODEL_USD_BUDGET_REFUSED");
      await tx.$executeRawUnsafe(
        `INSERT INTO "PersonalAssistantOperation" (id,"workspaceId","createdByUserId","connectorAccountId",kind,status,"idempotencyKey",request,"requestHash",
          "sourcePersonalOperationId","modelGatewayOperationId","budgetId","reservedCadMicros","leaseUntil","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,'personal_model_candidate_v1','received',$5,$6::jsonb,$7,$8,$9,$10,$11,now()+interval '5 minutes',now(),now())`,
        childOperationId, input.subject.workspaceId, context.source.actorUserId, context.modelAuthority.accountId,
        `personal-model:${input.subject.operationId}:v1`, JSON.stringify(childRequest), canonicalFingerprint(childRequest), input.subject.operationId, operation.id,
        policy.budgetId, policy.reservationCadMicros);
      const decision = await persistGatewayDecision(tx, { gatewayOperationId: operation.id, attempt: 1, disposition: "route_authorized",
        routeProfileId: context.route.id, reasonClass: "initial_route", policyHash: context.policy.canonicalHash,
        routeHash: context.route.canonicalHash, privacyEvidenceHash: context.privacyEvidenceHash,
        breakerGeneration: context.breakerGeneration, remainingCostMicros: policy.reservationUsdMicros });
      const attempt = await createGatewayAttempt(tx, { decisionId: decision.id, accountSpendHoldId: hold.holdId, requestEvidenceRef: canonicalFingerprint(childRequest) });
      return Object.freeze({ status: "ADMITTED_NOT_DISPATCHED" as const, executionAuthorized: false as const,
        source: context.source, modelAuthority: context.modelAuthority, request: context.request, budgetPolicy: policy,
        claim, operation, decision, attempt, policy: context.policy, route: context.route, childOperationId,
        pilotEnvelopeReview: context.pilotEnvelopeReview, pilotEnvelopeFingerprint: context.pilotEnvelopeFingerprint });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof PersonalIntentAdmissionRefused) return Object.freeze({ status: "REFUSED", executionAuthorized: false, reason: error.reason });
    throw error;
  }
}

/** Re-read after latency; never trust a caller-held admission snapshot as authority. */
export async function reinspectPersonalIntentAdmission(tx: Tx, admission: PersonalIntentAdmission,
  currentRateConfiguration: unknown, env: NodeJS.ProcessEnv, currentPilotEnvelopeReview: unknown) {
  const current = await currentContext(tx, { subject: admission.source.subject, policyVersionId: admission.policy.id,
    rateConfiguration: currentRateConfiguration, pilotEnvelopeReview: currentPilotEnvelopeReview, enabled: true }, env);
  if (current.source.authorityFingerprint !== admission.source.authorityFingerprint || current.modelAuthority.fingerprint !== admission.modelAuthority.fingerprint ||
    current.budgetPolicy.reviewedRateFingerprint !== admission.budgetPolicy.reviewedRateFingerprint ||
    current.request.requestFingerprint !== admission.request.requestFingerprint || current.policy.canonicalHash !== admission.policy.canonicalHash ||
    current.route.canonicalHash !== admission.route.canonicalHash || current.breakerGeneration !== admission.decision.breakerGeneration ||
    current.privacyEvidenceHash !== admission.decision.privacyEvidenceHash ||
    current.pilotEnvelopeFingerprint !== admission.pilotEnvelopeFingerprint) refuse("PERSONAL_MODEL_AUTHORITY_CHANGED");
  const [child] = await tx.$queryRawUnsafe<Array<{ requestHash: string; request: unknown; sourcePersonalOperationId: string; modelGatewayOperationId: string;
    connectorAccountId: string; createdByUserId: string; workspaceId: string; budgetId: string; reservedCadMicros: bigint }>>(
    `SELECT "requestHash",request,"sourcePersonalOperationId","modelGatewayOperationId","connectorAccountId","createdByUserId","workspaceId","budgetId","reservedCadMicros"
     FROM "PersonalAssistantOperation" WHERE id=$1 AND kind='personal_model_candidate_v1'`, admission.childOperationId);
  const expected = personalModelChildRequest(admission);
  if (!child || child.requestHash !== canonicalFingerprint(expected) || canonicalFingerprint(child.request) !== child.requestHash ||
    child.sourcePersonalOperationId !== current.source.subject.operationId || child.modelGatewayOperationId !== admission.operation.id ||
    child.connectorAccountId !== current.modelAuthority.accountId || child.createdByUserId !== current.source.actorUserId ||
    child.workspaceId !== current.source.subject.workspaceId || child.budgetId !== current.budgetPolicy.budgetId ||
    child.reservedCadMicros !== current.budgetPolicy.reservationCadMicros) refuse("PERSONAL_MODEL_DURABLE_BINDING_CHANGED");
  return current;
}
