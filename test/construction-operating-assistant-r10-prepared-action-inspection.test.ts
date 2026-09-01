import { describe, expect, it } from "vitest";
import { buildActionFingerprint } from "@/lib/construction-assistant-v1/outbound";
import {
  preparedActionInspectionSchema,
  projectPreparedActionInspection,
} from "@/lib/construction-operating-assistant-r10/prepared-action-contracts";

function action(overrides: Record<string, unknown> = {}) {
  const payload = {
    workspaceId: "workspace-1",
    actionId: "action-1",
    version: 1,
    contactId: "contact-1",
    channel: "SMS" as const,
    normalizedRecipient: "+15555550184",
    body: "Bonjour Marc, le rendez-vous est à 14 h.",
  };
  return {
    id: "action-1",
    workspaceId: "workspace-1",
    type: "outbound_message" as const,
    status: "proposed" as const,
    dueAt: null,
    version: 1,
    payloadHash: buildActionFingerprint(payload),
    payload,
    approvalRequired: true as const,
    approvedVersion: null,
    approvedPayloadHash: null,
    approvedAt: null,
    simulatedDeliveryCount: 0 as const,
    project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
    contact: { id: "contact-1", displayName: "Marc" },
    sourceMessage: {
      id: "message-1",
      channel: "portal" as const,
      direction: "inbound" as const,
      receivedAt: new Date("2026-09-01T13:00:00.000Z"),
      createdAt: new Date("2026-09-01T13:00:01.000Z"),
    },
    ...overrides,
  };
}

describe("Construction Operating Assistant R10 prepared-action inspection", () => {
  it("projects the exact recipient, body, fingerprint and provenance with transport false", () => {
    const projected = projectPreparedActionInspection(action());
    expect(preparedActionInspectionSchema.parse(projected)).toEqual(projected);
    expect(projected).toMatchObject({
      state: "PREPARED_UNSENT",
      recipient: "+15555550184",
      channel: "SMS",
      body: "Bonjour Marc, le rendez-vous est à 14 h.",
      provenance: { sourceMessageId: "message-1", channel: "portal" },
      externalTransportPerformed: false,
    });
  });

  it("projects only an exact approved-unsent state", () => {
    const base = action();
    const projected = projectPreparedActionInspection({
      ...base,
      status: "approved",
      approvedVersion: 1,
      approvedPayloadHash: base.payloadHash,
      approvedAt: new Date("2026-09-01T13:05:00.000Z"),
    });
    expect(projected.state).toBe("APPROVED_UNSENT");
    expect(projected.approval.approvedFingerprint).toBe(base.payloadHash);
  });

  it("fails closed on binding, fingerprint, delivery and approval drift", () => {
    expect(() =>
      projectPreparedActionInspection(action({ id: "other-action" })),
    ).toThrow("PREPARED_ACTION_BINDING_MISMATCH");
    expect(() =>
      projectPreparedActionInspection(action({ payloadHash: "0".repeat(64) })),
    ).toThrow("PREPARED_ACTION_FINGERPRINT_MISMATCH");
    expect(() =>
      projectPreparedActionInspection(action({ simulatedDeliveryCount: 1 })),
    ).toThrow();
    expect(() =>
      projectPreparedActionInspection(
        action({ approvedVersion: 1, approvedPayloadHash: "0".repeat(64) }),
      ),
    ).toThrow("PREPARED_ACTION_UNEXPECTED_APPROVAL");
  });

  it("refuses unknown fields in the external inspection contract", () => {
    expect(
      preparedActionInspectionSchema.safeParse({
        ...projectPreparedActionInspection(action()),
        dispatch: true,
      }).success,
    ).toBe(false);
  });
});
