import Link from "next/link";

/**
 * Language switcher for the public pages. Pure links (no client JS): the
 * choice IS the URL, and Proxy persists it to a year-long cookie so
 * a returning visitor lands in their own language.
 *
 * Both pages offer the same four languages (EN/FR/ES/FIL), but each passes
 * its own set and its own path, and the cookies stay separate on purpose: a
 * French client and a Filipino worker are different people reading different
 * pages, and one choosing FIL must not flip the other's page.
 */
export function LangSwitch<T extends string>({
  path,
  current,
  options,
  tone,
}: {
  path: string;
  current: T;
  options: { code: T; label: string }[];
  tone: "night" | "paper";
}) {
  const active =
    tone === "night" ? "bg-[#F7F6F3] text-[#14161A]" : "bg-[#14161A] text-[#F7F6F3]";
  const idle =
    tone === "night"
      ? "text-[#767C86] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";

  return (
    <>
      <details className="group relative sm:hidden">
        <summary
          aria-label="Choose language"
          className={`flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded font-mono text-[11px] uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${active}`}
        >
          {options.find((option) => option.code === current)?.label ?? current}
        </summary>
        <nav
          aria-label="Language"
          className={`absolute right-0 top-11 z-50 min-w-36 overflow-hidden rounded-md border p-1 shadow-xl ${
            tone === "night"
              ? "border-white/15 bg-[#111317]"
              : "border-black/10 bg-white"
          }`}
        >
          {options.map((option) => (
            <Link
              key={option.code}
              href={`${path}?lang=${option.code}`}
              hrefLang={option.code}
              aria-current={option.code === current ? "true" : undefined}
              className={`flex min-h-11 items-center rounded px-3 font-mono text-xs ${
                option.code === current ? active : idle
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </details>
      <nav
        aria-label="Language"
        className="hidden items-center gap-0.5 font-mono text-[11px] sm:flex"
      >
        {options.map((option) => (
          <Link
            key={option.code}
            href={`${path}?lang=${option.code}`}
            hrefLang={option.code}
            aria-current={option.code === current ? "true" : undefined}
            className={`flex min-h-11 items-center rounded px-2 transition-colors duration-150 ${
              option.code === current ? active : idle
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
