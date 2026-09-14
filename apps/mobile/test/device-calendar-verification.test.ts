import { describe, expect, it } from "vitest";
import {
  deviceCalendarMarker,
  persistedDeviceCalendarEventMatches,
} from "../src/lib/device-calendar-verification";

const marker = deviceCalendarMarker("directive-123");
const expected = {
  calendarId: "google-calendar-1",
  title: "Rendez-vous avec Marc au Randolph",
  startsAt: "2026-09-16T01:30:00.000Z",
  endsAt: "2026-09-16T02:30:00.000Z",
  marker,
};
const persisted = {
  id: "native-42",
  calendarId: expected.calendarId,
  title: expected.title,
  notes: `Ajouté par ENDVERA.\n${marker}`,
  startDate: new Date(expected.startsAt),
  endDate: expected.endsAt,
};

describe("device calendar persisted-event verification", () => {
  it("accepts only the exact persisted calendar, title, marker and instants", () => {
    expect(persistedDeviceCalendarEventMatches(persisted, expected)).toBe(true);
    expect(persistedDeviceCalendarEventMatches({ ...persisted, calendarId: "local-calendar" }, expected)).toBe(false);
    expect(persistedDeviceCalendarEventMatches({ ...persisted, title: "Autre rendez-vous" }, expected)).toBe(false);
    expect(persistedDeviceCalendarEventMatches({ ...persisted, notes: "Ajouté par ENDVERA." }, expected)).toBe(false);
    expect(persistedDeviceCalendarEventMatches({ ...persisted, startDate: "2026-09-16T01:31:00.000Z" }, expected)).toBe(false);
  });

  it("uses a directive-specific idempotency marker", () => {
    expect(marker).toBe("ENDVERA-DIRECTIVE:directive-123");
    expect(deviceCalendarMarker("directive-456")).not.toBe(marker);
  });
});
