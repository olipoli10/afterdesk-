import { Fragment } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   THE COMPARISON — /about's comparison section.

   Two renderings of the SAME data, split at `md`, because the two widths
   asked for different things: mobile wanted short and scannable (a chip
   grid — one verdict word per cell, ✓/✗ glyph, no sentences), desktop had
   room to spare and wanted the fuller version back (a real table, each
   cell a short bold verdict plus the sentence that explains it). Every
   cell's `label`+`tone` feeds the mobile chip; `label`+`detail` feeds the
   desktop sentence — one data source, never two lists to keep in sync.

   Five axes, not six — the sixth ("if the seller used AI") read as
   redundant once the other five already make the same point.

   Styled as the page's one deliberate NIGHT punctuation on an otherwise
   paper page — same #0A0B0D/#111317 tokens the homepage's night sections
   and this page's own closing CTA bookend already use.

   Names real platforms (Fiverr, Upwork, OnlineJobs.ph) — a founder-
   requested exception to this site's usual generic-category rule. Every
   verdict stays true of the platform: escrow and reviews are real, a
   pre-delivery quality check is what's still missing.
   ───────────────────────────────────────────────────────────────────────── */

export type MatrixCell = {
  /** Short bold verdict — the whole mobile chip, and the lead-in on desktop. */
  label: string;
  tone: "weak" | "strong" | null;
  /** The sentence fragment that follows `label` on desktop only. */
  detail: string;
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

/** "OnlineJobs.ph" and "AfterDesk" have no natural space to wrap on — left to
 *  the browser they break mid-word ("ONLINEJ/OBS.PH"). Both names are
 *  identical across all four site languages (brand names, not translated),
 *  so a fixed break point here is safe everywhere, not just in English. */
const HEADER_BREAKS: Record<string, [string, string]> = {
  "OnlineJobs.ph": ["Online", "Jobs.ph"],
  AfterDesk: ["After", "Desk"],
};

function ChannelHeader({ name, className }: { name: string; className: string }) {
  const parts = HEADER_BREAKS[name];
  return (
    <span className={className}>
      {parts ? (
        <>
          {parts[0]}
          <br />
          {parts[1]}
        </>
      ) : (
        name
      )}
    </span>
  );
}

function toneColor(tone: MatrixCell["tone"], strongColor: string, weakColor: string, neutralColor: string) {
  if (tone === "strong") return strongColor;
  if (tone === "weak") return weakColor;
  return neutralColor;
}

function Chip({ cell, us }: { cell: MatrixCell; us: boolean }) {
  const glyph = cell.tone === "strong" ? "✓" : cell.tone === "weak" ? "✗" : "–";
  const glyphClass = toneColor(cell.tone, "text-[#3DDCA0]", "text-[#E8A854]", "text-[#5B6069]");
  return (
    <div
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded px-1 text-center ${
        us ? "bg-[#1E7F5C]/[0.12] ring-1 ring-inset ring-[#1E7F5C]/40" : "bg-white/[0.03]"
      }`}
    >
      <span className={`text-[15px] leading-none ${glyphClass}`} aria-hidden>
        {glyph}
      </span>
      <span className={`px-0.5 text-[9.5px] font-medium leading-[1.15] ${us ? "text-[#F7F6F3]" : "text-[#9AA1AB]"}`}>
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

      <div className="mt-7 overflow-hidden rounded-lg border border-white/8 bg-[#0A0B0D]">
        {/* Mobile — compact chip grid, below md */}
        <div className="p-3 md:hidden">
          <div className="grid grid-cols-[minmax(76px,1fr)_repeat(4,minmax(0,1.15fr))] items-center gap-1.5">
            <span />
            {t.channels.map((c, i) => (
              <ChannelHeader
                key={c}
                name={c}
                className={`px-0.5 text-center text-[9.5px] font-semibold uppercase leading-tight tracking-[0.01em] ${
                  i === 3 ? "text-[#3DDCA0]" : "text-[#767C86]"
                }`}
              />
            ))}

            {t.axes.map((row) => (
              <Fragment key={row.axis}>
                <span className="pr-1 text-[11px] font-medium leading-[1.2] text-[#C9CDD3]">{row.axis}</span>
                {row.cells.map((cell, ci) => (
                  <Chip key={`${row.axis}-${ci}`} cell={cell} us={ci === 3} />
                ))}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Desktop — real table with the full sentence, md and up */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-white/[0.16] px-5 py-4" />
                {t.channels.map((c, i) => (
                  <th
                    key={c}
                    className={`border-b px-5 py-4 text-left ${
                      i === 3 ? "border-white/[0.16] bg-[#1E7F5C]/[0.12]" : "border-white/[0.16]"
                    }`}
                  >
                    <ChannelHeader
                      name={c}
                      className={`text-[16px] font-bold leading-[1.1] tracking-[-0.005em] ${
                        i === 3 ? "text-[#3DDCA0]" : "text-[#F7F6F3]"
                      }`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.axes.map((row, ri) => (
                <tr key={row.axis}>
                  <td
                    className={`px-5 py-[18px] text-[14px] font-semibold text-[#F7F6F3] ${
                      ri < t.axes.length - 1 ? "border-b border-white/8" : ""
                    }`}
                  >
                    {row.axis}
                  </td>
                  {row.cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-5 py-[18px] text-[14px] leading-[1.5] text-[#C9CDD3] ${
                        ri < t.axes.length - 1 ? "border-b border-white/8" : ""
                      } ${ci === 3 ? "border-l-2 border-l-[#1E7F5C] bg-[#1E7F5C]/[0.08]" : ""}`}
                    >
                      <b
                        className="font-semibold"
                        style={{ color: toneColor(cell.tone, "#3DDCA0", "#E8A854", "inherit") }}
                      >
                        {cell.label}
                      </b>{" "}
                      {cell.detail}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 max-w-[62ch] font-mono text-[11px] leading-relaxed text-[#5B6069]">{t.footnote}</p>
    </div>
  );
}
