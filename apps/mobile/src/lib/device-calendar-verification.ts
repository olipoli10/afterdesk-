export type PersistedDeviceCalendarEvent = {
  id: string;
  calendarId: string;
  title: string;
  notes?: string | null;
  startDate: string | Date;
  endDate: string | Date;
};

export type ExpectedDeviceCalendarEvent = {
  calendarId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  marker: string;
};

const DATE_TOLERANCE_MS = 1_000;

function instant(value: string | Date) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deviceCalendarMarker(directiveId: string) {
  return `ENDVERA-DIRECTIVE:${directiveId}`;
}

export function persistedDeviceCalendarEventMatches(
  event: PersistedDeviceCalendarEvent,
  expected: ExpectedDeviceCalendarEvent,
) {
  const start = instant(event.startDate);
  const end = instant(event.endDate);
  const expectedStart = Date.parse(expected.startsAt);
  const expectedEnd = Date.parse(expected.endsAt);
  return event.calendarId === expected.calendarId
    && event.title === expected.title
    && typeof event.notes === "string"
    && event.notes.includes(expected.marker)
    && start !== null
    && end !== null
    && Math.abs(start - expectedStart) <= DATE_TOLERANCE_MS
    && Math.abs(end - expectedEnd) <= DATE_TOLERANCE_MS;
}
