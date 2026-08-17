/* Phase 1.4C - the shared instrument primitives. The visual family of the
   accepted V5.5 homepage, distilled for the secondary pages: a gold axis,
   a machined frame with tick corners, an onyx threshold, mono kickers and
   colorless-legible state chips. Server-safe, CSS-only, zero packages. */

const GOLD = "#C9A76A";

export function Kicker({ children, tone = "night" }: { children: React.ReactNode; tone?: "night" | "paper" }) {
  return (
    <p className={`font-mono text-[11px] uppercase tracking-[0.16em] ${tone === "night" ? "text-[#C9A76A]" : "text-[#8a7a55]"}`}>
      {children}
    </p>
  );
}

/* a quiet vertical gold line that ties a section to the assembly spine */
export function GoldAxis({ height = "100%" }: { height?: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 w-px -translate-x-1/2 opacity-60"
      style={{ height, background: `linear-gradient(to bottom, transparent, ${GOLD} 12%, ${GOLD} 88%, transparent)` }}
    />
  );
}

/* machined frame: hairline border + four corner ticks, graphite ground */
export function InstrumentFrame({
  children,
  tone = "night",
  className = "",
  proof,
}: {
  children: React.ReactNode;
  tone?: "night" | "paper";
  className?: string;
  proof?: string;
}) {
  const ground = tone === "night" ? "border-white/12 bg-[#111318]" : "border-black/15 bg-white";
  const tick = `absolute h-2 w-2 border-[#C9A76A]`;
  return (
    <div data-proof={proof} className={`relative rounded-sm border ${ground} ${className}`}>
      <span aria-hidden className={`${tick} left-[-1px] top-[-1px] border-l border-t`} />
      <span aria-hidden className={`${tick} right-[-1px] top-[-1px] border-r border-t`} />
      <span aria-hidden className={`${tick} bottom-[-1px] left-[-1px] border-b border-l`} />
      <span aria-hidden className={`${tick} bottom-[-1px] right-[-1px] border-b border-r`} />
      {children}
    </div>
  );
}

/* an onyx band that breaks a paper page - the "threshold" the mandate names */
export function OnyxThreshold({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden bg-[#08090B] text-[#F7F6F3] ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "96px 96px" }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}

/* state chip that never speaks by color alone: shape + label carry it */
export function StateChip({
  kind,
  children,
  tone = "night",
}: {
  kind: "live" | "building" | "refused" | "money" | "returned";
  children: React.ReactNode;
  tone?: "night" | "paper";
}) {
  const dim = tone === "night" ? "border-white/15 text-[#c7ccd4]" : "border-black/20 text-[#3d424b]";
  const marks: Record<typeof kind, { glyph: string; extra: string }> = {
    live: { glyph: "●", extra: "text-inherit" },
    building: { glyph: "◐", extra: "text-inherit" },
    refused: { glyph: "✕", extra: "text-inherit" },
    money: { glyph: "✓", extra: "text-[#1d7f4f]" },
    returned: { glyph: "↺", extra: "text-[#a86414]" },
  };
  const m = marks[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] ${dim}`}>
      <span aria-hidden className={m.extra}>{m.glyph}</span>
      {children}
    </span>
  );
}

/* one passage of the operation cutaway: rail dot + title + short body */
export function Passage({
  index,
  title,
  children,
  last = false,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative grid grid-cols-[2rem_1fr] gap-x-4 pb-8 last:pb-0">
      {!last && <span aria-hidden className="absolute bottom-0 left-[0.9375rem] top-7 w-px bg-gradient-to-b from-[#C9A76A66] to-transparent" />}
      <span className="relative z-10 flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-full border border-[#C9A76A]/50 bg-[#111318] font-mono text-[10.5px] text-[#E2C486]">
        {index}
      </span>
      <div>
        <h3 className="text-[15.5px] font-semibold leading-[1.875rem]">{title}</h3>
        <div className="mt-1 max-w-[58ch] text-[14px] leading-[1.65] text-[#9AA1AB]">{children}</div>
      </div>
    </li>
  );
}
