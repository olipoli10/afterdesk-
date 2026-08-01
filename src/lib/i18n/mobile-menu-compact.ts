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
  en: "Our Services",
  fr: "Produits",
  es: "Servicios",
  tl: "Serbisyo",
};

export const COMPACT_HOW_LABEL: Record<SiteLang, string> = {
  en: "How it works",
  fr: "Fonctionnement",
  es: "Cómo funciona",
  tl: "Proseso",
};
