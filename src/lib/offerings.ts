/**
 * The single list "Our Services" is built from. This file stays English-only
 * on purpose — a slug and an href are not language. The translated
 * audience/title/description a visitor actually reads live in
 * src/lib/i18n/services.ts, joined to this list BY INDEX rather than by slug.
 *
 * Adding a row therefore means adding a card to all four language dicts in the
 * same commit: the dict is a fixed-length tuple, so a short language fails to
 * compile, and the length agreement between the two files is asserted at
 * runtime in test/standing-capacity-unpublished.test.ts.
 */
export type Offering = {
  slug: string;
  title: string;
  audience: string;
  description: string;
  href: string;
};

/**
 * WHAT THE HUB LISTS: KINDS OF WORK, NOT WAYS TO BUY LABOUR.
 *
 * It used to hold two rows — a one-off task and a weekly block of hours — so
 * the page asked the visitor to choose a staffing arrangement before it had
 * said what Endvera produces. The block of hours is unpublished (see the
 * note at the end of this file) and the remaining row described a purchasing
 * mode, not a result.
 *
 * These four are not invented for the page. They are the families the product
 * actually routes on (src/lib/families.ts: data, research, writing, admin),
 * which are in turn the eight live task categories grouped. That is the limit
 * of what may be listed: broad enough to recognise your own job in, and each
 * one something the platform genuinely takes. Nothing here promises "any
 * task" — the homepage's own limits paragraph says plainly what we refuse.
 *
 * Copy is joined by INDEX order, not by slug. The previous version mapped
 * slugs through a `Record<string, ...>` whose lookup TypeScript treats as
 * always-defined, so adding a row here with no copy compiled cleanly and then
 * crashed at render. `slug` survives as the React key and as the identifier
 * the unpublication test asserts against, not as the join.
 *
 * ORDER IS THE CONTRACT. Reordering these rows silently reassigns all four
 * languages' copy to the wrong cards, and neither the type system nor the
 * tests can see it. Add at the end.
 */
export const OFFERINGS: Offering[] = [
  {
    slug: "data",
    title: "Data & CRM",
    audience: "Records that have to be right",
    description: "Cleaning, deduplication, entry and reconciliation across exports and CRM records.",
    href: "/register",
  },
  {
    slug: "research",
    title: "Research & lists",
    audience: "Finding and checking, to written criteria",
    description: "Company and contact research, list building and analysis, with the source kept for every value.",
    href: "/register",
  },
  {
    slug: "writing",
    title: "Documents",
    audience: "Long files turned into something usable",
    description: "Key terms and dates pulled out, documents rebuilt to your template, drafts written to a brief.",
    href: "/register",
  },
  {
    slug: "admin",
    title: "Coordination",
    audience: "The recurring back-office chores",
    description: "Bounded administrative coordination: checking, compiling and keeping records in step.",
    href: "/register",
  },
  /**
   * STANDING CAPACITY WAS REMOVED FROM THIS LIST, NOT FROM THE PRODUCT.
   *
   * Its row read "Reserve a block of managed hours every week" and linked to a
   * page that priced 5h / 10h / 20h. That is what the schema actually bills,
   * so the copy was honest — and it is the one offer Endvera cannot show
   * next to "finished outcomes at a fixed price" without contradicting itself.
   *
   * Everything behind the storefront is untouched: existing accounts, their
   * portal, the admin screens and the billing all work exactly as before. The
   * public page 307s to /services (see next.config.ts).
   *
   * To bring it back: restore this row AND write a fresh card in all four
   * languages. The card copy is gone deliberately, because /services is now
   * organised by kind of work and a purchasing arrangement would not be a card
   * in that list. What is still in src/lib/i18n/services.ts is the four
   * languages of the PAGE BODY, under STANDING_I18N.
   */
];
