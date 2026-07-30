import Link from "next/link";

export function TrustLinks({ tone = "paper" }: { tone?: "paper" | "night" }) {
  const cls =
    tone === "night"
      ? "text-[#8A9099] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";
  return (
    <nav aria-label="Trust and policies" className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {[
        ["/security", "Security"],
        ["/privacy", "Privacy"],
        ["/terms", "Terms"],
        ["/acceptable-use", "Acceptable use"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={`inline-flex min-h-11 items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${cls}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
