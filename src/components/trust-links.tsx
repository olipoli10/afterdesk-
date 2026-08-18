import Link from "next/link";
import type { SiteLang } from "@/lib/i18n/langs";

/**
 * The Academy leads on purpose. This component is on every public page, and
 * /academy had exactly ONE inbound internal link on the whole site — an
 * audit found the platform's largest asset was very nearly an orphan.
 * Anchor text carries the category noun rather than the product name,
 * The label used to read "Free training for remote workers" — chosen because
 * that phrase is what the audience searches. On a client page it named the
 * other audience in the footer of every visit, so the brand name carries the
 * link here; /workers and /academy keep the searchable phrasing where the
 * people searching it actually land. The original reasoning follows:
 * because "free training" is what the audience searches and what a crawler
 * should read here.
 *
 * All four languages now lead to a real translation on the other end
 * (src/lib/i18n/legal.ts) — Security/Privacy/Terms/Acceptable use used to
 * stay English in Tagalog specifically (no established Tagalog legal
 * glossary), so a Filipino-labeled link opened an English-only page. Terms
 * and Acceptable use keep short English nouns in the TL label itself
 * (Taglish, the same register the pages' own body copy uses) rather than
 * forcing a stiff, unfamiliar formal coinage.
 *
 * Public ledger link WITHDRAWN 2026-08-05, temporarily: a first-time visitor
 * hitting "No entries yet" reads as no traction, not as transparency. The
 * route, page, DB triggers and queries are untouched — only the promotion is
 * paused. Reinstate the href+label pair below once /ledger clears its own
 * publication floor (MIN_PUBLIC_ENTRIES in public-ledger.ts, currently 25)
 * so the page has something real to show the moment it's linked again.
 */
const LABELS: Record<SiteLang, [string, string, string, string, string]> = {
  en: ["Endvera Academy", "Security", "Privacy", "Terms", "Acceptable use"],
  fr: [
    "Académie Endvera",
    "Sécurité",
    "Confidentialité",
    "Conditions",
    "Utilisation acceptable",
  ],
  es: [
    "Academia Endvera",
    "Seguridad",
    "Privacidad",
    "Términos",
    "Uso aceptable",
  ],
  tl: [
    "Endvera Academy",
    "Seguridad",
    "Privacy",
    "Mga Tuntunin",
    "Katanggap-tanggap na Paggamit",
  ],
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
