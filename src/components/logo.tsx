/**
 * The AfterDesk mark: a rounded plate, night on one side and paper on the
 * other, cut by a single diagonal seam — the desk you leave, and the shift
 * that picks up where it stops. Reused everywhere the wordmark used to
 * stand alone (src/app/icon.svg is the same shape, kept in sync by hand
 * since the file-convention icon can't import a shared component).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#0A0B0D" />
      <path d="M19 0 h6 a7 7 0 0 1 7 7 v18 a7 7 0 0 1 -7 7 h-12 z" fill="#F7F6F3" />
      <rect x="18.4" y="0" width="1.6" height="32" fill="#1E7F5C" />
    </svg>
  );
}

/**
 * Mark + wordmark lockup, same mono-uppercase treatment the bare text used
 * everywhere. "ink" is dark text for the paper chrome (app shell, auth
 * shell, footers); "paper" is white text for the night homepage nav.
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
          tone === "paper" ? "text-white" : "text-[#14161A]"
        }`}
      >
        AfterDesk
      </span>
    </span>
  );
}
