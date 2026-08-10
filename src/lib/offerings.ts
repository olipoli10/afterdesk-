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
  /**
   * STANDING CAPACITY WAS REMOVED FROM THIS LIST, NOT FROM THE PRODUCT.
   *
   * Its row read "Reserve a block of managed hours every week" and linked to a
   * page that priced 5h / 10h / 20h. That is what the schema actually bills,
   * so the copy was honest — and it is the one offer AfterDesk cannot show
   * next to "finished outcomes at a fixed price" without contradicting itself.
   *
   * Everything behind the storefront is untouched: existing accounts, their
   * portal, the admin screens and the billing all work exactly as before. The
   * public page 307s to /services (see next.config.ts).
   *
   * To bring it back: restore this row. The four-language copy for its card is
   * still in src/lib/i18n/services.ts, kept for that reason.
   */
];
