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

   Styled as the page's one deliberate NIGHT punctuation on an otherwise
   paper page — same #0A0B0D/#111317 tokens the homepage's night sections
   and this page's own closing CTA bookend already use.

   ── THE COLUMNS ARE BUYING MODELS, NOT BRANDS ──

   This table used to name real platforms (Fiverr, Upwork, OnlineJobs.ph) and
   rate them. The repositioning replaced them with the four ways a buyer can
   get this work done, because rating other companies on price and vetting
   made claims nothing here measures, and naming marketplaces filed Endvera
   as a fourth marketplace.

   That swap is also what broke the mobile layout, and the failure is worth
   recording because it is not obvious from either change alone: the mobile
   grid was sized for SHORT BRAND NAMES and was then fed DESCRIPTIVE PHRASES.
   Measured on production at 375px, each channel column was 50px wide while
   the word "MARKETPLACE" alone renders 71px at 9.5px — so the header spilled
   21px past its own track and physically overlapped "HOURLY STAFFING" by
   14px. Neither the copy change nor the grid was wrong by itself; the pairing
   was never re-measured.
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
  /** [Fiverr, Upwork, OnlineJobs.ph, Endvera] */
  cells: [MatrixCell, MatrixCell, MatrixCell, MatrixCell];
};

export type ComparisonTableDict = {
  eyebrow: string;
  heading: string;
  subline: string;
  /** [Fiverr, Upwork, OnlineJobs.ph, Endvera] */
  channels: [string, string, string, string];
  axes: MatrixAxis[];
  footnote: string;
};

/** "Endvera" has no natural space to wrap on — left to the browser it breaks
 *  mid-word. The name is identical across all four site languages (a brand
 *  name, not translated), so a fixed break point here is safe everywhere, not
 *  just in English. The OnlineJobs.ph entry beside it went with the brands. */
const HEADER_BREAKS: Record<string, [string, string]> = {
  Endvera: ["After", "Desk"],
};

/**
 * THE MOBILE GRID'S TRACK WIDTHS, IN PIXELS, AND WHY THEY ARE PIXELS.
 *
 * They used to be fractions (`minmax(0,1.15fr)`), which is what allowed a
 * column to become 50px and a 71px word to spill out of it: a fraction always
 * "fits" by definition, so nothing could ever report that the text did not.
 *
 * Fixed tracks make the requirement legible instead. `CHANNEL` is sized from
 * the longest UNBREAKABLE word across all four languages, measured in the
 * page's own Geist at the size below ("MARKETPLACE", the worst case in both
 * English and Tagalog: 82px at 11px), plus breathing room. `AXIS` holds the
 * row labels, which are short sentences and wrap freely.
 *
 * ── WHY 11px AND A SCROLL, RATHER THAN SMALLER TEXT ──
 *
 * Four readable columns do not fit any phone width: at 320px the content box
 * is ~272px, and even the old 9.5px needs ~404px to stop overlapping. So the
 * choice was between shrinking the type further and letting the TABLE scroll.
 * Shrinking loses twice: it is already below comfortable reading size, and it
 * would only buy back a few pixels. Scrolling costs one gesture, on one
 * element, and buys back enough room to make the type BIGGER than it was.
 *
 * Only the table scrolls. The page must not, which the tests assert.
 */
const MOBILE_TRACKS = { axis: 104, channel: 88, gap: 6 } as const;
const MOBILE_MIN_WIDTH =
  MOBILE_TRACKS.axis + MOBILE_TRACKS.channel * 4 + MOBILE_TRACKS.gap * 4;

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

function Chip({ cell, us, axis, channel }: { cell: MatrixCell; us: boolean; axis: string; channel: string }) {
  const glyph = cell.tone === "strong" ? "✓" : cell.tone === "weak" ? "✗" : "–";
  const glyphClass = toneColor(cell.tone, "text-[#3DDCA0]", "text-[#E8A854]", "text-[#5B6069]");
  return (
    <div
      role="img"
      aria-label={`${axis}, ${channel}: ${cell.label}`}
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded px-1 text-center ${
        us ? "bg-[#1E7F5C]/[0.12] ring-1 ring-inset ring-[#1E7F5C]/40" : "bg-white/[0.03]"
      }`}
    >
      <span className={`text-[15px] leading-none ${glyphClass}`} aria-hidden>
        {glyph}
      </span>
      <span
        aria-hidden
        className={`px-0.5 text-[9.5px] font-medium leading-[1.15] ${us ? "text-[#F7F6F3]" : "text-[#9AA1AB]"}`}
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

      <div className="mt-7 overflow-hidden rounded-lg border border-white/8 bg-[#0A0B0D]">
        {/* Mobile — compact chip grid, below md */}
        <div
          /**
           * Focusable and labelled BECAUSE it scrolls. A scroll container that
           * only a pointer can reach is unreachable for a keyboard user, and
           * this one holds the comparison the whole section exists to make.
           * `tabIndex` plus a role and a name is the standard pairing browsers
           * and screen readers both understand.
           */
          role="group"
          aria-label={t.heading}
          tabIndex={0}
          className="overflow-x-auto p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3DDCA0] md:hidden"
        >
          <div
            className="grid items-center gap-1.5"
            style={{
              minWidth: MOBILE_MIN_WIDTH,
              gridTemplateColumns: `${MOBILE_TRACKS.axis}px repeat(4, ${MOBILE_TRACKS.channel}px)`,
            }}
          >
            {/**
             * The axis column is STICKY. Scrolling four columns is only usable
             * if the row label stays put; without this the reader arrives at
             * "Endvera" having lost which question the tick answers. It
             * carries the panel's own background so the chips pass behind it
             * rather than through it.
             */}
            <span className="sticky left-0 z-10 bg-[#0A0B0D]" />
            {t.channels.map((c, i) => (
              <ChannelHeader
                key={c}
                name={c}
                className={`px-0.5 text-center text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.01em] ${
                  i === 3 ? "text-[#3DDCA0]" : "text-[#767C86]"
                }`}
              />
            ))}

            {t.axes.map((row) => (
              <Fragment key={row.axis}>
                <span className="sticky left-0 z-10 bg-[#0A0B0D] pr-2 text-[11px] font-medium leading-[1.2] text-[#C9CDD3]">
                  {row.axis}
                </span>
                {row.cells.map((cell, ci) => (
                  <Chip
                    key={`${row.axis}-${ci}`}
                    cell={cell}
                    us={ci === 3}
                    axis={row.axis}
                    channel={t.channels[ci]}
                  />
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
