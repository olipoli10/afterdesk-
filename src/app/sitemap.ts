import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { PUBLISHED_COURSES } from "@/lib/academy/public";

/**
 * Generated from the same allowlist the course routes are built from, so the
 * sitemap and the site cannot disagree: publishing a course adds its URL here
 * automatically, and withholding one removes it.
 *
 * No `priority` or `changeFrequency` — Google has said publicly it ignores
 * both, and a hand-maintained priority column is a standing invitation to
 * argue with the link graph and lose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "",
    "/workers",
    "/academy",
    "/about",
    "/how-it-works",
    "/security",
    "/privacy",
    "/terms",
    "/acceptable-use",
  ];

  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}` })),
    ...PUBLISHED_COURSES.map((slug) => ({ url: `${SITE_URL}/academy/${slug}` })),
  ];
}
