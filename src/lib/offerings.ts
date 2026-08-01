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
      "Describe any task in plain language, get a fixed price, approve it, and get it back done by morning — reviewed by an operator before it reaches you.",
    href: "/",
  },
  {
    slug: "standing-capacity",
    title: "Standing capacity",
    audience: "For ongoing, recurring work",
    description:
      "Reserve a block of hours every week at one fixed price. Submit tasks as they come up all week, with a running account history so a new specialist never starts cold.",
    href: "/services/standing-capacity",
  },
];
