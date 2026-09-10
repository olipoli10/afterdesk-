import { describe, expect, it } from "vitest";
import { classifySmsTemporalTimeLiteral as classify } from "@/server/personal-assistant/sms-temporal-clarification";

describe("shared temporal SMS literal grammar, routing only", () => {
  it.each([
    ["14h", 14, 0], ["14:00", 14, 0], ["14 h 30", 14, 30], ["14\u202fh\u00a030", 14, 30],
    ["  14h30\n", 14, 30], ["00:00", 0, 0], ["0h", 0, 0], ["00h15", 0, 15], ["23:59", 23, 59], ["12:00", 12, 0],
  ])("recognizes only an exact explicit time %s", (text, hour, minute) => {
    const result = classify(text as string);
    expect(result).toEqual({ status: "EXACT_TIME_LITERAL", hour, minute }); expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("date"); expect(result).not.toHaveProperty("executionAuthorized");
  });
  it.each(["1h", "01h", "3h30", "12h", "12 h 59", "24h", "24:00", "99:99", "14h60", "00:60"])("keeps ambiguous/invalid time-shaped reply %s separate from a new command", text => {
    const result = classify(text); expect(result).toEqual({ status: "AMBIGUOUS_OR_INVALID_TIME_LITERAL" }); expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(["", "14", "2:00", "14 H", "à 14h", "14h demain", "14h puis appelle Marc", "Ne mets pas 14h", "14h30 EST", "14:00Z",
    "Qu’est-ce que j’ai demain?", "Ajoute inspection demain à 14h, fin 15h.", "CONFIRME ENDVERA AGENDA bois lac lune sable", "14h2", "-1h", "１４h", "１４：００"])("does not reinterpret nonliteral request %s", text => {
    expect(classify(text)).toEqual({ status: "NOT_TIME_LITERAL" });
  });
  it("never coerces non-string input into a reply", () => {
    for (const input of [null, undefined, 14, { toString: () => "14h" }]) expect(classify(input as never)).toEqual({ status: "NOT_TIME_LITERAL" });
  });
});
