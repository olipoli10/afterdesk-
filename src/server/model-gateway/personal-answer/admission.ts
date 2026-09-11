import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction } from "@/server/account-spend";
import { inspectPersonalGatewaySubject } from "../personal-subject";
import { inspectModelAuthority, inspectPersonalModelPilotEnvelope } from "../personal-intent/admission";
import { canonicalFingerprint } from "../evidence";
import { loadGatewayBreakerResolution } from "../breakers";
import { resolveGatewayPolicy } from "../policy";
import { bindGatewayOperation, createGatewayAttempt, loadGatewayPolicySnapshot, loadGatewayRouteSnapshots, persistGatewayDecision } from "../operations";
import type { PersonalAnswerGatewayOperationRequest } from "../types";
import { createAnswerInput, candidateAnswerSchema, RESEARCH_OPERATION } from "./contract";
import { inspectAnswerBudget } from "./budget-policy";
import { answerWireRequest } from "./openrouter-adapter";
import type { PersonalSmsExecutionContext } from "@/server/personal-assistant/sms-worker";

type Tx = Prisma.TransactionClient;
const uid = () => `answer_${randomUUID().replaceAll("-", "")}`;
export const ANSWER_CONTRACT_HASH = canonicalFingerprint(z.toJSONSchema(candidateAnswerSchema));
export type AnswerAdmissionConfiguration = Readonly<{
  policyVersionId: string; rateConfiguration: unknown; pilotEnvelopeReview: unknown;
}>;
export type AnswerAdmissionInput = Readonly<{
  context: PersonalSmsExecutionContext; configuration: AnswerAdmissionConfiguration; enabled?: boolean;
}>;
function live(input: AnswerAdmissionInput, env: NodeJS.ProcessEnv) {
  if (!input.enabled || env.ENDVERA_PERSONAL_ANSWER_ENGINE_ENABLED !== "true"
    || input.context.signal.aborted || Date.now() >= input.context.deadlineAt) throw new Error("ANSWER_ENGINE_NOT_ACTIVE");
}
export async function inspectAnswerContext(tx: Tx, input: AnswerAdmissionInput, env: NodeJS.ProcessEnv) {
  live(input, env);
  const claim = input.context.claim;
  const rows = await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS now FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound' AND status='processing'
      AND attempts=1 AND "leaseUntil"=($4::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`,
    claim.operationId, claim.workspaceId, claim.userId, new Date(claim.leaseUntil));
  if (rows.length !== 1 || !(rows[0].now instanceof Date)) throw new Error("ANSWER_SOURCE_CLAIM_LOST");
  const now = rows[0].now;
  const source = await inspectPersonalGatewaySubject(tx, { kind: "personal_assistant_operation", operationId: claim.operationId, workspaceId: claim.workspaceId });
  if (source.actorUserId !== claim.userId) throw new Error("ANSWER_ACTOR_CHANGED");
  const candidateInput = createAnswerInput({ requestId: claim.operationId, workspaceId: claim.workspaceId,
    body: source.input.source, senderVerified: true, workspaceBound: true, receivedAt: source.receivedAt });
  const budget = inspectAnswerBudget(input.configuration.rateConfiguration, candidateInput.operation, now);
  const envelope = inspectPersonalModelPilotEnvelope(env, now, budget.ceilingCadMicros, input.configuration.pilotEnvelopeReview);
  const authority = await inspectModelAuthority(tx, source, now);
  // Public search has a distinct disclosure surface. A route needs reviewed
  // search-source terms in addition to inference consent; no key or data is read here.
  if (candidateInput.operation === RESEARCH_OPERATION && env.ENDVERA_PERSONAL_PUBLIC_RESEARCH_ENABLED !== "true") throw new Error("PUBLIC_RESEARCH_NOT_ENABLED");
  const policyKey = candidateInput.operation === RESEARCH_OPERATION ? "personal-public-research-v1" : "personal-answer-v1";
  const routeKey = candidateInput.operation === RESEARCH_OPERATION ? "personal-public-research-openrouter-v1" : "personal-answer-openrouter-v1";
  const request: PersonalAnswerGatewayOperationRequest = {
    operationType: candidateInput.operation, logicalOperationKey: `personal-answer:${claim.operationId}:${candidateInput.requestFingerprint}`,
    tenantId: source.tenantKey, subject: source.subject, requestFingerprint: candidateInput.requestFingerprint,
    outputContractHash: ANSWER_CONTRACT_HASH, dataClass: "personal_data", privacyRequirement: "zero_retention", policyKey,
    maxTotalCostMicros: budget.reservationUsdMicros,
    contentRef: { kind: "personal_answer_input", id: claim.operationId, fingerprint: candidateInput.requestFingerprint }, createdAt: new Date(source.receivedAt),
  };
  const policy = await loadGatewayPolicySnapshot(input.configuration.policyVersionId, tx);
  const routes = await loadGatewayRouteSnapshots(tx);
  const resolution = resolveGatewayPolicy({ request, policy, routes, now });
  if (resolution.disposition !== "route_authorized") throw new Error("ANSWER_GATEWAY_ROUTE_UNAVAILABLE");
  const route = resolution.route;
  if (resolution.policy.policyKey !== policyKey || resolution.policy.maxAttempts !== 1 || resolution.policy.fallbackRules.length
    || resolution.policy.routeOrder.length !== 1 || route.routeKey !== routeKey || route.adapterKey !== "openrouter-personal-answer-candidate"
    || route.modelKey !== "openrouter/auto" || route.billingProvider !== "openrouter" || route.intermediary !== "openrouter"
    || route.pathKind !== "gateway_mediated" || budget.providerEndpoints.length !== 1 || route.endpointKey !== budget.providerEndpoints[0]
    || route.operationTypes.length !== 1 || route.operationTypes[0] !== candidateInput.operation
    || route.maxOutputTokens !== budget.maxOutputTokens || route.maxInputTokens > budget.totalContextTokens) throw new Error("ANSWER_EXACT_ROUTE_REQUIRED");
  const adapterConfiguration = { enabled: true, allowedModels: budget.allowedModels, providerEndpoints: budget.providerEndpoints,
    maxOutputTokens: budget.maxOutputTokens, timeoutMs: 25_000 };
  // Conservatively count UTF-8 bytes as tokens and reserve room for all five
  // capped search results, not only the user/system request.
  const searchContextAllowance = candidateInput.operation === RESEARCH_OPERATION ? 5 * 2000 * 4 : 0;
  if (Buffer.byteLength(JSON.stringify(answerWireRequest(candidateInput, adapterConfiguration)), "utf8") + 1024 + searchContextAllowance > route.maxInputTokens) throw new Error("ANSWER_INPUT_LIMIT");
  const breaker = await loadGatewayBreakerResolution({ policy: resolution.policy, route }, tx);
  if (breaker.status !== "clear") throw new Error("ANSWER_BREAKER_OPEN");
  const binding = { source: source.authorityFingerprint, model: authority.fingerprint, rates: budget.reviewedRateFingerprint,
    policy: resolution.policy.canonicalHash, route: route.canonicalHash, breaker: breaker.generation.toString(),
    privacy: resolution.privacyEvidenceHash, envelope: canonicalFingerprint(envelope), input: candidateInput.requestFingerprint };
  live(input, env);
  return { now, source, authority, candidateInput, request, budget, envelope, policy: resolution.policy, route,
    adapterConfiguration, breakerGeneration: breaker.generation, privacyEvidenceHash: resolution.privacyEvidenceHash,
    bindingFingerprint: canonicalFingerprint(binding) };
}
export type AnswerCurrentContext = Awaited<ReturnType<typeof inspectAnswerContext>>;

/** Same AiOperation, gateway, account USD ledger and personal CAD envelope as
 * existing intents. Unique source subject prevents answer/intent double billing. */
export async function admitPersonalAnswer(input: AnswerAdmissionInput, env: NodeJS.ProcessEnv = process.env) {
  live(input, env);
  return prisma.$transaction(async tx => {
    const current = await inspectAnswerContext(tx, input, env);
    const aiId = uid(), lockedBy = uid(), sourceId = input.context.claim.operationId;
    await tx.$executeRawUnsafe(`INSERT INTO "AiOperation" (id,"personalAssistantOperationId",purpose,"operationKey",status,attempts,"lockedAt","lockedBy","leaseExpiresAt","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,'running',1,(now() AT TIME ZONE 'UTC'),$5,($6::timestamptz AT TIME ZONE 'UTC'),(now() AT TIME ZONE 'UTC'),(now() AT TIME ZONE 'UTC'))`,
      aiId, sourceId, current.candidateInput.operation, current.request.logicalOperationKey, lockedBy, new Date(input.context.claim.leaseUntil));
    const operation = await bindGatewayOperation(tx, { aiOperationId: aiId, tenantId: current.request.tenantId,
      operationType: current.request.operationType, requestFingerprint: current.candidateInput.requestFingerprint,
      outputContractHash: ANSWER_CONTRACT_HASH, dataClass: current.request.dataClass, privacyRequirement: current.request.privacyRequirement,
      policyVersionId: current.policy.id, maxTotalCostMicros: current.budget.reservationUsdMicros });
    const b = current.budget;
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS acquired', b.budgetId);
    await tx.$executeRawUnsafe(`INSERT INTO "PersonalAssistantBudget" (id,"ceilingCadMicros","reservedCadMicros","expiresAt","createdAt","updatedAt")
      VALUES ($1,$2,0,($3::timestamptz AT TIME ZONE 'UTC'),(now() AT TIME ZONE 'UTC'),(now() AT TIME ZONE 'UTC')) ON CONFLICT (id) DO NOTHING`,
      b.budgetId, b.ceilingCadMicros, new Date(b.expiresAt));
    const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantBudget" SET "reservedCadMicros"="reservedCadMicros"+$2,"updatedAt"=(now() AT TIME ZONE 'UTC')
      WHERE id=$1 AND "ceilingCadMicros"=$3 AND "expiresAt"=($4::timestamptz AT TIME ZONE 'UTC')
        AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AND "reservedCadMicros"+$2<="ceilingCadMicros"`,
      b.budgetId, b.reservationCadMicros, b.ceilingCadMicros, new Date(b.expiresAt));
    if (changed !== 1) throw new Error("ANSWER_CAD_BUDGET_REFUSED");
    const hold = await reserveAccountProviderSpendInTransaction(tx, { operationKey: current.request.logicalOperationKey, attempt: 1,
      provider: "openrouter", worstCaseMicros: b.reservationUsdMicros, now: current.now }, env);
    if (!hold.ok || !hold.created || hold.grantedMicros !== b.reservationUsdMicros) throw new Error("ANSWER_USD_BUDGET_REFUSED");
    const childId = uid();
    const childRequest = { schemaVersion: 1, bindingFingerprint: current.bindingFingerprint, requestFingerprint: current.candidateInput.requestFingerprint,
      sourceId, gatewayOperationId: operation.id, budgetId: b.budgetId, cadMicros: b.reservationCadMicros.toString(), usdMicros: b.reservationUsdMicros.toString() };
    await tx.$executeRawUnsafe(`INSERT INTO "PersonalAssistantOperation" (id,"workspaceId","createdByUserId","connectorAccountId",kind,status,"idempotencyKey",request,"requestHash",
      "sourcePersonalOperationId","modelGatewayOperationId","budgetId","reservedCadMicros","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,'personal_answer_v1','received',$5,$6::jsonb,$7,$8,$9,$10,$11,(now() AT TIME ZONE 'UTC'),(now() AT TIME ZONE 'UTC'))`,
      childId, input.context.claim.workspaceId, current.source.actorUserId, current.authority.accountId, `answer:${sourceId}:v1`,
      JSON.stringify(childRequest), canonicalFingerprint(childRequest), sourceId, operation.id, b.budgetId, b.reservationCadMicros);
    const decision = await persistGatewayDecision(tx, { gatewayOperationId: operation.id, attempt: 1, disposition: "route_authorized", routeProfileId: current.route.id,
      reasonClass: "initial_route", policyHash: current.policy.canonicalHash, routeHash: current.route.canonicalHash,
      privacyEvidenceHash: current.privacyEvidenceHash, breakerGeneration: current.breakerGeneration, remainingCostMicros: b.reservationUsdMicros });
    const attempt = await createGatewayAttempt(tx, { decisionId: decision.id, accountSpendHoldId: hold.holdId, requestEvidenceRef: canonicalFingerprint(childRequest) });
    live(input, env);
    return { status: "ADMITTED_NOT_DISPATCHED" as const, current, aiId, lockedBy, operation, decision, attempt, childId, childRequest,
      context: input.context, configuration: input.configuration };
  }, { isolationLevel: "Serializable", timeout: Math.max(1, Math.min(5000, input.context.deadlineAt - Date.now())) });
}
export type AnswerAdmission = Awaited<ReturnType<typeof admitPersonalAnswer>>;
