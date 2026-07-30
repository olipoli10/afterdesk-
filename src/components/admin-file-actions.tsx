"use client";

import { useState, useTransition } from "react";
import { recheckFile } from "@/server/actions/admin-files";

export function RecheckFileButton({ fileId }: { fileId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="min-h-11 rounded-md border border-black/15 px-3 text-xs font-medium text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const result = await recheckFile(fileId);
            setError(result.ok ? null : result.error);
            if (result.ok) window.location.reload();
          })
        }
      >
        {pending ? "Checking…" : "Recheck"}
      </button>
      {error ? <span role="alert" className="max-w-48 text-xs text-[#8C2F23]">{error}</span> : null}
    </span>
  );
}
