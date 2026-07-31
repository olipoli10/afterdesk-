"use client";

import { useSyncExternalStore } from "react";

/**
 * Every timestamp in the UI goes through this component: rendered in the
 * viewer's own timezone (or an explicit one), always with the timezone label.
 * Never a bare time.
 *
 * Timestamps are structural strings → mono, as a real <time> element.
 * The server render uses UTC (the only zone it can know); the client's first
 * render replaces it with the local zone via useSyncExternalStore's server/
 * client snapshot split — one correction, no "…" placeholder, no CLS.
 */
const subscribe = () => () => {};

function format(iso: string | Date, dateStyle: "medium" | "short", timeZone?: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle, timeStyle: "short", timeZone });
  const tzFmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" });
  const tzName = tzFmt.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${fmt.format(d)} ${tzName}`;
}

export function LocalTime({
  iso,
  timeZone,
  dateStyle = "medium",
}: {
  iso: string | Date;
  /** Explicit zone override (e.g. "Asia/Manila" to show PH time to the admin). */
  timeZone?: string;
  dateStyle?: "medium" | "short";
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(iso, dateStyle, timeZone),
    () => format(iso, dateStyle, timeZone ?? "UTC")
  );
  const dateTime = typeof iso === "string" ? iso : iso.toISOString();

  return (
    <time dateTime={dateTime} suppressHydrationWarning className="font-mono tabular-nums">
      {text}
    </time>
  );
}
