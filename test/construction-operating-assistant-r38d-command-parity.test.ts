import { describe, expect, it } from "vitest";
import { interpretOperatingAssistantCommand } from "@/lib/construction-operating-assistant-r2/interpreter";
import { VIRTUAL_SECRETARY_ACTIONS } from "../apps/mobile/src/lib/virtual-secretary-actions";

const context = {
  referenceNow: "2026-09-05T16:00:00.000Z",
  locale: "fr-CA" as const,
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
  calendarItems: [],
};

describe("R38D advertised command parity", () => {
  it("maps every assistant prefill to an implemented intent", () => {
    const prompts = VIRTUAL_SECRETARY_ACTIONS.filter((action) => action.entry.kind === "ASSISTANT_PROMPT");
    expect(prompts.map((action) => [action.key, interpretOperatingAssistantCommand(action.entry.value, context).intent])).toEqual([
      ["SCHEDULE_QUERY", "AGENDA_QUERY"],
      ["CALENDAR_EVENT_CREATE", "CALENDAR_ITEM_CREATE"],
      ["PROJECT_RECORD_UPDATE", "REPORT_WORK_FINISHED"],
      ["SMS_SINGLE_PREPARE", "OUTBOUND_MESSAGE_DRAFT"],
    ]);
  });

  it("does not advertise conversational batch preparation before integration", () => {
    const batch = VIRTUAL_SECRETARY_ACTIONS.find((action) => action.key === "SMS_BROADCAST_PREPARE");
    expect(batch).toMatchObject({
      readiness: "Planificateur local prêt · groupe à approuver · compréhension AI à intégrer",
      entry: { kind: "APP_ROUTE", value: "/assistant", label: "Décrire le groupe à ENDVERA" },
    });
  });
});
