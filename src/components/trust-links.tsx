import Link from "next/link";
import type { SiteLang } from "@/lib/i18n/langs";

/**
 * The Academy leads on purpose. This component is on every public page, and
 * /academy had exactly ONE inbound internal link on the whole site — an
 * audit found the platform's largest asset was very nearly an orphan.
 * Anchor text carries the category noun rather than the product name,
 * because "free training" is what the audience searches and what a crawler
 * should read here.
 *
 * TL keeps Security/Privacy/Terms/Acceptable use in English (Taglish
 * code-switching, same as footer.signIn's "Mag-sign in") since this
 * codebase has no established Tagalog legal glossary for them.
 */
const LABELS: Record<SiteLang, [string, string, string, string, string]> = {
  en: ["Free training for remote workers", "Security", "Privacy", "Terms", "Acceptable use"],
  fr: [
    "Formation gratuite pour travailleurs à distance",
    "Sécurité",
    "Confidentialité",
    "Conditions",
    "Utilisation acceptable",
  ],
  es: [
    "Formación gratuita para trabajadores remotos",
    "Seguridad",
    "Privacidad",
    "Términos",
    "Uso aceptable",
  ],
  tl: ["Libreng pagsasanay para sa mga remote worker", "Security", "Privacy", "Terms", "Acceptable use"],
};

const HREFS = ["/academy", "/security", "/privacy", "/terms", "/acceptable-use"] as const;

export function TrustLinks({
  tone = "paper",
  lang = "en",
}: {
  tone?: "paper" | "night";
  lang?: SiteLang;
}) {
  const cls =
    tone === "night"
      ? "text-[#8A9099] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";
  const labels = LABELS[lang];
  return (
    <nav aria-label="Trust and policies" className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {HREFS.map((href, i) => (
        <Link
          key={href}
          href={href}
          className={`inline-flex min-h-11 items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${cls}`}
        >
          {labels[i]}
        </Link>
      ))}
    </nav>
  );
}
