import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * The marketing pages, the Academy and the policy pages are for crawlers.
 * Everything behind a session (and the auth funnel) is disallowed here AND
 * noindexed via per-layout robots metadata — belt and suspenders, since
 * robots.txt is only advisory.
 *
 * No `allow` list: paths are crawlable by default, and an explicit allow list
 * is a standing invitation to forget a page. /academy and the four policy
 * pages were all added after the original list and none of them was in it.
 * Name only what must stay OUT, and new public pages are crawlable the day
 * they ship.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/client",
          "/va",
          "/admin",
          "/api",
          "/login",
          "/register",
          "/verify-email",
          "/notifications",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
