import "server-only";

import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  boundOutboundActionSchema,
  verifyExactApproval,
} from "@/lib/construction-assistant-v1/outbound";
import {
  messagingCockpitSchema,
  messagingDeliveryObservationSchema,
  messagingDeliveryResultSchema,
  messagingInboundEventSchema,
  messagingInboundResultSchema,
  messagingPolicyCommandSchema,
  messagingPolicyResultSchema,
  policyBoundSmsResultSchema,
  preparePolicyBoundSmsSchema,
  type MessagingDeliveryStatus,
  type MessagingInboundEvent,
} from "@/lib/construction-operating-assistant-r24/contracts";
import {
  classifyMessagingKeyword,
  deriveMessagingPermission,
  nextDeliveryStatus,
  opaqueContactMessagingRef,
} from "@/lib/construction-operating-assistant-r24/policy";
import {
  SMS_CONNECTOR_PROVIDER,
  SMS_OUTBOUND_PREPARE_CAPABILITY,
  trustedCommunicationAdapterAssertionSchema,
  type TrustedCommunicationAdapterAssertion,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  communicationOperationKey,
  maskCommunicationRecipient,
} from "@/lib/construction-operating-assistant-r4/communications";
import { appendConstructionAudit } from "@/server/construction-assistant-v1/audit";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const PURPOSES = ["service", "commercial"] as const;

async function requireMessagingManager(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
  }
  return membership;
}

function messagingEventKey(eventId: string) {
  return `r24:${eventId}`;
}

function inboundResult(input: {
  event: MessagingInboundEvent;
  message: { id: string; projectId: string | null; status: string; mediaReferenceCount: number };
  replayed: boolean;
}) {
  const keyword = classifyMessagingKeyword(input.event.body);
  const status = keyword === "STOP"
    ? "SUPPRESSED"
    : keyword === "HELP"
      ? "HELP_PREPARED_UNSENT"
      : input.message.projectId && keyword === "NONE"
        ? "APPLIED"
        : "CLARIFICATION_REQUIRED";
  return messagingInboundResultSchema.parse({
    schemaVersion: 1,
    eventId: input.event.eventId,
    messageId: input.message.id,
    projectId: input.message.projectId,
    status,
    keyword,
    mediaReferenceCount: input.message.mediaReferenceCount,
    replayed: input.replayed,
    externalTransportPerformed: false,
  });
}

async function resolveProject(
  tx: Prisma.TransactionClient,
  event: MessagingInboundEvent,
  contactProjectId: string | null,
) {
  if (contactProjectId) {
    const project = await tx.constructionProject.findFirst({
      where: { id: contactProjectId, workspaceId: event.workspaceId, status: "active" },
      select: { id: true },
    });
    return project?.id ?? null;
  }
  const projects = await tx.constructionProject.findMany({
    where: { workspaceId: event.workspaceId, status: "active" },
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
  });
  const normalizedBody = event.body.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toUpperCase();
  const explicit = projects.filter((project) =>
    normalizedBody.includes(project.code.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toUpperCase()) ||
    normalizedBody.includes(project.name.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toUpperCase()),
  );
  if (explicit.length === 1) return explicit[0].id;
  if (explicit.length > 1) return null;
  return projects.length === 1 ? projects[0].id : null;
}

function expectedEvidenceKind(kind: "PHOTO" | "DOCUMENT" | "WRITTEN_APPROVAL") {
  return {
    PHOTO: "photo",
    DOCUMENT: "document",
    WRITTEN_APPROVAL: "written_approval",
  }[kind];
}

async function validateMediaReferences(
  tx: Prisma.TransactionClient,
  event: MessagingInboundEvent,
  projectId: string | null,
) {
  if (event.mediaReferences.length === 0) return;
  if (!projectId) throw new Error("MESSAGING_PROJECT_CLARIFICATION_REQUIRED");
  const evidence = await tx.constructionOpenLoopEvidence.findMany({
    where: {
      id: { in: event.mediaReferences.map((item) => item.evidenceId) },
      workspaceId: event.workspaceId,
      projectId,
      state: { not: "revoked" },
    },
    select: { id: true, contentHash: true, kind: true },
  });
  const byId = new Map(evidence.map((item) => [item.id, item]));
  for (const reference of event.mediaReferences) {
    const current = byId.get(reference.evidenceId);
    if (
      !current ||
      current.contentHash !== reference.contentHash ||
      current.kind !== expectedEvidenceKind(reference.kind)
    ) {
      throw new Error("MESSAGING_MEDIA_REFERENCE_REFUSED");
    }
  }
}

