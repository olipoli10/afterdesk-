import { describe, expect, it } from "vitest";
import {
  communicationInboundEventSchema,
  manageCommunicationConnectorSchema,
  voiceTranscriptInboundEventSchema,
} from "../src/lib/construction-operating-assistant-r4/communication-contracts";
import {
  admitCommunicationEvent,
  communicationProviderMessageId,
  consentEvidenceRef,
  maskCommunicationRecipient,
  opaqueCommunicationIdentityRef,
} from "../src/lib/construction-operating-assistant-r4/communications";

const workspaceId = "workspace-r4";
const userId = "user-r4";
const smsIdentity = opaqueCommunicationIdentityRef({ workspaceId, userId, channel: "SMS" });

describe("ENDVERA SMS and voice adapter contracts R4", () => {
  it("uses opaque deterministic identities and rejects a raw phone number", () => {
    expect(smsIdentity).toMatch(/^ref_[a-f0-9]{64}$/u);
    expect(opaqueCommunicationIdentityRef({ workspaceId, userId, channel: "SMS" })).toBe(smsIdentity);
    expect(() => communicationInboundEventSchema.parse({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      workspaceId,
      senderIdentityRef: "+15555550184",
      occurredAt: "2026-09-01T12:00:00.000Z",
      channel: "SMS",
      kind: "TEXT",
      body: "Qu’est-ce que j’ai aujourd’hui?",
    })).toThrow();
  });

  it("requires consent evidence for voice and never admits source audio", () => {
    const eventId = crypto.randomUUID();
    const value = voiceTranscriptInboundEventSchema.parse({
      schemaVersion: 1,
      eventId,
      workspaceId,
      senderIdentityRef: opaqueCommunicationIdentityRef({ workspaceId, userId, channel: "VOICE" }),
      occurredAt: "2026-09-01T12:00:00.000Z",
      channel: "VOICE",
      kind: "TRANSCRIPT",
      body: "Rappelle-moi demain d’appeler Marc.",
      consentEvidenceRef: consentEvidenceRef({ workspaceId, eventId, consentVersion: "r4-local-v1" }),
      sourceAudioPersisted: false,
    });
    expect(value.channel).toBe("VOICE");
    expect(() => communicationInboundEventSchema.parse({ ...value, sourceAudioPersisted: true })).toThrow();
    const { consentEvidenceRef: consent, ...withoutConsent } = value;
    expect(consent).toMatch(/^consent_[a-f0-9]{64}$/u);
    expect(() => communicationInboundEventSchema.parse(withoutConsent)).toThrow();
  });

  it("admits only a server-supplied trusted assertion and keeps event identity deterministic", () => {
    const event = communicationInboundEventSchema.parse({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      workspaceId,
      senderIdentityRef: smsIdentity,
      occurredAt: "2026-09-01T12:00:00.000Z",
      channel: "SMS",
      kind: "TEXT",
      body: "Qu’est-ce que j’ai aujourd’hui?",
    });
    expect(admitCommunicationEvent({
      event,
      assertion: {
        adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4",
        authenticityVerified: false,
        externalTransportPerformed: false,
      },
    })).toEqual({ admitted: false, reason: "ADAPTER_AUTHENTICITY_UNVERIFIED" });
    const admitted = admitCommunicationEvent({
      event,
      assertion: {
        adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4",
        authenticityVerified: true,
        externalTransportPerformed: false,
      },
    });
    expect(admitted.admitted).toBe(true);
    expect(communicationProviderMessageId(event)).toBe(communicationProviderMessageId(event));
  });

  it("keeps management envelopes strict and masks a recipient", () => {
    expect(() => manageCommunicationConnectorSchema.parse({
      schemaVersion: 1,
      action: "PREPARE_CHANNEL",
      commandId: crypto.randomUUID(),
      workspaceId,
      channel: "SMS",
      execute: true,
    })).toThrow();
    expect(maskCommunicationRecipient("+1 555 555 0184")).toBe("••••0184");
  });
});
