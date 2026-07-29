import { publicStats } from "@/lib/queries/public-stats";

function bucketDollars(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}+`;
}

/**
 * The public counters — real DB aggregates (see public-stats.ts for the
 * RULE 2 boundary and the money-withholding rules). The same figures appear
 * on both homepages so a visitor toggling between them sees both sides
 * reading the same ledger.
 *
 * Render guard: a zero ledger is worse than no ledger — nothing renders until
 * at least one task has been delivered. The money cell renders only once the
 * ledger is deep enough that no individual payout is derivable from it.
 *
 * Green-on-night rule: #1E7F5C text never sits directly on a night surface —
 * on `night` tone the money figure is paper text with a green underline.
 */
export async function PublicCounters({
  tone,
  variant,
  className = "",
}: {
  tone: "night" | "paper";
  variant: "strip" | "line";
  className?: string;
}) {
  const stats = await publicStats();
  if (stats.tasksDelivered === 0) return null;

  const n = stats.tasksDelivered.toLocaleString("en-US");
  const w = stats.approvedWorkers.toLocaleString("en-US");
  const taskWord = stats.tasksDelivered === 1 ? "task delivered" : "tasks delivered";
  const workerWord = stats.approvedWorkers === 1 ? "approved worker" : "approved workers";
  const released =
    stats.releasedBucketCents !== null ? bucketDollars(stats.releasedBucketCents) : null;

  if (variant === "line") {
    return (
      <p
        className={`border-t font-mono text-[12px] leading-relaxed ${
          tone === "night"
            ? "border-white/10 text-[#767C86]"
            : "border-black/8 text-[#5B6069]"
        } ${className}`}
      >
        to date — {n} {taskWord}
        {released ? ` · ${released} released to workers` : ""} · {w} {workerWord}
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

  const cells: { v: string; l: string; money?: boolean }[] = [
    { v: n, l: taskWord },
    ...(released ? [{ v: released, l: "released to workers", money: true }] : []),
    { v: w, l: workerWord },
  ];

  return (
    <div
      className={`flex flex-wrap items-baseline justify-center gap-x-10 gap-y-2 border-y py-3.5 font-mono ${border} ${className}`}
    >
      {cells.map((c) => (
        <span key={c.l} className="flex items-baseline gap-2.5">
          <span className={`text-[15px] font-medium tabular-nums ${c.money ? money : value}`}>
            {c.v}
          </span>
          <span className={`text-[10px] uppercase tracking-[0.15em] sm:text-[11px] ${label}`}>
            {c.l}
          </span>
        </span>
      ))}
    </div>
  );
}
