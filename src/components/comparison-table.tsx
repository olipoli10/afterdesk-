import { Fragment } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE COMPARISON MATRIX — /about's comparison section.

   A compact icon grid, not a table of sentences: one short verdict word
   per cell (✓ green for an AfterDesk strength, ✗ amber for a gap the other
   side has, a plain dash for a neutral fact) — the same ONE grid at every
   width, no separate mobile fallback needed, because short chips don't
   need one. Replaced the earlier sentence-per-cell table, which read fine
   on desktop but turned into a long paragraph-per-row scroll on mobile.

   Styled as the page's one deliberate NIGHT punctuation on an otherwise
   paper page — same #0A0B0D/#111317 tokens the homepage's night sections
   and this page's own closing CTA bookend already use.

   Names real platforms (Fiverr, Upwork, OnlineJobs.ph) — a founder-
   requested exception to this site's usual generic-category rule. Every
   verdict stays true of the platform: escrow and reviews are real, a
   pre-delivery quality check is what's still missing.
   ───────────────────────────────────────────────────────────────────────── */

export type MatrixCell = {
  label: string;
  tone: "weak" | "strong" | null;
};

export type MatrixAxis = {
  axis: string;
  /** [Fiverr, Upwork, OnlineJobs.ph, AfterDesk] */
  cells: [MatrixCell, MatrixCell, MatrixCell, MatrixCell];
};

export type ComparisonTableDict = {
  eyebrow: string;
  heading: string;
  subline: string;
  /** [Fiverr, Upwork, OnlineJobs.ph, AfterDesk] */
  channels: [string, string, string, string];
  axes: MatrixAxis[];
  footnote: string;
};

function Chip({ cell, us }: { cell: MatrixCell; us: boolean }) {
  const glyph = cell.tone === "strong" ? "✓" : cell.tone === "weak" ? "✗" : "–";
  const glyphClass =
    cell.tone === "strong" ? "text-[#3DDCA0]" : cell.tone === "weak" ? "text-[#E8A854]" : "text-[#5B6069]";
  return (
    <div
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded px-1 text-center ${
        us ? "bg-[#1E7F5C]/[0.12] ring-1 ring-inset ring-[#1E7F5C]/40" : "bg-white/[0.03]"
      }`}
    >
      <span className={`text-[15px] leading-none sm:text-[17px] ${glyphClass}`} aria-hidden>
        {glyph}
      </span>
      <span
        className={`px-0.5 text-[9.5px] font-medium leading-[1.15] sm:text-[10.5px] ${
          us ? "text-[#F7F6F3]" : "text-[#9AA1AB]"
        }`}
      >
        {cell.label}
      </span>
    </div>
  );
}

export function ComparisonTable({ t }: { t: ComparisonTableDict }) {
  return (
    <div className="mt-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5B6069]">{t.eyebrow}</p>
      <h2 className="mt-3 max-w-[520px] text-[24px] font-semibold leading-[1.15] tracking-[-0.015em] text-[#14161A]">
        {t.heading}
      </h2>
      <p className="mt-2.5 max-w-[52ch] text-[15px] leading-relaxed text-[#5B6069]">{t.subline}</p>

      <div className="mt-7 rounded-lg border border-white/8 bg-[#0A0B0D] p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(84px,1fr)_repeat(4,minmax(0,1.15fr))] items-center gap-1.5 sm:gap-2">
          {/* header row */}
          <span />
          {t.channels.map((c, i) => (
            <span
              key={c}
              className={`break-words px-0.5 text-center text-[9.5px] font-semibold uppercase leading-tight tracking-[0.01em] sm:text-[11px] ${
                i === 3 ? "text-[#3DDCA0]" : "text-[#767C86]"
              }`}
            >
              {c}
            </span>
          ))}

          {t.axes.map((row) => (
            <Fragment key={row.axis}>
              <span className="pr-1 text-[11px] font-medium leading-[1.2] text-[#C9CDD3] sm:text-[12.5px]">
                {row.axis}
              </span>
              {row.cells.map((cell, ci) => (
                <Chip key={`${row.axis}-${ci}`} cell={cell} us={ci === 3} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <p className="mt-4 max-w-[62ch] font-mono text-[11px] leading-relaxed text-[#5B6069]">{t.footnote}</p>
    </div>
  );
}
