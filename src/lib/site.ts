/**
 * Canonical site origin for metadata, sitemaps and share cards.
 * Falls back to the intended production domain; override per environment.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://secondshift.co";
