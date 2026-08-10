import type { ReactNode } from "react";
import { publicStats } from "@/lib/queries/public-stats";
import { RollingNumber } from "@/components/rolling-number";

function bucketDollars(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}+`;
}

function bucketHours(minutes: number): string {
  return `${Math.floor(minutes / 60).toLocaleString("en-US")}+`;
}

/**
 * The public counters — real DB aggregates (see public-stats.ts for the
 * RULE 2 boundary and the money-withholding rules).
 *
 * The two sides read DIFFERENT cells of the same ledger, and deliberately: the
 * worker side gets the headcount and the payout total, the client side gets
 * tasks delivered plus time and money saved. Each figure is the proof that
 * side is actually shopping for, and neither has any business seeing the
 * other's. What both sides always share is `tasksDelivered`, which is the one
 * number that means the same thing to everyone.
 *
 * Render guard: a thin ledger is worse than no ledger — nothing renders below
 * ten delivered tasks. The money cell renders only once the ledger is deep
 * enough that no individual payout is derivable from it.
 *
 * The five-approved-workers half of that guard applies ONLY to the side that
 * shows a headcount. Gating the client strip on it would suppress the client's
 * proof over a number the client is deliberately not allowed to see: five
 * hundred delivered tasks and four approved workers would render nothing at
 * all, for a reason no reader of that page could ever discover.
 *
 * Green-on-night rule: #1E7F5C text never sits directly on a night surface —
 * on `night` tone the money figure is paper text with a green underline.
 */
export async function PublicCounters({
  tone,
  variant,
  copy,
  className = "",
}: {
  tone: "night" | "paper";
  variant: "strip" | "line";
  copy: {
    taskWord: [string, string];
    /**
     * WORKER SIDE ONLY, both of them.
     *
     * A headcount and a payout total are the proof that matters to someone
     * deciding whether to work here. On the client side they are the wrong
     * ledger entirely: "47 specialists approved" answers a question the client
     * never asked and files the page as a marketplace of people, which is the
     * one reading the positioning cannot carry. AfterDesk sells a finished
     * outcome and owns how it gets made.
     *
     * Optional rather than blank strings, so the client dictionary simply does
     * not carry them and the cells cannot render with placeholder wording.
     */
    workerWord?: [string, string];
    released?: string;
    toDate: string;
    /** Client side only — TIME SAVED / MONEY SAVED cells replace `released`. */
    moneySaved?: { label: string; timeLabel: string; note: string };
  };
  className?: string;
}) {
  const stats = await publicStats();
  // Tiny seed numbers hurt trust and can expose individual activity. Publish
  // only once the ledger has enough real depth to be meaningful.
  if (stats.tasksDelivered < 10) return null;
  // The headcount depth rule guards the headcount, and nothing else: with four
  // approved workers the cell is withheld, not the whole strip.
  const showWorkforce = copy.workerWord && stats.approvedWorkers >= 5;

  const n = stats.tasksDelivered.toLocaleString("en-US");
  const w = stats.approvedWorkers.toLocaleString("en-US");
  const taskWord = copy.taskWord[stats.tasksDelivered === 1 ? 0 : 1];
  const workerWord = showWorkforce
    ? copy.workerWord![stats.approvedWorkers === 1 ? 0 : 1]
    : null;
  const released =
    stats.releasedBucketCents !== null ? bucketDollars(stats.releasedBucketCents) : null;
  // Client side only: MONEY SAVED / TIME SAVED replace the worker-payout
  // figure entirely (never both on the same page — see the copy.moneySaved
  // guard on the RULE 2 boundary in public-stats.ts's own doc comment).
  const showSavings = tone === "night" && copy.moneySaved;
  const moneySaved =
    showSavings && stats.moneySavedBucketCents !== null
      ? bucketDollars(stats.moneySavedBucketCents)
      : null;
  const timeSaved =
    showSavings && stats.timeSavedBucketMinutes !== null
      ? bucketHours(stats.timeSavedBucketMinutes)
      : null;

  if (variant === "line") {
    const moneyPart = showSavings
      ? moneySaved
        ? ` · ${moneySaved} ${copy.moneySaved!.label}`
        : ""
      : released && copy.released
        ? ` · ${released} ${copy.released}`
        : "";
    const workerPart = workerWord ? ` · ${w} ${workerWord}` : "";
    return (
      <p
        className={`border-t font-mono text-[12px] leading-relaxed ${
          tone === "night"
            ? "border-white/10 text-[#767C86]"
            : "border-black/8 text-[#5B6069]"
        } ${className}`}
      >
        {copy.toDate} {n} {taskWord}
        {moneyPart}
        {workerPart}
</p>
    );
  }

  const label = tone === "night" ? "text-[#767C86]" : "text-[#5B6069]";
  const value = tone === "night" ? "text-[#F7F6F3]" : "text-[#14161A]";
  const money =
    tone === "night"
      ? "text-[#F7F6F3] underline decoration-[#1E7F5C] decoration-2 underline-offset-4"
      : "text-[#1E7F5C]";
  const border = tone === "night" ? "border-white/[0.08]" : "border-[#14161A]/10";

  /* Evidence-layer motion: figures roll up once on entry, then hold. */
  const cells: { node: ReactNode; l: string; money?: boolean; title?: string }[] = [
    { node: <RollingNumber value={stats.tasksDelivered} />, l: taskWord },
    ...(showSavings
      ? [
          ...(timeSaved !== null
            ? [
                {
                  node: (
                    <RollingNumber value={Math.floor((stats.timeSavedBucketMinutes ?? 0) / 60)} suffix="+" />
                  ),
                  l: copy.moneySaved!.timeLabel,
                },
              ]
            : []),
          ...(moneySaved !== null
            ? [
                {
                  node: (
                    <RollingNumber
                      value={Math.floor((stats.moneySavedBucketCents ?? 0) / 100)}
                      prefix="$"
                      suffix="+"
                    />
                  ),
                  l: copy.moneySaved!.label,
                  money: true,
                  title: copy.moneySaved!.note,
                },
              ]
            : []),
        ]
      : stats.releasedBucketCents !== null && copy.released
        ? [
            {
              node: (
                <RollingNumber
                  value={Math.floor(stats.releasedBucketCents / 100)}
                  prefix="$"
                  suffix="+"
                />
              ),
              l: copy.released,
              money: true,
            },
          ]
        : []),
    ...(workerWord
      ? [{ node: <RollingNumber value={stats.approvedWorkers} />, l: workerWord }]
      : []),
  ];

  return (
    <div
      className={`flex flex-wrap items-baseline justify-center gap-x-10 gap-y-2 border-y py-3.5 font-mono ${border} ${className}`}
    >
      {cells.map((c) => (
        <span key={c.l} className="flex items-baseline gap-2.5" title={c.title}>
          <span className={`text-[15px] font-medium tabular-nums ${c.money ? money : value}`}>
            {c.node}
          </span>
          <span className={`text-[10px] uppercase tracking-[0.15em] sm:text-[11px] ${label}`}>
            {c.l}
          </span>
        </span>
      ))}
    </div>
  );
}
