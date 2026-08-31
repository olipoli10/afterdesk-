import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type ConstructionChannel } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { interpretConstructionMessage } from "@/lib/construction-assistant-v1/interpreter";
import { buildActionFingerprint } from "@/lib/construction-assistant-v1/outbound";
import { appendConstructionAudit } from "./audit";
import { tomorrowAnswer } from "./queries";
import { requireActiveConstructionMember } from "./workspace";

export type ConstructionIntakeResult = {
  messageId: string;
  intent: string;
  status: string;
  reply: string;
  calendarItemId?: string;
  actionId?: string;
  replayed: boolean;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function intentForDb(intent: string) {
  return intent.toLocaleLowerCase("en-CA") as
    | "calendar_item_create"
    | "calendar_query"
    | "outbound_message_draft"
    | "clarification_required"
    | "unsupported";
}

async function reconstructResult(tx: Prisma.TransactionClient, messageId: string): Promise<ConstructionIntakeResult> {
  const row = await tx.constructionMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      id: true,
      status: true,
      interpretation: { select: { intent: true, clarification: true } },
      calendarItem: { select: { id: true, title: true, verificationState: true } },
      action: { select: { id: true } },
    },
  });
  const clarification = row.interpretation?.clarification as { question?: string } | null;
  return {
    messageId: row.id,
    intent: row.interpretation?.intent?.toLocaleUpperCase("en-CA") ?? "UNSUPPORTED",
    status: row.status,
    reply: row.calendarItem
      ? `Ajouté au calendrier: ${row.calendarItem.title}. Statut: ${row.calendarItem.verificationState === "proposed" ? "proposé" : "vérifié"}.`
      : row.action
        ? "Le message est préparé. Vérifiez le destinataire et le texte avant l’approbation."
        : clarification?.question ?? "La demande est conservée, mais aucune action n’a été inventée.",
    calendarItemId: row.calendarItem?.id,
    actionId: row.action?.id,
    replayed: true,
  };
}

