/**
 * Compact labels for the two "Our Services" / "How it works" links inside
 * the mobile hamburger pill (src/components/mobile-menu.tsx) — deliberately
 * shorter than the site's normal wording, not full translations. The pill
 * fits three links on one line in one fixed font size across every
 * language (see that component's own comment for why), so a label that's
 * too long in any single language forces a smaller font for all four.
 * Measured directly against real rendered Geist Sans text at 375px:
 * French's normal wording ("Comment ça marche") and Tagalog's ("Paano ito
 * gumagana") didn't leave enough room at a readable size — these
 * shortened forms do, with a real margin, not just a few pixels of luck.
 * English and Spanish keep their normal, already-short wording.
 */
import { type SiteLang } from "./langs";

export const COMPACT_SERVICES_LABEL: Record<SiteLang, string> = {
  // The operations repositioning (ADR-022) renames the hub link without
  // moving the /services route. These compact forms are chosen to stay AT OR
  // UNDER the measured lengths they replace — the pill's 375px budget was
  // measured, not estimated, and this file may not silently spend it:
  // EN 10<12, FR "Mandats" 7<8 (Québécois for entrusted engagements),
  // ES "Encargos" 8<9 (commissioned work), TL 9 vs 8 (+~5px at 10px mono,
  // inside every measured margin). FR/ES deliberately use the shorter
  // domestic word rather than the full "Opérations"/"Operaciones" the
  // footer carries — this file's own rule: compact forms, not translations.
  en: "Operations",
  fr: "Mandats",
  es: "Encargos",
  tl: "Operasyon",
};

export const COMPACT_HOW_LABEL: Record<SiteLang, string> = {
  en: "How it works",
  fr: "Fonctionnement",
  es: "Cómo funciona",
  tl: "Proseso",
};
