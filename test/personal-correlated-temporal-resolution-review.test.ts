import { describe, expect, it } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
import { resolvePersonalCalendarTemporal as legacy, resolvePersonalCalendarTemporalClarifiedSlot as clarify } from "@/server/model-gateway/personal-intent/temporal";

const context = { receivedAt: "2026-09-11T03:59:00.000Z", timezone: "America/Toronto" };
function proposal(start = "demain à 2h", end = "16h", tail = "") {
  const input = createPersonalIntentInput("review-source", `Ajoute visite ${start}, fin ${end}. ${tail}`);
  const span = (quote: string) => ({ start: input.source.indexOf(quote), end: input.source.indexOf(quote) + quote.length, quote });
  const raw = JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [
    { id: "visit", kind: "PREPARE_CALENDAR_EVENT", dependsOn: [], title: span("visite"), starts: span(start), ends: span(end) },
  ] });
  return { input, raw };
}

describe("independent single-slot temporal override review — pure only", () => {
  it.each([
    { slot: "START", hour: 24, minute: 0 }, { slot: "START", hour: -1, minute: 0 },
    { slot: "START", hour: 14, minute: 60 }, { slot: "START", hour: 14.5, minute: 0 },
    { slot: "START", hour: 14, minute: 0, date: "2030-01-01" },
    { slot: "START", hour: 14, minute: 0, timezone: "UTC" },
  ])("rejects malformed override or extra date/zone %#", override => {
    const f = proposal();
    expect(clarify(f.input, f.raw, "visit", context, override as never)).toMatchObject({ status: "CLARIFY", reason: "INVALID_INPUT", executionAuthorized: false });
  });
  it("cannot replace an already explicit start merely because the end is ambiguous", () => {
    const f = proposal("demain à 14h", "4h");
    expect(clarify(f.input, f.raw, "visit", context, { slot: "START", hour: 15, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "UNSUPPORTED_ACTION" });
  });
  it("cannot resolve either slot when both are independently ambiguous", () => {
    const f = proposal("demain à 2h", "4h");
    for (const slot of ["START", "END"] as const) expect(clarify(f.input, f.raw, "visit", context, { slot, hour: 14, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "UNSUPPORTED_ACTION" });
  });
  it("preserves a dated end rather than rebasing it to receipt date or start date", () => {
    const f = proposal("2026-09-15 à 2h", "2026-09-16 à 00:30");
    expect(clarify(f.input, f.raw, "visit", context, { slot: "START", hour: 14, minute: 0 })).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED",
      startsAtUtc: "2026-09-15T18:00:00.000Z", endsAtUtc: "2026-09-16T04:30:00.000Z", anchorReceivedAt: context.receivedAt, executionAuthorized: false, preview: null });
  });
  it("never rolls an earlier END-only reply into another day", () => {
    const f = proposal("demain à 14h", "4h");
    expect(clarify(f.input, f.raw, "visit", context, { slot: "END", hour: 4, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "END_NOT_AFTER_START" });
  });
  it("does not drop an explicit conflicting timezone outside the quoted slot", () => {
    const f = proposal("demain à 2h", "16h", "fuseau UTC");
    expect(legacy(f.input, f.raw, "visit", context)).toMatchObject({ status: "CLARIFY", reason: "EXPLICIT_TIMEZONE_UNSUPPORTED" });
    expect(clarify(f.input, f.raw, "visit", context, { slot: "START", hour: 14, minute: 0 })).toMatchObject({ status: "CLARIFY", reason: "UNSUPPORTED_ACTION" });
  });
  it("keeps legacy single-source ambiguity before and after a separate clarified computation", () => {
    const f = proposal(), before = legacy(f.input, f.raw, "visit", context);
    expect(before).toMatchObject({ status: "CLARIFY", reason: "AMBIGUOUS_TIME" });
    expect(clarify(f.input, f.raw, "visit", context, { slot: "START", hour: 14, minute: 30 })).toMatchObject({ status: "RESOLVED_NOT_AUTHORIZED",
      startsAtUtc: "2026-09-11T18:30:00.000Z", endsAtUtc: "2026-09-11T20:00:00.000Z" });
    expect(legacy(f.input, f.raw, "visit", context)).toEqual(before);
  });
});
