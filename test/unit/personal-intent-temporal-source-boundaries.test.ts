import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";
function event(suffix = "", starts = "demain à 14h", timezone = "America/Toronto") {
  const source = `Ajoute visite ${starts} à 15h${suffix}`;
  const input = createPersonalIntentInput("synthetic-source-boundary", source);
  const span = (quote: string) => ({ start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote });
  const proposal = { schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [{ id: "a", kind: "PREPARE_CALENDAR_EVENT",
    dependsOn: [], title: span("visite"), starts: span(starts), ends: span("15h") }] };
  return resolvePersonalCalendarTemporal(input, JSON.stringify(proposal), "a", { receivedAt: "2026-09-10T13:00:00Z", timezone });
}
describe("calendar literal source and explicit timezone boundaries", () => {
  it("resolves the observed 18:30 owner command after exact unique span realignment", () => {
    const source = "Ajoute à mon calendrier, demain à 18:30, un rendez-vous d'une heure avec Marc au Randolph";
    const input = createPersonalIntentInput("observed-owner-1830", source);
    const proposal = { schemaVersion: 1, requestFingerprint: input.requestFingerprint,
      actions: [{ id: "event", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [],
        title: { start: 0, end: 1, quote: "un rendez-vous d'une heure avec Marc au Randolph" },
        starts: { start: 0, end: 1, quote: "demain à 18:30" },
        ends: { start: 0, end: 1, quote: "d'une heure" } }] };
    expect(resolvePersonalCalendarTemporal(input, JSON.stringify(proposal), "event", {
      receivedAt: "2026-09-14T00:34:38.000Z",
      timezone: "America/Toronto",
    })).toMatchObject({
      status: "RESOLVED_NOT_AUTHORIZED",
      startsAtUtc: "2026-09-14T22:30:00.000Z",
      endsAtUtc: "2026-09-14T23:30:00.000Z",
      timezone: "America/Toronto",
    });
  });
  it("accepts the natural explicit de interval without changing a source quote", () => {
    expect(event("", "demain de 14h")).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", startsAtUtc: "2026-09-11T18:00:00.000Z", endsAtUtc: "2026-09-11T19:00:00.000Z" });
  });
  it.each([", heure de Vancouver", ", heure de Toronto", ", fuseau Inconnu", ", timezone Mars/Colony", ", America/Vancouver", ", PST", ", UTC+02:00", ", GMT-04:00", ", fuseau horaire", ", time zone Europe/Paris"])("clarifies an unknown/conflicting explicit timezone instead of ignoring it: %s", suffix => {
    expect(event(suffix)).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED", executionAuthorized: false });
  });
  it.each([", America/Toronto", ", fuseau horaire America/Toronto", ", timezone America/Toronto", ", heure de America/Toronto"])("accepts only a canonically identical explicit timezone: %s", suffix => {
    expect(event(suffix)).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", timezone: "America/Toronto" });
  });
  it("does not mistake the ordinary French verb est for an EST timezone claim", () => {
    expect(event("; la visite est à Laval")).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED" });
  });
  it.each(["demain vers 14h", "demain à peu près 14h", "demain de 2h"])("retains closed grammar and AM/PM ambiguity: %s", starts => {
    expect(event("", starts)).toMatchObject({ status: "CLARIFY" });
  });
  it("rejects an explicit offset even when the candidate omits it from valid source spans", () => {
    const source = "Ajoute visite 2026-09-11T14:00-07:00 à 15h";
    const input = createPersonalIntentInput("synthetic-offset", source);
    const span = (quote: string) => ({ start: source.indexOf(quote), end: source.indexOf(quote) + quote.length, quote });
    expect(resolvePersonalCalendarTemporal(input, JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint,
      actions: [{ id: "a", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("visite"), starts: span("2026-09-11T14:00"), ends: span("15h") }] }), "a",
    { receivedAt: "2026-09-10T13:00:00Z", timezone: "America/Toronto" })).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED" });
  });
});
