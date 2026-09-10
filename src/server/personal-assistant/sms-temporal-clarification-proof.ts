import "server-only";
import { canonicalFingerprint, canonicalJson } from "@/server/model-gateway/evidence";
import { inspectModelAuthority } from "@/server/model-gateway/personal-intent/admission";
import { prepareSmsTemporalClarification, smsTemporalClarificationQuestionRequest,
  type PreparedSmsTemporalClarification, type WaitingSmsTemporalClarification } from "./sms-temporal-clarification";
import { temporalRequireLive, temporalLockSourceNamespace, temporalCurrentBinding, temporalSha,
  type TemporalRegistryActor, type TemporalRegistryClaim, type TemporalRegistryContext, type TemporalRegistryDB } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";

export const TEMPORAL_PROPOSAL_SERIALIZATION_VERSION = "personal-inspected-proposal-canonical-v1";

// Shared internal proof reader. Locks and validates only; creates no draft,
// model call, receipt or execution authority. Store and outbox use identical checks.
export type StoredTemporalClarification = { id: string; workspaceId: string; userId: string; sourceOperationId: string; modelChildOperationId: string; modelGatewayOperationId: string;
  reviewActionId: string; questionOutboundOperationId: string; namespace: string; phase: string; prepared: PreparedSmsTemporalClarification;
  sourceClaim: TemporalRegistryClaim; reviewSnapshot: unknown; preparedHash: string; bindingHash: string; questionRequestHash: string; proposalEvidenceRef: string;
  identityId: string; proposalSerializationVersion: string; wireTextHash: string; wireFormatterVersion: string; createdAt: Date;
  waiting: WaitingSmsTemporalClarification | null; waitingHash: string | null; acceptedAt: Date | null; acceptedProviderSid: string | null;
  expiresAt: Date; failedAttempts: number };
