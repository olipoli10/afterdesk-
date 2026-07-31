"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitExam, type ExamResult } from "@/server/actions/academy";
import type { PublicQuestion } from "@/lib/academy/types";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

/**
 * The exam sheet. Receives ONLY the public projection of each question —
 * the answer key never leaves the server (grading happens in the action).
 *
 * One long form on purpose: a 12-question exam is a sitting, not a wizard.
 * Unanswered questions are surfaced on submit rather than blocking radios.
 */
export function ExamForm({
  slug,
  courseTitle,
  questions,
  attemptsLeftToday,
  attemptNo,
  familyHue,
}: {
  slug: string;
  courseTitle: string;
  questions: PublicQuestion[];
  attemptsLeftToday: number;
  /** Pins the per-attempt scramble the server rendered this sheet with. */
  attemptNo: number;
  familyHue: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [missing, setMissing] = useState<number[]>([]);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [isPending, start] = useTransition();

  function submit() {
    const blank = answers.flatMap((a, i) => (a === null ? [i] : []));
    if (blank.length > 0) {
      setMissing(blank);
      document
        .getElementById(`exam-q-${blank[0]}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setMissing([]);
    start(async () => {
      const r = await submitExam({ slug, answers: answers as number[], attemptNo });
      setResult(r);
      if (r.ok) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="space-y-4">
        {result.passed ? (
          <div className="rounded-[4px] bg-[#1B2740] px-5 py-5 text-white">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9AA9C4]">
              Result
            </p>
            <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em]">
              Passed: {result.score}/{result.total}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#C9D2E3]">
              You are now certified in {courseTitle}. The certificate is on your profile —
              it stays yours, no matter what.
            </p>
          </div>
        ) : (
          <div className="rounded-[4px] border border-[#14161A]/15 bg-white px-5 py-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B6069]">
              Result
            </p>
            <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em] text-[#14161A]">
              {result.score}/{result.total}, not this time
            </p>
            {/* No per-question breakdown on a failure, on purpose: naming the
                missed questions would let three attempts solve the whole exam
                by elimination. The score is the signal; the lessons are the
                remedy. */}
            <p className="mt-2 text-sm leading-relaxed text-[#5B6069]">
              Passing is 10 of 12. We don&apos;t say which ones you missed, that would give
              the exam away, but the lessons cover all of them.{" "}
              {result.attemptsLeftToday > 0
                ? `${result.attemptsLeftToday} attempt${result.attemptsLeftToday === 1 ? "" : "s"} left today.`
                : "The exam reopens tomorrow — that pause is part of the design."}
            </p>
          </div>
        )}

        {result.passed && result.corrections && result.corrections.length > 0 ? (
          <div className="rounded-[4px] border border-[#E4E2DC] bg-white px-5 py-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5B6069]">
              The ones you missed
            </p>
            <ul className="mt-2 space-y-3">
              {result.corrections.map((c) => (
                <li key={c.prompt} className="text-sm leading-relaxed">
                  <span className="font-semibold text-[#14161A]">
                    {c.prompt}: {c.correctText}
                  </span>
                  <span className="block text-[#5B6069]">{c.explain}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link href={`/va/training/${slug}`} className={buttonPrimary}>
            Back to the course
          </Link>
          {!result.passed && result.attemptsLeftToday > 0 ? (
            <button
              className={buttonSecondary}
              onClick={() => {
                // A new attempt is a NEW paper — the scramble is keyed on the
                // attempt number, so the sheet must be re-fetched, not reused.
                window.location.reload();
              }}
            >
              Try again
            </button>
          ) : null}
          <Link href="/va/training" className={buttonSecondary}>
            All courses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ol className="space-y-4">
        {questions.map((q, qi) => (
          <li
            key={qi}
            id={`exam-q-${qi}`}
            className={`rounded-[4px] border bg-white px-4 py-4 ${
              missing.includes(qi) ? "border-[#A82318]" : "border-[#E4E2DC]"
            }`}
          >
            <fieldset>
              <legend className="text-sm font-semibold leading-relaxed text-[#14161A]">
                <span className="mr-2 font-mono text-[13px] font-bold" style={{ color: familyHue }}>
                  {String(qi + 1).padStart(2, "0")}
                </span>
                {q.prompt}
              </legend>
              <div className="mt-3 space-y-1">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[3px] px-2 py-2 text-sm leading-relaxed text-[#14161A] transition-colors duration-150 hover:bg-[#14161A]/[0.03]"
                  >
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#14161A]"
                      checked={answers[qi] === oi}
                      onChange={() =>
                        setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))
                      }
                    />
                    {opt}
                  </label>
                ))}
              </div>
              {missing.includes(qi) ? (
                <p role="alert" className="mt-1.5 text-xs font-medium text-[#8C2F23]">
                  Answer this one.
                </p>
              ) : null}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className={buttonPrimary} disabled={isPending} onClick={submit}>
          {isPending ? "Grading…" : "Submit answers"}
        </button>
        <span className="text-xs leading-relaxed text-[#5B6069]">
          Pass at 10/12 · {attemptsLeftToday} attempt{attemptsLeftToday === 1 ? "" : "s"} left
          today
        </span>
      </div>
      {result && !result.ok ? (
        <p role="alert" className="mt-3 text-sm text-[#8C2F23]">
          {result.error}
        </p>
      ) : null}
    </div>
  );
}
