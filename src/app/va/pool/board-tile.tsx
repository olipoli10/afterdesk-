import Link from "next/link";
import { formatCents } from "@/lib/money";
import { familyOf } from "@/lib/families";
import { ClaimButton } from "@/components/va-actions";
import type { VaPoolView } from "@/lib/queries/tasks";

/**
 * One task on the board — a compact tile, not a full-width sheet. The brief
 * is deliberately NOT on the tile: the Details page behind it carries the
 * full text plus the category's delivery standard, so the board stays a
 * board and the reading happens one tap deeper. (The full brief must always
 * be readable before claiming — a release is recorded on the worker's
 * record; the Details page is how that rule is now honored.)
 *
 * COLOR DISCIPLINE: the family hue appears only as a dot + label — never a
 * fill — so a category can never be mistaken for a status. Red #A82318 is
 * the ≤24h deadline pill and nothing else. Green is the payout figure and
 * nothing else.
 *
 * RULE 2: every field comes from vaPoolSelect — no client identity, no
 * client price, no filenames (a count only).
 */

/**
 * A per-unit rate is the number a worker judges a bulk job by ("$0.02 each"
 * says more than "$66.00" on 4,000 rows). `quantity` is free text the client
 * typed, so this is deliberately strict: exactly one number in the whole
 * string, and at least 10 of them — a wrong rate shown to someone deciding
 * whether to commit is worse than no rate.
 */
function unitCountOf(quantity: string | null): number | null {
  if (!quantity) return null;
  const matches = quantity.match(/\d[\d,]*/g);
  if (!matches || matches.length !== 1) return null;
  const n = Number(matches[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 10) return null;
  return n;
}

/** ≤24h = the urgent red fill; ≤48h = shaded; later = quiet text. */
export function duePill(vaDeadlineUtc: Date | null): {
  label: string;
  tone: "soon" | "near" | "far";
} | null {
  if (!vaDeadlineUtc) return null;
  const hours = (vaDeadlineUtc.getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return { label: "Due now", tone: "soon" };
  const days = Math.ceil(hours / 24);
  const label = days === 1 ? "1 day" : `${days} days`;
  if (hours <= 24) return { label, tone: "soon" };
  if (hours <= 48) return { label, tone: "near" };
  return { label, tone: "far" };
}

const DUE_TONE: Record<"soon" | "near" | "far", string> = {
  soon: "bg-[#A82318] text-white",
  near: "bg-[#EDEBE6] text-[#14161A]",
  far: "text-[#5B6069]",
};

export function BoardTile({
  task,
  headingLevel = "h3",
}: {
  task: VaPoolView;
  /** h3 inside a grouped section (the group name is the h2), h2 when flat. */
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const fam = familyOf(task.category?.slug);
  const due = duePill(task.vaDeadlineUtc);
  const units = unitCountOf(task.quantity);
  const perUnitCents =
    units !== null && task.vaPayoutCents != null
      ? Math.round(task.vaPayoutCents / units)
      : null;
  const estimatedHours =
    task.estimatedMinutes != null ? Math.max(0.25, task.estimatedMinutes / 60) : null;
  const effectiveHourlyCents =
    estimatedHours && task.vaPayoutCents != null
      ? Math.round(task.vaPayoutCents / estimatedHours)
      : null;

  return (
    <div className="flex min-w-0 flex-col rounded-[4px] border border-[#E4E2DC] bg-white px-3.5 pt-3 transition-colors duration-150 hover:border-[#D5D2CB]">
      {/* top row — category + stamps */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-[11px] font-semibold uppercase tracking-[0.07em]"
          style={{ color: fam.hue }}
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: fam.hue }}
          />
          <span className="truncate">{task.category?.name ?? "Unfiled"}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {task.tier === "high_value" ? (
            <span className="rounded-[2px] border border-[#1B2740] px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#1B2740]">
              High value
            </span>
          ) : null}
          {due ? (
            <span
              className={`whitespace-nowrap rounded-[2px] px-1.5 py-[3px] font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] tabular-nums ${DUE_TONE[due.tone]}`}
            >
              {due.label}
            </span>
          ) : null}
        </span>
      </div>

      {/* title — links to the pre-claim detail page */}
      <Heading className="mt-1.5 min-h-[2.56em] text-[15.5px] font-semibold leading-[1.28] tracking-[-0.008em] text-[#14161A]">
        <Link
          href={`/va/pool/${task.id}`}
          className="transition-colors duration-150 hover:text-[#1B2740] hover:underline hover:decoration-[#14161A]/30 hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2"
        >
          {task.title}
        </Link>
      </Heading>

      {/* meta — the separator is drawn, not typed (a faint middot is sub-AA text) */}
      <p className="mb-2.5 mt-1.5 flex items-center gap-2 font-mono text-[11.5px] text-[#5B6069]">
        {task.quantity ? (
          <>
            <span className="tabular-nums">{task.quantity}</span>
            <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-[#D5D2CB]" />
          </>
        ) : null}
        <span className="tabular-nums">
          {task._count.files} {task._count.files === 1 ? "file" : "files"}
        </span>
        {estimatedHours ? (
          <>
            <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-[#D5D2CB]" />
            <span className="tabular-nums">~{estimatedHours.toFixed(1)} h</span>
          </>
        ) : null}
      </p>

      {/* foot — payout · details · claim */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-[#E4E2DC] py-2">
        <span className="min-w-0">
          <span className="block font-mono text-[19px] font-bold leading-[1.15] tracking-[-0.02em] tabular-nums text-[#166049]">
            {task.vaPayoutCents != null ? formatCents(task.vaPayoutCents, task.currency) : "—"}
          </span>
          {perUnitCents != null ? (
            <span className="block font-mono text-[11px] tabular-nums text-[#5B6069]">
              {formatCents(perUnitCents, task.currency)} each
            </span>
          ) : null}
          {effectiveHourlyCents != null ? (
            <span className="block font-mono text-[11px] tabular-nums text-[#5B6069]">
              ~{formatCents(effectiveHourlyCents, task.currency)}/h estimated
            </span>
          ) : null}
        </span>
        <Link
          href={`/va/pool/${task.id}`}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center px-1.5 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2"
          aria-label={`Details of “${task.title}”`}
        >
          Details
        </Link>
        <span className="shrink-0">
          <ClaimButton taskId={task.id} variant="board" />
        </span>
      </div>
    </div>
  );
}
