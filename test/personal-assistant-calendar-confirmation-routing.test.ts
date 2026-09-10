import { describe, expect, it } from "vitest";
import { isReservedCalendarConfirmationMessage } from "@/server/personal-assistant/calendar-confirmation-routing";

describe("reserved calendar confirmation routing is not an approval parser", () => {
  it.each([
    "CONFIRME ENDVERA AGENDA foret lune rive vent",
    "confirme endvera agenda ancien code",
    "  CONFIRME\nENDVERA\tAGENDA mauvais",
    "Ne fais pas CONFIRME ENDVERA AGENDA foret lune rive vent",
    "« CONFIRME ENDVERA AGENDA foret lune rive vent » puis appelle Marc",
    "CONFIRME ENDVERA AGENDA",
    "CONFIRME ENDVERA AGENDA.",
    "ＣＯＮＦＩＲＭＥ ＥＮＤＶＥＲＡ ＡＧＥＮＤＡ foret lune rive vent",
    "CONFI\u200bRME ENDVERA AGENDA foret lune rive vent",
  ])("reserves %s without authorizing it", body => {
    expect(isReservedCalendarConfirmationMessage(body)).toBe(true);
  });
  it.each(["Oui", "Ajoute une visite demain", "Mon agenda demain", "CONFIRME ENDVERA AGENDAS", "Confirme le rendez-vous avec Marc"])("does not invent a reserved phrase: %s", body => {
    expect(isReservedCalendarConfirmationMessage(body)).toBe(false);
  });
});
