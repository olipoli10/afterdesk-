import { describe, expect, it } from "vitest";
import { interpretConstructionMessage } from "@/lib/construction-assistant-v1/interpreter";
import type { InterpreterContext } from "@/lib/construction-assistant-v1/contracts";

const context: InterpreterContext = {
  referenceNow: "2026-03-06T16:00:00.000Z", timezone: "America/Toronto", locale: "fr-CA",
  projects: [{ id: "syn-project", code: "LAVAL-001", name: "Laval" }],
  contacts: [{ id: "syn-marc", displayName: "Marc", preferredLanguage: "fr" }],
};
describe("Distinct-lane review of the Toronto DST correction", () => {
  it.each(["2 h", "2 h 30", "2 h 59"])("rejects the nonexistent spring time %s", (hour) => {
    const result = interpretConstructionMessage(`Rendez-vous avec Marc dimanche à ${hour} pour Laval.`, context);
    expect(result).toMatchObject({ intent: "CLARIFICATION_REQUIRED", startsAtUtc: null, clarification: { reason: "AMBIGUOUS_TIME" } });
    expect(result.clarification?.question).toContain("n’existe pas");
  });
  it.each([["1 h 59", "2026-03-08T06:59:00.000Z"], ["3 h", "2026-03-08T07:00:00.000Z"]])("retains the unique spring boundary %s", (hour, instant) => {
    expect(interpretConstructionMessage(`Rendez-vous avec Marc dimanche à ${hour} pour Laval.`, context).startsAtUtc).toBe(instant);
  });
  it.each(["1 h", "1 h 59"])("rejects the duplicated fall boundary %s", (hour) => {
    const result = interpretConstructionMessage(`Rendez-vous avec Marc dimanche à ${hour} pour Laval.`, { ...context, referenceNow: "2026-10-30T16:00:00.000Z" });
    expect(result).toMatchObject({ intent: "CLARIFICATION_REQUIRED", startsAtUtc: null, clarification: { reason: "AMBIGUOUS_TIME" } });
  });
});
