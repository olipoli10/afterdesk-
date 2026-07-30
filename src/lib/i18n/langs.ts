/**
 * The four languages the public site offers, declared once so the two
 * switchers can never drift apart: same codes, same labels, same order.
 *
 * "FIL" is the label — Filipino is the language's own name; `tl` is the ISO
 * code the URL and the cookie carry.
 */

export type SiteLang = "en" | "fr" | "es" | "tl";

export const SITE_LANGS: { code: SiteLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
  { code: "tl", label: "FIL" },
];

/** Anything unrecognised falls back to English rather than throwing: the
    value arrives from a query string and a cookie, neither of which the
    server controls. */
export function siteLangOf(value: string | undefined | null): SiteLang {
  return value === "fr" || value === "es" || value === "tl" ? value : "en";
}

/**
 * hreflang + canonical for a page that renders all four languages at ONE
 * path, switched by ?lang= and a cookie.
 *
 * English is the default rendering, so it owns the bare path and x-default;
 * the other three own their ?lang= URL. The canonical follows the SAME rule,
 * because an alternate that does not self-canonicalise is discarded: a page
 * reached as ?lang=fr canonicalises to ?lang=fr, and everything else —
 * including ?lang=en — canonicalises to the bare path.
 *
 * The COOKIE deliberately never enters this. Googlebot does not carry one,
 * so a cookie-driven French rendering is still the bare path's content as
 * far as any crawler is concerned; letting the cookie move the canonical
 * would make the same URL claim four different canonicals depending on who
 * asked.
 */
export function langAlternates(path: string, queryLang: string | undefined | null) {
  const chosen = SITE_LANGS.some((l) => l.code === queryLang)
    ? (queryLang as SiteLang)
    : null;
  const url = (code: SiteLang) => (code === "en" ? path : `${path}?lang=${code}`);
  return {
    canonical: chosen ? url(chosen) : path,
    languages: {
      ...Object.fromEntries(SITE_LANGS.map((l) => [l.code, url(l.code)])),
      "x-default": path,
    },
  };
}
