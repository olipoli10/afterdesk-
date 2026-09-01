import "server-only";
import { Prisma, type ConstructionChannel } from "@prisma-client";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  operatingCommandEnvelopeSchema,
  operatingCommandResultSchema,
  type OperatingCommandEnvelope,
  type OperatingCommandResult,
  type OperatingInterpretation,
} from "@/lib/construction-operating-assistant-r2/contracts";
import { interpretOperatingAssistantCommand } from "@/lib/construction-operating-assistant-r2/interpreter";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { processConstructionMessage } from "@/server/construction-assistant-v1/intake";
import { ConstructionAccessDenied, requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dbChannel(channel: OperatingCommandEnvelope["channel"]): ConstructionChannel {
  return channel === "VOICE_TRANSCRIPT" ? "voice" : channel.toLocaleLowerCase("en-CA") as ConstructionChannel;
}

function dbIntent(intent: OperatingInterpretation["intent"]) {
  const values = {
    AGENDA_QUERY: "calendar_query",
    DAILY_BRIEFING: "daily_briefing",
    REMINDER_CREATE: "reminder_create",
    CALENDAR_ITEM_RESCHEDULE: "calendar_item_reschedule",
    CALENDAR_ITEM_CREATE: "calendar_item_create",
    OUTBOUND_MESSAGE_DRAFT: "outbound_message_draft",
    REPORT_WORK_FINISHED: "report_work_finished",
    CLARIFICATION_REQUIRED: "clarification_required",
    UNSUPPORTED: "unsupported",
  } as const;
  return values[intent];
}

function commandKey(envelope: OperatingCommandEnvelope): string {
  return sha256Canonical({
    source: "endvera-operating-assistant-r2",
    workspaceId: envelope.workspaceId,
    commandId: envelope.commandId,
  });
}

function replyKey(envelope: OperatingCommandEnvelope): string {
  return sha256Canonical({
    source: "endvera-operating-assistant-r2-reply",
    workspaceId: envelope.workspaceId,
    commandId: envelope.commandId,
  });
}

async function requireEnvelopeAuthority(
  tx: Prisma.TransactionClient,
  input: { userId: string; envelope: OperatingCommandEnvelope },
) {
  const membership = await requireActiveConstructionMember(tx, input.userId, input.envelope.workspaceId);
  if (input.envelope.channel === "PORTAL") {
    if (
      input.envelope.senderAddress !== `user:${input.userId}` ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      throw new ConstructionAccessDenied();
    }
    return;
  }
  const identity = await tx.constructionCommunicationIdentity.findUnique({
    where: {
      workspaceId_channel_normalizedAddress: {
        workspaceId: input.envelope.workspaceId,
        channel: dbChannel(input.envelope.channel),
        normalizedAddress: input.envelope.senderAddress,
      },
    },
    select: { userId: true, verified: true, permissions: true, status: true },
  });
  if (
    identity?.status !== "active" ||
    !identity.verified ||
    identity.userId !== input.userId ||
    !identity.permissions.includes("COMMAND")
  ) {
    throw new ConstructionAccessDenied();
  }
}

function windowBounds(referenceNow: Date, timezone: string, kind: "TODAY" | "TOMORROW") {
  const zonedNow = toZonedTime(referenceNow, timezone);
  const localDay = startOfDay(kind === "TOMORROW" ? addDays(zonedNow, 1) : zonedNow);
  return {
    from: fromZonedTime(localDay, timezone),
    to: fromZonedTime(addDays(localDay, 1), timezone),
  };
}

function formatAgenda(
  items: Array<{ title: string; startsAt: Date; timezone: string; project: { name: string } | null }>,
  kind: "TODAY" | "TOMORROW",
) {
  if (items.length === 0) return `Vous n’avez rien au calendrier ${kind === "TODAY" ? "aujourd’hui" : "demain"}.`;
  return items
    .map((item) => {
      const time = new Intl.DateTimeFormat("fr-CA", {
        timeZone: item.timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(item.startsAt);
      return `${time} — ${item.title} (${item.project?.name ?? "sans chantier"})`;
    })
    .join("\n");
}

async function persistLegacyReply(input: {
  userId: string;
  envelope: OperatingCommandEnvelope;
  reply: string;
  intent: OperatingInterpretation["intent"];
  messageId: string;
  effectId: string | null;
  status: OperatingCommandResult["status"];
  replayed: boolean;
}): Promise<OperatingCommandResult> {
  const key = replyKey(input.envelope);
  let replyMessage = await prisma.constructionMessage.findUnique({
    where: { workspaceId_idempotencyKey: { workspaceId: input.envelope.workspaceId, idempotencyKey: key } },
    select: { id: true },
  });
  if (!replyMessage) {
    try {
      replyMessage = await prisma.constructionMessage.create({
        data: {
          workspaceId: input.envelope.workspaceId,
          direction: "outbound",
          channel: dbChannel(input.envelope.channel),
          provider: "ENDVERA_CORE_R2",
          providerMessageId: `reply:${input.envelope.commandId}`,
          idempotencyKey: key,
          sender: "ENDVERA",
          recipients: [input.envelope.senderAddress],
          originalBody: input.reply,
          normalizedBody: input.reply.normalize("NFKC").replace(/\s+/g, " ").trim(),
          status: "answered",
          sentAt: new Date(input.envelope.occurredAt),
        },
        select: { id: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      replyMessage = await prisma.constructionMessage.findUniqueOrThrow({
        where: { workspaceId_idempotencyKey: { workspaceId: input.envelope.workspaceId, idempotencyKey: key } },
        select: { id: true },
      });
    }
  }
  return operatingCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: input.envelope.commandId,
    messageId: input.messageId,
    assistantMessageId: replyMessage.id,
    intent: input.intent,
    status: input.status,
    reply: input.reply,
    canonicalEffectId: input.effectId,
    replayed: input.replayed,
    externalTransportPerformed: false,
  });
}

async function reconstructNewResult(
  tx: Prisma.TransactionClient,
  envelope: OperatingCommandEnvelope,
  messageId: string,
): Promise<OperatingCommandResult> {
  const [message, reply] = await Promise.all([
    tx.constructionMessage.findUniqueOrThrow({
      where: { id: messageId },
      select: {
        status: true,
        interpretation: { select: { structuredResult: true } },
        calendarItem: { select: { id: true } },
        action: { select: { id: true, type: true } },
      },
    }),
    tx.constructionMessage.findUniqueOrThrow({
      where: { workspaceId_idempotencyKey: { workspaceId: envelope.workspaceId, idempotencyKey: replyKey(envelope) } },
      select: { id: true, originalBody: true },
    }),
  ]);
  const interpretation = message.interpretation?.structuredResult as OperatingInterpretation;
  const status: OperatingCommandResult["status"] = message.status === "needs_clarification"
    ? "CLARIFICATION_REQUIRED"
    : interpretation.intent === "AGENDA_QUERY" || interpretation.intent === "DAILY_BRIEFING"
      ? "ANSWERED"
      : message.action?.type === "outbound_message"
        ? "PREPARED_UNSENT"
        : "APPLIED";
  return operatingCommandResultSchema.parse({
    schemaVersion: 1,
    commandId: envelope.commandId,
    messageId,
    assistantMessageId: reply.id,
    intent: interpretation.intent,
    status,
    reply: reply.originalBody,
    canonicalEffectId: message.calendarItem?.id ?? message.action?.id ?? null,
    replayed: true,
    externalTransportPerformed: false,
  });
}

export async function processOperatingAssistantCommand(input: {
  userId: string;
  envelope: OperatingCommandEnvelope;
}): Promise<OperatingCommandResult> {
  const envelope = operatingCommandEnvelopeSchema.parse(input.envelope);
  const context = await prisma.$transaction(async (tx) => {
    await requireEnvelopeAuthority(tx, { userId: input.userId, envelope });
    const workspace = await tx.constructionWorkspace.findUniqueOrThrow({
      where: { id: envelope.workspaceId },
      select: { defaultTimezone: true, defaultLocale: true },
    });
    const [projects, contacts, calendarItems] = await Promise.all([
      tx.constructionProject.findMany({
        where: { workspaceId: envelope.workspaceId, status: "active" },
        select: { id: true, code: true, name: true },
      }),
      tx.constructionContact.findMany({
        where: { workspaceId: envelope.workspaceId, status: "active" },
        select: { id: true, displayName: true, preferredLanguage: true },
      }),
      tx.constructionCalendarItem.findMany({
        where: { workspaceId: envelope.workspaceId, status: "scheduled" },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: 500,
        select: { id: true, projectId: true, contactId: true, title: true, startsAt: true, endsAt: true, status: true },
      }),
    ]);
    return {
      referenceNow: envelope.occurredAt,
      locale: workspace.defaultLocale === "en-CA" ? "en-CA" as const : "fr-CA" as const,
      timezone: workspace.defaultTimezone,
      projects,
      contacts,
      calendarItems: calendarItems.map((item) => ({
        ...item,
        startsAtUtc: item.startsAt.toISOString(),
        endsAtUtc: item.endsAt?.toISOString() ?? null,
      })),
    };
  });
  const interpretation = interpretOperatingAssistantCommand(envelope.body, context);

  if (
    interpretation.legacy &&
    !["AGENDA_QUERY", "DAILY_BRIEFING", "REMINDER_CREATE", "CALENDAR_ITEM_RESCHEDULE"].includes(interpretation.intent)
  ) {
    const legacy = await processConstructionMessage({
      userId: input.userId,
      workspaceId: envelope.workspaceId,
      channel: dbChannel(envelope.channel),
      body: envelope.body,
      idempotencyKey: commandKey(envelope),
      provider: envelope.provider,
      providerMessageId: envelope.providerMessageId,
      sender: envelope.senderAddress,
      receivedAt: new Date(envelope.occurredAt),
      referenceNow: new Date(envelope.occurredAt),
    });
    const status: OperatingCommandResult["status"] = legacy.status === "needs_clarification"
      ? "CLARIFICATION_REQUIRED"
      : legacy.actionId
        ? "PREPARED_UNSENT"
        : "APPLIED";
    return persistLegacyReply({
      userId: input.userId,
      envelope,
      reply: legacy.reply,
      intent: interpretation.intent,
      messageId: legacy.messageId,
      effectId: legacy.calendarItemId ?? legacy.actionId ?? legacy.openLoopId ?? null,
      status,
      replayed: legacy.replayed,
    });
  }

  return prisma.$transaction(async (tx) => {
    const key = commandKey(envelope);
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${envelope.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireEnvelopeAuthority(tx, { userId: input.userId, envelope });
    const existing = await tx.constructionMessage.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: envelope.workspaceId, idempotencyKey: key } },
      select: { id: true },
    });
    if (existing) return reconstructNewResult(tx, envelope, existing.id);

    const inbound = await tx.constructionMessage.create({
      data: {
        workspaceId: envelope.workspaceId,
        projectId: interpretation.projectId,
        contactId: interpretation.contactId,
        direction: "inbound",
        channel: dbChannel(envelope.channel),
        provider: envelope.provider,
        providerMessageId: envelope.providerMessageId,
        idempotencyKey: key,
        sender: envelope.senderAddress,
        recipients: ["ENDVERA"],
        originalBody: envelope.body,
        normalizedBody: envelope.body.normalize("NFKC").replace(/\s+/g, " ").trim(),
        status: "received",
        receivedAt: new Date(envelope.occurredAt),
      },
      select: { id: true },
    });

    await tx.constructionInterpretation.create({
      data: {
        workspaceId: envelope.workspaceId,
        messageId: inbound.id,
        intent: dbIntent(interpretation.intent),
        confidence: interpretation.confidence,
        language: interpretation.language,
        structuredResult: asJson(interpretation),
        clarification: interpretation.clarification ? asJson(interpretation.clarification) : Prisma.JsonNull,
        interpreterVersion: "construction-operating-deterministic-r2",
      },
    });

    let reply = "La demande est conservée, mais aucune action n’a été inventée.";
    let canonicalEffectId: string | null = null;
    let resultStatus: OperatingCommandResult["status"] = "APPLIED";
    let messageStatus: "interpreted" | "needs_clarification" = "interpreted";

    if (interpretation.intent === "AGENDA_QUERY" || interpretation.intent === "DAILY_BRIEFING") {
      const workspace = await tx.constructionWorkspace.findUniqueOrThrow({
        where: { id: envelope.workspaceId },
        select: { defaultTimezone: true },
      });
      const kind = interpretation.queryWindow?.kind ?? "TODAY";
      const bounds = windowBounds(new Date(envelope.occurredAt), workspace.defaultTimezone, kind);
      const items = await tx.constructionCalendarItem.findMany({
        where: { workspaceId: envelope.workspaceId, status: "scheduled", startsAt: { gte: bounds.from, lt: bounds.to } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: { title: true, startsAt: true, timezone: true, project: { select: { name: true } } },
      });
      reply = formatAgenda(items, kind);
      if (interpretation.intent === "DAILY_BRIEFING") {
        const [reminders, loops] = await Promise.all([
          tx.constructionAction.findMany({
            where: { workspaceId: envelope.workspaceId, type: "reminder", status: "approved", dueAt: { gte: bounds.from, lt: bounds.to } },
            orderBy: [{ dueAt: "asc" }, { id: "asc" }],
            select: { payload: true },
          }),
          tx.constructionOpenLoop.findMany({
            where: { workspaceId: envelope.workspaceId, status: { in: ["open", "waiting_for_evidence", "waiting_for_verification"] } },
            orderBy: [{ priority: "desc" }, { updatedAt: "asc" }],
            take: 5,
            select: { nextAction: true, project: { select: { name: true } } },
          }),
        ]);
        const reminderLines = reminders.map((item) => {
          const payload = item.payload as { title?: string };
          return payload.title ?? "Rappel";
        });
        const loopLines = loops.map((loop) => `${loop.project.name}: ${loop.nextAction}`);
        reply = [
          reply,
          reminderLines.length ? `Rappels: ${reminderLines.join("; ")}` : "Aucun rappel dû aujourd’hui.",
          loopLines.length ? `Suivis: ${loopLines.join("; ")}` : "Aucun dossier bloqué prioritaire.",
        ].join("\n");
      }
      resultStatus = "ANSWERED";
    } else if (interpretation.intent === "REMINDER_CREATE" && interpretation.dueAtUtc && interpretation.title) {
      const payload = {
        schemaVersion: 1,
        kind: "REMINDER",
        title: interpretation.title,
        dueAtUtc: interpretation.dueAtUtc,
        projectId: interpretation.projectId,
        contactId: interpretation.contactId,
        externalTransportAuthorized: false,
      };
      const action = await tx.constructionAction.create({
        data: {
          workspaceId: envelope.workspaceId,
          projectId: interpretation.projectId,
          contactId: interpretation.contactId,
          sourceMessageId: inbound.id,
          type: "reminder",
          status: "approved",
          dueAt: new Date(interpretation.dueAtUtc),
          riskClass: "low",
          approvalRequired: false,
          payload: asJson(payload),
          payloadHash: sha256Canonical(payload),
          approvedVersion: 1,
          approvedPayloadHash: sha256Canonical(payload),
          approvedAt: new Date(envelope.occurredAt),
        },
        select: { id: true },
      });
      canonicalEffectId = action.id;
      const time = new Intl.DateTimeFormat("fr-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: interpretation.timezone,
      }).format(new Date(interpretation.dueAtUtc));
      reply = `Rappel créé pour ${time}: ${interpretation.title}.`;
    } else if (
      interpretation.intent === "CALENDAR_ITEM_RESCHEDULE" &&
      interpretation.calendarItemId &&
      interpretation.startsAtUtc &&
      interpretation.title
    ) {
      const previous = await tx.constructionCalendarItem.findFirst({
        where: { id: interpretation.calendarItemId, workspaceId: envelope.workspaceId, status: "scheduled" },
        select: { id: true, projectId: true, contactId: true, description: true, startsAt: true, endsAt: true, verificationState: true },
      });
      if (!previous) throw new Prisma.PrismaClientKnownRequestError("Calendar item changed concurrently", { code: "P2025", clientVersion: "6.19.3" });
      await tx.constructionCalendarItem.update({ where: { id: previous.id }, data: { status: "rescheduled" } });
      const replacement = await tx.constructionCalendarItem.create({
        data: {
          workspaceId: envelope.workspaceId,
          projectId: previous.projectId,
          contactId: previous.contactId,
          sourceMessageId: inbound.id,
          type: "meeting",
          title: interpretation.title,
          description: [previous.description, `Remplace ${previous.id}; ancienne heure ${previous.startsAt.toISOString()}.`].filter(Boolean).join(" "),
          startsAt: new Date(interpretation.startsAtUtc),
          endsAt: interpretation.endsAtUtc ? new Date(interpretation.endsAtUtc) : null,
          timezone: interpretation.timezone,
          status: "scheduled",
          confidence: interpretation.confidence,
          verificationState: previous.verificationState,
        },
        select: { id: true },
      });
      canonicalEffectId = replacement.id;
      const time = new Intl.DateTimeFormat("fr-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: interpretation.timezone,
      }).format(new Date(interpretation.startsAtUtc));
      reply = `Rendez-vous déplacé au ${time}. L’ancienne version demeure dans l’historique.`;
      await appendConstructionAudit(tx, {
        workspaceId: envelope.workspaceId,
        actorUserId: input.userId,
        entityType: "calendar_item",
        entityId: replacement.id,
        action: "construction_calendar_item_rescheduled",
        metadata: { previousId: previous.id, sourceMessageId: inbound.id },
      });
    } else if (interpretation.clarification) {
      reply = interpretation.clarification.question;
      resultStatus = "CLARIFICATION_REQUIRED";
      messageStatus = "needs_clarification";
    }

    await tx.constructionMessage.update({
      where: { id: inbound.id },
      data: { status: messageStatus },
    });
    const assistant = await tx.constructionMessage.create({
      data: {
        workspaceId: envelope.workspaceId,
        projectId: interpretation.projectId,
        contactId: interpretation.contactId,
        direction: "outbound",
        channel: dbChannel(envelope.channel),
        provider: "ENDVERA_CORE_R2",
        providerMessageId: `reply:${envelope.commandId}`,
        idempotencyKey: replyKey(envelope),
        sender: "ENDVERA",
        recipients: [envelope.senderAddress],
        originalBody: reply,
        normalizedBody: reply.normalize("NFKC").replace(/\s+/g, " ").trim(),
        status: "answered",
        sentAt: new Date(envelope.occurredAt),
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: envelope.workspaceId,
      actorUserId: input.userId,
      entityType: "message",
      entityId: inbound.id,
      action: "operating_assistant_command_processed",
      reasonCode: interpretation.intent,
      metadata: { commandId: envelope.commandId, resultStatus, externalTransportPerformed: false },
    });

    return operatingCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: envelope.commandId,
      messageId: inbound.id,
      assistantMessageId: assistant.id,
      intent: interpretation.intent,
      status: resultStatus,
      reply,
      canonicalEffectId,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: "Serializable" });
}
