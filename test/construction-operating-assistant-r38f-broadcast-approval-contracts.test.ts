import { describe, expect, it } from "vitest";
import {
  approveSecretaryBroadcastCommandSchema,
  secretaryBroadcastApprovalResultSchema,
} from "@/lib/construction-operating-assistant-r38f/contracts";

describe("R38F secretary broadcast approval contracts", () => {
  const command = {
    schemaVersion: 1,
    action: "APPROVE_SECRETARY_BROADCAST",
    commandId: "de4a3138-18e6-470d-8af7-a491e2f5c93d",
    workspaceId: "workspace-1",
    draftId: "draft-1",
    expectedVersion: 1,
    expectedPayloadHash: "a".repeat(64),
    approvalStatementAccepted: true,
  } as const;

  it("requires exact version, fingerprint and affirmative approval", () => {
    expect(approveSecretaryBroadcastCommandSchema.parse(command)).toEqual(command);
    expect(() => approveSecretaryBroadcastCommandSchema.parse({
      ...command,
      approvalStatementAccepted: false,
    })).toThrow();
    expect(() => approveSecretaryBroadcastCommandSchema.parse({
      ...command,
      expectedPayloadHash: "not-a-fingerprint",
    })).toThrow();
  });

  it("cannot represent a sent result", () => {
    const result = {
      schemaVersion: 1,
      action: "APPROVE_SECRETARY_BROADCAST",
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      draftId: command.draftId,
      status: "APPROVED_UNSENT",
      version: 1,
      payloadHash: command.expectedPayloadHash,
      recipientCount: 2,
      body: "Le chantier ouvre à 7 h.",
      approvedAt: "2026-09-06T01:00:00.000Z",
      replayed: false,
      externalTransportPerformed: false,
    } as const;
    expect(secretaryBroadcastApprovalResultSchema.parse(result)).toEqual(result);
    expect(() => secretaryBroadcastApprovalResultSchema.parse({
      ...result,
      externalTransportPerformed: true,
    })).toThrow();
  });
});
