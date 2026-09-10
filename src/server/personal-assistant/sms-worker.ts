import "server-only";
import { createHash } from "node:crypto";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { enqueuePersonalSms } from "./sms-inbox";
import { readGoogleCalendarWithAuthority, requireGoogleReadAuthority, type GoogleReadAuthority } from "./google-connection";
import { GoogleCalendarClient, type ConnectorEnvironment } from "./google-client";
import { sendAutomaticPersonalReply } from "./outbox";
import { processPersonalModelSms, personalModelReviewReply, type PersonalModelSmsResult } from "./model-worker";
import { isReservedCalendarConfirmationMessage } from "./calendar-confirmation-routing";

const receivedSchema = z.object({ schemaVersion: z.literal(1), accountSid: z.string(), messageSid: z.string(), from: z.string(), to: z.string(), body: z.string().max(10000), contentHash: z.string(), identityId: z.string() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function personalSmsWorkerEnabled(env: ConnectorEnvironment, now = Date.now()) {
  return externalCapabilityDecision("SMS", env).enabled && env.ENDVERA_PERSONAL_SMS_WORKER_ENABLED === "true" && Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "") > now;
}
export function smsCalendarDay(message: string): "TODAY" | "TOMORROW" | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[-?!.]/g, " ").replace(/\s+/g, " ").trim();
  const match = /^(?:(?:hey|salut) )?(?:qu est ce que j ai|qu ai je|j ai quoi|c est quoi mon horaire|mon horaire|mon agenda|mon calendrier(?: google)?|mes rendez vous)(?: pour)? (demain|aujourd hui)$/.exec(normalized);
  return match ? match[1] === "demain" ? "TOMORROW" : "TODAY" : null;
}
export function personalCalendarWindow(now: Date, timezone: string, day: "TODAY" | "TOMORROW") {
  new Intl.DateTimeFormat("fr-CA", { timeZone: timezone }).format(now);
  const local = startOfDay(toZonedTime(now, timezone));
  const start = day === "TOMORROW" ? addDays(local, 1) : local;
  return { start: fromZonedTime(start, timezone).toISOString(), end: fromZonedTime(addDays(start, 1), timezone).toISOString() };
}
function commandUuid(id: string) { const raw = hash(id); return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-8${raw.slice(17, 20)}-${raw.slice(20, 32)}`; }
export const PERSONAL_SMS_PROCESS_BUDGET_MS = 35_000;
export const PERSONAL_SMS_BATCH_BUDGET_MS = 50_000;
const CLEANUP_BUDGET_MS = 2_000;
export type PersonalSmsSourceClaim = Readonly<{ operationId: string; workspaceId: string; userId: string; attempt: 1; leaseUntil: string }>;
export type PersonalSmsExecutionContext = Readonly<{ claim: PersonalSmsSourceClaim; signal: AbortSignal; deadlineAt: number }>;
type Dependencies = { engine?: (input: Parameters<typeof processUnifiedAssistantRequest>[0], context: PersonalSmsExecutionContext) => Promise<{ reply: string; intent?: string; canonicalEffectId?: string | null }>; model?: typeof processPersonalModelSms; calendar?: typeof readGoogleCalendarWithAuthority; deadlineAt?: number };

class SmsWorkerDeadline extends Error { constructor() { super("SMS_WORKER_DEADLINE"); } }
async function withinDeadline<T>(work: () => Promise<T>, deadlineAt: number, expired: () => void = () => undefined): Promise<T> {
  if (Date.now() >= deadlineAt) { expired(); throw new SmsWorkerDeadline(); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired(); reject(new SmsWorkerDeadline()); }, deadlineAt - Date.now());
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function retainSourceUncertain(claim: PersonalSmsSourceClaim, deadlineExceeded: boolean) {
  let recorded = false;
  try {
    recorded = await withinDeadline(async () => (await prisma.$executeRawUnsafe(
      `UPDATE "PersonalAssistantOperation" SET status='uncertain',"leaseUntil"=NULL,result=$6::jsonb,"updatedAt"=now()
       WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND attempts=$4 AND "leaseUntil"=$5
         AND kind='personal_sms_inbound' AND status='processing'`,
      claim.operationId, claim.workspaceId, claim.userId, claim.attempt, new Date(claim.leaseUntil),
      JSON.stringify({ reviewRequired: true, reason: deadlineExceeded ? "WORKER_DEADLINE_EXCEEDED" : "WORKER_OUTCOME_UNKNOWN", automaticRetry: false, engineCancellationConfirmed: false }),
    )) === 1, Date.now() + CLEANUP_BUDGET_MS);
  } catch { /* A failed/late database acknowledgement is not confirmed cleanup. The durable lease remains recoverable. */ }
  return { status: "REVIEW_REQUIRED" as const, recorded, automaticRetry: false as const, engineCancellationConfirmed: false as const };
}

export async function processPersonalSms(operationId: string, env: ConnectorEnvironment = process.env, deps: Dependencies = {}) {
  if (!personalSmsWorkerEnabled(env)) return { status: "DISABLED" as const };
  if (deps.deadlineAt !== undefined && !Number.isFinite(deps.deadlineAt)) throw new Error("SMS_WORKER_DEADLINE_INVALID");
  const deadlineAt = Math.min(Date.now() + PERSONAL_SMS_PROCESS_BUDGET_MS, deps.deadlineAt ?? Infinity);
  const controller = new AbortController();
  let owned: PersonalSmsSourceClaim | undefined;
  const requireLive = () => { if (controller.signal.aborted || Date.now() >= deadlineAt) throw new SmsWorkerDeadline(); };
  const work = async () => {
  requireLive();
  const row = await prisma.personalAssistantOperation.findUnique({ where: { id: operationId } });
  requireLive();
  if (!row || row.kind !== "personal_sms_inbound" || row.status !== "received" || row.attempts !== 0) return { status: "NOT_PENDING" as const };
  const received = receivedSchema.parse(row.request);
  // Re-run binding and grant admission after durable receipt, not just at ingress.
  const admission = await enqueuePersonalSms(received);
  requireLive();
  if (admission.operationId !== row.id) throw new Error("SMS_ADMISSION_CHANGED");
  const claim: PersonalSmsSourceClaim = Object.freeze({ operationId: row.id, workspaceId: row.workspaceId, userId: row.createdByUserId, attempt: 1, leaseUntil: new Date(deadlineAt).toISOString() });
  const claimed = await prisma.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='processing',attempts=1,"leaseUntil"=$4,"updatedAt"=now()
    WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND "requestHash"=$5
      AND kind='personal_sms_inbound' AND status='received' AND attempts=0 AND "leaseUntil" IS NULL AND clock_timestamp()<$4`,
    row.id, row.workspaceId, row.createdByUserId, new Date(claim.leaseUntil), row.requestHash);
  if (claimed !== 1) return { status: "NOT_PENDING" as const };
  owned = claim;
  try {
    requireLive();
    if (env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true"
      && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED === "true") {
      const { maintainCalendarSmsConfirmations } = await import("./calendar-confirmation-maintenance");
      requireLive();
      try {
        await maintainCalendarSmsConfirmations({ actor: { userId: claim.userId, workspaceId: claim.workspaceId },
          batchSize: 25, deadlineAt, signal: controller.signal }, env);
      } catch { /* Bookkeeping failure never authorizes replacement/retry. Current challenge checks still fail closed. */ }
      requireLive();
    }
    const workspace = await prisma.constructionWorkspace.findUniqueOrThrow({ where: { id: row.workspaceId }, select: { defaultTimezone: true } });
    requireLive();
    const day = smsCalendarDay(received.body);
    let reply: string; let source: "GOOGLE_CALENDAR" | "ENDVERA_LOCAL" | "CLARIFICATION" | "MODEL_REVIEW_ONLY";
    let finalizeReview: PersonalModelSmsResult["finalizeReview"];
    let googleReadAuthority: GoogleReadAuthority | undefined;
    let googleReadRange: { start: string; end: string } | undefined;
    // Only the closed whole-message day grammar bypasses interpretation. No
    // model call or legacy fallback is needed for this explicit read request.
    if (isReservedCalendarConfirmationMessage(received.body)) {
      if (env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED === "true"
        && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true"
        && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true") {
        const { processCalendarConfirmationSms } = await import("./calendar-confirmation-worker");
        requireLive();
        const result = await processCalendarConfirmationSms(Object.freeze({ claim, signal: controller.signal, deadlineAt }), env);
        // Consumption owns source completion and acknowledgement in one tx.
        // Never perform another source CAS, model call or effect on that source.
        if (result.status === "CONFIRMATION_HANDLED" || result.status === "REFUSED") return { status: "COMPLETED_REPLY_PREPARED" as const };
        requireLive();
        reply = "Aucune confirmation valide et unique n’est en attente pour ce texto. Consulte le rendez-vous dans ENDVERA. Aucun ajout Google n’a été exécuté par cette confirmation.";
      } else {
        // Reserve this namespace even while OFF. Quoted/malformed/expired
        // confirmations are never fresh model requests or implicit approval.
        reply = "Cette confirmation ne peut pas encore être traitée par texto. Ouvre le rendez-vous dans ENDVERA pour vérifier son état et l’approuver. Aucun ajout Google n’a été exécuté par cette confirmation.";
      }
      source = "CLARIFICATION";
    } else if (day) {
      const range = personalCalendarWindow(row.createdAt, workspace.defaultTimezone, day);
      const client = new GoogleCalendarClient(env, undefined, undefined, controller.signal);
      const read = await (deps.calendar ?? readGoogleCalendarWithAuthority)(row.createdByUserId, row.workspaceId, range.start, range.end, env, client);
      requireLive();
      const result = read.result;
      if (result.complete !== true || result.source !== "GOOGLE_CALENDAR") throw new Error("GOOGLE_CALENDAR_INCOMPLETE");
      googleReadAuthority = read.authority; googleReadRange = range;
      const label = day === "TOMORROW" ? "Demain" : "Aujourd’hui";
      reply = result.events.length === 0 ? `${label} : aucun rendez-vous dans ton Google Agenda principal (${workspace.defaultTimezone}).`
        : `${label}, Google Agenda (${workspace.defaultTimezone}) :\n${result.events.map(event => `${event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("fr-CA", { timeZone: workspace.defaultTimezone, hour: "2-digit", minute: "2-digit" }) : "Toute la journée"} — ${event.summary}`).join("\n")}`;
      source = "GOOGLE_CALENDAR";
    } else if (env.ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED === "true") {
      const result = await (deps.model ?? processPersonalModelSms)(Object.freeze({ claim, signal: controller.signal, deadlineAt }), env);
      requireLive();
      reply = result.reply; finalizeReview = result.finalizeReview; source = "MODEL_REVIEW_ONLY";
    } else if (/\bgoogle\b/i.test(received.body)) {
      reply = "Pour consulter Google Agenda, demande « Qu’est-ce que j’ai demain? ». Les autres demandes Google nécessitent encore une précision ou une action approuvée dans l’app. Rien n’a été modifié."; source = "CLARIFICATION";
    } else {
      const engine = deps.engine ?? ((input: Parameters<typeof processUnifiedAssistantRequest>[0]) => processUnifiedAssistantRequest(input));
      const result = await engine({ userId: row.createdByUserId, channel: "SMS", request: { schemaVersion: 1, requestId: commandUuid(row.id), workspaceId: row.workspaceId, message: received.body, occurredAt: row.createdAt.toISOString() }, admittedSource: { senderAddress: received.from, provider: "endvera_sms", providerMessageId: received.messageSid } }, Object.freeze({ claim, signal: controller.signal, deadlineAt }));
      requireLive();
      reply = `${result.reply}\nTraitement dans ENDVERA seulement. Aucun SMS/appel envoyé à tes contacts ni changement Google exécuté.`;
      source = "ENDVERA_LOCAL";
      if (result.intent === "CALENDAR_ITEM_CREATE" && result.canonicalEffectId) {
        // The legacy interpreter synthesizes a one-hour duration. A stored
        // endsAt therefore is NOT evidence that the sender supplied an end.
        // Do not promote that legacy projection to a Google write draft. The
        // owner can supply an exact draft in the existing calendar screen; the
        // candidate path must separately resolve source-quoted start AND end.
        reply += "\nL’heure de fin du rendez-vous ENDVERA peut être une durée par défaut. Confirme les heures exactes dans Connexions calendrier pour préparer l’ajout à Google. Aucun ajout Google n’est préparé à partir de cette durée.";
      }
    }
    if (reply.length > 1500) reply = "Ton résultat est trop long pour un seul résumé SMS fiable. Consulte le dossier dans ENDVERA ou demande une période plus précise. Aucun détail n’a été remplacé par une supposition.";
    // Persist reply separately from dispatch. Receiving an SMS is not approval
    // to spend an unbounded amount or send a third-party message.
    await prisma.$transaction(async tx => {
      requireLive();
      const active = await tx.constructionCommunicationIdentity.findFirst({ where: { id: received.identityId, userId: row.createdByUserId, workspaceId: row.workspaceId, verified: true, status: "active", permissions: { has: "COMMAND" } } });
      if (!active) throw new Error("SMS_IDENTITY_REVOKED");
      requireLive();
      if (source === "GOOGLE_CALENDAR") await requireGoogleReadAuthority(tx, row.createdByUserId, row.workspaceId, googleReadAuthority, env);
      requireLive();
      const personalModelReview = finalizeReview ? await finalizeReview(tx) : undefined;
      if (personalModelReview) reply = personalModelReviewReply(personalModelReview);
      let calendarConfirmationId: string | undefined;
      if (personalModelReview && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED === "true"
        && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true" && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true"
        && env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED === "true") {
        const { prepareCalendarConfirmationForReviewInTransaction } = await import("./calendar-confirmation-preparation");
        requireLive();
        const prepared = await prepareCalendarConfirmationForReviewInTransaction(tx, Object.freeze({ claim, signal: controller.signal, deadlineAt }), personalModelReview, env);
        if (prepared.status === "PREPARED_FOR_SOURCE_COMMIT") {
          calendarConfirmationId = prepared.challengeId;
          reply = "Ton rendez-vous est préparé dans ENDVERA. Un résumé exact est préparé séparément pour confirmation par texto; aucun ajout Google n’est encore exécuté. Tu peux aussi le vérifier dans l’app.";
        }
      }
      requireLive();
      if (reply.length > 1500) reply = "Ta demande et les précisions nécessaires sont conservées dans ENDVERA. Consulte la demande originale et chaque proposition dans l’app. Aucun effet exécuté par ces propositions.";
      const request = { to: received.from, from: received.to, text: reply, sourceOperationId: row.id };
      await tx.personalAssistantOperation.create({ data: { workspaceId: row.workspaceId, connectorAccountId: row.connectorAccountId, kind: "sms_outbound", status: "pending", idempotencyKey: `reply:${row.id}`, request, requestHash: hash(JSON.stringify(request)), createdByUserId: row.createdByUserId } });
      requireLive();
      const finished = await tx.$executeRawUnsafe(`UPDATE "PersonalAssistantOperation" SET status='completed',"leaseUntil"=NULL,result=$6::jsonb,"updatedAt"=now()
        WHERE id=$1 AND "workspaceId"=$2 AND "createdByUserId"=$3 AND attempts=$4 AND "leaseUntil"=$5
          AND kind='personal_sms_inbound' AND status='processing' AND "leaseUntil">clock_timestamp()`,
        claim.operationId, claim.workspaceId, claim.userId, claim.attempt, new Date(claim.leaseUntil), JSON.stringify({ reply, source, replyDelivery: "PREPARED_UNSENT",
          ...(source === "GOOGLE_CALENDAR" ? { googleReadAuthority, googleReadRange } : {}), ...(personalModelReview ? { personalModelReview } : {}) }));
      if (finished !== 1) throw new Error("SMS_SOURCE_CLAIM_LOST");
      if (calendarConfirmationId) {
        const { prepareCalendarConfirmationOutboundInTransaction } = await import("./calendar-confirmation-bridge");
        requireLive();
        const bridge = await prepareCalendarConfirmationOutboundInTransaction(tx, { actor: { userId: claim.userId, workspaceId: claim.workspaceId }, challengeId: calendarConfirmationId }, env);
        if (bridge.status !== "PREPARED_UNSENT") throw new Error("SMS_CONFIRMATION_BRIDGE_DISABLED");
        requireLive();
      }
    }, { isolationLevel: "Serializable", maxWait: 1000, timeout: Math.max(1, Math.min(5000, deadlineAt - Date.now())) });
    requireLive();
    return { status: "COMPLETED_REPLY_PREPARED" as const };
  } catch (error) {
    // A worker may have committed an internal action before losing its result.
    // Do not automatically run that uncertain action a second time.
    if (error instanceof SmsWorkerDeadline) controller.abort();
    return retainSourceUncertain(claim, error instanceof SmsWorkerDeadline);
  }
  };
  try { return await withinDeadline(work, deadlineAt, () => controller.abort()); }
  catch (error) {
    if (!(error instanceof SmsWorkerDeadline)) throw error;
    return owned ? retainSourceUncertain(owned, true) : { status: "REVIEW_REQUIRED" as const, recorded: false, automaticRetry: false as const, engineCancellationConfirmed: false as const };
  }
}

