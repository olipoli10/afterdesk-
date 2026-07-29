"use client";

import { useEffect, useState } from "react";

/**
 * Every timestamp in the UI goes through this component: rendered in the
 * viewer's own timezone (or an explicit one), always with the timezone label.
 * Never a bare time.
 */
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
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    const fmt = new Intl.DateTimeFormat(undefined, {
      dateStyle,
      timeStyle: "short",
      timeZone,
    });
    const tzFmt = new Intl.DateTimeFormat(undefined, {
      timeZone,
      timeZoneName: "short",
    });
    const tzName =
      tzFmt.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
    setText(`${fmt.format(d)} ${tzName}`);
  }, [iso, timeZone, dateStyle]);

  // Avoid hydration mismatch: server can't know the viewer's timezone.
  return <span suppressHydrationWarning>{text ?? "…"}</span>;
}