async function applyKeywordPolicy(
  tx: Prisma.TransactionClient,
  input: { event: MessagingInboundEvent; messageId: string; contactId: string | null },
) {
  const keyword = classifyMessagingKeyword(input.event.body);
  if (keyword !== "STOP" && keyword !== "START_REVIEW_REQUIRED") return;
  if (!input.contactId) throw new Error("MESSAGING_CONTACT_IDENTITY_REQUIRED");
  for (const purpose of PURPOSES) {
    await tx.constructionMessagingPermission.upsert({
      where: {
        workspaceId_contactId_purpose: {
          workspaceId: input.event.workspaceId,
          contactId: input.contactId,
          purpose,
        },
      },
      create: {
        workspaceId: input.event.workspaceId,
        contactId: input.contactId,
        purpose,
        consentStatus: keyword === "STOP" ? "withdrawn" : "unknown",
        suppressionStatus: keyword === "STOP" ? "suppressed" : "review_required",
        sourceMessageId: input.messageId,
        actorUserId: null,
        effectiveAt: new Date(input.event.occurredAt),
      },
      update: {
        consentStatus: keyword === "STOP" ? "withdrawn" : "unknown",
        suppressionStatus: keyword === "STOP" ? "suppressed" : "review_required",
        evidenceRef: null,
        sourceMessageId: input.messageId,
        actorUserId: null,
        effectiveAt: new Date(input.event.occurredAt),
        stateVersion: { increment: 1 },
      },
    });
  }
}

export async function processMessagingInboundR24(input: {
  event: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}) {
  const event = messagingInboundEventSchema.parse(input.event);
  const assertion = trustedCommunicationAdapterAssertionSchema.parse(input.assertion);
  if (!assertion.authenticityVerified || assertion.externalTransportPerformed) {
    throw new Error("MESSAGING_ADAPTER_AUTHENTICITY_REFUSED");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${event.workspaceId}:${event.eventId}`}, 0))::text AS acquired
    `);
    const existing = await tx.constructionMessage.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: event.workspaceId,
          idempotencyKey: messagingEventKey(event.eventId),
        },
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        _count: { select: { mediaReferences: true } },
      },
    });
    if (existing) {
      return inboundResult({
        event,
        message: {
          id: existing.id,
          projectId: existing.projectId,
          status: existing.status,
          mediaReferenceCount: existing._count.mediaReferences,
        },
        replayed: true,
      });
    }
    const identity = await tx.constructionCommunicationIdentity.findUnique({
      where: {
        workspaceId_channel_normalizedAddress: {
          workspaceId: event.workspaceId,
          channel: "sms",
          normalizedAddress: event.senderIdentityRef,
        },
      },
      select: {
        contactId: true,
        verified: true,
        status: true,
        permissions: true,
        contact: { select: { projectId: true, status: true } },
      },
    });
    if (
      !identity ||
      identity.status !== "active" ||
      !identity.verified ||
      !identity.permissions.some((value) => ["COMMAND", "PROJECT_UPDATE", "MESSAGE"].includes(value)) ||
      identity.contact?.status === "inactive"
    ) {
      throw new Error("MESSAGING_INBOUND_REFUSED");
    }
    const projectId = await resolveProject(tx, event, identity.contact?.projectId ?? null);
    await validateMediaReferences(tx, event, projectId);
    const keyword = classifyMessagingKeyword(event.body);
    const message = await tx.constructionMessage.create({
      data: {
        workspaceId: event.workspaceId,
        projectId,
        contactId: identity.contactId,
        direction: "inbound",
        channel: "sms",
        provider: SMS_CONNECTOR_PROVIDER,
        providerMessageId: sha256Canonical({
          schemaVersion: 1,
          provider: SMS_CONNECTOR_PROVIDER,
          eventId: event.eventId,
          senderIdentityRef: event.senderIdentityRef,
        }),
        idempotencyKey: messagingEventKey(event.eventId),
        sender: event.senderIdentityRef,
        recipients: [],
        originalBody: event.body,
        normalizedBody: event.body.trim(),
        status: keyword === "STOP" || keyword === "HELP"
          ? "answered"
          : keyword === "START_REVIEW_REQUIRED" || !projectId
            ? "needs_clarification"
            : "interpreted",
        receivedAt: new Date(event.occurredAt),
        mediaReferences: projectId && event.mediaReferences.length > 0
          ? {
              createMany: {
                data: event.mediaReferences.map((reference) => ({
                  workspaceId: event.workspaceId,
                  projectId,
                  evidenceId: reference.evidenceId,
                  kind: reference.kind,
                  contentHash: reference.contentHash,
                })),
              },
            }
          : undefined,
      },
      select: { id: true, projectId: true, status: true },
    });
    await applyKeywordPolicy(tx, {
      event,
      messageId: message.id,
      contactId: identity.contactId,
    });
    await appendConstructionAudit(tx, {
      workspaceId: event.workspaceId,
      entityType: "message",
      entityId: message.id,
      action: "construction_messaging_inbound_admitted_r24",
      reasonCode: projectId ? null : "PROJECT_CLARIFICATION_REQUIRED",
      metadata: {
        eventId: event.eventId,
        projectId,
        contactId: identity.contactId,
        kind: event.kind,
        keyword,
        mediaReferenceCount: event.mediaReferences.length,
        externalTransportPerformed: false,
      },
    });
    return inboundResult({
      event,
      message: {
        ...message,
        mediaReferenceCount: event.mediaReferences.length,
      },
      replayed: false,
    });
  });
}

