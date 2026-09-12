import { describe, expect, it } from "vitest";
import type { WritableDeviceCalendar } from "@/lib/device-calendar-bridge";
import { preferredWritableDeviceCalendar } from "@/lib/device-calendar-selection";

const calendar = (id: string, title = id): WritableDeviceCalendar => ({
  schemaVersion: 1,
  id,
  title,
  ownerAccount: null,
});

describe("default writable Android calendar selection", () => {
  it("retains a still-writable previous selection", () => {
    const calendars = [calendar("primary"), calendar("work")];
    expect(preferredWritableDeviceCalendar(calendars, calendar("work"))).toEqual(calendar("work"));
  });

  it("uses the first prioritized writable calendar when no valid selection exists", () => {
    const calendars = [calendar("primary"), calendar("work")];
    expect(preferredWritableDeviceCalendar(calendars, calendar("removed"))).toEqual(calendar("primary"));
    expect(preferredWritableDeviceCalendar([], null)).toBeNull();
  });
});
