/**
 * The four WORK FAMILIES the board is organized around — a fixed, hand-drawn
 * grouping of the eight task categories, founder-approved with the board
 * design ("variant 3"). Four hues instead of eight chips: all four are solved
 * to the same contrast (~6.9:1 on paper) so they differ in hue only and read
 * as one ink set.
 *
 * RESERVED COLORS THIS FILE MUST NEVER TOUCH: green (#166049/#1E7F5C) is
 * payout figures only; red #A82318 is deadline-urgency (≤24h) only; amber is
 * returned-work only. A category is always a DOT + LABEL in its family hue,
 * never a fill — so it can never be mistaken for a status.
 *
 * A category slug not listed here (a future category added by the operator)
 * falls back to the "other" family: neutral ink, no hue. Add it here when it
 * becomes real — this map is display metadata, not schema.
 */

export type Family = {
  key: string;
  label: string;
  /** Family ink — category labels, group names, key headers. ~6.9:1 on paper. */
  hue: string;
  /** Family tint — group-head band background, ~8.5% of hue over paper. */
  tint: string;
};

export const FAMILIES: Family[] = [
  { key: "data", label: "Data & lists", hue: "#195A7B", tint: "#E4E9E9" },
  { key: "research", label: "Research & analysis", hue: "#4B46B3", tint: "#E8E7EE" },
  { key: "writing", label: "Writing & documents", hue: "#7D3692", tint: "#EDE6EB" },
  { key: "admin", label: "Coordination", hue: "#912E6D", tint: "#EEE5E8" },
];

const OTHER: Family = { key: "other", label: "Other work", hue: "#14161A", tint: "#EDEBE6" };

/** Category slug → family, in board display order within each family. */
const FAMILY_OF: Record<string, string> = {
  "data-cleanup": "data",
  "data-entry": "data",
  "list-building": "data",
  research: "research",
  analysis: "research",
  writing: "writing",
  "document-production": "writing",
  "admin-coordination": "admin",
};

export function familyOf(categorySlug: string | null | undefined): Family {
  const key = categorySlug ? FAMILY_OF[categorySlug] : undefined;
  return FAMILIES.find((f) => f.key === key) ?? OTHER;
}

/** Board order: categories sorted family-by-family, then by their own sortOrder. */
export function familyRank(categorySlug: string | null | undefined): number {
  const fam = familyOf(categorySlug);
  const i = FAMILIES.findIndex((f) => f.key === fam.key);
  return i === -1 ? FAMILIES.length : i;
}
