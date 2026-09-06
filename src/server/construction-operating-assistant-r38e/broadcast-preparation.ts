import "server-only";

import { Prisma, type ConstructionChannel } from "@prisma-client";
import { z } from "zod";
import type { ConstructionMobileAssistantRequest } from "@/lib/construction-operating-assistant-r9/mobile-assistant-contracts";
import {
  buildSecretaryBroadcastRequestHash,
  maskSecretaryBroadcastDestination,
  secretaryBroadcastCockpitSchema,
  secretaryBroadcastPayloadSchema,
  type SecretaryBroadcastParseResult,
} from "@/lib/construction-operating-assistant-r38e/contracts";
import type {
  ClientAssistantRoutingProjection,
  TrustedAdmittedAssistantSource,
  UnifiedAssistantResult,
} from "@/lib/construction-operating-assistant-r36c/contracts";
import { unifiedAssistantResultSchema } from "@/lib/construction-operating-assistant-r36c/contracts";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { prisma } from "@/lib/db";
import { requireActiveConstructionMember, ConstructionAccessDenied } from "@/server/construction-assistant-v1/workspace";

type BroadcastCandidate = Extract<SecretaryBroadcastParseResult, { kind: "CANDIDATE" }>;

export class SecretaryBroadcastRefused extends Error {
  constructor(
    readonly reasonCode:
      | "R38E_CONTACT_NOT_FOUND"
      | "R38E_AMBIGUOUS_CONTACT"
      | "R38E_CONTACT_PHONE_REQUIRED",
    readonly reply: string,
  ) {
    super(reasonCode);
    this.name = "SecretaryBroadcastRefused";
  }
}

export async function secretaryBroadcastCockpitForUser(input: {
  userId: string;
  workspaceId: string;
}) {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.workspaceId);
  const role = membership.role === "owner" ? "owner" : membership.role === "admin" ? "admin" : "field_worker";
  const rows = await prisma.constructionSecretaryBroadcastDraft.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: [{ preparedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      version: true,
      recipientSnapshot: true,
      payloadHash: true,
      body: true,
      preparedAt: true,
      externalTransportPerformed: true,
    },
  });
  const drafts = rows.map((row) => {
    const recipients = z.array(secretaryBroadcastPayloadSchema.shape.recipients.element).parse(row.recipientSnapshot);
    const base = {
      id: row.id,
      status: row.status,
      version: row.version,
      recipientCount: recipients.length,
      preparedAt: row.preparedAt.toISOString(),
      externalTransportPerformed: row.externalTransportPerformed,
    };
    if (role === "field_worker") return { ...base, visibility: "REDACTED" as const };
    return {
      ...base,
      visibility: "FULL" as const,
      payloadHash: row.payloadHash,
      body: row.body,
      recipients: recipients.map((recipient) => ({
        displayName: recipient.displayName,
        maskedDestination: maskSecretaryBroadcastDestination(recipient.normalizedRecipient),
      })),
    };
  });
  return secretaryBroadcastCockpitSchema.parse({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    role,
    drafts,
    externalTransportEnabled: false,
  });
}

function databaseChannel(channel: "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL"): ConstructionChannel {
  if (channel === "VOICE_TRANSCRIPT") return "voice";
  if (channel === "MOBILE_APP") return "portal";
  return channel.toLocaleLowerCase("en-CA") as ConstructionChannel;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-CA");
}

function inboundKey(workspaceId: string, requestId: string) {
  return sha256Canonical({ source: "endvera-secretary-broadcast-r38e", workspaceId, requestId });
}

