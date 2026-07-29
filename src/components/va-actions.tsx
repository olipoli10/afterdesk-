"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimTask, releaseTask } from "@/server/actions/va-tasks";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export function ClaimButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  return (
    <div className="w-full">
      <button
        className={`${buttonPrimary} w-full sm:w-auto`}
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
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function ReleaseButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        className="text-sm font-medium text-neutral-500 hover:text-red-600"
        onClick={() => setConfirming(true)}
      >
        Release this task
      </button>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm text-neutral-600">
        This returns the task to the pool and is recorded on your record. You will
        lose access to the client&apos;s files.
      </p>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonSecondary}
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
          className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => setConfirming(false)}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
