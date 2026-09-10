import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reserveAccountProviderSpendInTransaction, resolveAccountSpendCeilingMicros } from "@/server/account-spend";
import { canonicalFingerprint } from "../evidence";
import { gatewayBreakerScopes, loadGatewayBreakerResolution } from "../breakers";
import { bindGatewayOperation, createGatewayAttempt, loadGatewayPolicySnapshot, loadGatewayRouteSnapshots, persistGatewayDecision } from "../operations";
import { buildVoiceGatewayRequest } from "../privacy";
import { resolveGatewayPolicy } from "../policy";
import type { GatewayDataClass, GatewayPrivacyRequirement } from "../types";
import type { AuthorizedVoiceGatewayAdmission } from "./dispatch";
import { inspectProjectBrainVoiceSessionInTransaction } from "./project-brain-sessions";
import { buildVoiceSegmentProjection } from "./projection";
import { checkVoiceSessionSpendHeadroom, reserveAndClaimProjectBrainVoiceOperationInTransaction, voiceOperationKey } from "./operations";
import { VOICE_LIMITS } from "./types";

export type ProjectBrainVoiceActor = Readonly<{ kind: "PROJECT_BRAIN_OWNER"; id: string; workspaceId: string }>;
export type ProjectBrainVoiceAdmissionInput = Readonly<{
  actor: ProjectBrainVoiceActor; sessionId: string; segmentId: string; audioBytes: Uint8Array; policyId: string;
  dataClass: GatewayDataClass; privacyRequirement: GatewayPrivacyRequirement; maxSegmentCostMicros: bigint; deadline: Date;
}>;
export type ProjectBrainVoiceAdmissionOptions = Readonly<{ enabled?: boolean; environment?: string; voiceEnabled?: boolean; env?: NodeJS.ProcessEnv }>;
export type PreparedProjectBrainVoiceAdmission = Omit<AuthorizedVoiceGatewayAdmission, "status"> & Readonly<{
  status: "prepared_synthetic_not_dispatched"; executionAuthorized: false; transportMode: "SYNTHETIC_LOCAL";
  actor: ProjectBrainVoiceActor; deadline: string; sourceBindingHash: string; segmentManifestHash: string;
}>;
class Refused extends Error {}
function refuse(reason: string): never { throw new Refused(reason); }
const identifier = z.string().min(1).max(200);

/** Internal branch of admitGatewayVoiceSegment. No transport or alternative operation ledger. */
export async function prepareProjectBrainVoiceAdmission(input: ProjectBrainVoiceAdmissionInput, options: ProjectBrainVoiceAdmissionOptions = {}): Promise<
  PreparedProjectBrainVoiceAdmission | Readonly<{ status: "refused"; reasonClass: string }> | Readonly<{ status: "busy" }>