function replyKey(workspaceId: string, requestId: string) {
  return sha256Canonical({ source: "endvera-secretary-broadcast-r38e-reply", workspaceId, requestId });
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function prepareSecretaryBroadcast(input: {
  userId: string;
  request: ConstructionMobileAssistantRequest;
  channel: "PORTAL" | "MOBILE_APP" | "SMS" | "VOICE_TRANSCRIPT" | "EMAIL";
  candidate: BroadcastCandidate;
  routing: ClientAssistantRoutingProjection;
  admittedSource?: TrustedAdmittedAssistantSource;
}): Promise<UnifiedAssistantResult> {
  const membership = await requireActiveConstructionMember(prisma, input.userId, input.request.workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") throw new ConstructionAccessDenied();

  const contacts = await prisma.constructionContact.findMany({
    where: { workspaceId: input.request.workspaceId, status: "active" },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true, normalizedPhone: true },
  });
  const recipients = input.candidate.recipientNames.map((requestedName) => {
    const matches = contacts.filter((contact) => normalizeName(contact.displayName) === normalizeName(requestedName));
    if (matches.length === 0) {
      throw new SecretaryBroadcastRefused(
        "R38E_CONTACT_NOT_FOUND",
        `Je ne trouve pas le contact « ${requestedName} ». Aucun texto de groupe n’a été préparé.`,
      );
    }
    if (matches.length > 1) {
      throw new SecretaryBroadcastRefused(
        "R38E_AMBIGUOUS_CONTACT",
        `Il y a plusieurs contacts nommés « ${requestedName} ». Précise lequel; rien n’a été préparé.`,
      );
    }
    const contact = matches[0];
    if (!contact.normalizedPhone) {
      throw new SecretaryBroadcastRefused(
        "R38E_CONTACT_PHONE_REQUIRED",
        `Le contact « ${contact.displayName} » n’a pas de numéro de téléphone. Aucun texto de groupe n’a été préparé.`,
      );
    }
    return {
      contactId: contact.id,
      displayName: contact.displayName,
      normalizedRecipient: contact.normalizedPhone,
    };
  });

  const source = input.admittedSource ?? null;
  const requestHash = sha256Canonical({
    candidateHash: buildSecretaryBroadcastRequestHash(input.candidate),
    channel: input.channel,
    occurredAt: input.request.occurredAt,
    sender: source?.senderAddress ?? `user:${input.userId}`,
    provider: source?.provider ?? null,
    providerMessageId: source?.providerMessageId ?? null,
  });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${input.request.workspaceId}:${input.request.requestId}:r38e`}, 0))::text AS acquired
    `);

    const existing = await tx.constructionSecretaryBroadcastDraft.findUnique({
      where: {
        workspaceId_requestId: {
          workspaceId: input.request.workspaceId,
          requestId: input.request.requestId,
        },
      },
      select: { id: true, requestHash: true, sourceMessageId: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("R38E_BROADCAST_REPLAY_MISMATCH");
      const reply = await tx.constructionMessage.findUniqueOrThrow({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: input.request.workspaceId,
            idempotencyKey: replyKey(input.request.workspaceId, input.request.requestId),
          },
        },
        select: { id: true, originalBody: true },
      });
      return unifiedAssistantResultSchema.parse({
        schemaVersion: 1,
        commandId: input.request.requestId,
        messageId: existing.sourceMessageId,
        assistantMessageId: reply.id,
        intent: "OUTBOUND_MESSAGE_DRAFT",
        status: "PREPARED_UNSENT",
        reply: reply.originalBody,
        canonicalEffectId: existing.id,
        replayed: true,
        externalTransportPerformed: false,
        routing: input.routing,
      });
    }

    const inbound = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        direction: "inbound",
        channel: databaseChannel(input.channel),
        provider: source?.provider ?? "ENDVERA_SECRETARY_R38E",
        providerMessageId: source?.providerMessageId ?? `request:${input.request.workspaceId}:${input.request.requestId}`,
        idempotencyKey: inboundKey(input.request.workspaceId, input.request.requestId),
        sender: source?.senderAddress ?? `user:${input.userId}`,
        recipients: ["ENDVERA"],
        originalBody: input.request.message,
        normalizedBody: input.request.message.normalize("NFKC").replace(/\s+/g, " ").trim(),
        status: "interpreted",
        receivedAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });

    const draftId = crypto.randomUUID();
    const payload = secretaryBroadcastPayloadSchema.parse({
      schemaVersion: 1,
      workspaceId: input.request.workspaceId,
      draftId,
      version: 1,
      channel: "SMS",
      recipients,
      body: input.candidate.body,
      externalTransportAuthorized: false,
    });
    const payloadHash = sha256Canonical(payload);
    const draft = await tx.constructionSecretaryBroadcastDraft.create({
      data: {
        id: draftId,
        workspaceId: input.request.workspaceId,
        requestId: input.request.requestId,
        requestHash,
        sourceMessageId: inbound.id,
        body: input.candidate.body,
        recipientSnapshot: asJson(recipients),
        payloadHash,
        preparedByUserId: input.userId,
      },
      select: { id: true },
    });

    await tx.constructionInterpretation.create({
      data: {
        workspaceId: input.request.workspaceId,
        messageId: inbound.id,
        intent: "outbound_message_draft",
        confidence: 1,
        language: "fr-CA",
        structuredResult: asJson({
          schemaVersion: 1,
          kind: "R38E_SECRETARY_BROADCAST",
          draftId: draft.id,
          recipientCount: recipients.length,
          payloadHash,
          state: "PREPARED_UNSENT",
          externalTransportPerformed: false,
        }),
        interpreterVersion: "endvera-secretary-broadcast-r38e-v1",
      },
    });

    const names = recipients.map((recipient) => recipient.displayName).join(", ");
    const replyText = `Texto de groupe préparé pour ${names}. Vérifie le texte avant une future approbation : « ${input.candidate.body} » Aucun texto n’a été envoyé.`;
    const reply = await tx.constructionMessage.create({
      data: {
        workspaceId: input.request.workspaceId,
        direction: "outbound",
        channel: databaseChannel(input.channel),
        provider: "ENDVERA_SECRETARY_R38E",
        providerMessageId: `reply:${input.request.workspaceId}:${input.request.requestId}`,
        idempotencyKey: replyKey(input.request.workspaceId, input.request.requestId),
        sender: "ENDVERA",
        recipients: [source?.senderAddress ?? `user:${input.userId}`],
        originalBody: replyText,
        normalizedBody: replyText.normalize("NFKC").replace(/\s+/g, " ").trim(),
        status: "answered",
        sentAt: new Date(input.request.occurredAt),
      },
      select: { id: true },
    });

    await tx.constructionAuditEvent.create({
      data: {
        workspaceId: input.request.workspaceId,
        actorUserId: input.userId,
        entityType: "secretary_broadcast_draft",
        entityId: draft.id,
        action: "secretary_broadcast_prepared_unsent",
        reasonCode: "R38E_LOCAL_PREPARATION_ONLY",
        metadata: asJson({ recipientCount: recipients.length, channel: "SMS", externalTransportPerformed: false }),
        fingerprint: sha256Canonical({ action: "secretary_broadcast_prepared_unsent", draftId: draft.id, payloadHash }),
      },
    });

    return unifiedAssistantResultSchema.parse({
      schemaVersion: 1,
      commandId: input.request.requestId,
      messageId: inbound.id,
      assistantMessageId: reply.id,
      intent: "OUTBOUND_MESSAGE_DRAFT",
      status: "PREPARED_UNSENT",
      reply: replyText,
      canonicalEffectId: draft.id,
      replayed: false,
      externalTransportPerformed: false,
      routing: input.routing,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
