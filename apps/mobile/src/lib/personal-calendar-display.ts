import { z } from "zod";

const inputSchema = z.object({ startsAt: z.string().max(40), endsAt: z.string().max(40), timezone: z.string().min(1).max(100) }).strict();

/** Display only: never rewrites the stored draft, creates a request or authorizes an action. */
export type PersonalCalendarDisplay =
  | { readonly status: "UNAVAILABLE"; readonly readOnly: true }
  | { readonly status: "DISPLAYABLE"; readonly readOnly: true; readonly timezone: string; readonly canonicalTimezone: string;
      readonly start: CalendarDisplayBoundary; readonly end: CalendarDisplayBoundary };
type CalendarDisplayBoundary = { readonly raw: string; readonly localDate: string; readonly localTime: string; readonly utcOffset: string };
const unavailable = Object.freeze({ status: "UNAVAILABLE" as const, readOnly: true as const });

/** Hide zero-only precision in the main label; nonzero seconds/fractions remain visible. */
export function readableCalendarLocalTime(exact: string): string {
  return /^\d{2}:\d{2}:00\.000$/.test(exact) ? exact.slice(0, 5) : /^\d{2}:\d{2}:\d{2}\.000$/.test(exact) ? exact.slice(0, 8) : exact;
}

function parseInstant(raw: string): number | null {
  // No local-time strings, guessed timezone, Date.parse normalization or natural-language dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , offset] = match;
  if (+year < 1000 || +hour > 23 || +minute > 59 || +second > 59) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) return null;
  if (offset !== "Z" && (+offset.slice(1, 3) > 23 || +offset.slice(4) > 59 || offset === "-00:00")) return null;
  const instant = Date.parse(raw);
  return Number.isFinite(instant) ? instant : null;
}

function boundary(raw: string, instant: number, formatter: Intl.DateTimeFormat): CalendarDisplayBoundary | null {
  const parts = formatter.formatToParts(instant);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  const year = part("year"), month = part("month"), day = part("day"), hour = part("hour"), minute = part("minute"), second = part("second"), fraction = part("fractionalSecond");
  if (!year || !/^\d{4}$/.test(year) || ![month, day, hour, minute, second].every(value => value && /^\d{2}$/.test(value))
    || !fraction || !/^\d{3}$/.test(fraction) || Number(hour) > 23) return null;
  const localDate = `${year}-${month}-${day}`;
  const localTime = `${hour}:${minute}:${second}.${fraction}`;
  const offsetSeconds = (Date.parse(`${localDate}T${localTime}Z`) - instant) / 1000;
  if (!Number.isSafeInteger(offsetSeconds) || Math.abs(offsetSeconds) > 24 * 60 * 60) return null;
  const absolute = Math.abs(offsetSeconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  const utcOffset = `UTC${offsetSeconds < 0 ? "−" : "+"}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute / 60) % 60)}${absolute % 60 ? `:${pad(absolute % 60)}` : ""}`;
  return Object.freeze({ raw, localDate, localTime, utcOffset });
}

/** Exact instants are converted in the draft's named zone, never in the device's default zone. */
export function personalCalendarDisplay(raw: unknown): PersonalCalendarDisplay {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return unavailable;
  const { startsAt, endsAt, timezone } = parsed.data;
  const startInstant = parseInstant(startsAt), endInstant = parseInstant(endsAt);
  if (startInstant === null || endInstant === null || endInstant <= startInstant || timezone.trim() !== timezone) return unavailable;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
    const resolved = formatter.resolvedOptions();
    if (resolved.calendar !== "gregory" || resolved.numberingSystem !== "latn" || resolved.hourCycle !== "h23" || !resolved.timeZone) return unavailable;
    const start = boundary(startsAt, startInstant, formatter), end = boundary(endsAt, endInstant, formatter);
    if (!start || !end) return unavailable;
    return Object.freeze({ status: "DISPLAYABLE", readOnly: true, timezone, canonicalTimezone: resolved.timeZone, start, end });
  } catch { return unavailable; }
}
