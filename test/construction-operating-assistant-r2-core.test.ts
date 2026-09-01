import { describe, expect, it } from "vitest";
import {
  operatingCommandEnvelopeSchema,
  operatingInterpretationSchema,
} from "../src/lib/construction-operating-assistant-r2/contracts";
import { connectorCapabilities } from "../src/lib/construction-operating-assistant-r2/connectors";
import { interpretOperatingAssistantCommand } from "../src/lib/construction-operating-assistant-r2/interpreter";

const context = {
  referenceNow: "2026-08-31T13:00:00.000Z",
  locale: "fr-CA" as const,
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "LAVAL-001", name: "Rénovation Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
  calendarItems: [
    {
      id: "calendar-marc-tuesday",
      projectId: "project-laval",
      contactId: "contact-marc",
      title: "Rendez-vous avec Marc",
      startsAtUtc: "2026-09-01T18:00:00.000Z",
      endsAtUtc: "2026-09-01T19:00:00.000Z",
      status: "scheduled",
    },
  ],
};

describe("ENDVERA operating assistant R2 contracts", () => {
  it("accepts one provider-neutral command envelope and rejects unknown fields", () => {
    const value = operatingCommandEnvelopeSchema.parse({
      schemaVersion: 1,
      commandId: "de32c4c8-14fc-4f89-bd89-5f905ffdd7bf",
      workspaceId: "workspace-1",
      channel: "VOICE_TRANSCRIPT",
      body: "Qu’est-ce que j’ai aujourd’hui?",
      occurredAt: "2026-08-31T13:00:00.000Z",
      senderAddress: "user:user-1",
    });
    expect(value.channel).toBe("VOICE_TRANSCRIPT");
    expect(() => operatingCommandEnvelopeSchema.parse({ ...value, execute: true })).toThrow();
  });

  it("reports connector truth without implying live transport", () => {
    const capabilities = connectorCapabilities();
    expect(capabilities.find((item) => item.id === "PORTAL")?.status).toBe("LOCAL_READY");
    expect(capabilities.find((item) => item.id === "SMS")?.status).toBe("LOCAL_READY");
    expect(capabilities.find((item) => item.id === "VOICE")?.status).toBe("LOCAL_READY");
    expect(capabilities.find((item) => item.id === "GOOGLE_CALENDAR")?.externalWriteEnabled).toBe(false);
    expect(capabilities.every((item) => item.externalTransportEnabled === false)).toBe(true);
  });
});

describe("ENDVERA operating assistant R2 interpretation", () => {
  it("answers today's agenda from a bounded query window", () => {
    const result = interpretOperatingAssistantCommand("Qu’est-ce que j’ai aujourd’hui?", context);
    expect(result.intent).toBe("AGENDA_QUERY");
    expect(result.queryWindow?.kind).toBe("TODAY");
    expect(() => operatingInterpretationSchema.parse(result)).not.toThrow();
  });

  it("creates a precise low-risk reminder", () => {
    const result = interpretOperatingAssistantCommand(
      "Rappelle-moi mardi à 9 h d'appeler Marc pour Laval.",
      context,
    );
    expect(result.intent).toBe("REMINDER_CREATE");
    expect(result.projectId).toBe("project-laval");
    expect(result.contactId).toBe("contact-marc");
    expect(result.dueAtUtc).toBe("2026-09-01T13:00:00.000Z");
    expect(result.approvalRequired).toBe(false);
  });

  it("refuses an ambiguous reminder time", () => {
    const result = interpretOperatingAssistantCommand(
      "Rappelle-moi mardi à 2 d'appeler Marc pour Laval.",
      context,
    );
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_TIME");
    expect(result.dueAtUtc).toBeNull();
  });

  it("reschedules exactly one matching appointment and preserves its identity", () => {
    const result = interpretOperatingAssistantCommand(
      "Déplace le rendez-vous avec Marc mardi de 14 h à 16 h pour Laval.",
      context,
    );
    expect(result.intent).toBe("CALENDAR_ITEM_RESCHEDULE");
    expect(result.calendarItemId).toBe("calendar-marc-tuesday");
    expect(result.startsAtUtc).toBe("2026-09-01T20:00:00.000Z");
  });

  it("does not reschedule when more than one appointment matches", () => {
    const result = interpretOperatingAssistantCommand(
      "Déplace le rendez-vous avec Marc mardi de 14 h à 16 h pour Laval.",
      { ...context, calendarItems: [...context.calendarItems, { ...context.calendarItems[0], id: "second" }] },
    );
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_CALENDAR_ITEM");
    expect(result.calendarItemId).toBeNull();
  });
});
