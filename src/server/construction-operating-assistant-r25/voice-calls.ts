import "server-only";

import path from "node:path";
import { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  callTranscriptInboundEventSchema,
  callTranscriptResultSchema,
  prepareOutboundCallWorkCommandSchema,
  preparedOutboundCallWorkResultSchema,
  selectedVoiceNoteCommandSchema,
  selectedVoiceNoteResultSchema,
  voiceCallsCockpitSchema,
  type CallTranscriptResult,
  type PrepareOutboundCallWorkCommand,
  type SelectedVoiceNoteCommand,
} from "@/lib/construction-operating-assistant-r25/contracts";
import {
  callEventHash,
  deriveCallTranscriptAdmission,
  deriveOutboundCallPolicy,
} from "@/lib/construction-operating-assistant-r25/policy";
import {
  trustedCommunicationAdapterAssertionSchema,
  type TrustedCommunicationAdapterAssertion,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
} from "@/lib/file-security";
import { deleteObject, putObject } from "@/lib/storage";
import { processUnifiedIntent } from "@/server/construction-operating-assistant-r18/unified-intent";
import {
  ConstructionAccessDenied,
  requireActiveConstructionMember,
} from "@/server/construction-assistant-v1/workspace";

const inboundInFlight = new Map<string, Promise<CallTranscriptResult>>();

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function lowerConsent(value: string) {
  return value.toLowerCase();
}

async function requireVoiceManager(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
) {
  const membership = await requireActiveConstructionMember(tx, userId, workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new ConstructionAccessDenied();
  }
  return membership;
}

function normalizeIntentStatus(status: string): CallTranscriptResult["status"] {
  if (status === "APPLIED") return "APPLIED";
  if (status === "PREPARED_UNSENT") return "PREPARED_UNSENT";
  if (status === "CLARIFICATION_REQUIRED") return "CLARIFICATION_REQUIRED";
  if (status === "REFUSED") return "REFUSED";
  return "ANSWERED";
}

async function existingCallResult(input: {
  workspaceId: string;
  callId: string;
  eventId: string;
  eventHash: string;
}) {
  const existing = await prisma.constructionCallSession.findFirst({
    where: {
      workspaceId: input.workspaceId,
      OR: [{ callId: input.callId }, { eventId: input.eventId }],
    },
    select: { callId: true, eventId: true, eventHash: true, result: true },
  });
  if (!existing) return null;
  if (
    existing.callId !== input.callId ||
    existing.eventId !== input.eventId ||
    existing.eventHash !== input.eventHash
  ) {
    throw new Error("VOICE_CALL_IDEMPOTENCY_CONFLICT");
  }
  if (!existing.result) return null;
  return callTranscriptResultSchema.parse({
    ...(existing.result as Record<string, unknown>),
    replayed: true,
  });
}

