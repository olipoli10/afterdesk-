import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { z } from "zod";
import { GOOGLE_CALENDAR_READ_SCOPE, GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalCalendarDraftSchema, preparePersonalCalendarInTransaction } from "@/server/personal-assistant/calendar-actions";
import { preparePersonalOutboundInTransaction } from "@/server/personal-assistant/outbox";
import { canonicalFingerprint } from "../evidence";
import { inspectPersonalGatewaySubject } from "../personal-subject";
import { inspectModelAuthority } from "./admission";
import { PERSONAL_MODEL_AUTHORITY } from "./budget-policy";
import { inspectPersonalIntentCandidate } from "./contract";
import { personalIntentClarificationQuestion, resolvePersonalCalendarTemporal } from "./temporal";

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
type ActionReview = Readonly<{ actionId: string; kind: string; status: "CLARIFY" | "READ_REVIEW_ONLY" | "PREPARED_UNSENT";
  question?: string; operationId?: string; requestHash?: string; draft?: Readonly<Record<string, string>> }>;
const clarify = (actionId: string, kind: string, question: string): ActionReview => ({ actionId, kind, status: "CLARIFY", question });
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/’/g, "'").toLowerCase().trim();
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function requestId(childId: string, actionId: string) {
  const h = createHash("sha256").update(JSON.stringify(["personal-model-review-v1", childId, actionId])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function actionAccount(tx: Prisma.TransactionClient, userId: string, workspaceId: string, provider: string, capability: string) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string; grantedScopes: string[] }>>(
    `SELECT a.id,a."grantedScopes" FROM "ConstructionConnectorAccount" a
    JOIN "ConstructionConnectorGrant" g ON g."connectorAccountId"=a.id
    WHERE a."workspaceId"=$1 AND a."createdByUserId"=$2 AND a.provider=$3 AND a.status='connected' AND a."revokedAt" IS NULL
      AND g.capability=$4 AND g.status='active' AND g."revokedAt" IS NULL FOR SHARE OF a,g`, workspaceId, userId, provider, capability);
  return rows.length === 1 ? rows[0] : null;
}

/** Caller supplies an authenticated actor and a SERIALIZABLE transaction with
 * its live source CAS. This function only prepares review drafts. It does not
 * read Google, execute, approve, dispatch, settle billing or complete the SMS.
 * Source quotes prove provenance, NOT semantic correctness. Full source text
 * must remain visible alongside these proposed drafts in the approval UI.
 * Self-message grammar is deliberately closed: "texte-moi : <exact message>"
 * or "appelle-moi : <exact message>" (and listed synonyms), one action only.
 * Dependencies and negative/conditional instructions require clarification.
 */