export async function drainPersonalSms(env: ConnectorEnvironment = process.env, batchSize = 10, deps: Dependencies = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw new Error("SMS_BATCH_LIMIT_INVALID");
  if (deps.deadlineAt !== undefined && !Number.isFinite(deps.deadlineAt)) throw new Error("SMS_WORKER_DEADLINE_INVALID");
  if (!personalSmsWorkerEnabled(env)) return { disabled: true, processed: 0 };
  const deadlineAt = Math.min(Date.now() + PERSONAL_SMS_BATCH_BUDGET_MS, deps.deadlineAt ?? Infinity);
  const batchController = new AbortController();
  const requireBatchTime = () => { if (Date.now() >= deadlineAt) throw new SmsWorkerDeadline(); };
  let processed = 0;
  const work = async () => {
  requireBatchTime();
  await prisma.personalAssistantOperation.updateMany({ where: { kind: "personal_sms_inbound", status: "processing", leaseUntil: { lt: new Date() } }, data: { status: "uncertain", result: { reviewRequired: true, reason: "WORKER_LEASE_EXPIRED", automaticRetry: false } } });
  requireBatchTime();
  const pending = await prisma.personalAssistantOperation.findMany({ where: { kind: "personal_sms_inbound", status: "received" }, orderBy: { createdAt: "asc" }, take: batchSize, select: { id: true } });
  requireBatchTime();
  for (const row of pending) {
    if (Date.now() >= deadlineAt - CLEANUP_BUDGET_MS) break;
    try { const result = await processPersonalSms(row.id, env, { ...deps, deadlineAt: Math.min(deps.deadlineAt ?? Infinity, deadlineAt - CLEANUP_BUDGET_MS) }); if (result.status === "COMPLETED_REPLY_PREPARED") processed++; }
    catch { requireBatchTime(); await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "received", attempts: 0 }, data: { status: "refused", result: { reason: "ADMISSION_REVOKED", automaticRetry: false } } }); }
  }
  requireBatchTime();
  if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED === "true") {
    const confirmationEnabled = env.ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED === "true"
      && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED === "true" && env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED === "true";
    const sourceKinds = confirmationEnabled ? { OR: [{ idempotencyKey: { startsWith: "reply:" } }, { idempotencyKey: { startsWith: "calendar-confirmation:" } }] }
      : { idempotencyKey: { startsWith: "reply:" } };
    const replies = await prisma.personalAssistantOperation.findMany({ where: { kind: "sms_outbound", status: { in: ["pending", "approved"] }, ...sourceKinds }, take: batchSize, orderBy: { createdAt: "asc" }, select: { id: true, idempotencyKey: true } });
    for (const reply of replies) {
      requireBatchTime();
      try {
        if (confirmationEnabled && reply.idempotencyKey.startsWith("calendar-confirmation:")) {
          const { sendAutomaticCalendarConfirmationSummary } = await import("./outbox");
          requireBatchTime();
          await sendAutomaticCalendarConfirmationSummary(reply.id, env, undefined, { deadlineAt, signal: batchController.signal });
        } else await sendAutomaticPersonalReply(reply.id, env, undefined, { deadlineAt, signal: batchController.signal });
      } catch { /* Missing authority/configuration or unknown delivery is retained; never retry a claimed effect or invent a receipt. */ }
    }
  }
  return { disabled: false, processed, deadlineReached: Date.now() >= deadlineAt - CLEANUP_BUDGET_MS };
  };
  try { return await withinDeadline(work, deadlineAt, () => batchController.abort()); }
  catch (error) { if (!(error instanceof SmsWorkerDeadline)) throw error; return { disabled: false, processed, deadlineReached: true }; }
}
