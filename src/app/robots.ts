import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only the two marketing pages are for crawlers. Everything behind a session
 * (and the auth funnel) is noindexed here AND via per-layout robots metadata —
 * belt and suspenders, since robots.txt is advisory.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/workers"],
        disallow: ["/client", "/va", "/admin", "/api", "/login", "/register"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
