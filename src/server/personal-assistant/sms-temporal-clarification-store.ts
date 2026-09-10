import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { loadStoredPersonalIntentReviewProof } from "@/server/model-gateway/personal-intent/review-proof";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
import { resolveCorrelatedPersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/correlated-temporal-resolution";
import { prepareSmsTemporalClarification, markSmsTemporalClarificationAsked, smsTemporalClarificationQuestionRequest } from "./sms-temporal-clarification";
import { temporalActorSchema, temporalClaimSchema, temporalRegistryEnabled, temporalRegistryDisabled, temporalRequireLive,
  temporalRegistryTransaction, temporalRegistryClock, temporalLockSourceNamespace, temporalCurrentBinding, temporalCheckedSource, temporalSha,
  type TemporalRegistryActor, type TemporalRegistryClaim, type TemporalRegistryContext, type TemporalRegistryDB } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

import { TEMPORAL_PROPOSAL_SERIALIZATION_VERSION, temporalRegistryStoredProof as reinspectStored,
  temporalRegistryLockProof as lockRow, temporalRegistryCurrentProof as current,
  type StoredTemporalClarification as Stored } from "./sms-temporal-clarification-proof";
export { TEMPORAL_PROPOSAL_SERIALIZATION_VERSION } from "./sms-temporal-clarification-proof";
const id = z.string().min(1).max(191);
const preparationInput = z.object({ actor: temporalActorSchema, sourceClaim: temporalClaimSchema, modelChildOperationId: id,
  reviewActionId: id, questionOutboundOperationId: id, ttlMs: z.number().int().min(1).max(600000).optional() }).strict();
const lookupInput = z.object({ actor: temporalActorSchema, clarificationId: id, questionOutboundOperationId: id }).strict();
const consumeInput = z.object({ actor: temporalActorSchema, clarificationId: id, replySourceClaim: temporalClaimSchema }).strict();
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function sameActor(actor: TemporalRegistryActor, claim: TemporalRegistryClaim) {
  if (actor.userId !== claim.userId || actor.workspaceId !== claim.workspaceId) throw new Error("TEMPORAL_REGISTRY_ACTOR_MISMATCH");
}

/** Registry only: canonical proof loader is read-only. Does not call the review
 * consumer, create an outbound/calendar draft, complete the source or commit. */
export async function prepareSmsTemporalClarificationInTransaction(tx: TemporalRegistryDB, untrusted: z.infer<typeof preparationInput>,
  env: ConnectorEnvironment = process.env, context: TemporalRegistryContext) {
  if (!temporalRegistryEnabled(env)) return temporalRegistryDisabled();
  const input = preparationInput.parse(untrusted); sameActor(input.actor, input.sourceClaim);
  await temporalRegistryTransaction(tx, context, env);
  const namespace = await temporalLockSourceNamespace(tx, input.actor, input.sourceClaim.operationId);
  temporalRequireLive(context, env);
  const proof = await loadStoredPersonalIntentReviewProof(tx, { enabled: true, ...input.actor, sourceOperationId: input.sourceClaim.operationId, modelChildOperationId: input.modelChildOperationId }, env);
  if (proof.status !== "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED" || proof.inspected.proposal.actions.length !== 1) throw new Error("TEMPORAL_REGISTRY_SINGLE_PROOF_REQUIRED");
  const action = proof.inspected.proposal.actions[0];
  if (action.id !== input.reviewActionId || action.dependsOn.length) throw new Error("TEMPORAL_REGISTRY_SINGLE_PROOF_REQUIRED");
  const rawProposal = canonicalJson(proof.inspected.proposal);
  const temporal = resolvePersonalCalendarTemporal(proof.source.input, rawProposal, action.id, { receivedAt: proof.source.receivedAt, timezone: proof.source.timezone });
  if (temporal.status !== "CLARIFY" || !["AMBIGUOUS_TIME", "MISSING_END_TIME"].includes(temporal.reason)) throw new Error("TEMPORAL_REGISTRY_TEMPORAL_QUESTION_REQUIRED");
  const loaded = await temporalCurrentBinding(tx, input.actor, input.sourceClaim.operationId, input.modelChildOperationId, env, input.sourceClaim);
  const now = await temporalRegistryClock(tx); temporalRequireLive(context, env);
  const old = await tx.$queryRawUnsafe<Stored[]>(`SELECT * FROM "PersonalSmsTemporalClarification" WHERE "sourceOperationId"=$1 AND "reviewActionId"=$2 FOR UPDATE`, input.sourceClaim.operationId, action.id);
  if (old.length) {
    const p = reinspectStored(old[0]);
    if (old.length !== 1 || old[0].phase !== "PREPARED" || old[0].questionOutboundOperationId !== input.questionOutboundOperationId || old[0].namespace !== namespace
      || canonicalJson(p.binding) !== canonicalJson(loaded.binding) || canonicalJson(p.source) !== canonicalJson(loaded.source) || p.rawProposal !== rawProposal
      || canonicalJson(old[0].sourceClaim) !== canonicalJson(input.sourceClaim) || old[0].expiresAt <= now) throw new Error("TEMPORAL_REGISTRY_REPLAY_CHANGED");
    temporalRequireLive(context, env);
    return freeze({ status: "PREPARED_FOR_SOURCE_COMMIT" as const, executionAuthorized: false as const, clarificationId: old[0].id,
      preparedHash: p.preparedHash, requiredSourceReview: old[0].reviewSnapshot, replayed: true, committed: false as const });
  }
  const prepared = prepareSmsTemporalClarification({ schemaVersion: 1, clarificationId: randomUUID(), binding: loaded.binding, source: loaded.source,
    modelChildOperationId: input.modelChildOperationId, modelGatewayOperationId: proof.row.gatewayId, rawProposal, actionId: action.id,
    createdAt: now.toISOString(), expiresAt: new Date(Math.min(now.getTime() + (input.ttlMs ?? 600000), Date.parse("2026-10-10T01:18:26Z"))).toISOString() });
  const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false, accounting: "UNSETTLED",
    automaticRetry: false, semanticIntentVerified: false, source: { operationId: loaded.source.operationId, text: loaded.source.body,
      receivedAt: loaded.source.receivedAt, timezone: loaded.binding.timezone }, modelChildOperationId: input.modelChildOperationId,
    actions: [{ actionId: action.id, kind: action.kind, status: "CLARIFY", question: prepared.question }] };
  const expectedRequest = smsTemporalClarificationQuestionRequest(prepared), requestHash = temporalSha(JSON.stringify(expectedRequest));
  const questions = await tx.$queryRawUnsafe<Array<{ request: unknown; requestHash: string }>>(`SELECT request,"requestHash" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "connectorAccountId"=$4 AND kind='sms_outbound'
      AND status='pending' AND attempts=0 AND "leaseUntil" IS NULL AND "idempotencyKey"=$5 FOR SHARE`, input.questionOutboundOperationId,
  input.actor.workspaceId, input.actor.userId, prepared.binding.smsAccountId, `reply:${input.sourceClaim.operationId}`);
  if (questions.length !== 1 || canonicalJson(questions[0].request) !== canonicalJson(expectedRequest) || questions[0].requestHash !== requestHash) throw new Error("TEMPORAL_REGISTRY_EXACT_QUESTION_REQUIRED");
  temporalRequireLive(context, env);
  await tx.$executeRawUnsafe(`INSERT INTO "PersonalSmsTemporalClarification"
    (id,"workspaceId","userId","identityId","sourceOperationId","modelChildOperationId","modelGatewayOperationId","reviewActionId","questionOutboundOperationId",namespace,
     phase,prepared,"sourceClaim","reviewSnapshot","preparedHash","bindingHash","questionRequestHash","proposalEvidenceRef","proposalSerializationVersion","wireTextHash","wireFormatterVersion","createdAt","expiresAt","updatedAt")
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PREPARED',$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,($21::timestamptz AT TIME ZONE 'UTC'),($22::timestamptz AT TIME ZONE 'UTC'),($21::timestamptz AT TIME ZONE 'UTC'))`,
  prepared.clarificationId, input.actor.workspaceId, input.actor.userId, prepared.binding.identityId, input.sourceClaim.operationId, input.modelChildOperationId,
  proof.row.gatewayId, action.id, input.questionOutboundOperationId, namespace, JSON.stringify(prepared), JSON.stringify(input.sourceClaim), JSON.stringify(review),
  prepared.preparedHash, prepared.bindingHash, requestHash, proof.row.resultEvidenceRef, TEMPORAL_PROPOSAL_SERIALIZATION_VERSION, prepared.wireTextHash, prepared.wireFormatterVersion, now, new Date(prepared.expiresAt));
  temporalRequireLive(context, env);
  return freeze({ status: "PREPARED_FOR_SOURCE_COMMIT" as const, executionAuthorized: false as const, clarificationId: prepared.clarificationId,
    preparedHash: prepared.preparedHash, requiredSourceReview: review, replayed: false, committed: false as const });
}

