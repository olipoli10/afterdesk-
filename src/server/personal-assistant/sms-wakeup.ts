/** Best-effort wakeup only: the persisted inbox, never this callback, owns work. */
export function schedulePersonalSmsWakeup(
  receipt: Readonly<{ replayed: boolean }>,
  deps: Readonly<{
    enabled: boolean;
    deadlineAt: number;
    now: () => number;
    schedule: (callback: () => Promise<void>) => void;
    run: (deadlineAt: number) => Promise<unknown>;
    observe?: (event: Readonly<{ event: string; processed?: number; deadlineReached?: boolean; outboundFailures?: string[] }>) => void;
  }>,
): "DISABLED" | "REPLAY" | "DEADLINE_EXPIRED" | "SCHEDULED" | "SCHEDULER_UNAVAILABLE" {
  if (!deps.enabled) return "DISABLED";
  if (receipt.replayed) return "REPLAY";
  if (!Number.isFinite(deps.deadlineAt) || deps.now() >= deps.deadlineAt) return "DEADLINE_EXPIRED";
  let started = false;
  try {
    deps.schedule(async () => {
      if (started) return;
      started = true;
      if (deps.now() >= deps.deadlineAt) return;
      const observe = (event: Parameters<NonNullable<typeof deps.observe>>[0]) => {
        try { deps.observe?.(event); } catch { /* Logging is never action authority. */ }
      };
      try {
        const result = await deps.run(deps.deadlineAt);
        const row = result && typeof result === "object" ? result as Record<string, unknown> : {};
        observe({ event: "personal_sms.drain_finished",
          processed: Number.isSafeInteger(row.processed) && Number(row.processed) >= 0 ? Number(row.processed) : 0,
          deadlineReached: row.deadlineReached === true,
          outboundFailures: Array.isArray(row.outboundFailures)
            ? row.outboundFailures.slice(0, 10).map(code => typeof code === "string" && /^(?:SELECTOR:)?[A-Z_]{1,100}$/u.test(code) ? code : "UNCLASSIFIED") : [] });
      } catch { observe({ event: "personal_sms.drain_failed" }); /* No retry of uncertain effects. */ }
    });
    return "SCHEDULED";
  } catch {
    // The receipt has already committed. Do not turn scheduling failure into a
    // misleading ingress failure or automatically replay a provider operation.
    return "SCHEDULER_UNAVAILABLE";
  }
}
