import { describe, expect, it } from "vitest";
import {
  planVirtualSecretaryAction,
  virtualSecretaryCapabilityCatalog,
} from "@/lib/construction-operating-assistant-r38b/virtual-secretary-actions";

const common = {
  schemaVersion: 1 as const,
  requestId: "0a36b837-f3b2-4be9-82af-50980ed520d5",
  idempotencyKey: "r38b-request-1",
  workspaceId: "workspace-1",
};

const authorized = { actorVerified: true, actorAuthorized: true, workspaceBound: true };

const recipient = (index: number, eligible = true) => ({
  contactId: `contact-${index}`,
  displayName: `Personne ${index}`,
  communicationEligible: eligible,
});

describe("R38B virtual secretary action kernel", () => {
  it("publishes exactly the seven founder-selected secretary capabilities", () => {
    expect(virtualSecretaryCapabilityCatalog().map((item) => item.key)).toEqual([
      "SCHEDULE_QUERY",
      "GOOGLE_CALENDAR_QUERY",
      "CALENDAR_EVENT_CREATE",
      "PROJECT_RECORD_UPDATE",
      "SMS_SINGLE_PREPARE",
      "SMS_BROADCAST_PREPARE",
      "OUTBOUND_CALL_PREPARE",
    ]);
  });

  it("answers from the canonical schedule and requests the Google connection when absent", () => {
    expect(planVirtualSecretaryAction({ ...common, capability: "SCHEDULE_QUERY", payload: { sourceReady: true } }, authorized)).toMatchObject({
      outcome: "ANSWER_READY",
      reasonCode: "R38B_CANONICAL_SCHEDULE_READY",
      externalTransportPerformed: false,
    });
    expect(planVirtualSecretaryAction({ ...common, capability: "GOOGLE_CALENDAR_QUERY", payload: { connectorReadGranted: false } }, authorized)).toMatchObject({
      outcome: "CONNECTION_REQUIRED",
      reasonCode: "R38B_GOOGLE_CALENDAR_READ_GRANT_REQUIRED",
    });
  });

  it("prepares one text and one exact ten-person broadcast", () => {
    const single = planVirtualSecretaryAction({
      ...common,
      capability: "SMS_SINGLE_PREPARE",
      payload: { recipients: [recipient(1)], message: "Rendez-vous déplacé à 14 h." },
    }, authorized);
    expect(single).toMatchObject({ outcome: "PREPARED_ACTION", approvalRequired: true, preview: { channel: "SMS" } });

    const broadcast = planVirtualSecretaryAction({
      ...common,
      requestId: "1a36b837-f3b2-4be9-82af-50980ed520d5",
      idempotencyKey: "r38b-request-2",
      capability: "SMS_BROADCAST_PREPARE",
      payload: { recipients: Array.from({ length: 10 }, (_, index) => recipient(index + 1)), message: "Le chantier ouvre à 7 h." },
    }, authorized);
    expect(broadcast).toMatchObject({ outcome: "PREPARED_ACTION", reasonCode: "R38B_SMS_BROADCAST_PREPARED" });
    expect(broadcast.preview.recipients).toHaveLength(10);
    expect(broadcast.externalTransportPerformed).toBe(false);
  });

  it("refuses duplicate, ineligible and eleven-person recipient sets", () => {
    const inputs = [
      [recipient(1), recipient(1)],
      [recipient(1, false)],
      Array.from({ length: 11 }, (_, index) => recipient(index + 1)),
    ];
    expect(inputs.map((recipients, index) => planVirtualSecretaryAction({
      ...common,
      requestId: `${index + 2}a36b837-f3b2-4be9-82af-50980ed520d5`,
      idempotencyKey: `r38b-refusal-${index}`,
      capability: "SMS_BROADCAST_PREPARE",
      payload: { recipients, message: "Avis opérationnel." },
    }, authorized).reasonCode)).toEqual([
      "R38B_DUPLICATE_RECIPIENT_REFUSED",
      "R38B_RECIPIENT_NOT_ELIGIBLE",
      "R38B_BROADCAST_LIMIT_REFUSED",
    ]);
  });

  it("prepares disclosed calls, exact project updates and valid calendar events", () => {
    expect(planVirtualSecretaryAction({ ...common, capability: "OUTBOUND_CALL_PREPARE", payload: { recipient: recipient(1), objective: "Confirmer la livraison", assistantDisclosure: true } }, authorized)).toMatchObject({
      outcome: "PREPARED_ACTION", preview: { channel: "VOICE" }, reasonCode: "R38B_OUTBOUND_CALL_PREPARED",
    });
    expect(planVirtualSecretaryAction({ ...common, capability: "PROJECT_RECORD_UPDATE", payload: { projectId: "project-1", expectedStateVersion: 4, changeSummary: "Le dosseret est terminé." } }, authorized)).toMatchObject({
      outcome: "PREPARED_ACTION", effectClass: "INTERNAL_WRITE", reasonCode: "R38B_PROJECT_UPDATE_PREPARED",
    });
    expect(planVirtualSecretaryAction({ ...common, capability: "CALENDAR_EVENT_CREATE", payload: { connectorWriteGranted: true, calendarId: "primary", title: "Marc — Laval", startAt: "2026-09-08T14:00:00.000Z", endAt: "2026-09-08T15:00:00.000Z", timeZone: "America/Toronto" } }, authorized)).toMatchObject({
      outcome: "PREPARED_ACTION", preview: { channel: "GOOGLE_CALENDAR" }, reasonCode: "R38B_CALENDAR_EVENT_PREPARED",
    });
  });

  it("refuses unverified or unauthorized actors before planning", () => {
    const command = { ...common, capability: "SCHEDULE_QUERY" as const, payload: { sourceReady: true } };
    expect(planVirtualSecretaryAction(command, { ...authorized, actorVerified: false }).reasonCode).toBe("R38B_ACTOR_NOT_VERIFIED");
    expect(planVirtualSecretaryAction(command, { ...authorized, actorAuthorized: false }).reasonCode).toBe("R38B_ACTOR_NOT_AUTHORIZED");
    expect(planVirtualSecretaryAction(command, { ...authorized, workspaceBound: false }).reasonCode).toBe("R38B_WORKSPACE_NOT_BOUND");
  });
});
