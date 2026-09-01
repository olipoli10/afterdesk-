import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  communicationInboundEventSchema,
  trustedCommunicationAdapterAssertionSchema,
  type CommunicationChannel,
  type CommunicationInboundEvent,
  type TrustedCommunicationAdapterAssertion,
  SMS_CONNECTOR_PROVIDER,
  VOICE_CONNECTOR_PROVIDER,
} from "./communication-contracts";

export function communicationProvider(channel: CommunicationChannel) {
  return channel === "SMS" ? SMS_CONNECTOR_PROVIDER : VOICE_CONNECTOR_PROVIDER;
}

export function communicationCapabilities(channel: CommunicationChannel): string[] {
  return channel === "SMS"
    ? ["sms_inbound", "sms_outbound_prepare"]
    : ["voice_transcript_inbound"];
}

export function communicationMissingConfiguration(channel: CommunicationChannel): string[] {
  return channel === "SMS"
    ? ["SMS_PROVIDER_ACCOUNT", "BUSINESS_NUMBER", "WEBHOOK_SIGNATURE_SECRET", "CONSENT_AND_SUPPRESSION_POLICY"]
    : ["VOICE_PROVIDER_ACCOUNT", "BUSINESS_NUMBER", "CALL_AUTHENTICATION", "RECORDING_CONSENT_POLICY", "SPEECH_TO_TEXT_ROUTE"];
}

export function opaqueCommunicationIdentityRef(input: {
  workspaceId: string;
  userId: string;
  channel: CommunicationChannel;
}) {
  return `ref_${sha256Canonical({
    schemaVersion: 1,
    purpose: "communication-identity-r4",
    workspaceId: input.workspaceId,
    userId: input.userId,
    channel: input.channel,
  })}`;
}

export function consentEvidenceRef(input: {
  workspaceId: string;
  eventId: string;
  consentVersion: string;
}) {
  return `consent_${sha256Canonical({
    schemaVersion: 1,
    purpose: "voice-consent-r4",
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    consentVersion: input.consentVersion,
  })}`;
}

export function communicationProviderMessageId(event: CommunicationInboundEvent) {
  return sha256Canonical({
    schemaVersion: 1,
    provider: communicationProvider(event.channel),
    eventId: event.eventId,
    senderIdentityRef: event.senderIdentityRef,
  });
}

export function admitCommunicationEvent(input: {
  event: unknown;
  assertion: TrustedCommunicationAdapterAssertion;
}):
  | { admitted: false; reason: "ADAPTER_AUTHENTICITY_UNVERIFIED" }
  | { admitted: true; event: CommunicationInboundEvent; providerMessageId: string } {
  const assertion = trustedCommunicationAdapterAssertionSchema.parse(input.assertion);
  if (!assertion.authenticityVerified) {
    return { admitted: false, reason: "ADAPTER_AUTHENTICITY_UNVERIFIED" };
  }
  const event = communicationInboundEventSchema.parse(input.event);
  return { admitted: true, event, providerMessageId: communicationProviderMessageId(event) };
}

export function maskCommunicationRecipient(value: string) {
  const compact = value.replace(/\s+/gu, "");
  const suffix = compact.slice(-4);
  return suffix ? `••••${suffix}` : "••••";
}

export function communicationOperationKey(input: {
  commandId: string;
  workspaceId: string;
  channel: CommunicationChannel;
  action: string;
}) {
  return sha256Canonical({
    schemaVersion: 1,
    commandId: input.commandId,
    workspaceId: input.workspaceId,
    channel: input.channel,
    action: input.action,
    provider: communicationProvider(input.channel),
  });
}
