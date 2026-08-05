/**
 * The single list "Our Services" is built from. Add a third offering here
 * and the hub picks it up automatically — nothing about the hub page itself
 * assumes there are exactly two. This file itself stays English-only on
 * purpose (slug/href are not language, and slug is the join key) — the
 * translated audience/title/description a visitor actually reads live in
 * src/lib/i18n/services.ts, keyed by the same slug (see OFFERING_KEY in
 * src/app/services/page.tsx).
 */
export type Offering = {
  slug: string;
  title: string;
  audience: string;
  description: string;
  href: string;
};

export const OFFERINGS: Offering[] = [
  {
    slug: "one-off",
    title: "One-off task",
    audience: "For a single task, no commitment",
    description:
      "Describe a bounded deliverable, approve one fixed price and timing, then receive completed work after operator review.",
    href: "/",
  },
  {
    slug: "standing-capacity",
    title: "Standing capacity",
    audience: "For ongoing, recurring work",
    description:
      "Reserve a block of managed hours every week for recurring, bounded work. Account preferences and task history carry forward, and each completed task still receives quality control.",
    href: "/services/standing-capacity",
  },
];
