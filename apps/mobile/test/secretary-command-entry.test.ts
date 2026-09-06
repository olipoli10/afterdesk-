import { describe, expect, it } from "vitest";
import {
  assistantPrefillFromRoute,
  VIRTUAL_SECRETARY_ACTIONS,
  VIRTUAL_SECRETARY_EXTERNAL_EFFECTS,
} from "../src/lib/virtual-secretary-actions";

describe("R38C secretary command entry", () => {
  it("gives all seven capabilities one deterministic owned entry", () => {
    expect(VIRTUAL_SECRETARY_ACTIONS).toHaveLength(7);
    expect(VIRTUAL_SECRETARY_ACTIONS.map((action) => [action.key, action.entry])).toEqual([
      ["SCHEDULE_QUERY", { kind: "ASSISTANT_PROMPT", value: "Qu’est-ce que j’ai demain?", label: "Demander à ENDVERA" }],
      ["GOOGLE_CALENDAR_QUERY", { kind: "APP_ROUTE", value: "/calendar-connections", label: "Connecter mon calendrier" }],
      ["CALENDAR_EVENT_CREATE", { kind: "ASSISTANT_PROMPT", value: "Ajoute Marc mardi à 14 h pour Laval.", label: "Préparer dans l’assistant" }],
      ["PROJECT_RECORD_UPDATE", { kind: "ASSISTANT_PROMPT", value: "Le dosseret de Laval est terminé.", label: "Préparer dans l’assistant" }],
      ["SMS_SINGLE_PREPARE", { kind: "ASSISTANT_PROMPT", value: "Texte Marc pour confirmer 14 h.", label: "Préparer dans l’assistant" }],
      ["SMS_BROADCAST_PREPARE", { kind: "ASSISTANT_PROMPT", value: "Dis aux 10 gars que le chantier ouvre à 7 h.", label: "Préparer dans l’assistant" }],
      ["OUTBOUND_CALL_PREPARE", { kind: "APP_ROUTE", value: "/calls", label: "Préparer un appel" }],
    ]);
  });

  it("accepts one bounded assistant prefill and ignores unsafe route values", () => {
    expect(assistantPrefillFromRoute("  Texte Marc demain.  ")).toBe("Texte Marc demain.");
    expect(assistantPrefillFromRoute(["Premier", "Deuxième"])).toBe("Premier");
    expect(assistantPrefillFromRoute(undefined)).toBeNull();
    expect(assistantPrefillFromRoute("   ")).toBeNull();
    expect(assistantPrefillFromRoute("x".repeat(10_001))).toBeNull();
  });

  it("does not turn navigation into an external effect", () => {
    expect(VIRTUAL_SECRETARY_EXTERNAL_EFFECTS).toEqual({
      smsSent: 0,
      callsPlaced: 0,
      calendarWrites: 0,
      projectWrites: 0,
    });
  });
});
