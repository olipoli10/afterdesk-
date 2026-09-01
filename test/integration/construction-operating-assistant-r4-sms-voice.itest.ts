import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { boundOutboundActionSchema } from "@/lib/construction-assistant-v1/outbound";
import {
  createConstructionContact,
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import { processOperatingAssistantCommand } from "@/server/construction-operating-assistant-r2/core";
import {
  communicationChannelStatusForUser,
  prepareCommunicationChannel,
  revokeCommunicationChannel,
} from "@/server/construction-operating-assistant-r4/connectors";
import { processCommunicationInbound } from "@/server/construction-operating-assistant-r4/inbound";
import {
  approveOutboundWithoutDispatch,
  prepareApprovedSmsDispatch,
} from "@/server/construction-operating-assistant-r4/outbound";
import {
  consentEvidenceRef,
} from "@/lib/construction-operating-assistant-r4/communications";

async function fixture(label: string) {
  const owner = await prisma.user.create({
    data: { name: `R4 ${label}`, email: `r4-${label}-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: `R4 ${label}` });
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R4-${label}`,
    name: `Rénovation Laval ${label}`,
  });
  await createConstructionContact({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    displayName: "Marc",
    normalizedPhone: "+15555550184",
  });
  return { userId: owner.id, workspaceId: workspace.workspaceId, projectId: project.id };
}

function prepareChannel(f: Awaited<ReturnType<typeof fixture>>, channel: "SMS" | "VOICE", commandId = crypto.randomUUID()) {
  return prepareCommunicationChannel({
    userId: f.userId,
    command: { schemaVersion: 1, action: "PREPARE_CHANNEL", commandId, workspaceId: f.workspaceId, channel },
  });
}

const trustedAssertion = {
  adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4" as const,
  authenticityVerified: true,
  externalTransportPerformed: false as const,
};

describe("Construction Operating Assistant R4 communications on PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("prepares SMS and voice identities idempotently without credentials or transport", async () => {
    const f = await fixture("prepare");
    const commandId = crypto.randomUUID();
    const first = await prepareChannel(f, "SMS", commandId);
    const replay = await prepareChannel(f, "SMS", commandId);
    const voice = await prepareChannel(f, "VOICE");
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.operationId).toBe(first.operationId);
    expect(first.senderIdentityRef).toMatch(/^ref_[a-f0-9]{64}$/u);
    expect(voice.senderIdentityRef).not.toBe(first.senderIdentityRef);
    expect((await communicationChannelStatusForUser({ ...f, channel: "SMS" })).localAdapterReady).toBe(true);
    expect((await communicationChannelStatusForUser({ ...f, channel: "VOICE" })).localAdapterReady).toBe(true);
    expect(await prisma.constructionConnectorAccount.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: f.workspaceId, externalTransportPerformed: true } })).toBe(0);
    const accounts = await prisma.constructionConnectorAccount.findMany({ where: { workspaceId: f.workspaceId } });
    expect(accounts.every((account) => account.credentialRef === null && account.syncCursorRef === null)).toBe(true);
  });

  it("applies one SMS effect across concurrent retry and admits a consented voice transcript", async () => {
    const f = await fixture("inbound");
    const sms = await prepareChannel(f, "SMS");
    const voice = await prepareChannel(f, "VOICE");
    const smsEvent = {
      schemaVersion: 1 as const,
      eventId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      senderIdentityRef: sms.senderIdentityRef,
      occurredAt: "2026-09-01T12:00:00.000Z",
      channel: "SMS" as const,
      kind: "TEXT" as const,
      body: "Qu’est-ce que j’ai aujourd’hui?",
    };
    const [a, b] = await Promise.all([
      processCommunicationInbound({ event: smsEvent, assertion: trustedAssertion }),
      processCommunicationInbound({ event: smsEvent, assertion: trustedAssertion }),
    ]);
    expect(new Set([a.messageId, b.messageId]).size).toBe(1);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.externalTransportPerformed).toBe(false);
    const voiceEventId = crypto.randomUUID();
    const voiceResult = await processCommunicationInbound({
      event: {
        schemaVersion: 1,
        eventId: voiceEventId,
        workspaceId: f.workspaceId,
        senderIdentityRef: voice.senderIdentityRef,
        occurredAt: "2026-09-01T12:01:00.000Z",
        channel: "VOICE",
        kind: "TRANSCRIPT",
        body: "Qu’est-ce que j’ai aujourd’hui?",
        consentEvidenceRef: consentEvidenceRef({ workspaceId: f.workspaceId, eventId: voiceEventId, consentVersion: "r4-local-v1" }),
        sourceAudioPersisted: false,
      },
      assertion: trustedAssertion,
    });
    expect(voiceResult.status).toBe("ANSWERED");
    expect(voiceResult.sourceAudioPersisted).toBe(false);
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId, direction: "inbound" } })).toBe(2);
  });

  it("approves an exact outbound message without delivery and prepares one minimized SMS operation", async () => {
    const f = await fixture("outbound");
    await prepareChannel(f, "SMS");
    const draft = await processOperatingAssistantCommand({
      userId: f.userId,
      envelope: {
        schemaVersion: 1,
        commandId: crypto.randomUUID(),
        workspaceId: f.workspaceId,
        channel: "PORTAL",
        body: "Texte Marc que je serai 30 minutes en retard.",
        occurredAt: "2026-09-01T12:00:00.000Z",
        senderAddress: `user:${f.userId}`,
      },
    });
    const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: draft.canonicalEffectId ?? "" } });
    const payload = boundOutboundActionSchema.parse(action.payload);
    const approvalCommand = {
      schemaVersion: 1 as const,
      action: "APPROVE_OUTBOUND" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      actionId: action.id,
      expectedVersion: action.version,
      expectedPayloadHash: action.payloadHash,
    };
    const approved = await approveOutboundWithoutDispatch({ userId: f.userId, command: approvalCommand });
    const replay = await approveOutboundWithoutDispatch({ userId: f.userId, command: approvalCommand });
    expect(approved.status).toBe("APPROVED_UNSENT");
    expect(replay.replayed).toBe(true);
    const dispatchCommand = {
      schemaVersion: 1 as const,
      action: "PREPARE_SMS_DISPATCH" as const,
      commandId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      actionId: action.id,
      expectedVersion: action.version,
      expectedPayloadHash: action.payloadHash,
    };
    const prepared = await prepareApprovedSmsDispatch({ userId: f.userId, command: dispatchCommand });
    const dispatchReplay = await prepareApprovedSmsDispatch({ userId: f.userId, command: dispatchCommand });
    expect(prepared.status).toBe("PREPARED_UNSENT");
    expect(prepared.maskedRecipient).toBe("••••0184");
    expect(prepared.body).toBe(payload.body);
    expect(dispatchReplay.replayed).toBe(true);
    const persisted = await prisma.constructionConnectorOperation.findUniqueOrThrow({ where: { id: prepared.operationId } });
    expect(JSON.stringify(persisted.request)).not.toContain(payload.normalizedRecipient);
    expect(JSON.stringify(persisted.request)).not.toContain(payload.body);
    expect(persisted.externalTransportPerformed).toBe(false);
    expect((await prisma.constructionAction.findUniqueOrThrow({ where: { id: action.id } })).simulatedDeliveryCount).toBe(0);
  });

  it("refuses member management, cross-workspace inbound and revoked identities", async () => {
    const first = await fixture("guard-a");
    const second = await fixture("guard-b");
    const prepared = await prepareChannel(first, "SMS");
    const member = await prisma.user.create({
      data: { name: "R4 member", email: `r4-member-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
    });
    await prisma.constructionWorkspaceMember.create({
      data: { workspaceId: first.workspaceId, userId: member.id, role: "member", status: "active" },
    });
    await expect(prepareCommunicationChannel({
      userId: member.id,
      command: {
        schemaVersion: 1,
        action: "PREPARE_CHANNEL",
        commandId: crypto.randomUUID(),
        workspaceId: first.workspaceId,
        channel: "VOICE",
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processCommunicationInbound({
      event: {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        workspaceId: second.workspaceId,
        senderIdentityRef: prepared.senderIdentityRef,
        occurredAt: "2026-09-01T12:00:00.000Z",
        channel: "SMS",
        kind: "TEXT",
        body: "Qu’est-ce que j’ai aujourd’hui?",
      },
      assertion: trustedAssertion,
    })).rejects.toThrow("COMMUNICATION_INBOUND_REFUSED");
    await revokeCommunicationChannel({
      userId: first.userId,
      command: {
        schemaVersion: 1,
        action: "REVOKE_LOCAL",
        commandId: crypto.randomUUID(),
        workspaceId: first.workspaceId,
        channel: "SMS",
      },
    });
    await expect(processCommunicationInbound({
      event: {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        workspaceId: first.workspaceId,
        senderIdentityRef: prepared.senderIdentityRef,
        occurredAt: "2026-09-01T12:00:00.000Z",
        channel: "SMS",
        kind: "TEXT",
        body: "Qu’est-ce que j’ai aujourd’hui?",
      },
      assertion: trustedAssertion,
    })).rejects.toThrow("COMMUNICATION_INBOUND_REFUSED");
  });
});
