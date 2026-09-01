import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_INTENTS,
  constructionInterpretationSchema,
  type InterpreterContext,
} from "../src/lib/construction-assistant-v1/contracts";
import { interpretConstructionMessage } from "../src/lib/construction-assistant-v1/interpreter";

const context: InterpreterContext = {
  referenceNow: "2026-08-31T13:00:00.000Z",
  locale: "fr-CA",
  timezone: "America/Toronto",
  projects: [{ id: "project-laval", code: "281", name: "Laval" }],
  contacts: [{ id: "contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
};

describe("Construction Assistant V1 closed interpretation", () => {
  it("keeps the intent vocabulary closed", () => {
    expect(CONSTRUCTION_INTENTS).toEqual([
      "CALENDAR_ITEM_CREATE",
      "CALENDAR_QUERY",
      "OUTBOUND_MESSAGE_DRAFT",
      "REPORT_WORK_FINISHED",
      "CLARIFICATION_REQUIRED",
      "UNSUPPORTED",
    ]);
    expect(() => constructionInterpretationSchema.parse({ intent: "EXECUTE" })).toThrow();
  });

  it("turns the clear French appointment into a project/contact/time proposal", () => {
    const result = interpretConstructionMessage(
      "Rendez-vous avec Marc mardi à 14 h pour le chantier Laval.",
      context,
    );

    expect(result.intent).toBe("CALENDAR_ITEM_CREATE");
    expect(result.projectId).toBe("project-laval");
    expect(result.contactId).toBe("contact-marc");
    expect(result.originalDatePhrase).toBe("mardi à 14 h");
    expect(result.startsAtUtc).toBe("2026-09-01T18:00:00.000Z");
    expect(result.clarification).toBeNull();
  });

  it("refuses to guess AM or PM", () => {
    const result = interpretConstructionMessage(
      "Rendez-vous avec Marc mardi à 2 pour Laval.",
      context,
    );
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_TIME");
    expect(result.startsAtUtc).toBeNull();
  });

  it("asks one private clarification when two Marcs match", () => {
    const result = interpretConstructionMessage("Rendez-vous avec Marc mardi à 14 h pour Laval.", {
      ...context,
      contacts: [
        ...context.contacts,
        { id: "contact-marc-2", displayName: "Marc", preferredLanguage: "fr" },
      ],
    });
    expect(result.intent).toBe("CLARIFICATION_REQUIRED");
    expect(result.clarification?.reason).toBe("AMBIGUOUS_CONTACT");
    expect(result.clarification?.candidateCount).toBe(2);
    expect(JSON.stringify(result.clarification)).not.toContain("contact-marc");
  });

  it("recognizes the canonical tomorrow query without relying on chat memory", () => {
    const result = interpretConstructionMessage("Qu’est-ce que j’ai demain?", context);
    expect(result.intent).toBe("CALENDAR_QUERY");
    expect(result.queryWindow?.kind).toBe("TOMORROW");
  });

  it("drafts rather than sends outbound communication", () => {
    const result = interpretConstructionMessage(
      "Texte Marc que je vais avoir 30 minutes de retard.",
      context,
    );
    expect(result.intent).toBe("OUTBOUND_MESSAGE_DRAFT");
    expect(result.contactId).toBe("contact-marc");
    expect(result.outboundDraft?.body).toContain("30 minutes de retard");
    expect(result.outboundDraft?.sendAuthorized).toBe(false);
  });
});