export async function prepareStoredPersonalIntentReview(tx: Prisma.TransactionClient, untrusted: PersonalIntentReviewInput, env: NodeJS.ProcessEnv = process.env) {
  if (untrusted.enabled !== true) return freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
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
      AND s.kind='personal_sms_inbound' AND s.status='processing' AND s.attempts=1 AND s."leaseUntil">now()
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
  const source = await inspectPersonalGatewaySubject(tx, { kind: "personal_assistant_operation", operationId: input.sourceOperationId, workspaceId: input.workspaceId });
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
  const reviews: ActionReview[] = [];
  const normalized = normalize(source.input.source);
  const unsafeContext = /\b(?:pas|jamais|non|sauf|annule|annuler|si|sinon|unless|except|not|never|cancel)\b|\bn['’]/.test(normalized);
  const otherRecipient = /\b(?:texte|appelle|telephone)(?!-moi\b)\b|\benvoie\s+(?!moi\b)/.test(normalized);
  for (const action of inspected.proposal.actions) {
    const ask = (question: string) => reviews.push(clarify(action.id, action.kind, question));
    if (unsafeContext) { ask("Confirme séparément l’action exacte : la demande contient une négation ou une condition. Rien n’est préparé."); continue; }
    if (otherRecipient) { ask("Ce pilote prépare seulement un message destiné à ton propre numéro vérifié. Précise une demande personnelle séparée."); continue; }
    if (action.dependsOn.length) { ask("Cette action dépend d’une autre étape. Confirme chaque action séparément avant de la préparer."); continue; }
    if (action.kind === "CLARIFY") { ask(personalIntentClarificationQuestion(action.reason)); continue; }
    if (action.kind === "READ_CALENDAR" || action.kind === "PREPARE_CALENDAR_EVENT") {
      const temporal = resolvePersonalCalendarTemporal(source.input, proposalRaw, action.id, { receivedAt: source.receivedAt, timezone: source.timezone });
      if (temporal.status === "CLARIFY") { ask(temporal.question); continue; }
      const capability = action.kind === "READ_CALENDAR" ? "calendar_read" : "calendar_write";
      const account = await actionAccount(tx, input.userId, input.workspaceId, "google_calendar", capability);
      if (!account) { ask("Active l’accès Google Agenda correspondant dans ENDVERA avant de préparer cette action."); continue; }
      if (action.kind === "READ_CALENDAR") {
        if (!account.grantedScopes.some(scope => scope === GOOGLE_CALENDAR_READ_SCOPE || scope === GOOGLE_CALENDAR_WRITE_SCOPE)) {
          ask("L’autorisation de lecture Google Agenda doit être accordée dans l’app."); continue;
        }
        reviews.push({ actionId: action.id, kind: action.kind, status: "READ_REVIEW_ONLY",
          draft: { startsAt: temporal.startsAtUtc, endsAt: temporal.endsAtUtc, timezone: temporal.timezone } });
      } else {
        const parsed = personalCalendarDraftSchema.safeParse({ title: action.title.quote, startsAt: temporal.startsAtUtc, endsAt: temporal.endsAtUtc, timezone: temporal.timezone });
        if (!parsed.success) { ask("Le titre ou les heures doivent être précisés avant de préparer le rendez-vous."); continue; }
        const prepared = await preparePersonalCalendarInTransaction(tx, { userId: input.userId, workspaceId: input.workspaceId,
          requestId: requestId(input.modelChildOperationId, action.id), draft: parsed.data });
        if (prepared.status !== "pending") throw new Error("PERSONAL_REVIEW_DRAFT_ALREADY_CONSUMED");
        reviews.push({ actionId: action.id, kind: action.kind, status: "PREPARED_UNSENT", operationId: prepared.operationId, requestHash: prepared.requestHash, draft: parsed.data });
      }
      continue;
    }
    const prefix = action.kind === "PREPARE_SELF_SMS" ? /^(?:(?:hey|salut)[, ]+)?(?:texte-moi|envoie-moi un texto|envoie-moi un sms)\s*:\s*/
      : /^(?:(?:hey|salut)[, ]+)?(?:appelle-moi|telephone-moi)\s*:\s*/;
    const match = prefix.exec(normalized);
    if (inspected.proposal.actions.length !== 1 || !match || normalize(source.input.source.slice(action.message.start, action.message.end)) !== normalized.slice(match[0].length)
      || action.message.quote !== source.input.source.slice(source.input.source.length - action.message.quote.length)) {
      ask("Pour ce pilote personnel, écris « texte-moi : message exact » ou « appelle-moi : message exact ». Aucun message à un tiers n’est préparé."); continue;
    }
    const kind = action.kind === "PREPARE_SELF_SMS" ? "sms_outbound" : "voice_outbound";
    const account = await actionAccount(tx, input.userId, input.workspaceId, "endvera_sms", kind === "sms_outbound" ? "personal_sms_send" : "personal_voice_send");
    if (!account || !row.sourceRequest.to || row.sourceRequest.to !== env.TWILIO_PHONE_NUMBER || !row.sourceRequest.from) {
      ask("L’accès au numéro ENDVERA ou au destinataire personnel doit être vérifié dans l’app."); continue;
    }
    const text = action.message.quote;
    if (!text.trim() || text.length > (kind === "voice_outbound" ? 550 : 1500)) { ask("Le message est trop long. Précise un message plus court."); continue; }
    const prepared = await preparePersonalOutboundInTransaction(tx, { userId: input.userId, workspaceId: input.workspaceId,
      kind, to: row.sourceRequest.from, text, requestId: requestId(input.modelChildOperationId, action.id) }, env);
    if (prepared.status !== "pending") throw new Error("PERSONAL_REVIEW_DRAFT_ALREADY_CONSUMED");
    reviews.push({ actionId: action.id, kind: action.kind, status: "PREPARED_UNSENT", operationId: prepared.operationId, requestHash: prepared.requestHash,
      draft: { to: row.sourceRequest.from, from: row.sourceRequest.to, text: kind === "voice_outbound" ? `Bonjour, ici l’assistant ENDVERA. ${text}` : text } });
  }
  return freeze({ status: "REVIEW_PREPARED_NOT_AUTHORIZED" as const, executionAuthorized: false as const, externalTransportPerformed: false as const,
    accounting: "UNSETTLED" as const, automaticRetry: false as const, semanticIntentVerified: false as const,
    source: { operationId: input.sourceOperationId, text: source.input.source, receivedAt: source.receivedAt, timezone: source.timezone },
    modelChildOperationId: input.modelChildOperationId, actions: reviews });
}
