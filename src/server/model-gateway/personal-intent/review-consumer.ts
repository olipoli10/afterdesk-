import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma-client";
import { GOOGLE_CALENDAR_READ_SCOPE, GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalCalendarDraftSchema, preparePersonalCalendarInTransaction } from "@/server/personal-assistant/calendar-actions";
import { preparePersonalOutboundInTransaction } from "@/server/personal-assistant/outbox";
import { personalIntentClarificationQuestion, resolvePersonalCalendarTemporal } from "./temporal";

import { loadStoredPersonalIntentReviewProof, type PersonalIntentReviewInput } from "./review-proof";
export type { PersonalIntentReviewInput } from "./review-proof";

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
  const proof = await loadStoredPersonalIntentReviewProof(tx, untrusted, env);
  if (proof.status === "DISABLED") return proof;
  const { input, row, source, request, inspected, proposalRaw } = proof;
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
      const device = action.kind === "PREPARE_CALENDAR_EVENT"
        ? await actionAccount(tx, input.userId, input.workspaceId, "endvera_android_device", capability)
        : null;
      const account = device ?? await actionAccount(tx, input.userId, input.workspaceId, "google_calendar", capability);
      if (!account) { ask(action.kind === "PREPARE_CALENDAR_EVENT"
        ? "Associe le calendrier de ton téléphone ou Google Agenda dans ENDVERA avant de préparer cette action."
        : "Active l’accès Google Agenda correspondant dans ENDVERA avant de préparer cette lecture."); continue; }
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