/** acceptedAt is the immutable DB instant the acceptance receipt was recorded,
 * NOT Twilio's actual acceptance or delivery time. Missing today => refusal. */
export async function markSmsTemporalClarificationAskedInTransaction(tx: TemporalRegistryDB, untrusted: z.infer<typeof lookupInput>,
  env: ConnectorEnvironment = process.env, context: TemporalRegistryContext) {
  if (!temporalRegistryEnabled(env)) return temporalRegistryDisabled();
  const input = lookupInput.parse(untrusted); await temporalRegistryTransaction(tx, context, env);
  const row = await lockRow(tx, input.actor, input.clarificationId, context, env);
  if (row.phase !== "PREPARED" || row.questionOutboundOperationId !== input.questionOutboundOperationId) throw new Error("TEMPORAL_REGISTRY_NOT_PREPARED");
  await current(tx, row, input.actor, env);
  const questions = await tx.$queryRawUnsafe<Array<{ result: unknown; request: unknown; requestHash: string }>>(`SELECT result,request,"requestHash" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='sms_outbound' AND status='completed' AND attempts=1 AND "externalTransportPerformed"=true AND "idempotencyKey"=$4 FOR SHARE`,
  row.questionOutboundOperationId, input.actor.workspaceId, input.actor.userId, `reply:${row.sourceOperationId}`);
  if (questions.length !== 1) throw new Error("TEMPORAL_REGISTRY_DURABLE_ACCEPTANCE_REQUIRED");
  const receipt = z.object({ providerSid: z.string().regex(/^SM[a-f0-9]{32}$/i), acceptedByProvider: z.literal(true), delivered: z.literal(false),
    approvalHash: z.literal(row.questionRequestHash), acceptedAt: z.string().datetime().refine(s => new Date(s).toISOString() === s) }).parse(questions[0].result);
  if (questions[0].requestHash !== row.questionRequestHash || canonicalJson(questions[0].request) !== canonicalJson(smsTemporalClarificationQuestionRequest(row.prepared))) throw new Error("TEMPORAL_REGISTRY_EXACT_QUESTION_REQUIRED");
  const now = await temporalRegistryClock(tx); temporalRequireLive(context, env);
  const waiting = markSmsTemporalClarificationAsked(row.prepared, { outboundOperationId: row.questionOutboundOperationId, requestHash: row.questionRequestHash,
    acceptedProviderSid: receipt.providerSid, acceptedAt: receipt.acceptedAt, acceptedByProvider: true, deliveryConfirmed: false }, now.toISOString());
  const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalSmsTemporalClarification" SET phase='WAITING',waiting=$2::jsonb,"waitingHash"=$3,"acceptedProviderSid"=$4,
    "acceptedAt"=($5::timestamptz AT TIME ZONE 'UTC'),"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE id=$1 AND phase='PREPARED' AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')`,
  row.id, JSON.stringify(waiting), waiting.waitingHash, receipt.providerSid, new Date(receipt.acceptedAt));
  if (changed !== 1) throw new Error("TEMPORAL_REGISTRY_CLAIM_LOST");
  temporalRequireLive(context, env);
  return freeze({ status: "WAITING_FOR_TEMPORAL_REPLY" as const, executionAuthorized: false as const, waitingHash: waiting.waitingHash, committed: false as const });
}

