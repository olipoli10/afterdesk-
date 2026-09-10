import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolvePersonalCalendarTemporal } from "@/server/model-gateway/personal-intent/temporal";

function resolve(suffix: string, timezone = "America/Toronto", start = "demain de 14h") {
  const source = `Ajoute visite ${start} à 15h${suffix}`;
  const input = createPersonalIntentInput("synthetic-independent-temporal", source);
  const quote = (value: string) => ({ quote: value, start: source.indexOf(value), end: source.indexOf(value) + value.length });
  const proposal = JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [{ id: "a",
    kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: quote("visite"), starts: quote(start), ends: quote("15h") }] });
  return resolvePersonalCalendarTemporal(input, proposal, "a", { receivedAt: "2026-09-10T12:00:00Z", timezone });
}
describe("independent source-timezone boundary audit", () => {
  it.each([", pst", ", pdt", ", Pst", ", cest"])("does not discard a clearly written non-EST timezone abbreviation: %s", suffix => {
    expect(resolve(suffix)).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED" });
  });
  it.each(["-07", "+02"])("does not discard an ISO hour-only numeric offset %s", offset => {
    const start = "2026-09-11T14:00";
    const source = `Ajoute visite ${start}${offset} à 15h`;
    const input = createPersonalIntentInput("synthetic-independent-offset", source);
    const quote = (value: string) => ({ quote: value, start: source.indexOf(value), end: source.indexOf(value) + value.length });
    expect(resolvePersonalCalendarTemporal(input, JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint,
      actions: [{ id: "a", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: quote("visite"), starts: quote(start), ends: quote("15h") }] }), "a",
    { receivedAt: "2026-09-10T12:00:00Z", timezone: "America/Toronto" })).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED" });
  });
  it.each(["Canada/Eastern", "America/Montreal"])("accepts the platform's actual canonical Toronto alias %s", alias => {
    expect(new Intl.DateTimeFormat("en", { timeZone: alias }).resolvedOptions().timeZone)
      .toBe(new Intl.DateTimeFormat("en", { timeZone: "America/Toronto" }).resolvedOptions().timeZone);
    expect(resolve(`, fuseau ${alias}`)).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", executionAuthorized: false });
  });
  it("does not treat a currently equal UTC offset as canonical identity", () => {
    expect(resolve(", America/New_York")).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED" });
  });
  it("retains French est as an ordinary verb", () => {
    expect(resolve("; le client est disponible")).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED" });
  });
  it("retains the narrowly added demain de grammar without changing action authority", () => {
    expect(resolve("")).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED", startsAtUtc: "2026-09-11T18:00:00.000Z",
      endsAtUtc: "2026-09-11T19:00:00.000Z", executionAuthorized: false, sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_RESOLVER" });
    expect(resolve("", "America/Toronto", "aujourd’hui de 14h")).toMatchObject({ status: "CLARIFY" });
  });
});
