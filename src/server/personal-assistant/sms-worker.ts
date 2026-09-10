import "server-only";
import { createHash } from "node:crypto";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { enqueuePersonalSms } from "./sms-inbox";
import { readGoogleCalendar } from "./google-connection";
import type { ConnectorEnvironment } from "./google-client";
import { sendAutomaticPersonalReply } from "./outbox";

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
type Dependencies = { engine?: (input: Parameters<typeof processUnifiedAssistantRequest>[0]) => Promise<{ reply: string; intent?: string; canonicalEffectId?: string | null }>; calendar?: typeof readGoogleCalendar };

export async function processPersonalSms(operationId: string, env: ConnectorEnvironment = process.env, deps: Dependencies = {}) {
  if (!personalSmsWorkerEnabled(env)) return { status: "DISABLED" as const };
  const row = await prisma.personalAssistantOperation.findUnique({ where: { id: operationId } });
  if (!row || row.kind !== "personal_sms_inbound" || row.status !== "received") return { status: "NOT_PENDING" as const };
  const received = receivedSchema.parse(row.request);
  // Re-run binding and grant admission after durable receipt, not just at ingress.
  const admission = await enqueuePersonalSms(received);
  if (admission.operationId !== row.id) throw new Error("SMS_ADMISSION_CHANGED");
  const claimed = await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "received" }, data: { status: "processing", attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 120000) } });
  if (claimed.count !== 1) return { status: "NOT_PENDING" as const };
  try {
    const workspace = await prisma.constructionWorkspace.findUniqueOrThrow({ where: { id: row.workspaceId }, select: { defaultTimezone: true } });
    const day = smsCalendarDay(received.body);
    let reply: string; let source: "GOOGLE_CALENDAR" | "ENDVERA_LOCAL" | "CLARIFICATION";
    if (day) {
      const range = personalCalendarWindow(row.createdAt, workspace.defaultTimezone, day);
      const result = await (deps.calendar ?? readGoogleCalendar)(row.createdByUserId, row.workspaceId, range.start, range.end, env);
      const label = day === "TOMORROW" ? "Demain" : "Aujourd’hui";
      reply = result.events.length === 0 ? `${label} : aucun rendez-vous dans ton Google Agenda principal (${workspace.defaultTimezone}).`
        : `${label}, Google Agenda (${workspace.defaultTimezone}) :\n${result.events.map(event => `${event.start.dateTime ? new Date(event.start.dateTime).toLocaleTimeString("fr-CA", { timeZone: workspace.defaultTimezone, hour: "2-digit", minute: "2-digit" }) : "Toute la journée"} — ${event.summary}`).join("\n")}`;
      source = "GOOGLE_CALENDAR";
    } else if (/\bgoogle\b/i.test(received.body)) {
      reply = "Pour consulter Google Agenda, demande « Qu’est-ce que j’ai demain? ». Les autres demandes Google nécessitent encore une précision ou une action approuvée dans l’app. Rien n’a été modifié."; source = "CLARIFICATION";
    } else {
      const result = await (deps.engine ?? processUnifiedAssistantRequest)({ userId: row.createdByUserId, channel: "SMS", request: { schemaVersion: 1, requestId: commandUuid(row.id), workspaceId: row.workspaceId, message: received.body, occurredAt: row.createdAt.toISOString() }, admittedSource: { senderAddress: received.from, provider: "endvera_sms", providerMessageId: received.messageSid } });
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
    const request = { to: received.from, from: received.to, text: reply, sourceOperationId: row.id };
    // Persist reply separately from dispatch. Receiving an SMS is not approval
    // to spend an unbounded amount or send a third-party message.
    await prisma.$transaction(async tx => {
      const active = await tx.constructionCommunicationIdentity.findFirst({ where: { id: received.identityId, userId: row.createdByUserId, workspaceId: row.workspaceId, verified: true, status: "active", permissions: { has: "COMMAND" } } });
      if (!active) throw new Error("SMS_IDENTITY_REVOKED");
      await tx.personalAssistantOperation.create({ data: { workspaceId: row.workspaceId, connectorAccountId: row.connectorAccountId, kind: "sms_outbound", status: "pending", idempotencyKey: `reply:${row.id}`, request, requestHash: hash(JSON.stringify(request)), createdByUserId: row.createdByUserId } });
      await tx.personalAssistantOperation.update({ where: { id: row.id }, data: { status: "completed", leaseUntil: null, result: { reply, source, replyDelivery: "PREPARED_UNSENT" } } });
    }, { isolationLevel: "Serializable" });
    return { status: "COMPLETED_REPLY_PREPARED" as const };
  } catch {
    // A worker may have committed an internal action before losing its result.
    // Do not automatically run that uncertain action a second time.
    await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "processing" }, data: { status: "uncertain", leaseUntil: null, result: { reviewRequired: true, automaticRetry: false } } });
    return { status: "REVIEW_REQUIRED" as const };
  }
}

export async function drainPersonalSms(env: ConnectorEnvironment = process.env, batchSize = 10) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10) throw new Error("SMS_BATCH_LIMIT_INVALID");
  if (!personalSmsWorkerEnabled(env)) return { disabled: true, processed: 0 };
  await prisma.personalAssistantOperation.updateMany({ where: { kind: "personal_sms_inbound", status: "processing", leaseUntil: { lt: new Date() } }, data: { status: "uncertain", result: { reviewRequired: true, reason: "WORKER_LEASE_EXPIRED", automaticRetry: false } } });
  const pending = await prisma.personalAssistantOperation.findMany({ where: { kind: "personal_sms_inbound", status: "received" }, orderBy: { createdAt: "asc" }, take: batchSize, select: { id: true } });
  let processed = 0;
  for (const row of pending) {
    try { const result = await processPersonalSms(row.id, env); if (result.status === "COMPLETED_REPLY_PREPARED") processed++; }
    catch { await prisma.personalAssistantOperation.updateMany({ where: { id: row.id, status: "received" }, data: { status: "refused", result: { reason: "ADMISSION_REVOKED", automaticRetry: false } } }); }
  }
  if (env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED === "true") {
    const replies = await prisma.personalAssistantOperation.findMany({ where: { kind: "sms_outbound", status: { in: ["pending", "approved"] }, idempotencyKey: { startsWith: "reply:" } }, take: batchSize, orderBy: { createdAt: "asc" }, select: { id: true } });
    for (const reply of replies) { try { await sendAutomaticPersonalReply(reply.id, env); } catch { /* Missing budget/configuration or unknown delivery is retained; never forge a reply receipt. */ } }
  }
  return { disabled: false, processed };
}