export async function applyMessagingPolicyCommandR24(input: {
  userId: string;
  command: unknown;
}) {
  const command = messagingPolicyCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${command.contactId}:${command.purpose}`}, 0))::text AS acquired
    `);
    await requireMessagingManager(tx, input.userId, command.workspaceId);
    const replay = await tx.constructionMessagingTransition.findUnique({
      where: {
        workspaceId_commandId: {
          workspaceId: command.workspaceId,
          commandId: command.commandId,
        },
      },
      select: { commandHash: true, result: true },
    });
    if (replay) {
      if (replay.commandHash !== commandHash) throw new Error("MESSAGING_POLICY_IDEMPOTENCY_CONFLICT");
      return messagingPolicyResultSchema.parse({ ...(replay.result as object), replayed: true });
    }
    const contact = await tx.constructionContact.findFirst({
      where: { id: command.contactId, workspaceId: command.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!contact) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");
    const current = await tx.constructionMessagingPermission.findUnique({
      where: {
        workspaceId_contactId_purpose: {
          workspaceId: command.workspaceId,
          contactId: command.contactId,
          purpose: command.purpose,
        },
      },
    });
    const currentVersion = current?.stateVersion ?? 0;
    if (command.expectedStateVersion !== currentVersion) {
      throw new Error("MESSAGING_POLICY_STALE_STATE");
    }
    const next = command.action === "RECORD_CONSENT"
      ? {
          consentStatus: "granted",
          suppressionStatus: "allowed",
          evidenceRef: command.evidenceRef,
        }
      : {
          consentStatus: "withdrawn",
          suppressionStatus: "suppressed",
          evidenceRef: null,
        };
    const permission = await tx.constructionMessagingPermission.upsert({
      where: {
        workspaceId_contactId_purpose: {
          workspaceId: command.workspaceId,
          contactId: command.contactId,
          purpose: command.purpose,
        },
      },
      create: {
        workspaceId: command.workspaceId,
        contactId: command.contactId,
        purpose: command.purpose,
        ...next,
        actorUserId: input.userId,
        stateVersion: 1,
      },
      update: {
        ...next,
        sourceMessageId: null,
        actorUserId: input.userId,
        effectiveAt: new Date(),
        stateVersion: { increment: 1 },
      },
    });
    await tx.constructionCommunicationIdentity.upsert({
      where: {
        workspaceId_channel_normalizedAddress: {
          workspaceId: command.workspaceId,
          channel: "sms",
          normalizedAddress: opaqueContactMessagingRef({
            workspaceId: command.workspaceId,
            contactId: command.contactId,
          }),
        },
      },
      create: {
        workspaceId: command.workspaceId,
        contactId: command.contactId,
        channel: "sms",
        normalizedAddress: opaqueContactMessagingRef({
          workspaceId: command.workspaceId,
          contactId: command.contactId,
        }),
        verified: true,
        permissions: ["PROJECT_UPDATE", "MESSAGE"],
        status: "active",
      },
      update: {
        contactId: command.contactId,
        verified: true,
        permissions: ["PROJECT_UPDATE", "MESSAGE"],
        status: "active",
      },
    });
    const result = messagingPolicyResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      contactId: command.contactId,
      purpose: command.purpose,
      consentStatus: permission.consentStatus,
      suppressionStatus: permission.suppressionStatus,
      stateVersion: permission.stateVersion,
      replayed: false,
      externalTransportPerformed: false,
    });
    await tx.constructionMessagingTransition.create({
      data: {
        workspaceId: command.workspaceId,
        contactId: command.contactId,
        commandId: command.commandId,
        commandHash,
        action: command.action,
        purpose: command.purpose,
        versionBefore: current?.stateVersion ?? null,
        versionAfter: permission.stateVersion,
        beforeState: current as unknown as Prisma.InputJsonValue | undefined,
        afterState: permission as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        actorId: input.userId,
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "messaging_permission",
      entityId: permission.id,
      action: command.action === "RECORD_CONSENT"
        ? "construction_messaging_consent_recorded_r24"
        : "construction_messaging_consent_withdrawn_r24",
      metadata: {
        commandId: command.commandId,
        contactId: command.contactId,
        purpose: command.purpose,
        stateVersion: permission.stateVersion,
        externalTransportPerformed: false,
      },
    });
    return result;
  });
}