export async function processConstructionMessage(input: {
  userId: string;
  workspaceId: string;
  channel: ConstructionChannel;
  body: string;
  idempotencyKey: string;
  provider?: string;
  providerMessageId?: string;
  sender?: string;
  receivedAt?: Date;
  referenceNow: Date;
  /** Internal bounded recovery for a serializable write conflict. */
  _conflictAttempt?: number;
}): Promise<ConstructionIntakeResult> {
  let queryRequested = false;
  try {
    const result = await prisma.$transaction(async (tx) => {
      // One event key is one application, even when two workers receive the
      // same provider retry concurrently. The transaction-scoped lock is
      // released automatically and does not serialize unrelated projects.
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${input.workspaceId}:${input.idempotencyKey}`}, 0)
        )::text AS acquired
      `);
      await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
      const existing = await tx.constructionMessage.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey } },
        select: { id: true },
      });
      if (existing) return reconstructResult(tx, existing.id);

      const workspace = await tx.constructionWorkspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
        select: { defaultTimezone: true, defaultLocale: true },
      });
      const [projects, contacts] = await Promise.all([
        tx.constructionProject.findMany({
          where: { workspaceId: input.workspaceId, status: "active" },
          select: { id: true, code: true, name: true },
        }),
        tx.constructionContact.findMany({
          where: { workspaceId: input.workspaceId, status: "active" },
          select: { id: true, displayName: true, preferredLanguage: true },
        }),
      ]);

      const message = await tx.constructionMessage.create({
        data: {
          workspaceId: input.workspaceId,
          direction: "inbound",
          channel: input.channel,
          provider: input.provider ?? null,
          providerMessageId: input.providerMessageId ?? null,
          idempotencyKey: input.idempotencyKey,
          sender: input.sender ?? `user:${input.userId}`,
          recipients: ["ENDVERA"],
          originalBody: input.body,
          normalizedBody: input.body.normalize("NFKC").replace(/\s+/g, " ").trim(),
          status: "received",
          receivedAt: input.receivedAt ?? input.referenceNow,
        },
        select: { id: true },
      });

      const interpretation = interpretConstructionMessage(input.body, {
        referenceNow: input.referenceNow.toISOString(),
        locale: workspace.defaultLocale === "en-CA" ? "en-CA" : "fr-CA",
        timezone: workspace.defaultTimezone,
        projects,
        contacts,
      });

      await tx.constructionInterpretation.create({
        data: {
          workspaceId: input.workspaceId,
          messageId: message.id,
          intent: intentForDb(interpretation.intent),
          confidence: interpretation.confidence,
          language: interpretation.language,
          originalDatePhrase: interpretation.originalDatePhrase,
          structuredResult: asJson(interpretation),
          clarification: interpretation.clarification ? asJson(interpretation.clarification) : Prisma.JsonNull,
          interpreterVersion: "construction-deterministic-v1",
        },
      });

      let reply = "La demande est conservée, mais aucune action n’a été inventée.";
      let status: "interpreted" | "needs_clarification" | "proposed" = "interpreted";
      let calendarItemId: string | undefined;
      let actionId: string | undefined;

      if (
        interpretation.intent === "CALENDAR_ITEM_CREATE" &&
        interpretation.projectId &&
        interpretation.contactId &&
        interpretation.startsAtUtc &&
        interpretation.title
      ) {
        const calendar = await tx.constructionCalendarItem.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: interpretation.projectId,
            contactId: interpretation.contactId,
            sourceMessageId: message.id,
            type: "meeting",
            title: interpretation.title,
            startsAt: new Date(interpretation.startsAtUtc),
            endsAt: interpretation.endsAtUtc ? new Date(interpretation.endsAtUtc) : null,
            timezone: interpretation.timezone,
            confidence: interpretation.confidence,
            verificationState: "proposed",
          },
          select: { id: true },
        });
        calendarItemId = calendar.id;
        reply = `Ajouté au calendrier: ${interpretation.title}. Statut: proposé.`;
        await appendConstructionAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.userId,
          entityType: "calendar_item",
          entityId: calendar.id,
          action: "construction_calendar_item_created",
          metadata: { sourceMessageId: message.id, interpreterVersion: "construction-deterministic-v1" },
        });
      } else if (interpretation.intent === "OUTBOUND_MESSAGE_DRAFT" && interpretation.contactId && interpretation.outboundDraft) {
        const contact = await tx.constructionContact.findFirst({
          where: { id: interpretation.contactId, workspaceId: input.workspaceId, status: "active" },
          select: { normalizedPhone: true, normalizedEmail: true },
        });
        const channel = interpretation.outboundDraft.channel;
        const recipient = channel === "SMS" ? contact?.normalizedPhone : contact?.normalizedEmail;
        if (!recipient) {
          status = "needs_clarification";
          reply = `Ajoutez une adresse ${channel === "SMS" ? "SMS" : "courriel"} vérifiée à ce contact avant de préparer l’envoi.`;
        } else {
          const id = randomUUID();
          const bound = {
            workspaceId: input.workspaceId,
            actionId: id,
            version: 1,
            contactId: interpretation.contactId,
            channel,
            normalizedRecipient: recipient,
            body: interpretation.outboundDraft.body,
          };
          const payloadHash = buildActionFingerprint(bound);
          const action = await tx.constructionAction.create({
            data: {
              id,
              workspaceId: input.workspaceId,
              contactId: interpretation.contactId,
              sourceMessageId: message.id,
              type: "outbound_message",
              status: "proposed",
              approvalRequired: true,
              version: 1,
              payload: asJson(bound),
              payloadHash,
            },
            select: { id: true },
          });
          actionId = action.id;
          status = "proposed";
          reply = "Le message est préparé. Vérifiez le destinataire et le texte avant l’approbation.";
          await appendConstructionAudit(tx, {
            workspaceId: input.workspaceId,
            actorUserId: input.userId,
            entityType: "action",
            entityId: action.id,
            action: "construction_outbound_draft_proposed",
            metadata: { version: 1, payloadHash },
          });
        }
      } else if (interpretation.intent === "CALENDAR_QUERY") {
        queryRequested = true;
        reply = "Je vérifie le calendrier canonique de demain.";
      } else if (interpretation.clarification) {
        status = "needs_clarification";
        reply = interpretation.clarification.question;
      }

      await tx.constructionMessage.update({ where: { id: message.id }, data: { status } });
      await appendConstructionAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        entityType: "message",
        entityId: message.id,
        action: "construction_message_interpreted",
        reasonCode: interpretation.intent,
        metadata: { channel: input.channel, status },
      });

      return {
        messageId: message.id,
        intent: interpretation.intent,
        status,
        reply,
        calendarItemId,
        actionId,
        replayed: false,
      } satisfies ConstructionIntakeResult;
    });

    if (queryRequested && !result.replayed) {
      const answer = await tomorrowAnswer({
        userId: input.userId,
        workspaceId: input.workspaceId,
        referenceNow: input.referenceNow,
      });
      if (!answer) return result;
      return {
        ...result,
        reply: answer.items.length === 0
          ? "Vous n’avez rien au calendrier demain."
          : answer.items
              .map((item) => {
                const time = new Intl.DateTimeFormat("fr-CA", { timeZone: item.timezone, hour: "2-digit", minute: "2-digit" }).format(item.startsAt);
                const label = item.verificationState === "proposed" ? "Proposé" : "Vérifié";
                return `${time} — ${item.title} (${item.project?.name ?? "sans projet"}) [${label}]`;
              })
              .join("\n"),
      };
    }
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.constructionMessage.findUniqueOrThrow({
          where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey } },
          select: { id: true },
        });
        return reconstructResult(tx, existing.id);
      });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034" &&
      (input._conflictAttempt ?? 0) < 2
    ) {
      return processConstructionMessage({ ...input, _conflictAttempt: (input._conflictAttempt ?? 0) + 1 });
    }
    throw error;
  }
}

export function portalIdempotencyKey(input: { workspaceId: string; userId: string; requestId: string }) {
  return sha256Canonical({ source: "portal", ...input });
}
