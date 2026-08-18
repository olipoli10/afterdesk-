/**
 * Temporary ENDVERA mark. Two machined amber masses meet around one dark
 * seam: many execution paths, one finished join. It deliberately reuses the
 * accepted onyx / gilt / amber site tokens and stays simple enough to survive
 * at favicon size. The final identity can replace this component without
 * changing any consuming surface.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0A0B0D" stroke="#6F4C29" />
      <path d="M6 8h8l6 6-4 4-4-4H9v10H6V8Z" fill="#D87526" />
      <path d="M26 24h-8l-6-6 4-4 4 4h3V8h3v16Z" fill="#C9A76A" />
      <path d="m14.8 15.2 2-2 2.4 2.4-2 2-2.4-2.4Z" fill="#E2C486" />
    </svg>
  );
}

/**
 * Mark + wordmark lockup, same mono-uppercase treatment the bare text used
 * everywhere. "ink" is dark text for paper chrome; "paper" uses the gilt
 * highlight on the onyx homepage so the temporary identity reads amber.
 *
 * `plate` mounts the same lockup on a machined graphite name-plate — a
 * manufacturer's plate rather than a floating label: recessed surface, thin
 * border, a mounting seam under the mark, and a 4px amber pip as its entire
 * active state. Opt-in only; every existing consumer renders byte-identical.
 */
export function Wordmark({
  tone = "ink",
  plate = false,
  className = "",
}: {
  tone?: "ink" | "paper";
  plate?: boolean;
  className?: string;
}) {
  const lockup = (
    <span className={`inline-flex items-center gap-1.5 ${plate ? "" : className}`}>
      <LogoMark className={plate ? "h-[22px] w-[22px] shrink-0 rounded-[5px]" : "h-[18px] w-[18px] shrink-0 rounded-[4px]"} />
      <span
        className={`whitespace-nowrap font-mono uppercase tracking-[0.18em] ${
          tone === "paper" ? "text-[#E2C486]" : "text-[#14161A]"
        }`}
      >
        Endvera
      </span>
    </span>
  );
  if (!plate) return lockup;
  return (
    <span
      className={`relative inline-flex items-center gap-2 rounded-[6px] border border-[#262B35] bg-[#14171C] py-2 pl-2.5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      {lockup}
      <span aria-hidden className="mx-0.5 h-[18px] w-px bg-[#262B35]" />
      <span aria-hidden className="h-[4px] w-[4px] rounded-[1px] bg-[#C9A76A]" />
    </span>
  );
}
