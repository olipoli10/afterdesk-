import { describe, expect, it } from "vitest";
import {
  calendarVerificationPresentation,
  upcomingWorkspaceDays,
} from "../src/lib/calendar-display";

describe("mobile calendar presentation", () => {
  it("builds the day strip from the workspace date instead of the device date", () => {
    const instant = new Date("2026-01-02T00:30:00.000Z");

    expect(upcomingWorkspaceDays("America/Toronto", "en-CA", instant, 2)).toEqual([
      { key: "2026-01-01", weekday: "Thu", dayNumber: 1 },
      { key: "2026-01-02", weekday: "Fri", dayNumber: 2 },
    ]);
    expect(upcomingWorkspaceDays("Asia/Tokyo", "en-CA", instant, 1)[0]).toEqual({
      key: "2026-01-02",
      weekday: "Fri",
      dayNumber: 2,
    });
  });

  it("fails closed for rejected or unknown appointment verification states", () => {
    expect(calendarVerificationPresentation("verified")).toBe("verified");
    expect(calendarVerificationPresentation("proposed")).toBe("proposed");
    expect(calendarVerificationPresentation("rejected")).toBe("rejected");
    expect(calendarVerificationPresentation("future-state")).toBe("unknown");
  });
});
