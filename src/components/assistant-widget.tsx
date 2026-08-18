"use client";

import { useRef, useState, useTransition } from "react";
import { sendAssistantMessage } from "@/server/actions/va-assistant";
import { buttonSecondaryNight, inputClassNight } from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string; requiresHumanReview: boolean };

/**
 * Only ever mounted when task.status === "claimed" (the page checks this,
 * not the widget) — no greyed-out state, no "come back later" placeholder,
 * nothing hinting the assistant exists otherwise. See the doc comment on
 * sendAssistantMessage for why the real enforcement is server-side anyway;
 * this gate is about not advertising the feature, not about security.
 */
export function AssistantWidget({ taskId, initialHistory }: { taskId: string; initialHistory: Turn[] }) {
  const [turns, setTurns] = useState<Turn[]>(initialHistory);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  function send() {
    const text = message.trim();
    if (!text) return;
    setError(null);
    setMessage("");
    setTurns((t) => [...t, { role: "user", content: text, requiresHumanReview: false }]);
    start(async () => {
      const result = await sendAssistantMessage({ taskId, message: text });
      if (!result.ok) {
        setError(result.error);
        // Roll back the optimistic user bubble — it was never actually sent.
        setTurns((t) => t.slice(0, -1));
        return;
      }
      setTurns((t) => [
        ...t,
        { role: "assistant", content: result.answer, requiresHumanReview: result.requiresHumanReview },
      ]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  return (
    <div className="w-full rounded-lg border border-white/10 bg-[#111317] p-4">
      <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
        Endvera Assistant — method questions only
      </p>

      {turns.length > 0 ? (
        <div ref={listRef} className="mb-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-left text-[13px] leading-relaxed ${
                  t.role === "user" ? "bg-white/10 text-[#F7F6F3]" : "bg-white/[0.04] text-[#C9CDD3]"
                }`}
              >
                {t.content}
              </div>
              {t.role === "assistant" && t.requiresHumanReview ? (
                <p className="mt-1 text-[11px] font-medium text-[#FFCB7A]">
                  Unverified — confirm with an operator before relying on this.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-[13px] leading-relaxed text-[#8A9099]">
          Ask about method, format, or technique for this task — file formats, dedup approach, deliverable
          structure. Paste your own text if you want help on it; never a client name or contact detail. It
          doesn&apos;t know anything about this task beyond what you type here.
        </p>
      )}

      {error ? (
        <p role="alert" className="mb-2 text-sm text-[#FF9A8B]">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          className={`${inputClassNight} resize-none`}
          placeholder="How should I structure the output file…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={isPending}
        />
        <button className={buttonSecondaryNight} disabled={isPending || !message.trim()} onClick={send}>
          {isPending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
