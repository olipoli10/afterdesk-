/**
 * The single list "Our Services" is built from. Add a third offering here
 * and the hub picks it up automatically — nothing about the hub page itself
 * assumes there are exactly two. English-only for now, same as several
 * other newer pages in this app (e.g. src/components/policy-page.tsx) —
 * full FR/ES/TL coverage is real follow-up work, not done in this pass.
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
