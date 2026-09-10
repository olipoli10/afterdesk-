import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction, settleAccountSpendHold } from "@/server/account-spend";
import { appendGatewayAuditEvent, canonicalFingerprint } from "../evidence";
import { gatewayBreakerScopes, loadGatewayBreakerResolution } from "../breakers";
import { loadGatewayPolicySnapshot, loadGatewayRouteSnapshots } from "../operations";
import { resolveGatewayPolicy } from "../policy";
import { buildVoiceGatewayRequest } from "../privacy";
import { inspectProjectBrainVoiceSessionInTransaction } from "./project-brain-sessions";
import { copyVerifiedVoiceSegmentProjection, type VoiceSegmentProjection } from "./projection";
import { checkVoiceSessionSpendHeadroom, voiceOperationKey } from "./operations";
import { VOICE_LIMITS } from "./types";
import type { PreparedProjectBrainVoiceAdmission, ProjectBrainVoiceActor, ProjectBrainVoiceAdmissionOptions } from "./project-brain-admission";

export type ProjectBrainSyntheticScenario = "SUCCESS" | "DELAYED_SUCCESS" | "UNKNOWN";
export type ProjectBrainVoiceDispatchInput = Readonly<{
  admission: PreparedProjectBrainVoiceAdmission; actor: ProjectBrainVoiceActor;
  abortSignal: AbortSignal; rollout?: ProjectBrainVoiceAdmissionOptions;
  /** Closed local test scenario, never a caller-provided transport callback. */
  syntheticScenario?: ProjectBrainSyntheticScenario;
}>;
class Refused extends Error {}
class Lost extends Error {}
function refused(reason: string): never { throw new Refused(reason); }
const notAuthorized = { executionAuthorized: false as const, externalTransportPerformed: false as const, processingMode: "SYNTHETIC_LOCAL" as const };
const lost = Object.freeze({ ...notAuthorized, status: "superseded" as const, reasonClass: "attempt_claim_lost" });
const utcNow = "(clock_timestamp() AT TIME ZONE 'UTC')";

function active(options: ProjectBrainVoiceAdmissionOptions, signal: AbortSignal, deadline: Date) {
  if (options.enabled !== true || options.environment !== "local" || options.voiceEnabled !== true || (options.env ?? process.env).NODE_ENV === "production") refused("voice_disabled");
  if (signal.aborted || Date.now() >= deadline.getTime()) refused("voice_session_expired");
}
function transaction<T>(deadline: Date, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    const remaining = Math.min(2_000, deadline.getTime() - Date.now());
    if (remaining <= 0) refused("voice_session_expired");
    await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(remaining), String(Math.min(250, remaining)));
    return callback(tx);
  }, { isolationLevel: "Serializable", maxWait: 250, timeout: Math.max(1, Math.min(5_000, deadline.getTime() - Date.now())) });
}

/** All source/config/budget facts are reloaded under caller transaction, not inferred
 * from a prepared object. Session advisory is taken before its shared-row inspection. */
