export type CalendarVerificationPresentation = "verified" | "proposed" | "rejected" | "unknown";

export type WorkspaceCalendarDay = {
  key: string;
  weekday: string;
  dayNumber: number;
};

function numericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error("MOBILE_CALENDAR_DATE_PART_MISSING");
  return Number(value);
}

export function upcomingWorkspaceDays(
  timezone: string,
  locale: string,
  now = new Date(),
  length = 5,
): WorkspaceCalendarDay[] {
  const workspaceParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(now);
  const year = numericPart(workspaceParts, "year");
  const month = numericPart(workspaceParts, "month");
  const day = numericPart(workspaceParts, "day");

  return Array.from({ length }, (_, index) => {
    // UTC is used only as a stable carrier for the workspace's local calendar date.
    const date = new Date(Date.UTC(year, month - 1, day + index, 12));
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).formatToParts(date);
    const nextYear = numericPart(parts, "year");
    const nextMonth = numericPart(parts, "month");
    const nextDay = numericPart(parts, "day");
    return {
      key: `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`,
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
        .format(date)
        .replace(".", ""),
      dayNumber: nextDay,
    };
  });
}

export function calendarVerificationPresentation(value: string): CalendarVerificationPresentation {
  if (value === "verified" || value === "proposed" || value === "rejected") return value;
  return "unknown";
}