> {
  if (options.enabled !== true || options.environment !== "local" || options.voiceEnabled !== true) return Object.freeze({ status: "refused", reasonClass: "voice_disabled" });
  const actor = Object.freeze(z.object({ kind: z.literal("PROJECT_BRAIN_OWNER"), id: identifier, workspaceId: identifier }).strict().parse(input.actor));
  const requestIds = z.object({ sessionId: identifier, segmentId: identifier, policyId: identifier }).strict().parse({ sessionId: input.sessionId, segmentId: input.segmentId, policyId: input.policyId });
  const { dataClass, privacyRequirement, maxSegmentCostMicros } = input;
  const deadline = new Date(input.deadline.getTime());
  const env = options.env ?? process.env; // Trusted server configuration; never model/user text.
  if (env.NODE_ENV === "production" || !Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now() || deadline.getTime() > Date.now() + 60_000
    || typeof maxSegmentCostMicros !== "bigint" || maxSegmentCostMicros <= 0n) return Object.freeze({ status: "refused", reasonClass: "voice_not_configured" });
  if (!(input.audioBytes instanceof Uint8Array) || input.audioBytes.byteLength < 1 || input.audioBytes.byteLength > VOICE_LIMITS.maxSegmentBytes) return Object.freeze({ status: "refused", reasonClass: "voice_segment_conflict" });
  const bytes = new Uint8Array(input.audioBytes);
  try {
    return await prisma.$transaction(async tx => {
      const remaining = Math.min(2_000, deadline.getTime() - Date.now());
      if (remaining <= 0) refuse("voice_session_expired");
      await tx.$queryRawUnsafe("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", String(remaining), String(Math.min(250, remaining)));
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `voice-session-spend:${requestIds.sessionId}`);
      const inspected = await inspectProjectBrainVoiceSessionInTransaction(tx, { actorUserId: actor.id, workspaceId: actor.workspaceId, sessionId: requestIds.sessionId });
      const session = inspected.projection;
      if (!["finishing", "transcribing"].includes(session.sessionStatus)) refuse("voice_session_closed");
      const segment = session.segments.find(row => row.segmentId === requestIds.segmentId);
      if (!segment) refuse("voice_segment_missing");
      if (segment.status !== "registered") return Object.freeze({ status: "busy" as const });
      if (session.segments.some(row => row.ordinal < segment.ordinal && row.status !== "succeeded"
        || row.ordinal > segment.ordinal && row.status !== "registered")) refuse("voice_transcript_incomplete");
      const metadata = inspected.manifest.segments[segment.ordinal];
      const projection = buildVoiceSegmentProjection({ sessionId: session.sessionId, segmentId: segment.segmentId, ordinal: segment.ordinal,
        languageHint: session.languageHint, mediaFormat: metadata.mediaFormat, mimeType: metadata.mimeType, durationMs: segment.durationMs, audioBytes: bytes });
      if (projection.audioFingerprint !== segment.audioFingerprint || projection.byteCount !== segment.byteCount || projection.mimeType !== metadata.mimeType) refuse("voice_segment_conflict");
      const policy = await loadGatewayPolicySnapshot(requestIds.policyId, tx);
      if (!policy || policy.maxAttempts !== 1 || policy.fallbackRules.length !== 0) refuse("unpublished_policy");
      const request = buildVoiceGatewayRequest({ logicalOperationKey: voiceOperationKey(projection), tenantId: `construction-workspace:${actor.workspaceId}`,
        policyKey: policy.policyKey, dataClass, privacyRequirement, maxTotalCostMicros: maxSegmentCostMicros, projection,
        projectBrainSubject: { kind: "project_brain_voice_segment", actorUserId: actor.id, workspaceId: actor.workspaceId, projectId: session.projectId,
          intakeId: session.intakeId, sourceId: session.sourceId, sessionId: session.sessionId, segmentId: segment.segmentId,
          sourceBindingHash: session.sourceBindingHash, segmentManifestHash: session.segmentManifestHash }, createdAt: new Date(inspected.databaseNow) });
      const routes = await loadGatewayRouteSnapshots(tx);
      const resolution = resolveGatewayPolicy({ request, policy, routes, now: new Date(inspected.databaseNow) });
      if (resolution.disposition !== "route_authorized") refuse(resolution.reasonClass);
      const route = resolution.route;
      if (route.adapterKey !== "voice-synthetic-direct" || route.billingProvider !== "synthetic" || route.intermediary !== null) refuse("ineligible_route");
      const pins = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT p.id FROM "ModelGatewayPolicyVersion" p JOIN "ModelGatewayRouteProfile" r ON r.id=$2
         WHERE p.id=$1 AND p.status='published' AND r.status='published' AND p."canonicalHash"=$3 AND r."canonicalHash"=$4 FOR SHARE OF p,r`,
        policy.id, route.id, policy.canonicalHash, route.canonicalHash,
      );
      if (pins.length !== 1) refuse("ineligible_route");
      for (const scope of [...gatewayBreakerScopes({ policy, route })].sort((a, b) => `${a.scopeKind}:${a.scopeKey}`.localeCompare(`${b.scopeKind}:${b.scopeKey}`))) {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `gateway-breaker:${scope.scopeKind}:${scope.scopeKey}`);
      }
      const breaker = await loadGatewayBreakerResolution({ policy, route }, tx);
      if (breaker.status !== "clear") refuse("open_breaker");
      if (resolveAccountSpendCeilingMicros("synthetic", env) === null) refuse("insufficient_spend_headroom");
      const sessionLocks = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "VoiceIntakeSession" WHERE id=$1 AND "subjectKind"='project_brain_voice' FOR UPDATE`, session.sessionId);
      if (sessionLocks.length !== 1) refuse("voice_session_closed");
      const holds = await tx.$queryRawUnsafe<Array<{ status: string; amountMicros: bigint; settledMicros: bigint | null }>>(
        `SELECT h.status,h."amountMicros",h."settledMicros" FROM "AccountProviderSpendHold" h JOIN "AiOperation" a ON a."operationKey"=h."operationKey"
         JOIN "VoiceIntakeSegment" s ON s.id=a."voiceIntakeSegmentId" WHERE s."sessionId"=$1`, session.sessionId,
      );
      const headroom = checkVoiceSessionSpendHeadroom({ sessionCeilingMicros: BigInt(session.sessionCostBoundMicros), holds, requestedMicros: maxSegmentCostMicros });
      if (!headroom.allowed) refuse("insufficient_spend_headroom");
      const [clock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
      if (!(clock?.now instanceof Date) || !Number.isFinite(clock.now.getTime())) refuse("voice_not_configured");
      const currentResolution = resolveGatewayPolicy({ request, policy, routes, now: clock.now });
      if (currentResolution.disposition !== "route_authorized" || currentResolution.route.id !== route.id
        || currentResolution.route.canonicalHash !== route.canonicalHash || currentResolution.privacyEvidenceHash !== resolution.privacyEvidenceHash) refuse("ineligible_route");
      const leaseUntil = new Date(Math.min(deadline.getTime(), new Date(session.expiresAt).getTime()));
      if (clock.now.getTime() >= leaseUntil.getTime()) refuse("voice_session_expired");
      const claimed = await reserveAndClaimProjectBrainVoiceOperationInTransaction(tx, { actorUserId: actor.id, workspaceId: actor.workspaceId,
        sessionId: session.sessionId, segmentId: segment.segmentId, audioFingerprint: segment.audioFingerprint, now: clock.now, leaseUntil });
      if (claimed.status === "existing") return Object.freeze({ status: "busy" as const });
      const holdInput = { provider: "synthetic", operationKey: claimed.claim.operationKey, attempt: 1, worstCaseMicros: maxSegmentCostMicros, now: clock.now };
      const hold = await reserveAccountProviderSpendInTransaction(tx, holdInput, env);
      if (!hold.ok || !hold.created || hold.grantedMicros !== maxSegmentCostMicros) refuse("insufficient_spend_headroom");
      await tx.$executeRawUnsafe(`UPDATE "VoiceIntakeSession" SET status='transcribing',"updatedAt"=($2::timestamptz AT TIME ZONE 'UTC') WHERE id=$1 AND status='finishing'`, session.sessionId, clock.now);
      const operation = await bindGatewayOperation(tx, { aiOperationId: claimed.claim.operationId, tenantId: request.tenantId, operationType: request.operationType,
        requestFingerprint: request.requestFingerprint, outputContractHash: request.outputContractHash, dataClass, privacyRequirement,
        policyVersionId: policy.id, maxTotalCostMicros: maxSegmentCostMicros });
      const decision = await persistGatewayDecision(tx, { gatewayOperationId: operation.id, attempt: 1, disposition: "route_authorized", routeProfileId: route.id,
        reasonClass: resolution.reasonClass, policyHash: policy.canonicalHash, routeHash: route.canonicalHash, privacyEvidenceHash: resolution.privacyEvidenceHash,
        breakerGeneration: breaker.generation, remainingCostMicros: headroom.remainingMicros - maxSegmentCostMicros });
      const attempt = await createGatewayAttempt(tx, { decisionId: decision.id, accountSpendHoldId: hold.holdId,
        requestEvidenceRef: canonicalFingerprint({ operationType: request.operationType, requestFingerprint: request.requestFingerprint,
          outputContractHash: request.outputContractHash, routeHash: route.canonicalHash }) });
      const [finalClock] = await tx.$queryRawUnsafe<Array<{ now: Date }>>("SELECT clock_timestamp() AS now");
      if (!(finalClock?.now instanceof Date) || !Number.isFinite(finalClock.now.getTime()) || finalClock.now.getTime() >= leaseUntil.getTime()) refuse("voice_session_expired");
      const finalResolution = resolveGatewayPolicy({ request, policy, routes, now: finalClock.now });
      if (finalResolution.disposition !== "route_authorized" || finalResolution.route.id !== route.id
        || finalResolution.route.canonicalHash !== route.canonicalHash || finalResolution.privacyEvidenceHash !== resolution.privacyEvidenceHash) refuse("ineligible_route");
      const verifiedHold = await reserveAccountProviderSpendInTransaction(tx, { ...holdInput, now: finalClock.now }, env);
      if (!verifiedHold.ok || verifiedHold.created || verifiedHold.holdId !== hold.holdId || verifiedHold.grantedMicros !== maxSegmentCostMicros) refuse("insufficient_spend_headroom");
      if (Date.now() >= leaseUntil.getTime()) refuse("voice_session_expired");
      const commitResolution = resolveGatewayPolicy({ request, policy, routes, now: new Date(Math.max(Date.now(), finalClock.now.getTime())) });
      if (commitResolution.disposition !== "route_authorized" || commitResolution.route.id !== route.id
        || commitResolution.route.canonicalHash !== route.canonicalHash || commitResolution.privacyEvidenceHash !== resolution.privacyEvidenceHash) refuse("ineligible_route");
      return Object.freeze({ status: "prepared_synthetic_not_dispatched" as const, executionAuthorized: false as const, transportMode: "SYNTHETIC_LOCAL" as const,
        actorId: actor.id, actor, claim: claimed.claim, request, projection, policy, route, operation, decision, attempt,
        deadline: leaseUntil.toISOString(), sourceBindingHash: session.sourceBindingHash, segmentManifestHash: session.segmentManifestHash });
    }, { isolationLevel: "Serializable", timeout: Math.max(1, Math.min(5_000, deadline.getTime() - Date.now())), maxWait: 250 });
  } catch (error) {
    if (error instanceof Refused) return Object.freeze({ status: "refused", reasonClass: error.message });
    throw error; // No retry or out-of-transaction hold release on unknown commit.
  }
}
