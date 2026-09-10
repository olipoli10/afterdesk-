import { correlatedCalendarListDeadline, correlatedCalendarListFresh, parsePersonalCorrelatedCalendarList, type PersonalCorrelatedCalendarList } from "./personal-correlated-calendar-list";

export type CorrelatedListSnapshot = Readonly<
  { phase: "PAUSED" | "LOADING" | "DISABLED" | "UNAVAILABLE" | "EXPIRED"; data: null; readStartedAt: number }
  | { phase: "READY"; data: PersonalCorrelatedCalendarList; readStartedAt: number }
>;

/** One scope per instance. No writes, persistence, polling or automatic retry. */
export function createCorrelatedCalendarListLifecycle(input: {
  workspaceId: string; read: (signal: AbortSignal) => Promise<unknown>; isDisabled: (error: unknown) => boolean;
  now?: () => number;
}) {
  const workspaceId = input.workspaceId, read = input.read, isDisabled = input.isDisabled, now = input.now ?? Date.now;
  let active = false, generation = 0, controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: CorrelatedListSnapshot = Object.freeze({ phase: "PAUSED", data: null, readStartedAt: 0 });
  const listeners = new Set<() => void>();
  const publish = (next: CorrelatedListSnapshot) => { snapshot = Object.freeze(next); listeners.forEach(listener => listener()); };
  const cancel = () => { generation += 1; controller?.abort(); controller = null; if (timer !== null) clearTimeout(timer); timer = null; };
  async function reload() {
    if (!active) return;
    cancel(); const epoch = generation, started = now();
    const pending = new AbortController(); controller = pending;
    const current = () => active && epoch === generation && !pending.signal.aborted;
    publish({ phase: "LOADING", data: null, readStartedAt: started });
    if (!current()) return;
    if (!Number.isFinite(started)) { publish({ phase: "UNAVAILABLE", data: null, readStartedAt: started }); return; }
    try {
      const raw = await read(pending.signal);
      if (!current()) return;
      const data = parsePersonalCorrelatedCalendarList(raw, workspaceId);
      if (!current()) return;
      const finished = now();
      if (!correlatedCalendarListFresh(data, finished, started)) { publish({ phase: "EXPIRED", data: null, readStartedAt: started }); return; }
      if (data.reviews.length) {
        const delay = correlatedCalendarListDeadline(data, started) - finished;
        // A one-shot invalidation only: it never requests another read.
        timer = setTimeout(() => { if (current()) { cancel(); publish({ phase: "EXPIRED", data: null, readStartedAt: started }); } }, Math.min(delay, 2_147_483_647));
      }
      publish({ phase: "READY", data, readStartedAt: started });
    } catch (error) {
      if (current()) publish({ phase: isDisabled(error) ? "DISABLED" : "UNAVAILABLE", data: null, readStartedAt: started });
    }
  }
  return Object.freeze({
    getSnapshot: () => {
      // The external store owns its clock, not React render. Cache an invalidated
      // snapshot so repeated reads have stable identity and clock rollback cannot
      // resurrect the list. The one-shot timer still notifies subscribers.
      if (snapshot.phase === "READY" && !correlatedCalendarListFresh(snapshot.data, now(), snapshot.readStartedAt)) {
        snapshot = Object.freeze({ phase: "EXPIRED", data: null, readStartedAt: snapshot.readStartedAt });
      }
      return snapshot;
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload,
    activate() { if (!active) { active = true; void reload(); } },
    pause() { active = false; cancel(); publish({ phase: "PAUSED", data: null, readStartedAt: 0 }); },
  });
}