export async function preparePolicyBoundSmsR24(input: {
  userId: string;
  command: unknown;
}) {
  const command = preparePolicyBoundSmsSchema.parse(input.command);
  const key = communicationOperationKey({
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    channel: "SMS",
    action: command.action,
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${command.workspaceId}:${key}`}, 0))::text AS acquired
    `);
    await requireMessagingManager(tx, input.userId, command.workspaceId);
    const action = await tx.constructionAction.findFirst({
      where: {
        id: command.actionId,
        workspaceId: command.workspaceId,
        type: "outbound_message",
      },
      select: {
        id: true,
        contactId: true,
        version: true,
        payload: true,
        payloadHash: true,
        status: true,
        approvedVersion: true,
        approvedPayloadHash: true,
      },
    });
    if (!action?.contactId) throw new Error("MESSAGING_CONTACT_REQUIRED");
    const payload = boundOutboundActionSchema.parse(action.payload);
    const exact = verifyExactApproval(payload, {
      version: command.expectedVersion,
      fingerprint: command.expectedPayloadHash,
    });
    if (
      payload.channel !== "SMS" ||
      !exact.valid ||
      action.status !== "approved" ||
      action.version !== command.expectedVersion ||
      action.payloadHash !== command.expectedPayloadHash ||
      action.approvedVersion !== command.expectedVersion ||
      action.approvedPayloadHash !== command.expectedPayloadHash
    ) {
      throw new Error("EXACT_APPROVAL_REQUIRED");
    }
    const permission = await tx.constructionMessagingPermission.findUnique({
      where: {
        workspaceId_contactId_purpose: {
          workspaceId: command.workspaceId,
          contactId: action.contactId,
          purpose: command.purpose,
        },
      },
    });
    const policy = deriveMessagingPermission({
      consentStatus: permission?.consentStatus === "granted" || permission?.consentStatus === "withdrawn"
        ? permission.consentStatus
        : "unknown",
      suppressionStatus: permission?.suppressionStatus === "suppressed" || permission?.suppressionStatus === "review_required"
        ? permission.suppressionStatus
        : "allowed",
    });
    if (!policy.allowed) throw new Error(policy.reason);
    const existing = await tx.constructionConnectorOperation.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId: command.workspaceId, idempotencyKey: key } },
    });
    const recipientRef = opaqueContactMessagingRef({
      workspaceId: command.workspaceId,
      contactId: action.contactId,
    });
    if (existing) {
      if (existing.requestHash !== sha256Canonical({
        schemaVersion: 1,
        actionId: action.id,
        contactId: action.contactId,
        recipientRef,
        purpose: command.purpose,
        version: action.version,
        payloadHash: action.payloadHash,
        bodyHash: sha256Canonical({ body: payload.body }),
        externalTransportAuthorized: false,
      })) {
        throw new Error("MESSAGING_IDEMPOTENCY_CONFLICT");
      }
      return policyBoundSmsResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        actionId: action.id,
        operationId: existing.id,
        contactId: action.contactId,
        recipientRef,
        maskedRecipient: maskCommunicationRecipient(payload.normalizedRecipient),
        body: payload.body,
        purpose: command.purpose,
        consentStatus: "granted",
        suppressionStatus: "allowed",
        status: "PREPARED_UNSENT",
        version: action.version,
        payloadHash: action.payloadHash,
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const account = await tx.constructionConnectorAccount.findUnique({
      where: {
        workspaceId_provider: {
          workspaceId: command.workspaceId,
          provider: SMS_CONNECTOR_PROVIDER,
        },
      },
      select: {
        id: true,
        status: true,
        grants: {
          where: { capability: SMS_OUTBOUND_PREPARE_CAPABILITY },
          select: { status: true },
          take: 1,
        },
      },
    });
    if (
      account?.status !== "prepared" ||
      !["requested", "active"].includes(account.grants[0]?.status ?? "")
    ) {
      throw new Error("SMS_CONNECTOR_NOT_PREPARED");
    }
    const request = {
      schemaVersion: 1,
      actionId: action.id,
      contactId: action.contactId,
      recipientRef,
      purpose: command.purpose,
      version: action.version,
      payloadHash: action.payloadHash,
      bodyHash: sha256Canonical({ body: payload.body }),
      externalTransportAuthorized: false,
    };
    const operation = await tx.constructionConnectorOperation.create({
      data: {
        workspaceId: command.workspaceId,
        connectorAccountId: account.id,
        kind: "sms_mms_dispatch_prepare_r24",
        status: "prepared",
        idempotencyKey: key,
        request,
        requestHash: sha256Canonical(request),
        externalTransportPerformed: false,
        createdByUserId: input.userId,
      },
      select: { id: true },
    });
    await appendConstructionAudit(tx, {
      workspaceId: command.workspaceId,
      actorUserId: input.userId,
      entityType: "connector_operation",
      entityId: operation.id,
      action: "construction_policy_bound_sms_prepared_unsent_r24",
      metadata: {
        actionId: action.id,
        contactId: action.contactId,
        purpose: command.purpose,
        version: action.version,
        payloadHash: action.payloadHash,
        externalTransportPerformed: false,
      },
    });
    return policyBoundSmsResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      actionId: action.id,
      operationId: operation.id,
      contactId: action.contactId,
      recipientRef,
      maskedRecipient: maskCommunicationRecipient(payload.normalizedRecipient),
      body: payload.body,
      purpose: command.purpose,
      consentStatus: "granted",
      suppressionStatus: "allowed",
      status: "PREPARED_UNSENT",
      version: action.version,
      payloadHash: action.payloadHash,
      replayed: false,
      externalTransportPerformed: false,
    });
  });
}

