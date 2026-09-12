import "server-only";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { canonicalFingerprint } from "../evidence";
import { inspectPersonalGatewaySubject } from "../personal-subject";
import { inspectModelAuthority } from "./admission";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { inspectPersonalIntentCandidate } from "./contract";

const id = z.string().min(1).max(191);
const fingerprint = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const inputSchema = z.object({ enabled: z.boolean().optional(), userId: id, workspaceId: id, sourceOperationId: id, modelChildOperationId: id }).strict();
export type PersonalIntentReviewInput = Readonly<z.infer<typeof inputSchema>>;
const childRequestSchema = z.object({ schemaVersion: z.literal(1), sourceOperationId: id, requestFingerprint: fingerprint,
  sourceAuthorityFingerprint: fingerprint, modelAuthorityFingerprint: fingerprint, reviewedRateFingerprint: fingerprint,
  gatewayOperationId: id, policyHash: fingerprint, routeHash: fingerprint, pilotEnvelopeFingerprint: fingerprint,
  budgetId: id, reservedCadMicros: z.string().regex(/^\d+$/), reservedUsdMicros: z.string().regex(/^\d+$/) }).strict();
const storedSchema = z.object({ schemaVersion: z.literal(1), status: z.literal("PROPOSAL_STORED_NOT_AUTHORIZED"),
  executionAuthorized: z.literal(false), readyForActionPreparation: z.literal(false), accounting: z.literal("UNSETTLED"),
  automaticRetry: z.literal(false), transportMode: z.enum(["SYNTHETIC_LOCAL", "EXTERNAL_PROVIDER"]), dispatchAttempted: z.literal(true),
  outcomeKnowledge: z.literal("RESPONSE_RECEIVED_COST_UNSETTLED"), proposal: z.unknown(), temporal: z.array(z.unknown()).max(10) }).strict();
type Row = { request: unknown; requestHash: string; result: unknown; resultEvidenceRef: string; responseEvidenceRef: string;
  gatewayId: string; requestFingerprint: string; policyHash: string; routeHash: string; connectorAccountId: string;
  sourceRequest: { from?: string; to?: string }; now: Date };
/** Read-only proof inspection under the caller's source transaction. Locks and
 * validates existing rows only; never prepares a draft or executes an action. */
export async function loadStoredPersonalIntentReviewProof(tx: Prisma.TransactionClient, untrusted: PersonalIntentReviewInput, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (untrusted.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  const input = inputSchema.parse(untrusted);
  const rows = await tx.$queryRawUnsafe<Row[]>(
    `SELECT c.request,c."requestHash",c.result,c."connectorAccountId",o.id "gatewayId",o."requestFingerprint",o."resultEvidenceRef",
      a."responseEvidenceRef",d."policyHash",d."routeHash",s.request "sourceRequest",CURRENT_TIMESTAMP AS now
    FROM "PersonalAssistantOperation" c JOIN "PersonalAssistantOperation" s ON s.id=c."sourcePersonalOperationId"
      AND s."workspaceId"=c."workspaceId" AND s."createdByUserId"=c."createdByUserId"
    JOIN "ModelGatewayOperation" o ON o.id=c."modelGatewayOperationId"
    JOIN "AiOperation" ai ON ai.id=o."aiOperationId" AND ai."personalAssistantOperationId"=s.id
    JOIN "ModelGatewayAttempt" a ON a.id=o."finalAttemptId"
    JOIN "ModelGatewayDecision" d ON d.id=a."decisionId" AND d."gatewayOperationId"=o.id
    WHERE c.id=$1 AND s.id=$2 AND c."workspaceId"=$3 AND c."createdByUserId"=$4
      AND c.kind='personal_model_candidate_v1' AND c.status='completed' AND c.attempts=1
      AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">(now() AT TIME ZONE 'UTC')
      AND o."operationType"='personal_intent_candidate_v1' AND o.status='uncertain'
      AND ai.purpose='personal_intent_candidate_v1' AND ai.status='succeeded' AND ai.attempts=1
      AND ai."taskId" IS NULL AND ai."voiceIntakeSegmentId" IS NULL AND ai."resultId"=c.id
      AND ai."resultKind"='personal_model_proposal_inspected'
      AND a.status='uncertain' AND a."dispatchState"='unaccounted' AND a."resultContractStatus"='valid'
      AND d.disposition='route_authorized' AND d.attempt=1 FOR UPDATE OF c,s`,
    input.modelChildOperationId, input.sourceOperationId, input.workspaceId, input.userId);
  if (rows.length !== 1) throw new Error("PERSONAL_REVIEW_BOUND_RESULT_REQUIRED");
  const row = rows[0];
  if (!(row.now instanceof Date) || !Number.isFinite(row.now.getTime()) || row.now.getTime() < Date.parse("2026-09-10T01:18:26Z")
    || row.now.getTime() >= Date.parse("2026-10-10T01:18:26Z") || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY
    || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") throw new Error("PERSONAL_REVIEW_PILOT_INACTIVE");
  const source = await inspectPersonalGatewaySubject(tx, { kind: "personal_assistant_operation", operationId: input.sourceOperationId, workspaceId: input.workspaceId }, true);
  if (source.actorUserId !== input.userId) throw new Error("PERSONAL_REVIEW_ACTOR_MISMATCH");
  const model = await inspectModelAuthority(tx, source, row.now);
  const request = childRequestSchema.parse(row.request);
  if (row.requestHash !== canonicalFingerprint(request) || request.sourceOperationId !== input.sourceOperationId
    || request.sourceAuthorityFingerprint !== source.authorityFingerprint || request.requestFingerprint !== source.input.requestFingerprint
    || request.modelAuthorityFingerprint !== model.fingerprint || row.connectorAccountId !== model.accountId
    || request.gatewayOperationId !== row.gatewayId || row.requestFingerprint !== source.input.requestFingerprint
    || request.policyHash !== row.policyHash || request.routeHash !== row.routeHash) throw new Error("PERSONAL_REVIEW_SOURCE_CHANGED");
  const raw = JSON.stringify(row.result);
  if (Buffer.byteLength(raw, "utf8") > 131_072 || canonicalFingerprint(row.result) !== row.resultEvidenceRef
    || row.resultEvidenceRef !== row.responseEvidenceRef) throw new Error("PERSONAL_REVIEW_RESULT_CHANGED");
  const stored = storedSchema.parse(row.result);
  const proposalRaw = JSON.stringify(stored.proposal);
  const inspected = inspectPersonalIntentCandidate(proposalRaw, source.input);
  return Object.freeze({ status: "REVIEW_PROOF_INSPECTED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    input, row, source, request, inspected, proposalRaw });
}
