import Link from "next/link";

/**
 * The persistent client/worker switch, centered in the nav of both public
 * homepages. Pure links — no client JS, no cookie: which side you're on IS the
 * URL, and the default side is the client one at "/".
 */
export function AudienceToggle({
  side,
  tone,
  clientLabel,
  workersLabel,
}: {
  side: "client" | "worker";
  tone: "night" | "paper";
  clientLabel: string;
  workersLabel: string;
}) {
  const shell =
    tone === "night"
      ? "border-white/12 bg-white/[0.06]"
      : "border-black/10 bg-black/[0.04]";
  const active =
    tone === "night"
      ? "bg-[#F7F6F3] text-[#14161A] shadow-[0_1px_8px_rgba(247,246,243,0.25)]"
      : "bg-[#14161A] text-[#F7F6F3] shadow-[0_1px_8px_rgba(20,22,26,0.35)]";
  const idle =
    tone === "night"
      ? "text-[#8A9099] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";
  const ring = tone === "night" ? "focus-visible:ring-white" : "focus-visible:ring-[#14161A]";

  const seg =
    `flex min-h-11 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-3.5 sm:text-[13px] ${ring}`;

  return (
    <nav
      aria-label="Audience"
      className={`flex items-center gap-0.5 rounded-full border p-0.5 ${shell}`}
    >
      <Link
        href="/"
        aria-current={side === "client" ? "page" : undefined}
        className={`${seg} ${side === "client" ? active : idle}`}
      >
        {clientLabel}
      </Link>
      <Link
        href="/workers"
        aria-current={side === "worker" ? "page" : undefined}
        className={`${seg} ${side === "worker" ? active : idle}`}
      >
        {workersLabel}
      </Link>
    </nav>
  );
}
