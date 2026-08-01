"use client";

import { useState, useTransition } from "react";
import { submitContextNoteDraft } from "@/server/actions/standing-capacity";
import { inputClass, buttonSecondaryNight } from "@/components/ui";

export function StandingContextNoteForm({ accountId }: { accountId: string }) {
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitContextNoteDraft({ accountId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setSent(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2.5">
      <textarea
        required
        minLength={1}
        maxLength={4000}
        rows={3}
        placeholder="Something the next specialist on this account should know…"
        className={inputClass}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-[#FF9A8B]">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-sm text-[#3DDCA0]">
          Sent to an operator for review — it will not appear here until published.
        </p>
      ) : null}
      <button type="submit" disabled={isPending} className={buttonSecondaryNight}>
        {isPending ? "Sending…" : "Send note to operator"}
      </button>
    </form>
  );
}
