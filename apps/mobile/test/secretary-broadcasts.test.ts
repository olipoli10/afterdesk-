import { describe, expect, it } from "vitest";
import {
  createApproveSecretaryBroadcastCommand,
  mobileSecretaryBroadcastApprovalResultSchema,
  mobileSecretaryBroadcastCockpitSchema,
} from "../src/lib/secretary-broadcasts";

const draft = {
  id: "draft-1",
  status: "PREPARED_UNSENT" as const,
  version: 1 as const,
  recipientCount: 2,
  preparedAt: "2026-09-06T02:00:00.000Z",
  externalTransportPerformed: false as const,
  visibility: "FULL" as const,
  payloadHash: "a".repeat(64),
  body: "Le chantier ouvre à 7 h.",
  recipients: [
    { displayName: "Marc", maskedDestination: "••• ••• 0101" },
    { displayName: "Julie", maskedDestination: "••• ••• 0202" },
  ],
};

describe("mobile secretary broadcast approval", () => {
  it("shows exact recipients, channel evidence and body while transport stays disabled", () => {
    const cockpit = mobileSecretaryBroadcastCockpitSchema.parse({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "owner",
      drafts: [draft],
      externalTransportEnabled: false,
    });
    expect(cockpit.drafts[0]).toMatchObject({ visibility: "FULL", body: draft.body });
  });

  it("binds approval to the displayed version and payload hash", () => {
    const command = createApproveSecretaryBroadcastCommand({ workspaceId: "workspace-1", draft });
    expect(command).toMatchObject({
      action: "APPROVE_SECRETARY_BROADCAST",
      expectedVersion: 1,
      expectedPayloadHash: draft.payloadHash,
      approvalStatementAccepted: true,
    });
    expect(() => mobileSecretaryBroadcastApprovalResultSchema.parse({
      schemaVersion: 1,
      action: command.action,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      draftId: command.draftId,
      status: "APPROVED_UNSENT",
      version: 1,
      payloadHash: draft.payloadHash,
      recipientCount: 2,
      body: draft.body,
      approvedAt: "2026-09-06T02:01:00.000Z",
      replayed: false,
      externalTransportPerformed: false,
    })).not.toThrow();
  });
});
