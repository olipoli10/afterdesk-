import { addDays, addHours } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { Settings } from "@/lib/settings";

/**
 * Working-hours math for honest client-facing estimates. The operator is one
 * person in Eastern Time; estimates are computed from the workingHours
 * setting, never hardcoded and never a fake spinner.
 */

type WorkingHours = Settings["workingHours"];

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  return { h: h || 0, m: m || 0 };
}

/** Next instant ≥ `from` that falls inside working hours. */
export function nextWorkingMoment(from: Date, wh: WorkingHours): Date {
  const { h: startH, m: startM } = parseHM(wh.start);
  const { h: endH, m: endM } = parseHM(wh.end);

  let cursor = new Date(from);
  for (let i = 0; i < 14; i++) {
    const zoned = toZonedTime(cursor, wh.timezone);
    const day = zoned.getDay();
    const minutes = zoned.getHours() * 60 + zoned.getMinutes();
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (wh.days.includes(day) && minutes < endMin) {
      if (minutes >= startMin) return cursor;
      // Same working day, before opening — jump to opening.
      const opening = new Date(zoned);
      opening.setHours(startH, startM, 0, 0);
      return fromZonedTime(opening, wh.timezone);
    }
    // Jump to next day's opening.
    const nextDay = addDays(zoned, 1);
    nextDay.setHours(startH, startM, 0, 0);
    cursor = fromZonedTime(nextDay, wh.timezone);
  }
  return cursor;
}

/** Adds `hours` of *working* time starting from `from` (approximate, capped scan). */
export function addWorkingHours(from: Date, hours: number, wh: WorkingHours): Date {
  const { h: endH, m: endM } = parseHM(wh.end);
  let cursor = nextWorkingMoment(from, wh);
  let remainingMin = Math.round(hours * 60);

  for (let i = 0; i < 30 && remainingMin > 0; i++) {
    const zoned = toZonedTime(cursor, wh.timezone);
    const endOfDay = new Date(zoned);
    endOfDay.setHours(endH, endM, 0, 0);
    const availableMin = Math.max(
      0,
      Math.round((endOfDay.getTime() - zoned.getTime()) / 60000)
    );

    if (remainingMin <= availableMin) {
      return addHours(cursor, remainingMin / 60);
    }
    remainingMin -= availableMin;
    // Move just past end-of-day so nextWorkingMoment lands on the next opening.
    cursor = nextWorkingMoment(addHours(fromZonedTime(endOfDay, wh.timezone), 0.01), wh);
  }
  return cursor;
}

/** When the client can realistically expect their quote. */
export function computeQuotedBy(now: Date, settings: Settings): Date {
  return addWorkingHours(now, settings.quoteTurnaroundHours, settings.workingHours);
}

/** VA submission deadline = client deadline minus the QC buffer. */
export function computeVaDeadline(clientDeadlineUtc: Date, settings: Settings): Date {
  return addHours(clientDeadlineUtc, -settings.qcBufferHours);
}
