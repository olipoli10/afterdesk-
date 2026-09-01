import { describe, expect, it } from "vitest";
import { MobileApi } from "../src/lib/api";
import type { MobileWorkspace } from "../src/lib/contracts";
import {
  beginPreparedActionAttempt,
  createPreparedActionAttempt,
  finishPreparedActionAttempt,
  mobilePreparedActionDecisionResultSchema,
  mobilePreparedActionInspectionSchema,
  preparedActionInspections,
  type MobilePreparedActionInspection,
} from "../src/lib/prepared-actions";

function workspace(
  role: "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER" = "OWNER",
): MobileWorkspace {
  const allowed = role !== "FIELD_WORKER";
  return {
    id: "workspace-1",
    name: "ENDVERA Construction",
    defaultTimezone: "America/Toronto",
    defaultLocale: "fr-CA",
    role,
    permissions: {
      financialsVisible: allowed,
      canManageReceivables: allowed,
      canScheduleFollowUps: allowed,
      canApprovePreparedActions: allowed,
      canAddEvidence: true,
      externalTransportAuthorized: false,
    },
  };
}

function inspection(
  overrides: Partial<MobilePreparedActionInspection> = {},
): MobilePreparedActionInspection {
  return mobilePreparedActionInspectionSchema.parse({
    schemaVersion: 1,
    kind: "PREPARED_OUTBOUND_MESSAGE",
    actionId: "action-1",
    workspaceId: "workspace-1",
    state: "PREPARED_UNSENT",
    channel: "SMS",
    recipient: "+15555550184",
    body: "Bonjour Marc, le rendez-vous est déplacé à 14 h.",
    version: 1,
    fingerprint: "a".repeat(64),
    project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
    contact: { id: "contact-1", displayName: "Marc" },
    provenance: {
      sourceMessageId: "message-1",
      channel: "portal",
      direction: "inbound",
      receivedAt: "2026-09-01T13:00:00.000Z",
      recordedAt: "2026-09-01T13:00:01.000Z",
    },
    approval: {
      required: true,
      approvedVersion: null,
      approvedFingerprint: null,
      approvedAt: null,
    },
    externalTransportPerformed: false,
    ...overrides,
  });
}

function result(commandId: string) {
  return mobilePreparedActionDecisionResultSchema.parse({
    schemaVersion: 1,
    commandId,
    actionId: "action-1",
    decision: "APPROVE",
    state: "APPROVED_UNSENT",
    version: 1,
    fingerprint: "a".repeat(64),
    decidedAt: "2026-09-01T13:05:00.000Z",
    replayed: false,
    externalTransportPerformed: false,
  });
}

describe("mobile prepared-action inspection", () => {
  it("extracts the exact authorized payload and ignores a field projection", () => {
    const exact = inspection();
    expect(
      preparedActionInspections([
        { id: "action-1", payload: exact },
        { id: "field-action", type: "outbound_message", status: "proposed" },
      ]),
    ).toEqual([exact]);
    expect(() =>
      mobilePreparedActionInspectionSchema.parse({
        ...exact,
        externalTransportPerformed: true,
      }),
    ).toThrow();
  });

  it("refuses field workers, cross-workspace actions and invalid transitions", () => {
    expect(() =>
      createPreparedActionAttempt({
        workspace: workspace("FIELD_WORKER"),
        action: inspection(),
        decision: "APPROVE",
      }),
    ).toThrow("MOBILE_PREPARED_ACTION_PERMISSION_REFUSED");
    expect(() =>
      createPreparedActionAttempt({
        workspace: workspace(),
        action: inspection({ workspaceId: "workspace-2" }),
        decision: "APPROVE",
      }),
    ).toThrow("MOBILE_PREPARED_ACTION_WORKSPACE_REFUSED");
    expect(() =>
      createPreparedActionAttempt({
        workspace: workspace(),
        action: inspection({ state: "APPROVED_UNSENT" }),
        decision: "REJECT",
        reason: "Trop tard",
      }),
    ).toThrow("MOBILE_PREPARED_ACTION_STATE_REFUSED");
  });
});

describe("mobile prepared-action stable decisions", () => {
  it("keeps the exact command for an unknown-outcome retry", () => {
    const attempt = createPreparedActionAttempt({
      workspace: workspace(),
      action: inspection(),
      decision: "APPROVE",
      idFactory: () => "00000000-0000-4000-8000-000000000092",
    });
    const sending = beginPreparedActionAttempt(attempt);
    expect(() => beginPreparedActionAttempt(sending)).toThrow(
      "MOBILE_PREPARED_ACTION_ALREADY_DISPATCHED",
    );
    const unknown = finishPreparedActionAttempt(sending, {
      state: "OUTCOME_UNKNOWN",
    });
    const retry = beginPreparedActionAttempt(unknown);
    expect(retry.command).toEqual(attempt.command);
  });

  it("binds a successful API response to the exact submitted decision", async () => {
    const attempt = createPreparedActionAttempt({
      workspace: workspace(),
      action: inspection(),
      decision: "APPROVE",
      idFactory: () => "00000000-0000-4000-8000-000000000092",
    });
    const valid = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      getCookie: () => "better-auth.session_token=synthetic",
      fetchImpl: async () => new Response(JSON.stringify(result(attempt.command.commandId))),
    });
    await expect(valid.decidePreparedAction(attempt.command)).resolves.toMatchObject({
      state: "APPROVED_UNSENT",
      externalTransportPerformed: false,
    });

    const changed = new MobileApi({
      baseUrl: "http://127.0.0.1:3000",
      getCookie: () => "better-auth.session_token=synthetic",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ...result(attempt.command.commandId),
            fingerprint: "b".repeat(64),
          }),
        ),
    });
    await expect(changed.decidePreparedAction(attempt.command)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