export async function observeSyntheticMessagingDeliveryR24(input: {
  observation: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}) {
  const observation = messagingDeliveryObservationSchema.parse(input.observation);
  const assertion = trustedCommunicationAdapterAssertionSchema.parse(input.assertion);
  if (
    assertion.adapterId !== "ENDVERA_LOCAL_AUTHENTICATED_R4" ||
    !assertion.authenticityVerified ||
    assertion.externalTransportPerformed
  ) {
    throw new Error("MESSAGING_DELIVERY_ASSERTION_REFUSED");
  }
  const fingerprint = sha256Canonical(observation);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${observation.workspaceId}:${observation.operationId}`}, 0))::text AS acquired
    `);
    const replay = await tx.constructionMessageDeliveryEvent.findUnique({
      where: {
        workspaceId_providerEventRef: {
          workspaceId: observation.workspaceId,
          providerEventRef: observation.providerEventRef,
        },
      },
    });
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error("MESSAGING_DELIVERY_IDEMPOTENCY_CONFLICT");
      return messagingDeliveryResultSchema.parse({
        schemaVersion: 1,
        eventId: observation.eventId,
        operationId: observation.operationId,
        status: observation.status,
        proofLevel: "SYNTHETIC_LOCAL",
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const operation = await tx.constructionConnectorOperation.findFirst({
      where: {
        id: observation.operationId,
        workspaceId: observation.workspaceId,
        kind: "sms_mms_dispatch_prepare_r24",
        externalTransportPerformed: false,
      },
      select: { id: true },
    });
    if (!operation) throw new Error("MESSAGING_OPERATION_NOT_FOUND");
    const current = await tx.constructionMessageDeliveryEvent.findFirst({
      where: { workspaceId: observation.workspaceId, operationId: observation.operationId },
      orderBy: [{ statusRank: "desc" }, { observedAt: "desc" }],
      select: { status: true },
    });
    const transition = nextDeliveryStatus(
      (current?.status as MessagingDeliveryStatus | undefined) ?? null,
      observation.status,
    );
    if (!transition.accepted) throw new Error(transition.reason);
    await tx.constructionMessageDeliveryEvent.create({
      data: {
        workspaceId: observation.workspaceId,
        operationId: observation.operationId,
        providerEventRef: observation.providerEventRef,
        status: observation.status,
        statusRank: transition.rank,
        proofLevel: observation.proofLevel,
        observedAt: new Date(observation.observedAt),
        fingerprint,
        externalTransportPerformed: false,
      },
    });
    await appendConstructionAudit(tx, {
      workspaceId: observation.workspaceId,
      entityType: "connector_operation",
      entityId: observation.operationId,
      action: "construction_messaging_synthetic_delivery_observed_r24",
      metadata: {
        eventId: observation.eventId,
        status: observation.status,
        proofLevel: observation.proofLevel,
        externalTransportPerformed: false,
      },
    });
    return messagingDeliveryResultSchema.parse({
      schemaVersion: 1,
      eventId: observation.eventId,
      operationId: observation.operationId,
      status: observation.status,
      proofLevel: "SYNTHETIC_LOCAL",
      replayed: false,
      externalTransportPerformed: false,
    });
  });
}