export function temporalRegistryStoredProof(row: StoredTemporalClarification) {
  const p = row.prepared;
  const fresh = prepareSmsTemporalClarification({ schemaVersion: p.schemaVersion, clarificationId: p.clarificationId, binding: p.binding, source: p.source,
    modelChildOperationId: p.modelChildOperationId, modelGatewayOperationId: p.modelGatewayOperationId, rawProposal: p.rawProposal, actionId: p.actionId, createdAt: p.createdAt, expiresAt: p.expiresAt });
  if (canonicalJson(fresh) !== canonicalJson(p) || row.id !== p.clarificationId || row.preparedHash !== p.preparedHash
    || row.workspaceId !== p.binding.workspaceId || row.userId !== p.binding.userId || row.sourceOperationId !== p.source.operationId
    || row.modelChildOperationId !== p.modelChildOperationId || row.modelGatewayOperationId !== p.modelGatewayOperationId
    || row.identityId !== p.binding.identityId || row.bindingHash !== p.bindingHash || row.wireTextHash !== p.wireTextHash || row.wireFormatterVersion !== p.wireFormatterVersion
    || row.proposalSerializationVersion !== TEMPORAL_PROPOSAL_SERIALIZATION_VERSION || !(row.createdAt instanceof Date) || !(row.expiresAt instanceof Date)
    || row.createdAt.toISOString() !== p.createdAt || row.expiresAt.toISOString() !== p.expiresAt
    || row.reviewActionId !== p.actionId || row.questionRequestHash !== temporalSha(JSON.stringify(smsTemporalClarificationQuestionRequest(p)))) throw new Error("TEMPORAL_REGISTRY_SNAPSHOT_CHANGED");
  return fresh;
}
export async function temporalRegistryLockProof(tx: TemporalRegistryDB, actor: TemporalRegistryActor, clarificationId: string, context: TemporalRegistryContext, env: ConnectorEnvironment) {
  const candidates = await tx.$queryRawUnsafe<Array<{ sourceOperationId: string }>>(`SELECT "sourceOperationId" FROM "PersonalSmsTemporalClarification"
    WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3`, clarificationId, actor.workspaceId, actor.userId);
  temporalRequireLive(context, env);
  if (candidates.length !== 1) throw new Error("TEMPORAL_REGISTRY_OWNER_REQUIRED");
  const namespace = await temporalLockSourceNamespace(tx, actor, candidates[0].sourceOperationId);
  const rows = await tx.$queryRawUnsafe<StoredTemporalClarification[]>(`SELECT * FROM "PersonalSmsTemporalClarification" WHERE id=$1 AND "workspaceId"=$2 AND "userId"=$3 FOR UPDATE`, clarificationId, actor.workspaceId, actor.userId);
  temporalRequireLive(context, env);
  if (rows.length !== 1 || rows[0].namespace !== namespace) throw new Error("TEMPORAL_REGISTRY_NAMESPACE_CHANGED");
  temporalRegistryStoredProof(rows[0]); return rows[0];
}
export async function temporalRegistryCurrentProof(tx: TemporalRegistryDB, row: StoredTemporalClarification, actor: TemporalRegistryActor, env: ConnectorEnvironment) {
  const loaded = await temporalCurrentBinding(tx, actor, row.sourceOperationId, row.modelChildOperationId, env);
  if (canonicalJson(loaded.binding) !== canonicalJson(row.prepared.binding) || canonicalJson(loaded.source) !== canonicalJson(row.prepared.source)
    || canonicalJson((loaded.sourceResult as { personalModelReview?: unknown })?.personalModelReview) !== canonicalJson(row.reviewSnapshot)) throw new Error("TEMPORAL_REGISTRY_CONTEXT_CHANGED");
  const proof = await tx.$queryRawUnsafe<Array<{ result: unknown; request: { modelAuthorityFingerprint?: unknown }; resultEvidenceRef: string; responseEvidenceRef: string }>>(`SELECT c.result,c.request,o."resultEvidenceRef",a."responseEvidenceRef"
    FROM "PersonalAssistantOperation" c JOIN "ModelGatewayOperation" o ON o.id=c."modelGatewayOperationId" JOIN "ModelGatewayAttempt" a ON a.id=o."finalAttemptId"
    JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" AND d."gatewayOperationId"=o.id
    JOIN "AiOperation" ai ON ai.id=o."aiOperationId" AND ai."personalAssistantOperationId"=c."sourcePersonalOperationId"
    WHERE c.id=$1 AND c."workspaceId"=$2 AND c."createdByUserId"=$3 AND c."sourcePersonalOperationId"=$4 AND o.id=$5 AND c.status='completed'
      AND c.kind='personal_model_candidate_v1' AND c.attempts=1 AND o."operationType"='personal_intent_candidate_v1'
      AND ai.purpose='personal_intent_candidate_v1' AND ai.status='succeeded' AND ai.attempts=1 AND ai."resultId"=c.id
      AND ai."resultKind"='personal_model_proposal_inspected' AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL
      AND d.disposition='route_authorized' AND d.attempt=1 AND a."resultContractStatus"='valid' FOR SHARE OF c,o,a,d,ai`, row.modelChildOperationId, actor.workspaceId, actor.userId, row.sourceOperationId, row.modelGatewayOperationId);
  if (proof.length !== 1 || canonicalFingerprint(proof[0].result) !== row.proposalEvidenceRef || proof[0].resultEvidenceRef !== row.proposalEvidenceRef
    || proof[0].responseEvidenceRef !== row.proposalEvidenceRef) throw new Error("TEMPORAL_REGISTRY_MODEL_EVIDENCE_CHANGED");
  const model = await inspectModelAuthority(tx, { actorUserId: actor.userId,
    subject: { kind: "personal_assistant_operation", operationId: row.sourceOperationId, workspaceId: actor.workspaceId } }, loaded.now);
  if (model.accountId !== loaded.binding.modelAccountId || model.grantId !== loaded.binding.modelGrantId
    || model.fingerprint !== proof[0].request?.modelAuthorityFingerprint) throw new Error("TEMPORAL_REGISTRY_MODEL_AUTHORITY_CHANGED");
  return loaded;
}