async function applyCallTranscript(input: {
  event: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}): Promise<CallTranscriptResult> {
  const assertion = trustedCommunicationAdapterAssertionSchema.parse(input.assertion);
  if (!assertion.authenticityVerified) throw new Error("ADAPTER_AUTHENTICITY_UNVERIFIED");
  const event = callTranscriptInboundEventSchema.parse(input.event);
  const admission = deriveCallTranscriptAdmission(event);
  if (!admission.admitted) throw new Error(admission.reason);
  const eventHash = callEventHash(event);
  const replay = await existingCallResult({
    workspaceId: event.workspaceId,
    callId: event.callId,
    eventId: event.eventId,
    eventHash,
  });
  if (replay) return replay;

  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`r25:call:${event.workspaceId}:${event.callId}`}, 0))::text AS acquired
    `);
    const existing = await tx.constructionCallSession.findFirst({
      where: {
        workspaceId: event.workspaceId,
        OR: [{ callId: event.callId }, { eventId: event.eventId }],
      },
    });
    if (existing) {
      if (
        existing.callId !== event.callId ||
        existing.eventId !== event.eventId ||
        existing.eventHash !== eventHash
      ) {
        throw new Error("VOICE_CALL_IDEMPOTENCY_CONFLICT");
      }
      return { session: existing, actorUserId: existing.actorUserId };
    }

    const [account, identity, project] = await Promise.all([
      tx.constructionConnectorAccount.findUnique({
        where: {
          workspaceId_provider: {
            workspaceId: event.workspaceId,
            provider: "endvera_voice",
          },
        },
        select: {
          status: true,
          grants: {
            where: { capability: "voice_transcript_inbound" },
            select: { status: true },
            take: 1,
          },
        },
      }),
      tx.constructionCommunicationIdentity.findUnique({
        where: {
          workspaceId_channel_normalizedAddress: {
            workspaceId: event.workspaceId,
            channel: "voice",
            normalizedAddress: event.callerIdentityRef,
          },
        },
        select: {
          userId: true,
          contactId: true,
          verified: true,
          permissions: true,
          status: true,
        },
      }),
      event.projectId
        ? tx.constructionProject.findFirst({
            where: { id: event.projectId, workspaceId: event.workspaceId, status: "active" },
            select: { id: true },
          })
        : null,
    ]);
    if (
      account?.status !== "prepared" ||
      !["requested", "active"].includes(account.grants[0]?.status ?? "") ||
      identity?.status !== "active" ||
      !identity.verified ||
      !identity.userId ||
      !identity.permissions.includes("COMMAND") ||
      (event.projectId && !project)
    ) {
      throw new Error("VOICE_CALL_INBOUND_REFUSED");
    }
    await requireVoiceManager(tx, identity.userId, event.workspaceId);
    const session = await tx.constructionCallSession.create({
      data: {
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        contactId: identity.contactId,
        actorUserId: identity.userId,
        callerIdentityRef: event.callerIdentityRef,
        direction: "inbound",
        purpose: event.purpose,
        callId: event.callId,
        eventId: event.eventId,
        eventHash,
        lifecycleState: "PROCESSING",
        disclosureVersion: event.disclosure.version,
        disclosureStatus: "acknowledged",
        recordingConsentStatus: lowerConsent(event.recordingConsent),
        transcriptionConsentStatus: lowerConsent(event.transcriptionConsent),
        transcript: event.normalizedTranscript,
        transcriptHash: sha256Canonical(event.normalizedTranscript),
        transcriptProofLevel: event.transcriptProofLevel,
        nextOwnerUserId: identity.userId,
        externalTransportPerformed: false,
      },
    });
    return { session, actorUserId: identity.userId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const persistedReplay = await existingCallResult({
    workspaceId: event.workspaceId,
    callId: event.callId,
    eventId: event.eventId,
    eventHash,
  });
  if (persistedReplay) return persistedReplay;

  const intent = await processUnifiedIntent({
    userId: claimed.actorUserId,
    envelope: {
      schemaVersion: 1,
      envelopeId: event.eventId,
      workspaceId: event.workspaceId,
      occurredAt: event.occurredAt,
      mode: "APPLY_VALIDATED",
      context: { projectId: event.projectId, contactId: null },
      source: {
        kind: "VOICE_TRANSCRIPT",
        sourceId: event.callId,
        transcript: event.normalizedTranscript,
        verificationState: admission.verificationState,
      },
    },
  });
  const status = normalizeIntentStatus(intent.status);
  const lifecycleState = status === "CLARIFICATION_REQUIRED"
    ? "CLARIFICATION_REQUIRED"
    : status === "REFUSED"
      ? "REFUSED"
      : "COMPLETED";
  const result = callTranscriptResultSchema.parse({
    schemaVersion: 1,
    eventId: event.eventId,
    callId: event.callId,
    sessionId: claimed.session.id,
    workspaceId: event.workspaceId,
    projectId: intent.interpretation.projectId ?? event.projectId,
    status,
    reply: intent.reply,
    canonicalEffectId: intent.transition.canonicalEffectId,
    transcriptProofLevel: event.transcriptProofLevel,
    replayed: false,
    sourceAudioPersisted: false,
    externalTransportPerformed: false,
  });
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`r25:call:${event.workspaceId}:${event.callId}`}, 0))::text AS acquired
    `);
    const current = await tx.constructionCallSession.findUniqueOrThrow({
      where: {
        workspaceId_callId: { workspaceId: event.workspaceId, callId: event.callId },
      },
      select: { lifecycleState: true, eventHash: true },
    });
    if (current.eventHash !== eventHash) throw new Error("VOICE_CALL_IDEMPOTENCY_CONFLICT");
    await tx.constructionCallSession.update({
      where: {
        workspaceId_callId: { workspaceId: event.workspaceId, callId: event.callId },
      },
      data: {
        projectId: result.projectId,
        lifecycleState,
        result: asJson(result),
        nextOwnerUserId: lifecycleState === "CLARIFICATION_REQUIRED" ? claimed.actorUserId : null,
      },
    });
    await tx.constructionCallTransition.upsert({
      where: {
        workspaceId_commandId: { workspaceId: event.workspaceId, commandId: event.eventId },
      },
      create: {
        workspaceId: event.workspaceId,
        callSessionId: claimed.session.id,
        commandId: event.eventId,
        commandHash: eventHash,
        action: "TRUSTED_TRANSCRIPT_PROCESSED",
        stateBefore: current.lifecycleState,
        stateAfter: lifecycleState,
        result: asJson(result),
        actorId: claimed.actorUserId,
      },
      update: {},
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return result;
}

export async function processCallTranscriptR25(input: {
  event: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}) {
  const event = callTranscriptInboundEventSchema.parse(input.event);
  const key = `${event.workspaceId}:${event.callId}`;
  const existing = inboundInFlight.get(key);
  if (existing) {
    const value = await existing;
    return callTranscriptResultSchema.parse({ ...value, replayed: true });
  }
  const operation = applyCallTranscript(input);
  inboundInFlight.set(key, operation);
  try {
    return await operation;
  } finally {
    inboundInFlight.delete(key);
  }
}

function safeVoiceNoteName(value: string) {
  const base = path.basename(value);
  if (
    base !== value ||
    !base.toLowerCase().endsWith(".m4a") ||
    Buffer.byteLength(base, "utf8") > 255 ||
    /[\u0000-\u001f\u007f]/u.test(base)
  ) {
    throw new FileRejectedError("The voice-note filename is invalid.");
  }
  return base;
}

async function voiceNoteReplay(input: {
  command: SelectedVoiceNoteCommand;
  commandHash: string;
}) {
  const existing = await prisma.constructionVoiceNoteReference.findUnique({
    where: {
      workspaceId_commandId: {
        workspaceId: input.command.workspaceId,
        commandId: input.command.commandId,
      },
    },
  });
  if (!existing) return null;
  if (existing.commandHash !== input.commandHash) {
    throw new Error("VOICE_NOTE_IDEMPOTENCY_CONFLICT");
  }
  return selectedVoiceNoteResultSchema.parse({
    schemaVersion: 1,
    commandId: input.command.commandId,
    workspaceId: existing.workspaceId,
    projectId: existing.projectId,
    voiceNoteId: existing.id,
    evidenceId: existing.fileId,
    contentHash: existing.contentHash,
    mimeType: existing.mimeType,
    durationMs: existing.durationMs,
    sizeBytes: existing.sizeBytes,
    transcriptionState: existing.transcriptionState,
    transcriptCreated: false,
    replayed: true,
    externalTransportPerformed: false,
  });
}

export async function admitSelectedVoiceNoteR25(input: {
  userId: string;
  command: unknown;
  bytes: Buffer;
}) {
  const command = selectedVoiceNoteCommandSchema.parse(input.command);
  if (input.bytes.length !== command.sizeBytes) {
    throw new FileRejectedError("The selected voice-note size is invalid.");
  }
  const fileName = safeVoiceNoteName(command.fileName);
  const inspected = await inspectAndSanitizeFile(input.bytes, "m4a");
  const commandHash = sha256Canonical({ command, contentHash: inspected.sha256 });
  const replay = await voiceNoteReplay({ command, commandHash });
  if (replay) return replay;
  await prisma.$transaction(async (tx) => {
    await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
    const project = await tx.constructionProject.findFirst({
      where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
      select: { id: true },
    });
    if (!project) throw new ConstructionAccessDenied();
  });
  const storageKey = [
    "construction-voice-notes",
    command.workspaceId,
    command.projectId,
    `${command.commandId}-${inspected.sha256.slice(0, 16)}.m4a`,
  ].join("/");
  await putObject(storageKey, inspected.buffer);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`r25:voice-note:${command.workspaceId}:${command.commandId}`}, 0))::text AS acquired
      `);
      await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
      const existing = await tx.constructionVoiceNoteReference.findUnique({
        where: {
          workspaceId_commandId: {
            workspaceId: command.workspaceId,
            commandId: command.commandId,
          },
        },
      });
      if (existing) {
        if (existing.commandHash !== commandHash) throw new Error("VOICE_NOTE_IDEMPOTENCY_CONFLICT");
        return selectedVoiceNoteResultSchema.parse({
          schemaVersion: 1,
          commandId: command.commandId,
          workspaceId: existing.workspaceId,
          projectId: existing.projectId,
          voiceNoteId: existing.id,
          evidenceId: existing.fileId,
          contentHash: existing.contentHash,
          mimeType: existing.mimeType,
          durationMs: existing.durationMs,
          sizeBytes: existing.sizeBytes,
          transcriptionState: existing.transcriptionState,
          transcriptCreated: false,
          replayed: true,
          externalTransportPerformed: false,
        });
      }
      const project = await tx.constructionProject.findFirst({
        where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
        select: { id: true },
      });
      if (!project) throw new ConstructionAccessDenied();
      const file = await tx.file.create({
        data: {
          taskId: null,
          submissionId: null,
          kind: "input",
          uploaderId: input.userId,
          storageKey,
          fileName,
          mime: "audio/mp4",
          sizeBytes: inspected.buffer.length,
          scanStatus: "clean",
          detectedMime: inspected.detectedMime,
          sha256: inspected.sha256,
          scanDetails: inspected.details,
          scannedAt: new Date(),
        },
      });
      await tx.fileAccessLog.create({
        data: { fileId: file.id, userId: input.userId, action: "upload" },
      });
      const voiceNote = await tx.constructionVoiceNoteReference.create({
        data: {
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          commandId: command.commandId,
          commandHash,
          fileId: file.id,
          contentHash: inspected.sha256,
          mimeType: "audio/mp4",
          durationMs: command.durationMs,
          sizeBytes: inspected.buffer.length,
          transcriptionState: "TRANSCRIPTION_PREPARED",
          createdByUserId: input.userId,
          externalTransportPerformed: false,
        },
      });
      return selectedVoiceNoteResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        voiceNoteId: voiceNote.id,
        evidenceId: file.id,
        contentHash: inspected.sha256,
        mimeType: "audio/mp4",
        durationMs: command.durationMs,
        sizeBytes: inspected.buffer.length,
        transcriptionState: "TRANSCRIPTION_PREPARED",
        transcriptCreated: false,
        replayed: false,
        externalTransportPerformed: false,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const replayAfterConflict = await voiceNoteReplay({ command, commandHash }).catch(() => null);
    if (replayAfterConflict) return replayAfterConflict;
    await deleteObject(storageKey);
    throw error;
  }
}

export async function prepareOutboundCallWorkR25(input: {
  userId: string;
  command: PrepareOutboundCallWorkCommand | unknown;
}) {
  const command = prepareOutboundCallWorkCommandSchema.parse(input.command);
  const commandHash = sha256Canonical(command);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`r25:call-work:${command.workspaceId}:${command.commandId}`}, 0))::text AS acquired
    `);
    await requireVoiceManager(tx, input.userId, command.workspaceId);
    const existing = await tx.constructionCallWork.findUnique({
      where: {
        workspaceId_commandId: {
          workspaceId: command.workspaceId,
          commandId: command.commandId,
        },
      },
    });
    if (existing) {
      if (existing.commandHash !== commandHash) throw new Error("CALL_WORK_IDEMPOTENCY_CONFLICT");
      return preparedOutboundCallWorkResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        contactId: existing.contactId,
        workId: existing.id,
        recipientRef: existing.recipientRef,
        purpose: existing.purpose,
        objective: existing.objective,
        disclosureVersion: existing.disclosureVersion,
        disclosureScript: existing.disclosureScript,
        resultSchema: existing.resultSchema,
        policyVersion: existing.policyVersion,
        status: existing.status,
        nextOwnerRole: existing.nextOwnerRole,
        replayed: true,
        externalTransportPerformed: false,
      });
    }
    const [project, contact, identity] = await Promise.all([
      tx.constructionProject.findFirst({
        where: { id: command.projectId, workspaceId: command.workspaceId, status: "active" },
        select: { id: true },
      }),
      tx.constructionContact.findFirst({
        where: { id: command.contactId, workspaceId: command.workspaceId, status: "active" },
        select: { id: true, projectId: true },
      }),
      tx.constructionCommunicationIdentity.findFirst({
        where: {
          workspaceId: command.workspaceId,
          contactId: command.contactId,
          channel: "voice",
          status: "active",
          verified: true,
        },
        select: { normalizedAddress: true, permissions: true, verified: true },
      }),
    ]);
    if (!project || !contact || (contact.projectId && contact.projectId !== project.id)) {
      throw new ConstructionAccessDenied();
    }
    const policy = deriveOutboundCallPolicy({
      purpose: command.purpose,
      disclosureVersion: command.disclosureVersion,
      identityVerified: Boolean(identity?.verified && identity.permissions.includes("CALL")),
    });
    if (!policy.allowed) throw new Error(policy.reason);
    const work = await tx.constructionCallWork.create({
      data: {
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        contactId: command.contactId,
        commandId: command.commandId,
        commandHash,
        recipientRef: identity!.normalizedAddress,
        purpose: command.purpose,
        objective: command.objective,
        objectiveHash: sha256Canonical(command.objective),
        disclosureVersion: command.disclosureVersion,
        disclosureScript: command.disclosureScript,
        resultSchema: command.resultSchema,
        policyVersion: command.expectedPolicyVersion,
        policyDecision: policy.reason,
        status: "PREPARED_UNSENT",
        nextOwnerRole: "HUMAN_CALLER",
        createdByUserId: input.userId,
        externalTransportPerformed: false,
      },
    });
    return preparedOutboundCallWorkResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      projectId: command.projectId,
      contactId: command.contactId,
      workId: work.id,
      recipientRef: work.recipientRef,
      purpose: work.purpose,
      objective: work.objective,
      disclosureVersion: work.disclosureVersion,
      disclosureScript: work.disclosureScript,
      resultSchema: work.resultSchema,
      policyVersion: work.policyVersion,
      status: work.status,
      nextOwnerRole: work.nextOwnerRole,
      replayed: false,
      externalTransportPerformed: false,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voiceCallsCockpitForUserR25(input: {
  userId: string;
  workspaceId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const membership = await requireActiveConstructionMember(tx, input.userId, input.workspaceId);
    const role = membership.role === "member" ? "field_worker" : membership.role;
    if (role === "field_worker") {
      const notes = await tx.constructionVoiceNoteReference.findMany({
        where: { workspaceId: input.workspaceId, createdByUserId: input.userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return voiceCallsCockpitSchema.parse({
        schemaVersion: 1,
        workspaceId: input.workspaceId,
        role,
        sessions: [],
        voiceNotes: notes.map((note) => ({
          id: note.id,
          projectId: note.projectId,
          durationMs: note.durationMs,
          sizeBytes: note.sizeBytes,
          transcriptionState: note.transcriptionState,
          createdByCurrentUser: true,
          createdAt: note.createdAt.toISOString(),
        })),
        preparedWork: [],
        counts: { sessions: 0, voiceNotes: notes.length, preparedUnsent: 0 },
        rawPhoneVisible: false,
        providerRecordingUrlVisible: false,
        providerCallObserved: false,
        externalTransportEnabled: false,
      });
    }
    const [sessions, notes, work] = await Promise.all([
      tx.constructionCallSession.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.constructionVoiceNoteReference.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      tx.constructionCallWork.findMany({
        where: { workspaceId: input.workspaceId, status: "PREPARED_UNSENT" },
        include: { contact: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return voiceCallsCockpitSchema.parse({
      schemaVersion: 1,
      workspaceId: input.workspaceId,
      role,
      sessions: sessions.map((session) => ({
        id: session.id,
        projectId: session.projectId,
        contactId: session.contactId,
        direction: session.direction,
        purpose: session.purpose,
        lifecycleState: session.lifecycleState,
        disclosureVersion: session.disclosureVersion,
        disclosureStatus: session.disclosureStatus,
        recordingConsentStatus: session.recordingConsentStatus,
        transcriptionConsentStatus: session.transcriptionConsentStatus,
        transcript: session.transcript,
        transcriptProofLevel: session.transcriptProofLevel,
        nextOwnerUserId: session.nextOwnerUserId,
        createdAt: session.createdAt.toISOString(),
      })),
      voiceNotes: notes.map((note) => ({
        id: note.id,
        projectId: note.projectId,
        durationMs: note.durationMs,
        sizeBytes: note.sizeBytes,
        transcriptionState: note.transcriptionState,
        createdByCurrentUser: note.createdByUserId === input.userId,
        createdAt: note.createdAt.toISOString(),
      })),
      preparedWork: work.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        contactId: item.contactId,
        contactName: item.contact.displayName,
        recipientRef: item.recipientRef,
        purpose: item.purpose,
        objective: item.objective,
        disclosureVersion: item.disclosureVersion,
        disclosureScript: item.disclosureScript,
        resultSchema: item.resultSchema,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
      counts: {
        sessions: sessions.length,
        voiceNotes: notes.length,
        preparedUnsent: work.length,
      },
      rawPhoneVisible: false,
      providerRecordingUrlVisible: false,
      providerCallObserved: false,
      externalTransportEnabled: false,
    });
  });
}
