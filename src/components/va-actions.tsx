"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { claimTask, releaseTask } from "@/server/actions/va-tasks";
import { buttonPrimaryNight, buttonSecondaryNight } from "@/components/ui";

/** The board tile's claim: dusk fill, mono uppercase — the tile's one accent. */
const buttonBoard =
  "inline-flex min-h-11 items-center justify-center rounded-[3px] bg-[#1B2740] px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition-colors duration-150 hover:bg-[#0A0B0D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B2740] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-not-allowed disabled:opacity-40";

/** Destructive action on the dark surface — same shape as buttonSecondaryNight
 *  (hairline border, transparent fill) with the danger red/FF9A8B pairing
 *  used for on-dark error text elsewhere (register-forms, deliverable-form). */
const buttonDangerNight =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-[#A23B2E]/40 bg-transparent px-4 py-2 text-sm font-medium text-[#FF9A8B] transition-colors duration-150 hover:bg-[#A23B2E]/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9A8B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-not-allowed disabled:opacity-40";

export function ClaimButton({
  taskId,
  variant = "primary",
  label = "Claim this task",
}: {
  taskId: string;
  /**
   * "board" is the pool tile (compact, dusk-filled, mono). "primary" is the
   * pre-claim detail page, where the claim is THE action on the screen.
   * "secondary" remains for calmer contexts.
   */
  variant?: "primary" | "secondary" | "board";
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const cls =
    variant === "board"
      ? buttonBoard
      : `${variant === "secondary" ? buttonSecondaryNight : buttonPrimaryNight} w-full sm:w-auto`;

  return (
    <div className={variant === "board" ? "" : "w-full"}>
      <button
        className={cls}
        disabled={isPending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await claimTask(taskId);
            if (!result.ok) {
              setError(result.error);
              router.refresh();
              return;
            }
            router.push(`/va/tasks/${taskId}`);
          })
        }
      >
        {isPending ? "Claiming…" : variant === "board" ? "Claim" : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#FF9A8B]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ReleaseButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // The trigger unmounts when the confirm block appears — without explicit
  // focus management, keyboard focus falls back to <body> mid-destructive-flow.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true;
      confirmRef.current?.focus();
    } else if (wasConfirming.current) {
      triggerRef.current?.focus();
    }
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        ref={triggerRef}
        className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
        onClick={() => setConfirming(true)}
      >
        Release this task
      </button>
    );
  }

  // Full-width block: at 360px the warning and both buttons need the whole
  // column, not the right-hand slot of a justify-between footer row.
  return (
    <div className="w-full rounded-lg border border-white/10 bg-[#111317] p-4">
      <p className="text-sm leading-relaxed text-[#8A9099]">
        This returns the task to the pool and is recorded on your record. You will
        lose access to the client&apos;s files.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#FF9A8B]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          ref={confirmRef}
          className={buttonDangerNight}
          disabled={isPending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await releaseTask(taskId);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push("/va");
            })
          }
        >
          {isPending ? "Releasing…" : "Yes, release it"}
        </button>
        <button
          className={buttonSecondaryNight}
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
