"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markPatternResolved, reopenPattern } from "@/server/actions/admin-assistant";
import { buttonSecondary } from "@/components/ui";

export function AssistantPatternToggle({
  clusterKey,
  resolved,
}: {
  clusterKey: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <button
      className={buttonSecondary}
      disabled={isPending}
      onClick={() =>
        start(async () => {
          await (resolved ? reopenPattern({ clusterKey }) : markPatternResolved({ clusterKey }));
          router.refresh();
        })
      }
    >
      {isPending ? "…" : resolved ? "Reopen" : "Mark resolved"}
    </button>
  );
}
