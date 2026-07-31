import Link from "next/link";

/**
 * The two secondary doors — About us and Sign in — as glass pills floating
 * over the hero, MOBILE ONLY.
 *
 * On a wide screen both links live in the header, where there is room. On a
 * phone the header can only carry the wordmark, the audience toggle and the
 * language switch, so both were simply hidden (`hidden sm:block`) — which
 * meant a phone visitor had no way to sign in and no way to read the story
 * without hunting the footer. These put them back where a thumb reaches
 * first, without adding a fourth item to a 14px-tall header row.
 *
 * Glass, not a solid chip: the hero underneath is a grid and a glow, and a
 * translucent blurred pill lets both show through, so the pills read as
 * floating ABOVE the page rather than punched into it. Nothing animates —
 * the float is depth, not motion.
 */
export function FloatingLinks({
  tone,
  aboutLabel,
  signInLabel,
  className = "",
}: {
  /** "night" is the client homepage, "paper" the worker one. */
  tone: "night" | "paper";
  aboutLabel: string;
  signInLabel: string;
  className?: string;
}) {
  const pill =
    tone === "night"
      ? "border-white/[0.14] bg-white/[0.07] text-[#F7F6F3] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_24px_-10px_rgba(0,0,0,0.55)] hover:bg-white/[0.12]"
      : "border-[#14161A]/[0.09] bg-white/70 text-[#14161A] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_-12px_rgba(20,22,26,0.3)] hover:bg-white/90";

  const base = `inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium backdrop-blur-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 ${
    tone === "night" ? "focus-visible:ring-white/60" : "focus-visible:ring-[#14161A]/40"
  }`;

  return (
    <div className={`flex flex-wrap items-center gap-2 sm:hidden ${className}`}>
      <Link href="/about" className={`${base} ${pill}`}>
        {aboutLabel}
      </Link>
      <Link href="/login" className={`${base} ${pill}`}>
        {signInLabel}
      </Link>
    </div>
  );
}
