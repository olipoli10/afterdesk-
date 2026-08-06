"use client";

import { useEffect, useState, useTransition } from "react";
import {
  finishReviewerSession,
  finishWorkerSession,
  pauseReviewerSession,
  pauseWorkerSession,
  resumeReviewerSession,
  resumeWorkerSession,
  startReviewerSession,
  startWorkerSession,
} from "@/server/actions/work-sessions";

/**
 * THE VISIBLE TIMER — the whole measurement surface. Four explicit verbs,
 * server timestamps, and the user always sees whether their clock is
 * running. Nothing else is collected: no keystrokes, no focus, no activity
 * of any kind, and the component carries no cost, price or margin.
 *
 * The ticking display is cosmetic (local), the truth is server-side: on
 * every action the server returns the authoritative accumulated seconds and
 * the display re-anchors to it.
 */

export type TimerSession = {
  id: string;
  status: "active" | "paused" | "completed" | "abandoned";
  accumulatedSeconds: number;
  /** ISO — serialized by the server component. */
  lastResumedAt: string | null;
};

const ACTIONS = {
  worker: {
    start: startWorkerSession,
    pause: pauseWorkerSession,
    resume: resumeWorkerSession,
    finish: finishWorkerSession,
  },
  reviewer: {
    start: startReviewerSession,
    pause: pauseReviewerSession,
    resume: resumeReviewerSession,
    finish: finishReviewerSession,
  },
} as const;

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function liveSeconds(session: TimerSession | null, now: number): number {
  if (!session) return 0;
  if (session.status !== "active" || !session.lastResumedAt) return session.accumulatedSeconds;
  return (
    session.accumulatedSeconds +
    Math.max(0, Math.floor((now - new Date(session.lastResumedAt).getTime()) / 1000))
  );
}

export function WorkSessionTimer({
  taskId,
  scope,
  initialSession,
  night = false,
}: {
  taskId: string;
  scope: "worker" | "reviewer";
  initialSession: TimerSession | null;
  night?: boolean;
}) {
  const [session, setSession] = useState<TimerSession | null>(initialSession);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const running = session?.status === "active";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const act = (verb: keyof (typeof ACTIONS)["worker"]) =>
    start(async () => {
      setError(null);
      const result = await ACTIONS[scope][verb](taskId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSession(
        result.session
          ? {
              id: result.session.id,
              status: result.session.status,
              accumulatedSeconds: result.session.accumulatedSeconds,
              lastResumedAt: result.session.lastResumedAt
                ? new Date(result.session.lastResumedAt).toISOString()
                : null,
            }
          : null
      );
      setNow(Date.now());
    });

  const text = night ? "text-[#F7F6F3]" : "text-[#14161A]";
  const sub = night ? "text-[#F7F6F3]/60" : "text-[#5B6069]";
  const btn = `min-h-9 rounded-md border px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${
    night
      ? "border-[#F7F6F3]/25 text-[#F7F6F3] hover:border-[#F7F6F3]/50"
      : "border-[#14161A]/20 text-[#14161A] hover:border-[#14161A]/40"
  }`;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[6px] border p-3 ${
        night ? "border-[#F7F6F3]/15" : "border-[#14161A]/10"
      }`}
    >
      <div>
        <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${sub}`}>
          {scope === "worker" ? "Your work timer" : "Review timer"}
        </p>
        <p className={`font-mono text-xl tabular-nums ${text}`} aria-live="off">
          {fmt(liveSeconds(session, now))}
          {running ? (
            <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#1E7F5C] align-middle" aria-label="running" />
          ) : null}
        </p>
      </div>
      <span className="flex-1" />
      {!session ? (
        <button className={btn} disabled={isPending} onClick={() => act("start")}>
          Start
        </button>
      ) : session.status === "active" ? (
        <>
          <button className={btn} disabled={isPending} onClick={() => act("pause")}>
            Pause
          </button>
          <button className={btn} disabled={isPending} onClick={() => act("finish")}>
            Finish
          </button>
        </>
      ) : session.status === "paused" ? (
        <>
          <button className={btn} disabled={isPending} onClick={() => act("resume")}>
            Resume
          </button>
          <button className={btn} disabled={isPending} onClick={() => act("finish")}>
            Finish
          </button>
        </>
      ) : (
        <button className={btn} disabled={isPending} onClick={() => act("start")}>
          Start again
        </button>
      )}
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
      <p className={`w-full text-xs leading-snug ${sub}`}>
        Only these buttons are recorded — start, pause, finish. Nothing else is tracked.
      </p>
    </div>
  );
}