export async function consumeSmsTemporalClarificationInTransaction(tx: TemporalRegistryDB, untrusted: z.infer<typeof consumeInput>,
  env: ConnectorEnvironment = process.env, context: TemporalRegistryContext) {
  if (!temporalRegistryEnabled(env)) return temporalRegistryDisabled();
  const input = consumeInput.parse(untrusted); sameActor(input.actor, input.replySourceClaim);
  await temporalRegistryTransaction(tx, context, env);
  const row = await lockRow(tx, input.actor, input.clarificationId, context, env);
  if (row.phase !== "WAITING" || !row.waiting || row.failedAttempts >= 5) throw new Error("TEMPORAL_REGISTRY_NOT_WAITING");
  const loaded = await current(tx, row, input.actor, env);
  const sources = await tx.$queryRawUnsafe<Array<{ id: string; request: unknown; requestHash: string; idempotencyKey: string; createdAt: Date; result: unknown; connectorAccountId: string }>>(`SELECT id,request,"requestHash","idempotencyKey","createdAt",result,"connectorAccountId" FROM "PersonalAssistantOperation"
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND kind='personal_sms_inbound' AND status='processing' AND attempts=1
      AND "leaseUntil"=($4::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE`,
  input.replySourceClaim.operationId, input.actor.workspaceId, input.actor.userId, new Date(input.replySourceClaim.leaseUntil));
  if (sources.length !== 1 || sources[0].connectorAccountId !== loaded.binding.smsAccountId) throw new Error("TEMPORAL_REGISTRY_REPLY_CLAIM_REQUIRED");
  const source = temporalCheckedSource(sources[0], input.actor);
  const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalSmsConversationExpectation" WHERE namespace=$1 AND active FOR SHARE`, row.namespace);
  if (active.length !== 1 || active[0].id !== `temporal:${row.id}`) throw new Error("TEMPORAL_REGISTRY_NO_UNIQUE_QUESTION");
  const now = await temporalRegistryClock(tx); temporalRequireLive(context, env);
  // Establish authenticated causal source eligibility before handling lexical
  // rejection. A cross-identity, old or replayed source never burns an attempt.
  if (source.identityId !== loaded.binding.identityId || source.accountSid !== loaded.source.accountSid || source.from !== loaded.binding.ownerNumber || source.to !== loaded.binding.endveraNumber
    || source.operationId === row.sourceOperationId || source.messageSid === row.prepared.source.messageSid || source.messageSid === row.acceptedProviderSid
    || !row.acceptedAt || sources[0].createdAt <= row.acceptedAt || sources[0].createdAt > now || sources[0].createdAt >= row.expiresAt || now >= row.expiresAt) throw new Error("TEMPORAL_REGISTRY_REPLY_CAUSALITY_REQUIRED");
  const checkedWaiting = markSmsTemporalClarificationAsked(row.prepared, row.waiting.questionReceipt, now.toISOString());
  if (canonicalJson(checkedWaiting) !== canonicalJson(row.waiting) || checkedWaiting.waitingHash !== row.waitingHash
    || checkedWaiting.questionReceipt.acceptedAt !== row.acceptedAt.toISOString() || checkedWaiting.questionReceipt.acceptedProviderSid !== row.acceptedProviderSid) throw new Error("TEMPORAL_REGISTRY_WAITING_CHANGED");
  let packet: unknown, outcome: "ACCEPTED" | "REFUSED", reply: string;
  try {
    const resolved = resolveCorrelatedPersonalCalendarTemporal({ waiting: row.waiting, currentBinding: loaded.binding, currentPhase: "WAITING", activeQuestionCount: 1,
      reply: { source, attempt: 1, status: "processing", leaseUntil: new Date(input.replySourceClaim.leaseUntil).toISOString(), alreadyConsumed: false }, now: now.toISOString() });
    packet = resolved;
    outcome = resolved.status === "RESOLVED_NOT_AUTHORIZED" ? "ACCEPTED" : "REFUSED";
    reply = resolved.status === "CLARIFY" ? resolved.question : resolved.status === "RESOLVED_NOT_AUTHORIZED"
      ? "Ta précision est conservée avec ta demande originale dans ENDVERA. Aucun rendez-vous n’est créé ni envoyé à Google."
      : "La demande originale ne contient pas assez de détails pour utiliser cette heure. Reformule le rendez-vous complet avec son début et sa fin. Aucun rendez-vous n’est créé.";
  } catch {
    outcome = "REFUSED"; reply = "Précise une seule heure au format 24 heures, par exemple 14:00. Aucun rendez-vous n’est créé.";
    packet = { status: "REFUSED", reason: "EXPLICIT_TIME_REQUIRED", executionAuthorized: false, persistencePerformed: false };
  }
  const receiptId = randomUUID(), packetHash = temporalSha(canonicalJson(packet));
  if (Buffer.byteLength(canonicalJson(packet), "utf8") > 131072) throw new Error("TEMPORAL_REGISTRY_PACKET_TOO_LARGE");
  temporalRequireLive(context, env);
  await tx.$executeRawUnsafe(`INSERT INTO "PersonalSmsTemporalClarificationReply"
    (id,"clarificationId","workspaceId","userId","sourceOperationId","providerSid","requestHash","sourceClaim",outcome,packet,"packetHash","receivedAt","createdAt")
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,($12::timestamptz AT TIME ZONE 'UTC'),(clock_timestamp() AT TIME ZONE 'UTC'))`,
  receiptId, row.id, input.actor.workspaceId, input.actor.userId, source.operationId, source.messageSid, source.requestHash, JSON.stringify(input.replySourceClaim), outcome, JSON.stringify(packet), packetHash, sources[0].createdAt);
  const changed = await tx.$executeRawUnsafe(`UPDATE "PersonalSmsTemporalClarification" SET phase=CASE WHEN $2='ACCEPTED' THEN 'CONSUMED' WHEN "failedAttempts"+1>=5 THEN 'REFUSED' ELSE 'WAITING' END,
    "failedAttempts"="failedAttempts"+CASE WHEN $2='REFUSED' THEN 1 ELSE 0 END,"consumedReplyId"=CASE WHEN $2='ACCEPTED' THEN $3 ELSE "consumedReplyId" END,"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
    WHERE id=$1 AND phase='WAITING' AND "waitingHash"=$4 AND "failedAttempts"=$5 AND "expiresAt">(clock_timestamp() AT TIME ZONE 'UTC')`, row.id, outcome, receiptId, row.waitingHash, row.failedAttempts);
  if (changed !== 1) throw new Error("TEMPORAL_REGISTRY_CLAIM_LOST");
  const prior = sources[0].result && typeof sources[0].result === "object" && !Array.isArray(sources[0].result) ? sources[0].result as Record<string, unknown> : {};
  const result = { ...prior, source: "TEMPORAL_CLARIFICATION", reply, temporalClarificationReceiptId: receiptId, packetHash,
    executionAuthorized: false, externalTransportPerformed: false, automaticRetry: false, ...(sources[0].result == null ? {} : { priorClaimResult: sources[0].result }) };
  const finished = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$6::jsonb,"updatedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$4 AND kind='personal_sms_inbound' AND status='processing' AND attempts=1
      AND "leaseUntil"=($5::timestamptz AT TIME ZONE 'UTC') AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')`,
  source.operationId, input.actor.workspaceId, input.actor.userId, source.requestHash, new Date(input.replySourceClaim.leaseUntil), JSON.stringify(result));
  if (finished !== 1) throw new Error("TEMPORAL_REGISTRY_SOURCE_CLAIM_LOST");
  temporalRequireLive(context, env);
  return freeze({ status: outcome === "ACCEPTED" ? "CORRELATED_NOT_EXECUTED" as const : "REFUSED" as const, executionAuthorized: false as const,
    receiptId, packetHash, reply, committed: false as const });
}
