import type { WritableDeviceCalendar } from "@/lib/device-calendar-bridge";

export function preferredWritableDeviceCalendar(
  calendars: readonly WritableDeviceCalendar[],
  selected: WritableDeviceCalendar | null,
) {
  return calendars.find((calendar) => calendar.id === selected?.id) ?? calendars[0] ?? null;
}
