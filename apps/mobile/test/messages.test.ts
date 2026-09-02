import { describe, expect, it } from "vitest";
import {
  createConsentAttestationCommand,
  createConsentWithdrawalCommand,
  createPolicyBoundSmsCommand,
  mobileMessagingCommandResultSchema,
  mobileMessagingCommandSchema,
  parseMobileMessagingCockpit,
} from "../src/lib/messages";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const ownerWorkspace = {
  id: "workspace-1",
  name: "ENDVERA Construction",
  defaultTimezone: "America/Toronto",
  defaultLocale: "fr-CA",
  role: "OWNER" as const,
  permissions: {
    financialsVisible: true,
    canManageReceivables: true,
    canScheduleFollowUps: true,
    canApprovePreparedActions: true,
    canAddEvidence: true,
    externalTransportAuthorized: false as const,
  },
};

const contactPolicy = {
  contactId: "contact-1",
  contactName: "Marc",
  purpose: "service" as const,
  consentStatus: "granted" as const,
  suppressionStatus: "allowed" as const,
  evidencePresent: true,
  stateVersion: 1,
};

describe("native R24 SMS/MMS contracts", () => {
  it("parses the manager cockpit and deliberately empty field projection", () => {
    const owner = parseMobileMessagingCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "owner",
      policies: [contactPolicy],
      timeline: [{
        id: "message-1",
        projectId: "project-1",
        contactId: "contact-1",
        direction: "inbound",
        kind: "MMS",
        body: "Photo du chantier Laval",
        status: "interpreted",
        mediaReferenceCount: 1,
        createdAt: "2026-09-02T02:00:00.000Z",
      }],
      deliveries: [{
        operationId: "operation-1",
        status: "DELIVERED",
        proofLevel: "SYNTHETIC_LOCAL",
        observedAt: "2026-09-02T02:01:00.000Z",
      }],
      counts: { messages: 1, suppressedContacts: 0, preparedUnsent: 1 },
      externalTransportEnabled: false,
      providerDeliveryObserved: false,
      rawPhoneVisible: false,
    });
    const field = parseMobileMessagingCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "field_worker",
      policies: [],
      timeline: [],
      deliveries: [],
      counts: { messages: 1, suppressedContacts: 0, preparedUnsent: 1 },
      externalTransportEnabled: false,
      providerDeliveryObserved: false,
      rawPhoneVisible: false,
    });
    expect(owner.timeline[0]?.body).toBe("Photo du chantier Laval");
    expect(field.policies).toEqual([]);
    expect(field.timeline).toEqual([]);
  });

  it("recursively refuses contact, body, recipient and evidence details in field data", () => {
    expect(() => parseMobileMessagingCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "field_worker",
      policies: [],
      timeline: [],
      deliveries: [],
      counts: { messages: 0, suppressedContacts: 0, preparedUnsent: 0 },
      externalTransportEnabled: false,
      providerDeliveryObserved: false,
      rawPhoneVisible: false,
      nested: { recipientRef: "forbidden" },
    })).toThrow("MOBILE_MESSAGING_FIELD_LEAK_REFUSED");
  });

  it("requires a manager, explicit consent attestation and exact SMS approval", () => {
    const commandId = "7cbfa360-f57e-40b6-b10e-6a4835a8427f";
    const consent = createConsentAttestationCommand({
      workspace: ownerWorkspace,
      commandId,
      contactId: "contact-1",
      purpose: "service",
      expectedStateVersion: 0,
    });
    expect(consent).toMatchObject({ statementAccepted: true });
    expect(mobileMessagingCommandSchema.parse(consent)).toEqual(consent);

    const withdrawal = createConsentWithdrawalCommand({
      workspace: ownerWorkspace,
      commandId: "0e52795d-9ce7-4cd8-bc60-fb7961936c82",
      contactId: "contact-1",
      purpose: "commercial",
      expectedStateVersion: 1,
      reason: "Le contact a demandé STOP.",
    });
    expect(withdrawal.action).toBe("WITHDRAW_CONSENT");

    const prepared = createPolicyBoundSmsCommand({
      workspace: ownerWorkspace,
      commandId: "bce1137a-f738-428d-97cc-38b748ea24cd",
      purpose: "service",
      action: {
        schemaVersion: 1,
        kind: "PREPARED_OUTBOUND_MESSAGE",
        actionId: "action-1",
        workspaceId: "workspace-1",
        state: "APPROVED_UNSENT",
        channel: "SMS",
        recipient: "+1•••0184",
        body: "Bonjour Marc, le rendez-vous est à 14 h.",
        version: 2,
        fingerprint: "a".repeat(64),
        project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
        contact: { id: "contact-1", displayName: "Marc" },
        provenance: {
          sourceMessageId: "source-1",
          channel: "portal",
          direction: "inbound",
          receivedAt: null,
          recordedAt: "2026-09-02T02:00:00.000Z",
        },
        approval: {
          required: true,
          approvedVersion: 2,
          approvedFingerprint: "a".repeat(64),
          approvedAt: "2026-09-02T02:02:00.000Z",
        },
        externalTransportPerformed: false,
      },
    });
    expect(prepared).toMatchObject({
      action: "PREPARE_POLICY_BOUND_SMS",
      expectedVersion: 2,
      expectedPayloadHash: "a".repeat(64),
    });
    expect(() => createConsentAttestationCommand({
      workspace: { ...ownerWorkspace, role: "FIELD_WORKER" as const },
      commandId,
      contactId: "contact-1",
      purpose: "service",
      expectedStateVersion: 0,
    })).toThrow("MOBILE_MESSAGING_PERMISSION_REFUSED");
  });

  it("keeps results strict, replay-aware and zero-transport", () => {
    const result = mobileMessagingCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: "7cbfa360-f57e-40b6-b10e-6a4835a8427f",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      purpose: "service",
      consentStatus: "granted",
      suppressionStatus: "allowed",
      stateVersion: 1,
      replayed: false,
      externalTransportPerformed: false,
    });
    expect(result.externalTransportPerformed).toBe(false);
    expect(() => mobileMessagingCommandResultSchema.parse({
      ...result,
      externalTransportPerformed: true,
    })).toThrow();
  });

  it("restores the exact messaging decision after an application restart", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const command = createConsentAttestationCommand({
      workspace: ownerWorkspace,
      commandId: "7cbfa360-f57e-40b6-b10e-6a4835a8427f",
      contactId: "contact-1",
      purpose: "service",
      expectedStateVersion: 0,
    });
    const entry = await enqueueMobileOutbox({ kind: "MESSAGING_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: command.workspaceId, store });
    expect(restored[0]).toMatchObject({
      kind: "MESSAGING_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });
});
