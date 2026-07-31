"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * The one public exam question, playable without an account.
 *
 * It used to render with the correct answer already marked. That proved the
 * test was real but asked nothing of the reader — and a marked answer is
 * read, not thought about. Now the reader has to commit to one, which is the
 * only way a stranger finds out whether they'd pass.
 *
 * NOTHING IS WITHHELD ON A WRONG ANSWER. A miss marks that option and
 * invites the reader to take the free course, but every other option stays
 * live, so anyone stubborn enough can still reach the right answer and its
 * explanation without an account. That keeps the chapter's original promise
 * ("here is our real test, unedited") intact — the account is an offer, not
 * a paywall in front of the answer.
 *
 * COLOUR NOTE — deliberate exception to the page's colour law. Elsewhere on
 * this page green means MONEY (a payout) and nothing else; see the note in
 * src/lib/status.ts. A graded answer is not money, and green-for-correct is
 * a convention strong enough that anything else reads as a bug. The green
 * used here is the same token as the payout green rather than a second
 * green, so the palette does not grow a near-duplicate.
 */
export type SampleExamUiCopy = {
  pickOne: string;
  notThatOne: string;
  keepGoingPrefix: string;
  freeWithAccount: string;
  correct: string;
};

export function SampleExam({
  prompt,
  options,
  correct,
  explain,
  ui,
  applyHref = "/register/va",
}: {
  prompt: string;
  options: string[];
  correct: number;
  explain: string;
  ui: SampleExamUiCopy;
  applyHref?: string;
}) {
  const [wrong, setWrong] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);

  function pick(i: number) {
    if (solved) return;
    if (i === correct) {
      setSolved(true);
      return;
    }
    setWrong((w) => (w.includes(i) ? w : [...w, i]));
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-5">
      <p className="max-w-[58ch] text-[15px] leading-[1.55] text-[#14161A] sm:text-[16px]">{prompt}</p>

      <ol className="mt-4 grid gap-1.5">
        {options.map((opt, i) => {
          const isRight = solved && i === correct;
          const isWrong = wrong.includes(i);
          const shell = isRight
            ? "border-[#1E7F5C]/40 bg-[#1E7F5C]/10"
            : isWrong
              ? "border-[#A82318]/35 bg-[#A82318]/[0.06]"
              : "border-transparent hover:border-[#14161A]/15 hover:bg-[#F7F6F3]";
          const badge = isRight
            ? "rounded-[5px] bg-[#166049] text-[#F7F6F3]"
            : isWrong
              ? "rounded-full bg-[#A82318]/10 text-[#8C2F23]"
              : "rounded-full border border-[#14161A]/20 text-[#5B6069]";

          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => pick(i)}
                disabled={solved}
                aria-pressed={isRight || isWrong}
                className={`srow flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] disabled:cursor-default ${shell}`}
              >
                <span
                  aria-hidden
                  className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center font-mono text-[11px] font-medium ${badge}`}
                >
                  {isRight ? "✓" : isWrong ? "✕" : "ABCD"[i]}
                </span>
                <span
                  className={`min-w-0 pt-0.5 text-[14px] leading-[1.45] sm:text-[15px] ${
                    isRight ? "font-medium text-[#14161A]" : isWrong ? "text-[#5B6069]" : "text-[#14161A]"
                  }`}
                >
                  {opt}
                </span>
                {isRight ? (
                  <span
                    aria-hidden
                    className="stamp-in ml-auto shrink-0 pt-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#166049]"
                  >
                    {ui.correct}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>

      {/* One live region for both outcomes, so a screen reader announces the
          result of a tap without the focus moving anywhere. */}
      <div role="status" aria-live="polite" className="mt-3.5">
        {solved ? (
          <p className="border-l-2 border-[#166049]/40 pl-3 font-mono text-[12px] leading-[1.55] text-[#5B6069]">
            <b className="font-semibold tracking-[0.08em] text-[#166049]">{ui.correct}</b> · {explain}
          </p>
        ) : wrong.length > 0 ? (
          <p className="border-l-2 border-[#A82318]/30 pl-3 text-[13px] leading-[1.55] text-[#5B6069]">
            <b className="font-medium text-[#8C2F23]">{ui.notThatOne}</b> {ui.keepGoingPrefix}{" "}
            <Link
              href={applyHref}
              className="font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-[3px] transition-colors hover:decoration-[#14161A]"
            >
              {ui.freeWithAccount}
            </Link>
            .
          </p>
        ) : (
          <p className="pl-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[#8A9099]">
            {ui.pickOne}
          </p>
        )}
      </div>
    </div>
  );
}
