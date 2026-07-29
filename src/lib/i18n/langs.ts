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
