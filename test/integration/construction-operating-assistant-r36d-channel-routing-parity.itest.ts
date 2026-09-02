import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { consentEvidenceRef } from "@/lib/construction-operating-assistant-r4/communications";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { prepareCommunicationChannel } from "@/server/construction-operating-assistant-r4/connectors";
import { processCommunicationInbound } from "@/server/construction-operating-assistant-r4/inbound";

const trustedAssertion = {
  adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4" as const,
  authenticityVerified: true,
  externalTransportPerformed: false as const,
};

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: "R36D owner",
      email: `r36d-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
    },
  });
  const workspace = await initializeConstructionWorkspace({ userId: owner.id, name: "R36D parity" });
  const sms = await prepareCommunicationChannel({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_CHANNEL",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      channel: "SMS",
    },
  });
  const voice = await prepareCommunicationChannel({
    userId: owner.id,
    command: {
      schemaVersion: 1,
      action: "PREPARE_CHANNEL",
      commandId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      channel: "VOICE",
    },
  });
  return { workspaceId: workspace.workspaceId, sms, voice };
}

describe("R36D channel routing parity on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("routes SMS internally while preserving admitted channel provenance", async () => {
    const f = await fixture();
    const event = {
      schemaVersion: 1 as const,
      eventId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      senderIdentityRef: f.sms.senderIdentityRef,
      occurredAt: "2026-09-02T16:00:00.000Z",
      channel: "SMS" as const,
      kind: "TEXT" as const,
      body: "Qu’est-ce que j’ai aujourd’hui?",
    };
    const first = await processCommunicationInbound({ event, assertion: trustedAssertion });
    const replay = await processCommunicationInbound({ event, assertion: trustedAssertion });
    expect(first.status).toBe("ANSWERED");
    expect(replay).toMatchObject({ replayed: true, messageId: first.messageId });
    const message = await prisma.constructionMessage.findUniqueOrThrow({ where: { id: first.messageId } });
    expect(message).toMatchObject({
      channel: "sms",
      provider: "endvera_sms",
      sender: f.sms.senderIdentityRef,
    });
    expect(await prisma.constructionMessage.count({
      where: { workspaceId: f.workspaceId, direction: "inbound" },
    })).toBe(1);
  });

  it("records provider-required SMS once without research or dispatch", async () => {
    const f = await fixture();
    const event = {
      schemaVersion: 1 as const,
      eventId: crypto.randomUUID(),
      workspaceId: f.workspaceId,
      senderIdentityRef: f.sms.senderIdentityRef,
      occurredAt: "2026-09-02T16:01:00.000Z",
      channel: "SMS" as const,
      kind: "TEXT" as const,
      body: "Recherche la réputation publique de l’entreprise ABC avec des sources.",
    };
    const first = await processCommunicationInbound({ event, assertion: trustedAssertion });
    const replay = await processCommunicationInbound({ event, assertion: trustedAssertion });
    expect(first).toMatchObject({ status: "REFUSED", replayed: false, externalTransportPerformed: false });
    expect(first.reply).toContain("Aucune recherche n’a été exécutée");
    expect(replay).toMatchObject({ replayed: true, messageId: first.messageId });
    const inbound = await prisma.constructionMessage.findUniqueOrThrow({ where: { id: first.messageId } });
    expect(inbound).toMatchObject({ channel: "sms", provider: "endvera_sms", sender: f.sms.senderIdentityRef });
    expect(await prisma.constructionMessage.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
    expect(await prisma.constructionConnectorOperation.count({
      where: { workspaceId: f.workspaceId, externalTransportPerformed: true },
    })).toBe(0);
  });

  it("routes a consented voice transcript through the same brain without audio", async () => {
    const f = await fixture();
    const eventId = crypto.randomUUID();
    const result = await processCommunicationInbound({
      assertion: trustedAssertion,
      event: {
        schemaVersion: 1,
        eventId,
        workspaceId: f.workspaceId,
        senderIdentityRef: f.voice.senderIdentityRef,
        occurredAt: "2026-09-02T16:02:00.000Z",
        channel: "VOICE",
        kind: "TRANSCRIPT",
        body: "Recherche la réputation publique de l’entreprise ABC avec des sources.",
        consentEvidenceRef: consentEvidenceRef({
          workspaceId: f.workspaceId,
          eventId,
          consentVersion: "r4-local-v1",
        }),
        sourceAudioPersisted: false,
      },
    });
    expect(result).toMatchObject({ status: "REFUSED", sourceAudioPersisted: false, externalTransportPerformed: false });
    const message = await prisma.constructionMessage.findUniqueOrThrow({ where: { id: result.messageId } });
    expect(message).toMatchObject({
      channel: "voice",
      provider: "endvera_voice",
      sender: f.voice.senderIdentityRef,
    });
  });
});
