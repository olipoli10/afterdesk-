"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendIntakeTurn } from "@/server/actions/intake";
import { submitTask } from "@/server/actions/client-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import type { IntakeDraft } from "@/lib/ai";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Card,
  CardBody,
  Field,
  SectionLabel,
  inputClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string };

// The chat speaks as "we" — it is AfterDesk talking, never an "assistant".
const OPENER =
  "Tell us what you need done — in your own words, however messy. We'll ask a couple of questions if anything's unclear, then write it up for you.";

export function TaskChat({
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
}: {
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", content: OPENER }]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [thinking, startThinking] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const paneRef = useRef<HTMLDivElement>(null);
  // On touch/small screens Enter must make a newline (virtual keyboards have
  // no Shift+Enter); only a fine pointer gets Enter-to-send.
  const desktop = useMediaQuery("(hover: hover) and (pointer: fine)");

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    // Scroll the transcript pane only — never yank the whole document.
    const pane = paneRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [turns, draft, thinking]);

  function send() {
    const text = input.trim();
    if (!text || thinking) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError(null);

    startThinking(async () => {
      // The opener is ours, not the model's — don't replay it as context.
      const result = await sendIntakeTurn(next.slice(1));
      if (!result.ok) {
        setError(result.error);
        // Put the message back so it is never lost, and drop the turn that
        // was never answered — the transcript must stay strictly alternating.
        setTurns(next.slice(0, -1));
        setInput(text);
        if (result.kind === "unavailable" || result.kind === "limit") setFellBack(true);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: result.reply }]);
      // Always reconcile: a draft from an earlier turn must not survive a
      // conversation that has moved on.
      setDraft(result.ready && result.draft ? result.draft : null);
    });
  }

  function submit() {
    if (!draft) return;
    setError(null);
    startSubmit(async () => {
      const result = await submitTask({
        title: draft.title,
        description: draft.description,
        quantity: draft.quantity || undefined,
        deadlineLocal: deadlineLocal || undefined,
        timezone,
        fileIds: files.map((f) => f.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/client/tasks/${result.taskId}`);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div
          ref={paneRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="max-h-[min(420px,55dvh)] space-y-4 overflow-y-auto p-4 sm:p-5"
        >
          {turns.map((t, i) => (
            <div
              key={i}
              className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  t.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[#14161A] px-4 py-2.5 text-sm leading-relaxed text-[#F7F6F3]"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm bg-[#14161A]/[0.05] px-4 py-2.5 text-sm leading-relaxed text-[#14161A]"
                }
              >
                <span className="sr-only">
                  {t.role === "user" ? "You: " : "AfterDesk: "}
                </span>
                {t.content}
              </div>
            </div>
          ))}
          {thinking ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-[#14161A]/[0.05] px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-[#5B6069] motion-safe:animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                  <span className="sr-only">Writing a reply…</span>
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#14161A]/10 p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              className={`${inputClass} resize-none`}
              aria-label="Describe your task"
              placeholder="e.g. I need our supplier list rebuilt from 40 PDF invoices…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Ctrl/Cmd+Enter always sends; bare Enter sends only with a
                // fine pointer — on touch keyboards it makes a newline.
                if (e.ctrlKey || e.metaKey || (desktop && !e.shiftKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              onClick={send}
              disabled={thinking || input.trim().length === 0}
              className={buttonPrimary}
            >
              Send
            </button>
          </div>
          {desktop ? (
            <p className="mt-1.5 text-xs text-[#5B6069]">
              Enter to send · Shift+Enter for a new line
            </p>
          ) : null}
        </div>
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-[#A23B2E]/40 bg-[#A23B2E]/10 px-4 py-3"
        >
          <p className="text-sm text-[#8C2F23]">{error}</p>
          {fellBack ? (
            <Link
              href="/client/tasks/new?mode=form"
              className="mt-1.5 inline-block text-sm font-medium text-[#8C2F23] underline decoration-[#8C2F23]/40 underline-offset-2 transition-colors duration-150 hover:decoration-[#8C2F23]"
            >
              Write the task out myself
            </Link>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <Card className="border-[#14161A]/20">
          <CardBody>
            <SectionLabel as="h2">Your brief — edit anything before sending</SectionLabel>
            <div className="mt-4 space-y-4">
              <Field label="Title">
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </Field>
              <Field label="The task">
                <textarea
                  rows={7}
                  className={inputClass}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity / volume">
                  <input
                    className={inputClass}
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                </Field>
                <Field
                  label="Deadline"
                  hint={
                    draft.deadlineHint
                      ? `You said: “${draft.deadlineHint}” — set the exact time (${timezone}).`
                      : `Optional. Your local time (${timezone}).`
                  }
                >
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={deadlineLocal}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Files"
                hint="Anything the task works on — an export, a list, documents."
                group
              >
                <FileUpload
                  maxFileSizeMB={maxFileSizeMB}
                  maxFiles={maxFiles}
                  allowedExtensions={allowedExtensions}
                  files={files}
                  onChange={setFiles}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3 border-t border-[#14161A]/[0.06] pt-4">
                <button onClick={submit} disabled={submitting} className={buttonPrimary}>
                  {submitting ? "Sending…" : "Send this task"}
                </button>
                <button onClick={() => setDraft(null)} className={buttonSecondary}>
                  Keep talking
                </button>
                <span className="text-xs text-[#5B6069]">
                  You&apos;ll get one fixed price to approve — nothing starts before you do.
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