async function current(tx: Prisma.TransactionClient, a: PreparedProjectBrainVoiceAdmission, actor: ProjectBrainVoiceActor,
  phase: "prepared" | "dispatched", options: ProjectBrainVoiceAdmissionOptions, signal: AbortSignal, deadline: Date) {
  active(options, signal, deadline);
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `voice-session-spend:${a.request.subject.sessionId}`);
  const inspected = await inspectProjectBrainVoiceSessionInTransaction(tx, { actorUserId: actor.id, workspaceId: actor.workspaceId, sessionId: a.request.subject.sessionId });
  const session = inspected.projection, segment = session.segments.find(row => row.segmentId === a.request.subject.segmentId);
  if (!segment || session.sessionStatus !== "transcribing" || segment.status !== (phase === "prepared" ? "registered" : "running")
    || session.sourceBindingHash !== a.sourceBindingHash || session.segmentManifestHash !== a.segmentManifestHash
    || session.segments.some(row => row.ordinal < segment.ordinal && row.status !== "succeeded" || row.ordinal > segment.ordinal && row.status !== "registered")) refused("voice_session_closed");
  const projection = copyVerifiedVoiceSegmentProjection(a.projection);
  if (projection.audioFingerprint !== segment.audioFingerprint || projection.byteCount !== segment.byteCount || projection.ordinal !== segment.ordinal
    || projection.durationMs !== segment.durationMs || projection.languageHint !== session.languageHint) refused("voice_segment_conflict");
  const policy = await loadGatewayPolicySnapshot(a.policy.id, tx);
  if (!policy || policy.maxAttempts !== 1 || policy.fallbackRules.length || policy.canonicalHash !== a.policy.canonicalHash) refused("ineligible_route");
  const request = buildVoiceGatewayRequest({ logicalOperationKey: voiceOperationKey(projection), tenantId: `construction-workspace:${actor.workspaceId}`,
    policyKey: policy.policyKey, dataClass: a.request.dataClass, privacyRequirement: a.request.privacyRequirement,
    maxTotalCostMicros: a.request.maxTotalCostMicros, projection, createdAt: new Date(inspected.databaseNow),
    projectBrainSubject: { kind: "project_brain_voice_segment", actorUserId: actor.id, workspaceId: actor.workspaceId, projectId: session.projectId,
      intakeId: session.intakeId, sourceId: session.sourceId, sessionId: session.sessionId, segmentId: segment.segmentId,
      sourceBindingHash: session.sourceBindingHash, segmentManifestHash: session.segmentManifestHash } });
  if (request.requestFingerprint !== a.request.requestFingerprint || request.outputContractHash !== a.request.outputContractHash
    || request.logicalOperationKey !== a.claim.operationKey || request.tenantId !== a.request.tenantId) refused("voice_segment_conflict");
  const routes = await loadGatewayRouteSnapshots(tx);
  const resolution = resolveGatewayPolicy({ request, policy, routes, now: new Date(inspected.databaseNow) });
  if (resolution.disposition !== "route_authorized" || resolution.route.id !== a.route.id || resolution.route.canonicalHash !== a.route.canonicalHash
    || resolution.route.adapterKey !== "voice-synthetic-direct" || resolution.route.billingProvider !== "synthetic" || resolution.route.intermediary !== null
    || resolution.privacyEvidenceHash !== a.decision.privacyEvidenceHash) refused("ineligible_route");
  const route = resolution.route;
  const privacyEvidenceHash = resolution.privacyEvidenceHash;
  const pins = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT p.id FROM "ModelGatewayPolicyVersion" p JOIN "ModelGatewayRouteProfile" r ON r.id=$2
     WHERE p.id=$1 AND p.status='published' AND r.status='published' AND p."canonicalHash"=$3 AND r."canonicalHash"=$4 FOR SHARE OF p,r`,
    policy.id, route.id, policy.canonicalHash, route.canonicalHash);
  if (pins.length !== 1) refused("ineligible_route");
  for (const scope of [...gatewayBreakerScopes({ policy, route })].sort((l, r) => `${l.scopeKind}:${l.scopeKey}`.localeCompare(`${r.scopeKind}:${r.scopeKey}`))) {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `gateway-breaker:${scope.scopeKind}:${scope.scopeKey}`);
  }
  const breaker = await loadGatewayBreakerResolution({ policy, route }, tx);
  if (breaker.status !== "clear" || breaker.generation !== a.decision.breakerGeneration) refused("open_breaker");
  const owners = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT ai.id FROM "AiOperation" ai JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId"
     JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" JOIN "ModelGatewayOperation" o ON o."aiOperationId"=ai.id
     JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=o.id JOIN "ModelGatewayAttempt" t ON t."decisionId"=d.id
     JOIN "AccountProviderSpendHold" h ON h.id=t."accountSpendHoldId"
     WHERE ai.id=$1 AND ai."lockedBy"=$2 AND ai.attempts=1 AND ai.status='running' AND ai."operationKey"=$3
       AND ai."taskId" IS NULL AND ai."personalAssistantOperationId" IS NULL AND ai.purpose='intake_voice_transcription'
       AND ai."leaseExpiresAt"=($4::timestamptz AT TIME ZONE 'UTC') AND ai."leaseExpiresAt">${utcNow}
       AND v.id=$5 AND s.id=$6 AND v."subjectKind"='project_brain_voice' AND v."clientId" IS NULL
       AND v."requestedByUserId"=$7 AND v."workspaceId"=$8 AND s."audioFingerprint"=$9
       AND o.id=$10 AND o."tenantId"=$11 AND o."requestFingerprint"=$12 AND o."outputContractHash"=$13
       AND o."policyVersionId"=$14 AND o."maxTotalCostMicros"=$15 AND o.status='admitted'
       AND d.id=$16 AND d.attempt=1 AND d."routeProfileId"=$17 AND d."policyHash"=$18 AND d."routeHash"=$19
       AND d."privacyEvidenceHash"=$20 AND d."breakerGeneration"=$21 AND d.disposition='route_authorized'
       AND t.id=$22 AND t.status=$23 AND t."dispatchState"=$24 AND t."requestEvidenceRef"=$25
       AND h.id=$26 AND h.provider='synthetic' AND h."operationKey"=ai."operationKey" AND h.attempt=1 AND h.status='held' AND h."amountMicros"=$15
     FOR UPDATE OF ai,s,v,o,t`,
    a.claim.operationId, a.claim.lockedBy, a.claim.operationKey, deadline, session.sessionId, segment.segmentId, actor.id, actor.workspaceId,
    projection.audioFingerprint, a.operation.id, request.tenantId, request.requestFingerprint, request.outputContractHash, policy.id, request.maxTotalCostMicros,
    a.decision.id, route.id, policy.canonicalHash, route.canonicalHash, resolution.privacyEvidenceHash, breaker.generation,
    a.attempt.id, phase, phase === "prepared" ? "not_dispatched" : "unaccounted", a.attempt.requestEvidenceRef, a.attempt.accountSpendHoldId);
  if (owners.length !== 1) throw new Lost();
  const holds = await tx.$queryRawUnsafe<Array<{ status: string; amountMicros: bigint; settledMicros: bigint | null }>>(
    `SELECT h.status,h."amountMicros",h."settledMicros" FROM "AccountProviderSpendHold" h JOIN "AiOperation" ai ON ai."operationKey"=h."operationKey"
     JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId" WHERE s."sessionId"=$1`, session.sessionId);
  if (!checkVoiceSessionSpendHeadroom({ sessionCeilingMicros: BigInt(session.sessionCostBoundMicros), holds, requestedMicros: 0n }).allowed) refused("insufficient_spend_headroom");
  const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
  if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime()) || clock.now.getTime() >= deadline.getTime()) refused("voice_session_expired");
  const ceilingConfiguration = (options.env ?? process.env).ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS;
  const hold = await reserveAccountProviderSpendInTransaction(tx, { provider: "synthetic", operationKey: a.claim.operationKey, attempt: 1,
    worstCaseMicros: request.maxTotalCostMicros, now: clock.now }, options.env ?? process.env);
  if (!hold.ok || hold.created || hold.holdId !== a.attempt.accountSpendHoldId || hold.grantedMicros !== request.maxTotalCostMicros) refused("insufficient_spend_headroom");
  // Preserve canonical provider/day advisory -> hold-row lock order. Taking h
  // above, before reserve's advisory, would invert another runner's order.
  const held = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "AccountProviderSpendHold" WHERE id=$1 AND provider='synthetic' AND "operationKey"=$2
     AND attempt=1 AND status='held' AND "amountMicros"=$3 AND "periodKey"=$4 FOR UPDATE`,
    a.attempt.accountSpendHoldId, a.claim.operationKey, request.maxTotalCostMicros, clock.now.toISOString().slice(0, 10));
  if (held.length !== 1) refused("insufficient_spend_headroom");
  function finalFence() {
    const finalNow = new Date(Math.max(Date.now(), clock.now.getTime()));
    if (finalNow.getTime() >= deadline.getTime() || finalNow.toISOString().slice(0, 10) !== clock.now.toISOString().slice(0, 10)) refused("voice_session_expired");
    if ((options.env ?? process.env).ACCOUNT_PROVIDER_SPEND_CEILING_SYNTHETIC_MICROS !== ceilingConfiguration) refused("insufficient_spend_headroom");
    const final = resolveGatewayPolicy({ request, policy, routes, now: finalNow });
    if (final.disposition !== "route_authorized" || final.route.id !== route.id || final.privacyEvidenceHash !== privacyEvidenceHash) refused("ineligible_route");
    active(options, signal, deadline);
  }
  finalFence();
  active(options, signal, deadline);
  return { projection, expiresAt: new Date(session.expiresAt), finalFence };
}

/** Private deterministic implementation: no fetch, provider adapter, callback, key or
 * actual speech recognition. A synthetic result is unmistakably labeled as such. */
async function synthetic(projection: VoiceSegmentProjection, scenario: ProjectBrainSyntheticScenario) {
  if (scenario === "DELAYED_SUCCESS") await new Promise<void>(resolve => setTimeout(resolve, 25));
  if (scenario === "UNKNOWN") throw new Error("SYNTHETIC_UNKNOWN");
  const text = `SYNTHETIC_LOCAL — no speech was transcribed. Segment ${projection.ordinal}: ${projection.audioFingerprint}.`;
  return Object.freeze({ text, textFingerprint: canonicalFingerprint(text), costMicros: 0n,
    evidence: canonicalFingerprint({ mode: "SYNTHETIC_LOCAL", audioFingerprint: projection.audioFingerprint, text, costMicros: "0" }) });
}

/** Cleanup only our already-committed dispatch claim, never a losing caller's
 * tentative claim or any successor. Revoked source authority does not prevent
 * retention of uncertainty; no transcript/hold release is made in this function. */
async function retain(a: PreparedProjectBrainVoiceAdmission, callbackStarted: boolean, reason: string) {
  return transaction(new Date(Date.now() + 2_000), async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `voice-session-spend:${a.request.subject.sessionId}`);
    const owners = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT ai.id FROM "AiOperation" ai JOIN "VoiceIntakeSegment" s ON s.id=ai."voiceIntakeSegmentId"
       JOIN "VoiceIntakeSession" v ON v.id=s."sessionId" JOIN "ModelGatewayOperation" o ON o."aiOperationId"=ai.id
       JOIN "ModelGatewayDecision" d ON d."gatewayOperationId"=o.id JOIN "ModelGatewayAttempt" t ON t."decisionId"=d.id
       WHERE ai.id=$1 AND ai."lockedBy"=$2 AND ai.status='running' AND ai.attempts=1 AND ai."operationKey"=$3
         AND v."subjectKind"='project_brain_voice' AND v."requestedByUserId"=$4 AND v."workspaceId"=$5
         AND v.id=$6 AND s.id=$7 AND s.status='running' AND o.id=$8 AND o.status='admitted'
         AND d.id=$9 AND t.id=$10 AND t.status='dispatched' AND t."dispatchState"='unaccounted' AND t."accountSpendHoldId"=$11
         AND ai."leaseExpiresAt"=($12::timestamptz AT TIME ZONE 'UTC')
       FOR UPDATE OF ai,s,o,t`, a.claim.operationId, a.claim.lockedBy, a.claim.operationKey, a.actor.id, a.actor.workspaceId,
      a.request.subject.sessionId, a.request.subject.segmentId, a.operation.id, a.decision.id, a.attempt.id, a.attempt.accountSpendHoldId, new Date(a.deadline));
    if (owners.length !== 1) return lost;
    const status = callbackStarted ? "uncertain" : "cancelled_before_dispatch", dispatchState = callbackStarted ? "unaccounted" : "not_dispatched";
    await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status=$2,"dispatchState"=$3,"errorClass"=$4,"finishedAt"=${utcNow} WHERE id=$1`, a.attempt.id, status, dispatchState, reason);
    await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status=$2,"finalAttemptId"=$3,"finishedAt"=${utcNow} WHERE id=$1`, a.operation.id, callbackStarted ? "uncertain" : "refused", a.attempt.id);
    await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status=$2::"VoiceIntakeSegmentStatus","updatedAt"=${utcNow} WHERE id=$1`, a.request.subject.segmentId, callbackStarted ? "uncertain" : "failed");
    await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='abandoned',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"finishedAt"=${utcNow},"lastError"=$3,"updatedAt"=${utcNow} WHERE id=$1 AND "lockedBy"=$2`, a.claim.operationId, a.claim.lockedBy, reason);
    await appendGatewayAuditEvent(tx, { eventType: callbackStarted ? "model_gateway.attempt.uncertain" : "model_gateway.admission.refused",
      correlationId: `gateway:${a.operation.id}`, gatewayOperationId: a.operation.id, tenantId: a.request.tenantId, attemptId: a.attempt.id,
      decisionId: a.decision.id, spendHoldId: a.attempt.accountSpendHoldId, billingProvider: "synthetic", errorClass: reason, dispatchState });
    return Object.freeze({ ...notAuthorized, status: callbackStarted ? "uncertain" as const : "cancelled_before_dispatch" as const,
      reasonClass: reason, syntheticInvocationAttempted: callbackStarted, exposureRetained: true as const });
  });
}

