/* ─────────────────────────────────────────────────────────────────────────
   THE COMPARISON TABLE — /about's comparison section.

   A real 5-column table (axis + 3 named platforms + AfterDesk, always
   last), styled as the one deliberate NIGHT punctuation on an otherwise
   paper page — same #0A0B0D/#111317 tokens the homepage's night sections
   and this page's own closing CTA bookend already use, so it reads as an
   intentional second dark moment rather than an import from elsewhere.

   Unlike the rest of the site, this one names real platforms (Fiverr,
   Upwork, OnlineJobs.ph) rather than generic categories — a deliberate,
   founder-requested exception. Every claim stays true of the platform:
   escrow and reviews are real, a pre-delivery quality check is what's
   still missing.

   Green (#1E7F5C/#3DDCA0) = AfterDesk's strengths, amber (#D98324/#E8A854)
   = the other side's gaps — the site's existing money/attention colors,
   reused here in a marketing context rather than an operational-status one.

   Mobile: below `md`, the <table> is replaced by stacked cards (axis as a
   heading, then each platform's answer on its own line) — same pattern
   already proven on this page's own /about content, never a horizontal
   scroll.
   ───────────────────────────────────────────────────────────────────────── */

export type ComparisonCellPart = {
  pre: string;
  lead: string | null;
  tone: "weak" | "strong" | null;
  post: string;
};

export type ComparisonAxis = {
  axis: string;
  /** [Fiverr, Upwork, OnlineJobs.ph, AfterDesk] */
  cells: [ComparisonCellPart, ComparisonCellPart, ComparisonCellPart, ComparisonCellPart];
};

export type ComparisonTableDict = {
  eyebrow: string;
  heading: string;
  subline: string;
  axisHeader: string;
  /** [Fiverr, Upwork, OnlineJobs.ph, AfterDesk] */
  channels: [string, string, string, string];
  axes: ComparisonAxis[];
  footnote: string;
};

function toneClass(tone: "weak" | "strong" | null): string {
  if (tone === "strong") return "text-[#3DDCA0]";
  if (tone === "weak") return "text-[#E8A854]";
  return "";
}

function Cell({ part }: { part: ComparisonCellPart }) {
  return (
    <>
      {part.pre}
      {part.lead ? <b className={`font-semibold ${toneClass(part.tone)}`}>{part.lead}</b> : null}
      {part.post}
    </>
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
        {/* Desktop — real table, md and up */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-white/[0.16] px-5 py-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#767C86]">
                  {t.axisHeader}
                </th>
                {t.channels.map((c, i) => (
                  <th
                    key={c}
                    className={`border-b px-5 py-4 text-left text-[16px] font-bold tracking-[-0.005em] ${
                      i === 3
                        ? "border-white/[0.16] bg-[#1E7F5C]/[0.12] text-[#3DDCA0]"
                        : "border-white/[0.16] text-[#F7F6F3]"
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.axes.map((row, ri) => (
                <tr key={row.axis} className="group">
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
                      <Cell part={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile — stacked cards, below md, no horizontal scroll ever */}
        <div className="p-4 md:hidden">
          {t.axes.map((row, ri) => (
            <div key={row.axis} className={ri > 0 ? "mt-7" : ""}>
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#767C86]">
                {row.axis}
              </h3>
              <div className="mt-2.5">
                {row.cells.map((cell, ci) => (
                  <div
                    key={ci}
                    className={`grid gap-0.5 border-t border-white/8 px-3.5 py-3 ${
                      ci === 3 ? "rounded-r border-l-2 border-l-[#1E7F5C] bg-[#1E7F5C]/10" : ""
                    }`}
                  >
                    <span
                      className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${
                        ci === 3 ? "font-semibold text-[#3DDCA0]" : "text-[#767C86]"
                      }`}
                    >
                      {t.channels[ci]}
                    </span>
                    <span className={`text-[14px] leading-[1.45] ${ci === 3 ? "text-[#F7F6F3]" : "text-[#C9CDD3]"}`}>
                      <Cell part={cell} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 max-w-[62ch] font-mono text-[11px] leading-relaxed text-[#5B6069]">{t.footnote}</p>
    </div>
  );
}
