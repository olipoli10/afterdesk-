import { describe, expect, it } from "vitest";
import { personalCalendarDisplay, readableCalendarLocalTime } from "../src/lib/personal-calendar-display";
import { personalModelCalendarApproval } from "../src/lib/personal-model-reviews";

const draft = { startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" };
function display(value = draft) {
  const result = personalCalendarDisplay(value);
  expect(result.status).toBe("DISPLAYABLE");
  if (result.status !== "DISPLAYABLE") throw new Error("Expected displayable synthetic interval");
  return result;
}

describe("calendar approval display-only local dates", () => {
  it("simplifies only zero seconds/fractions in the human-readable label", () => {
    expect(readableCalendarLocalTime("14:00:00.000")).toBe("14:00");
    expect(readableCalendarLocalTime("14:00:03.000")).toBe("14:00:03");
    expect(readableCalendarLocalTime("14:00:03.120")).toBe("14:00:03.120");
    expect(readableCalendarLocalTime("14:00:00.001")).toBe("14:00:00.001");
  });
  it("shows Toronto local dates alongside unchanged raw instants", () => {
    const result = display();
    expect(result.start).toEqual({ raw: draft.startsAt, localDate: "2026-09-11", localTime: "14:00:00.000", utcOffset: "UTC−04:00" });
    expect(result.end.localTime).toBe("15:00:00.000");
    expect(result.timezone).toBe(draft.timezone); expect(result.readOnly).toBe(true);
  });
  it("uses the winter offset, not a fixed Toronto offset", () => {
    expect(display({ ...draft, startsAt: "2026-01-11T18:00:00Z", endsAt: "2026-01-11T19:00:00Z" }).start)
      .toMatchObject({ localTime: "13:00:00.000", utcOffset: "UTC−05:00" });
  });
  it("distinguishes repeated fall-back local times by their exact offsets", () => {
    const result = display({ ...draft, startsAt: "2026-11-01T05:30:00Z", endsAt: "2026-11-01T06:30:00Z" });
    expect(result.start.localTime).toBe("01:30:00.000"); expect(result.end.localTime).toBe("01:30:00.000");
    expect(result.start.utcOffset).toBe("UTC−04:00"); expect(result.end.utcOffset).toBe("UTC−05:00");
  });
  it("displays both sides of the spring-forward gap without inventing a wall time", () => {
    const result = display({ ...draft, startsAt: "2026-03-08T06:30:00Z", endsAt: "2026-03-08T07:30:00Z" });
    expect(result.start.localTime).toBe("01:30:00.000"); expect(result.end.localTime).toBe("03:30:00.000");
    expect(result.start.utcOffset).toBe("UTC−05:00"); expect(result.end.utcOffset).toBe("UTC−04:00");
  });
  it("preserves local date changes and midnight as 00, never 24", () => {
    const result = display({ ...draft, startsAt: "2026-09-12T03:30:00Z", endsAt: "2026-09-12T04:00:00Z" });
    expect(result.start.localDate).toBe("2026-09-11"); expect(result.end.localDate).toBe("2026-09-12");
    expect(result.end.localTime).toBe("00:00:00.000");
  });
  it("supports quarter-hour offsets and preserves subsecond precision", () => {
    const result = display({ ...draft, timezone: "Asia/Kathmandu", startsAt: "2026-09-11T18:00:00.123Z" });
    expect(result.start.localTime).toBe("23:45:00.123"); expect(result.start.utcOffset).toBe("UTC+05:45");
  });
  it("accepts an explicit nonzero source offset without rewriting it", () => {
    const result = display({ ...draft, startsAt: "2026-09-11T14:00:00-04:00" });
    expect(result.start.raw).toBe("2026-09-11T14:00:00-04:00"); expect(result.start.localTime).toBe("14:00:00.000");
  });
  it.each(["Mars/Colony", "", " Toronto ", "America/Toronto "])("never falls back to the device timezone for invalid zone %s", timezone => {
    expect(personalCalendarDisplay({ ...draft, timezone })).toEqual({ status: "UNAVAILABLE", readOnly: true });
  });
  it.each(["demain à 14h", "2026-09-11T14:00:00", "2026-02-30T14:00:00Z", "2026-13-11T14:00:00Z", "2026-09-11T24:00:00Z", "2026-09-11T14:00:60Z", "2026-09-11T14:00:00-00:00", "2026-09-11T14:00:00+24:00", "2026-09-11T14:00:00.1234Z"])("does not normalize or infer malformed/unsupported instant %s", startsAt => {
    expect(personalCalendarDisplay({ ...draft, startsAt }).status).toBe("UNAVAILABLE");
  });
  it("rejects reversed/equal intervals, missing fields and unknown fields", () => {
    for (const value of [{ ...draft, endsAt: draft.startsAt }, { ...draft, endsAt: "2026-09-11T17:00:00Z" }, { ...draft, timezone: undefined }, { ...draft, approve: true }, null]) {
      expect(personalCalendarDisplay(value).status).toBe("UNAVAILABLE");
    }
  });
  it("does not mutate the exact approval payload or request hash", () => {
    const calendar = Object.freeze({ ...draft, title: "Visite synthétique" });
    const action = Object.freeze({ actionId: "synthetic", kind: "PREPARE_CALENDAR_EVENT" as const, recordedStatus: "PREPARED_UNSENT" as const,
      currentStatus: "pending" as const, nextDecision: "REVIEW_EXACT_DRAFT" as const, operationId: "synthetic-op", requestHash: "a".repeat(64), draft: calendar });
    const before = JSON.stringify(action), approval = personalModelCalendarApproval(action);
    const result = display(Object.freeze({ startsAt: calendar.startsAt, endsAt: calendar.endsAt, timezone: calendar.timezone }));
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.start)).toBe(true); expect(Object.isFrozen(result.end)).toBe(true);
    expect(JSON.stringify(action)).toBe(before); expect(personalModelCalendarApproval(action)).toEqual(approval);
    expect(approval).toEqual({ operationId: "synthetic-op", expectedRequestHash: "a".repeat(64) });
  });
});
