import { describe, expect, it } from "vitest";
import {
  VIRTUAL_SECRETARY_ACTIONS,
  VIRTUAL_SECRETARY_EXTERNAL_EFFECTS,
} from "../src/lib/virtual-secretary-actions";

describe("mobile virtual secretary action catalog", () => {
  it("shows exactly the seven founder-selected secretary capabilities", () => {
    expect(VIRTUAL_SECRETARY_ACTIONS.map((action) => action.key)).toEqual([
      "SCHEDULE_QUERY",
      "GOOGLE_CALENDAR_QUERY",
      "CALENDAR_EVENT_CREATE",
      "PROJECT_RECORD_UPDATE",
      "SMS_SINGLE_PREPARE",
      "SMS_BROADCAST_PREPARE",
      "OUTBOUND_CALL_PREPARE",
    ]);
  });

  it("keeps the broadcast boundary visible and every write preview-bound", () => {
    expect(VIRTUAL_SECRETARY_ACTIONS.find((action) => action.key === "SMS_BROADCAST_PREPARE")).toMatchObject({
      maxRecipients: 10,
      readiness: "Groupe exact préparé sans envoi",
      entry: { kind: "ASSISTANT_PROMPT" },
    });
    expect(VIRTUAL_SECRETARY_ACTIONS.filter((action) => action.effectClass !== "READ").every((action) =>
      action.readiness.includes("approuver")
      || action.readiness.includes("Préparé")
      || action.readiness.includes("sans envoi"),
    )).toBe(true);
  });

  it("records no external effect in the local product slice", () => {
    expect(VIRTUAL_SECRETARY_EXTERNAL_EFFECTS).toEqual({ smsSent: 0, callsPlaced: 0, calendarWrites: 0, projectWrites: 0 });
  });
});
