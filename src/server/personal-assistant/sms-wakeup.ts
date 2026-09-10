/** Best-effort wakeup only: the persisted inbox, never this callback, owns work. */
export function schedulePersonalSmsWakeup(
  receipt: Readonly<{ replayed: boolean }>,
  deps: Readonly<{
    enabled: boolean;
    deadlineAt: number;
    now: () => number;
    schedule: (callback: () => Promise<void>) => void;
    run: (deadlineAt: number) => Promise<unknown>;
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
      try { await deps.run(deps.deadlineAt); }
      catch { /* Authenticated recovery can inspect the durable inbox. No retry here. */ }
    });
    return "SCHEDULED";
  } catch {
    // The receipt has already committed. Do not turn scheduling failure into a
    // misleading ingress failure or automatically replay a provider operation.
    return "SCHEDULER_UNAVAILABLE";
  }
}