/** Internal PB branch of dispatchVoiceGatewayAttempt, never another gateway. */
export async function dispatchProjectBrainVoiceAttempt(input: ProjectBrainVoiceDispatchInput) {
  const options = input.rollout ?? {};
  if (options.enabled !== true || options.environment !== "local" || options.voiceEnabled !== true || (options.env ?? process.env).NODE_ENV === "production") return Object.freeze({ ...notAuthorized, status: "refused" as const, reasonClass: "voice_disabled" });
  const actor = Object.freeze(z.object({ kind: z.literal("PROJECT_BRAIN_OWNER"), id: z.string().min(1).max(200), workspaceId: z.string().min(1).max(200) }).strict().parse(input.actor));
  if (!(input.admission?.projection?.audioBytes instanceof Uint8Array) || input.admission.projection.audioBytes.byteLength < 1
    || input.admission.projection.audioBytes.byteLength > VOICE_LIMITS.maxSegmentBytes) return Object.freeze({ ...notAuthorized, status: "refused" as const, reasonClass: "voice_segment_conflict" });
  // Snapshot every caller-reachable object before any await. Bytes are copied and
  // hashed again immediately before the private invocation below.
  const a: PreparedProjectBrainVoiceAdmission = structuredClone(input.admission);
  const scenario = z.enum(["SUCCESS", "DELAYED_SUCCESS", "UNKNOWN"]).parse(input.syntheticScenario ?? "SUCCESS");
  const signal = input.abortSignal, deadline = new Date(a.deadline);
  if (a.status !== "prepared_synthetic_not_dispatched" || a.transportMode !== "SYNTHETIC_LOCAL" || a.executionAuthorized !== false
    || a.actorId !== actor.id || a.actor.id !== actor.id || a.actor.workspaceId !== actor.workspaceId || a.request.subject.kind !== "project_brain_voice_segment"
    || a.claim.attempt !== 1 || !Number.isFinite(deadline.getTime()) || deadline.getTime() > Date.now() + 60_000) return Object.freeze({ ...notAuthorized, status: "refused" as const, reasonClass: "voice_subject_not_supported" });
  let acquired = false, callbackStarted = false;
  try {
    await transaction(deadline, async tx => {
      await current(tx, a, actor, "prepared", options, signal, deadline);
      const changed = await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='dispatched',"dispatchState"='unaccounted',"dispatchedAt"=${utcNow} WHERE id=$1 AND status='prepared' AND "dispatchState"='not_dispatched'`, a.attempt.id);
      if (changed !== 1) throw new Lost();
      const segment = await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status='running',"updatedAt"=${utcNow} WHERE id=$1 AND status='registered'`, a.request.subject.segmentId);
      if (segment !== 1) throw new Lost();
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.dispatched", correlationId: `gateway:${a.operation.id}`, gatewayOperationId: a.operation.id,
        tenantId: a.request.tenantId, attemptId: a.attempt.id, decisionId: a.decision.id, spendHoldId: a.attempt.accountSpendHoldId,
        billingProvider: "synthetic", dispatchState: "unaccounted", evidenceRef: a.attempt.requestEvidenceRef as `sha256:${string}` });
    });
    acquired = true; // Only after commit; a loser/unknown commit cannot clean up a winner.
    const boxed = await transaction(deadline, async tx => {
      const context = await current(tx, a, actor, "dispatched", options, signal, deadline);
      const privateProjection = copyVerifiedVoiceSegmentProjection(context.projection);
      context.finalFence(); callbackStarted = true;
      // Attach rejection handling immediately; never await simulated latency while
      // holding DB locks. No transport function is accepted from the caller.
      const outcome = synthetic(privateProjection, scenario).then(value => ({ ok: true as const, value }), () => ({ ok: false as const }));
      return { outcome };
    });
    const outcome = await boxed.outcome;
    if (!outcome.ok) refused("unknown_dispatched_outcome");
    const receipt = outcome.value;
    return await transaction(deadline, async tx => {
      const context = await current(tx, a, actor, "dispatched", options, signal, deadline);
      if (receipt.costMicros !== 0n || canonicalFingerprint(receipt.text) !== receipt.textFingerprint) refused("unknown_dispatched_outcome");
      const transcriptId = `vts_${randomUUID().replaceAll("-", "")}`;
      const claimed = await tx.$executeRawUnsafe(`UPDATE "AiOperation" SET status='succeeded',"lockedBy"=NULL,"leaseExpiresAt"=NULL,"resultKind"='VoiceTranscriptSegment',"resultId"=$3,"finishedAt"=${utcNow},"updatedAt"=${utcNow} WHERE id=$1 AND "lockedBy"=$2 AND status='running' AND attempts=1 AND "leaseExpiresAt">${utcNow}`, a.claim.operationId, a.claim.lockedBy, transcriptId);
      if (claimed !== 1) throw new Lost();
      await settleAccountSpendHold(tx, a.attempt.accountSpendHoldId, 0n); // Only closed deterministic synthetic accounting, not provider billing.
      const settled = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "AccountProviderSpendHold" WHERE id=$1 AND provider='synthetic' AND "operationKey"=$2
         AND attempt=1 AND status='settled' AND "settledMicros"=0 AND "amountMicros"=$3 FOR SHARE`,
        a.attempt.accountSpendHoldId, a.claim.operationKey, a.request.maxTotalCostMicros);
      if (settled.length !== 1) refused("unknown_dispatched_outcome");
      const finished = await tx.$executeRawUnsafe(`UPDATE "ModelGatewayAttempt" SET status='settled',"dispatchState"='settled',"resultContractStatus"='valid',"responseEvidenceRef"=$2,"finishedAt"=${utcNow} WHERE id=$1 AND status='dispatched' AND "dispatchState"='unaccounted'`, a.attempt.id, receipt.evidence);
      if (finished !== 1) throw new Lost();
      await tx.$executeRawUnsafe(`UPDATE "ModelGatewayOperation" SET status='succeeded',"finalAttemptId"=$2,"resultEvidenceRef"=$3,"finishedAt"=${utcNow} WHERE id=$1`, a.operation.id, a.attempt.id, receipt.evidence);
      await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSegment" SET status='succeeded',"updatedAt"=${utcNow} WHERE id=$1`, a.request.subject.segmentId);
      await tx.$executeRawUnsafe(`INSERT INTO "VoiceTranscriptSegment" (id,"segmentId","gatewayAttemptId",text,"textFingerprint","characterCount","reportedAudioSeconds","measuredCostMicros","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,0,($8::timestamptz AT TIME ZONE 'UTC'),${utcNow})`,
        transcriptId, a.request.subject.segmentId, a.attempt.id, receipt.text, receipt.textFingerprint, receipt.text.length, context.projection.durationMs / 1_000, context.expiresAt);
      await appendGatewayAuditEvent(tx, { eventType: "model_gateway.attempt.settled", correlationId: `gateway:${a.operation.id}`, gatewayOperationId: a.operation.id,
        tenantId: a.request.tenantId, attemptId: a.attempt.id, spendHoldId: a.attempt.accountSpendHoldId, billingProvider: "synthetic",
        amountMicros: 0n, dispatchState: "settled", resultContractStatus: "valid", evidenceRef: receipt.evidence });
      context.finalFence();
      return Object.freeze({ ...notAuthorized, status: "synthetic_succeeded" as const, syntheticInvocationAttempted: true as const,
        segmentId: a.request.subject.segmentId, transcriptId, textFingerprint: receipt.textFingerprint, transcriptionQualityVerified: false as const });
    });
  } catch (error) {
    if (!acquired) {
      if (error instanceof Lost) return lost;
      if (error instanceof Refused) return Object.freeze({ ...notAuthorized, status: "refused" as const, reasonClass: error.message });
      throw error; // Unknown claim commit: leave durable evidence untouched; never retry.
    }
    return retain(a, callbackStarted, callbackStarted ? "unknown_dispatched_outcome" : "voice_session_closed");
  }
}
