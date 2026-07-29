"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { claimTask, releaseTask } from "@/server/actions/va-tasks";
import { buttonDanger, buttonSecondary, buttonPrimary } from "@/components/ui";

export function ClaimButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  return (
    <div className="w-full">
      <button
        className={`${buttonPrimary} min-h-11 w-full sm:min-h-0 sm:w-auto`}
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
        {isPending ? "Claiming…" : "Claim this task"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#8C2F23]">
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
        className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        onClick={() => setConfirming(true)}
      >
        Release this task
      </button>
    );
  }

  // Full-width block: at 360px the warning and both buttons need the whole
  // column, not the right-hand slot of a justify-between footer row.
  return (
    <div className="w-full rounded-lg border border-[#14161A]/10 bg-white p-4 shadow-[0_1px_2px_rgba(20,22,26,0.04)]">
      <p className="text-sm leading-relaxed text-[#5B6069]">
        This returns the task to the pool and is recorded on your record. You will
        lose access to the client&apos;s files.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          ref={confirmRef}
          className={`${buttonDanger} min-h-11 sm:min-h-0`}
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
          className={`${buttonSecondary} min-h-11 sm:min-h-0`}
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
