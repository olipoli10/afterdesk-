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
 */
export function Wordmark({
  tone = "ink",
  className = "",
}: {
  tone?: "ink" | "paper";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <LogoMark className="h-[18px] w-[18px] shrink-0 rounded-[4px]" />
      <span
        className={`whitespace-nowrap font-mono uppercase tracking-[0.18em] ${
          tone === "paper" ? "text-[#E2C486]" : "text-[#14161A]"
        }`}
      >
        Endvera
      </span>
    </span>
  );
}
