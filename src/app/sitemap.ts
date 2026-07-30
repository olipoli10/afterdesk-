import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/workers`, changeFrequency: "weekly", priority: 0.9 },
    // The Academy is the shareable half of the worker funnel — free training
    // is only word of mouth if it can be looked at without an account.
    { url: `${SITE_URL}/academy`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