export async function messagingCockpitForUserR24(input: {
  userId: string;
  workspaceId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const role = membership.role === "member" ? "field_worker" : membership.role;
    const [messageCount, suppressed, preparedCount] = await Promise.all([
      tx.constructionMessage.count({ where: { workspaceId: input.workspaceId, channel: "sms" } }),
      tx.constructionMessagingPermission.findMany({
        where: { workspaceId: input.workspaceId, suppressionStatus: "suppressed" },
        distinct: ["contactId"],
        select: { contactId: true },
      }),
      tx.constructionConnectorOperation.count({
        where: {
          workspaceId: input.workspaceId,
          kind: "sms_mms_dispatch_prepare_r24",
          status: "prepared",
          externalTransportPerformed: false,
        },
      }),
    ]);
    if (role === "field_worker") {
      return messagingCockpitSchema.parse({
        schemaVersion: 1,
        workspaceId: input.workspaceId,
        role,
        policies: [],
        timeline: [],
        deliveries: [],
        counts: {
          messages: messageCount,
          suppressedContacts: suppressed.length,
          preparedUnsent: preparedCount,
        },
        externalTransportEnabled: false,
        providerDeliveryObserved: false,
        rawPhoneVisible: false,
      });
    }
    const [policies, messages, deliveryRows] = await Promise.all([
      tx.constructionMessagingPermission.findMany({
        where: { workspaceId: input.workspaceId },
        include: { contact: { select: { displayName: true } } },
        orderBy: [{ contactId: "asc" }, { purpose: "asc" }],
      }),
      tx.constructionMessage.findMany({
        where: { workspaceId: input.workspaceId, channel: "sms" },
        include: { _count: { select: { mediaReferences: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.constructionMessageDeliveryEvent.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
    ]);
    const latestDeliveries = Array.from(
      new Map(deliveryRows.map((item) => [item.operationId, item])).values(),
    );
    return messagingCockpitSchema.parse({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      role,
      policies: policies.map((permission) => ({
        contactId: permission.contactId,
        contactName: permission.contact.displayName,
        purpose: permission.purpose,
        consentStatus: permission.consentStatus,
        suppressionStatus: permission.suppressionStatus,
        evidencePresent: Boolean(permission.evidenceRef),
        stateVersion: permission.stateVersion,
      })),
      timeline: messages.map((message) => ({
        id: message.id,
        projectId: message.projectId,
        contactId: message.contactId,
        direction: message.direction,
        kind: message._count.mediaReferences > 0 ? "MMS" : "SMS",
        body: message.originalBody,
        status: message.status,
        mediaReferenceCount: message._count.mediaReferences,
        createdAt: message.createdAt.toISOString(),
      })),
      deliveries: latestDeliveries.map((item) => ({
        operationId: item.operationId,
        status: item.status,
        proofLevel: "SYNTHETIC_LOCAL",
        observedAt: item.observedAt.toISOString(),
      })),
      counts: {
        messages: messageCount,
        suppressedContacts: suppressed.length,
        preparedUnsent: preparedCount,
      },
      externalTransportEnabled: false,
      providerDeliveryObserved: false,
      rawPhoneVisible: false,
    });
  });
}
