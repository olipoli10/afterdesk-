"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendIntakeTurn } from "@/server/actions/intake";
import { submitTask } from "@/server/actions/client-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import type { IntakeDraft } from "@/lib/ai";
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

const OPENER =
  "Tell me what you need done — in your own words, however messy. I'll ask a couple of questions if anything's unclear, then write it up for you.";

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
  const [thinking, startThinking] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, draft]);

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
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: result.result.reply }]);
      if (result.result.ready && result.result.draft) setDraft(result.result.draft);
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
        <div className="max-h-[420px] space-y-4 overflow-y-auto p-4 sm:p-5">
          {turns.map((t, i) => (
            <div
              key={i}
              className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  t.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white"
                    : "max-w-[85%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2.5 text-sm leading-relaxed text-neutral-800"
                }
              >
                {t.content}
              </div>
            </div>
          ))}
          {thinking ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className="border-t border-neutral-200 p-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="e.g. I need our supplier list rebuilt from 40 PDF invoices…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
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
          <p className="mt-1.5 text-xs text-neutral-400">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {draft ? (
        <Card className="border-neutral-300">
          <CardBody>
            <SectionLabel>Your brief — edit anything before sending</SectionLabel>
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
              >
                <FileUpload
                  maxFileSizeMB={maxFileSizeMB}
                  maxFiles={maxFiles}
                  allowedExtensions={allowedExtensions}
                  files={files}
                  onChange={setFiles}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4">
                <button onClick={submit} disabled={submitting} className={buttonPrimary}>
                  {submitting ? "Sending…" : "Send this task"}
                </button>
                <button onClick={() => setDraft(null)} className={buttonSecondary}>
                  Keep talking
                </button>
                <span className="text-xs text-neutral-400">
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
