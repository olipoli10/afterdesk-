import Link from "next/link";

/**
 * Language switcher for the public pages. Pure links (no client JS): the
 * choice IS the URL, and the middleware persists it to a year-long cookie so
 * a returning visitor lands in their own language.
 *
 * Each page passes its own set — the client side speaks EN/FR/ES, the worker
 * side EN/FIL. There is no shared cookie between them on purpose: a French
 * client and a Filipino worker are different people on different pages.
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
    <nav aria-label="Language" className="flex items-center gap-0.5 font-mono text-[11px]">
      {options.map((o) => (
        <Link
          key={o.code}
          href={`${path}?lang=${o.code}`}
          hrefLang={o.code}
          aria-current={o.code === current ? "true" : undefined}
          className={`rounded px-1.5 py-0.5 transition-colors duration-150 ${
            o.code === current ? active : idle
          }`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
