"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendIntakeTurn } from "@/server/actions/intake";
import { submitTask } from "@/server/actions/client-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import { A2PortalPresence } from "@/components/a2-portal-presence";
import type { IntakeDraft } from "@/lib/ai";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  CLIENT_PORTAL_I18N,
  type ClientPortalIntakeCopy,
} from "@/lib/i18n/client-portal";
import {
  Card,
  CardBody,
  Field,
  SectionLabel,
  inputClass,
  inputClassNight,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string };

export function TaskChat({
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
  copy = CLIENT_PORTAL_I18N.en.intake,
}: {
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
  copy?: ClientPortalIntakeCopy;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", content: copy.opener },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [thinking, startThinking] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const paneRef = useRef<HTMLDivElement>(null);
  // On touch/small screens Enter must make a newline; only a fine pointer
  // gets bare Enter-to-send.
  const desktop = useMediaQuery("(hover: hover) and (pointer: fine)");

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
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
      // The local opener is presentation, not model context. A2 structures the brief;
      // the authenticated intake action remains the only real conversation boundary.
      const result = await sendIntakeTurn(next.slice(1));
      if (!result.ok) {
        setError(result.error);
        setTurns(next.slice(0, -1));
        setInput(text);
        if (result.kind === "unavailable" || result.kind === "limit") setFellBack(true);
        return;
      }
      setTurns((current) => [
        ...current,
        { role: "assistant", content: result.reply },
      ]);
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
        fileIds: files.map((file) => file.id),
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
      <section
        data-a2-thinking-box=""
        aria-labelledby="a2-intake-title"
        className="overflow-hidden rounded-[14px] border border-[#4A3A26] bg-[linear-gradient(145deg,#15171C,#0E1014_72%)] shadow-[inset_0_1px_0_rgba(226,196,134,0.08),0_28px_70px_-38px_rgba(0,0,0,0.95)]"
      >
        <header className="grid gap-4 border-b border-white/[0.08] p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5">
          <A2PortalPresence label={copy.a2Label} />
          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="a2-intake-title" className="text-[18px] font-semibold tracking-[-0.02em] text-[#F7F6F3]">
                {copy.a2Label}
              </h2>
              <span className="rounded-[3px] border border-[#6F4C29] bg-[#1B1510] px-2 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-[#E2C486]">
                {copy.a2Status}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8F97A3]">
              {copy.approvalNote}
            </p>
          </div>
        </header>

        <div
          ref={paneRef}
          role="log"
          aria-live="polite"
          aria-label={copy.conversation}
          className="max-h-[min(480px,54dvh)] space-y-3 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
        >
          {turns.map((turn, index) => (
            <div
              key={index}
              className={
                turn.role === "user"
                  ? "ml-auto max-w-[88%] rounded-[7px] border border-white/[0.13] bg-white/[0.07] px-4 py-3 text-[14px] leading-relaxed text-[#F7F6F3] sm:max-w-[76%]"
                  : "max-w-3xl border-l-2 border-[#D87526] bg-[#D87526]/[0.045] px-4 py-3 text-[14px] leading-relaxed text-[#D7DBE1]"
              }
            >
              <span className="sr-only">
                {turn.role === "user" ? "You: " : `${copy.a2Label}: `}
              </span>
              {turn.content}
            </div>
          ))}
          {thinking ? (
            <div className="max-w-3xl border-l-2 border-[#D87526] bg-[#D87526]/[0.045] px-4 py-3">
              <span className="flex items-center gap-2 text-[13px] text-[#A1A8B3]">
                <span aria-hidden className="flex gap-1">
                  {[0, 1, 2].map((index) => (
                    <span
                      key={index}
                      className="h-1.5 w-1.5 rounded-full bg-[#D87526] motion-safe:animate-pulse"
                      style={{ animationDelay: `${index * 160}ms` }}
                    />
                  ))}
                </span>
                {copy.writing}
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/[0.08] bg-black/10 p-3 sm:p-4">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <textarea
              rows={3}
              className={`${inputClassNight} min-h-[92px] resize-y`}
              aria-label={copy.inputLabel}
              placeholder={copy.placeholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (event.ctrlKey || event.metaKey || (desktop && !event.shiftKey)) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={thinking || input.trim().length === 0}
              className="inline-flex min-h-12 items-center justify-center rounded-[7px] bg-[#C9A76A] px-5 text-[14px] font-semibold text-[#14161A] transition-colors hover:bg-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1014] disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-28"
            >
              {thinking ? copy.sendingReply : copy.send}
            </button>
          </div>
          {desktop ? (
            <p className="mt-2 text-[12px] text-[#78808B]">{copy.keyboard}</p>
          ) : null}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-[8px] border border-[#FF9A8B]/30 bg-[#A23B2E]/15 px-4 py-3"
        >
          <p className="text-sm text-[#FFB1A5]">{error}</p>
          {fellBack ? (
            <Link
              href="/client/tasks/new?mode=form"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[#F7C1B8] underline decoration-[#F7C1B8]/40 underline-offset-2"
            >
              {copy.fallback}
            </Link>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <Card className="border-[#C9A76A]/30 bg-[#F7F6F3] shadow-[0_24px_60px_-40px_rgba(0,0,0,0.95)]">
          <CardBody className="sm:p-6">
            <SectionLabel as="h2">{copy.briefHeading}</SectionLabel>
            <div className="mt-4 space-y-4">
              <Field label={copy.titleLabel}>
                <input
                  className={inputClass}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </Field>
              <Field label={copy.descriptionLabel}>
                <textarea
                  rows={7}
                  className={inputClass}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={copy.quantityLabel}>
                  <input
                    className={inputClass}
                    value={draft.quantity}
                    onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                  />
                </Field>
                <Field
                  label={copy.deadlineLabel}
                  hint={
                    draft.deadlineHint
                      ? copy.deadlineSaid.replace("{hint}", `“${draft.deadlineHint}”`).replace("{timezone}", timezone)
                      : copy.deadlineOptional.replace("{timezone}", timezone)
                  }
                >
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={deadlineLocal}
                    onChange={(event) => setDeadlineLocal(event.target.value)}
                  />
                </Field>
              </div>
              <Field label={copy.filesLabel} hint={copy.filesHint} group>
                <FileUpload
                  maxFileSizeMB={maxFileSizeMB}
                  maxFiles={maxFiles}
                  allowedExtensions={allowedExtensions}
                  files={files}
                  onChange={setFiles}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3 border-t border-[#14161A]/[0.08] pt-4">
                <button type="button" onClick={submit} disabled={submitting} className={buttonPrimary}>
                  {submitting ? copy.submitting : copy.submit}
                </button>
                <button type="button" onClick={() => setDraft(null)} className={buttonSecondary}>
                  {copy.keepTalking}
                </button>
                <span className="max-w-md text-xs leading-relaxed text-[#5B6069]">
                  {copy.approvalNote}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
