import "server-only";
import { canonicalFingerprint, canonicalJson } from "@/server/model-gateway/evidence";
import { smsTemporalClarificationQuestionRequest } from "./sms-temporal-clarification";
import { temporalRegistryCurrentProof, temporalRegistryLockProof } from "./sms-temporal-clarification-proof";
import { temporalRegistryClock, temporalRegistryEnabled, temporalRegistryTransaction, temporalRequireLive,
  type TemporalRegistryContext, type TemporalRegistryDB } from "./sms-temporal-clarification-authority";
import type { ConnectorEnvironment } from "./google-client";
import type { PersonalOutbound } from "./twilio-outbound";

type OutboundIdentity = Readonly<{ id: string; workspaceId: string; createdByUserId: string; kind: string; idempotencyKey: string; requestHash: string }>;
export function requireTemporalOutboundBridgeEnabled(env: ConnectorEnvironment) {
  if (!temporalRegistryEnabled(env) || env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED !== "true") throw new Error("TEMPORAL_OUTBOUND_BRIDGE_DISABLED");
}

/** Internal restriction on an EXISTING ordinary reply, never sending authority.
 * Discovery runs even when OFF: an attached question must not downgrade to an
 * ordinary send. Namespace and registry locks precede outbox/budget row locks.
 */
export async function inspectTemporalOutboundSourceInTransaction(tx: TemporalRegistryDB, row: OutboundIdentity,
  request: PersonalOutbound, env: ConnectorEnvironment, context: TemporalRegistryContext) {
  const requireTime = () => { if (!Number.isFinite(context.deadlineAt) || Date.now() >= context.deadlineAt || context.signal?.aborted) throw new Error("TEMPORAL_OUTBOUND_DEADLINE"); };
  requireTime();
  const attachments = await tx.$queryRawUnsafe<Array<{ id: string; workspaceId: string; userId: string }>>(
    `SELECT id,"workspaceId","userId" FROM "PersonalSmsTemporalClarification" WHERE "questionOutboundOperationId"=$1 LIMIT 2`, row.id);
  requireTime();
  if (attachments.length === 0) return null;
  requireTemporalOutboundBridgeEnabled(env);
  if (attachments.length !== 1 || attachments[0].workspaceId !== row.workspaceId || attachments[0].userId !== row.createdByUserId
    || row.kind !== "sms_outbound" || !request.sourceOperationId || row.idempotencyKey !== `reply:${request.sourceOperationId}`) throw new Error("TEMPORAL_OUTBOUND_ATTACHMENT_CHANGED");
  await temporalRegistryTransaction(tx, context, env);
  const actor = { userId: row.createdByUserId, workspaceId: row.workspaceId };
  const stored = await temporalRegistryLockProof(tx, actor, attachments[0].id, context, env);
  if (stored.phase !== "PREPARED" || stored.questionOutboundOperationId !== row.id || stored.sourceOperationId !== request.sourceOperationId
    || stored.questionRequestHash !== row.requestHash || canonicalJson(smsTemporalClarificationQuestionRequest(stored.prepared)) !== canonicalJson(request)) throw new Error("TEMPORAL_OUTBOUND_QUESTION_CHANGED");
  await temporalRegistryCurrentProof(tx, stored, actor, env);
  const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "PersonalSmsConversationExpectation" WHERE namespace=$1 AND active FOR SHARE`, stored.namespace);
  if (active.length !== 1 || active[0].id !== `temporal:${stored.id}`) throw new Error("TEMPORAL_OUTBOUND_EXPECTATION_CHANGED");
  const now = await temporalRegistryClock(tx);
  temporalRequireLive(context, env);
  requireTemporalOutboundBridgeEnabled(env);
  if (stored.expiresAt <= now || stored.expiresAt.getTime() <= Date.now()) throw new Error("TEMPORAL_OUTBOUND_EXPIRED");
  const proof = { clarificationId: stored.id, namespace: stored.namespace, workspaceId: row.workspaceId, userId: row.createdByUserId,
    preparedHash: stored.preparedHash, bindingHash: stored.bindingHash, questionRequestHash: stored.questionRequestHash,
    sourceOperationId: stored.sourceOperationId, expiresAt: stored.expiresAt.toISOString(), executionAuthorized: false as const };
  return Object.freeze({ ...proof, fingerprint: canonicalFingerprint(proof) });
}
