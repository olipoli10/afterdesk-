/* Phase 1.4C (corrective gate) - the ONE public chrome vocabulary plus the
   page-aware concierge corpora.

   TRUTH PROVENANCE BY CONSTRUCTION: every concierge ANSWER is composed at
   runtime from the approved public dictionaries themselves - imported
   below, never copied. public-shell.ts holds no verified-answer literal;
   the SOURCES map names the exact route + dictionary expression behind
   each page's answer, and test/public-site-cohesion.test.ts recomputes
   the composition independently so any drift or hardcoding fails.
   The base panel copy (ask/hail/title/intro/close, the unknown human
   fallback and the fail-closed unavailable line) is the already-approved
   HOME_CONCIERGE_I18N wording, reused verbatim by import.
   Only the per-page QUESTIONS and the chrome labels are authored here:
   they are UI labels, not commercial claims. */
import type { ConciergeCopy } from "@/app/_home/a2-concierge";
import { HOME_CONCIERGE_I18N } from "@/lib/i18n/home-assembly";
import { SERVICES_I18N } from "@/lib/i18n/services";
import { INSIDE_I18N } from "@/lib/i18n/inside";
import { ABOUT_I18N } from "@/lib/i18n/docs";
import { WORKERS_I18N } from "@/lib/i18n/workers";

export type SiteLang = "en" | "fr" | "es" | "tl";

export type PublicShellCopy = {
  nav: { services: string; how: string; inside: string; about: string; workers: string };
  signIn: string;
  portal: string;
  cta: string;
  menu: string;
  closeMenu: string;
  footerNote: string;
};

export const PUBLIC_SHELL_I18N: Record<SiteLang, PublicShellCopy> = {
  en: {
    nav: { services: "Operations", how: "How it works", inside: "Inside", about: "About", workers: "Work with us" },
    signIn: "Sign in",
    portal: "My account",
    cta: "Request a fixed-price quote",
    menu: "Menu",
    closeMenu: "Close menu",
    footerNote: "One request in. One verified result out.",
  },
  fr: {
    nav: { services: "Opérations", how: "Comment ça marche", inside: "Sous le capot", about: "À propos", workers: "Travailler avec nous" },
    signIn: "Connexion",
    portal: "Mon compte",
    cta: "Demander un prix fixe",
    menu: "Menu",
    closeMenu: "Fermer le menu",
    footerNote: "Une demande entre. Un résultat vérifié ressort.",
  },
  es: {
    nav: { services: "Operaciones", how: "Cómo funciona", inside: "Por dentro", about: "Quiénes somos", workers: "Trabaja con nosotros" },
    signIn: "Iniciar sesión",
    portal: "Mi cuenta",
    cta: "Pedir un precio fijo",
    menu: "Menú",
    closeMenu: "Cerrar menú",
    footerNote: "Entra una solicitud. Sale un resultado verificado.",
  },
  tl: {
    nav: { services: "Mga operasyon", how: "Paano ito gumagana", inside: "Sa loob", about: "Tungkol sa amin", workers: "Magtrabaho sa amin" },
    signIn: "Mag-sign in",
    portal: "Account ko",
    cta: "Humingi ng fixed na presyo",
    menu: "Menu",
    closeMenu: "Isara ang menu",
    footerNote: "Isang kahilingan ang pumapasok. Isang beripikadong resulta ang lumalabas.",
  },
};

type PageKey = "services" | "how" | "inside" | "about" | "workers";

/* per-page opening QUESTIONS - UI labels, not claims */
const PAGE_QUESTION: Record<PageKey, Record<SiteLang, string>> = {
  services: {
    en: "What can AfterDesk take on?",
    fr: "Que peut prendre AfterDesk?",
    es: "¿Qué puede tomar AfterDesk?",
    tl: "Ano ang kayang gawin ng AfterDesk?",
  },
  how: {
    en: "How does the fixed price work?",
    fr: "Comment fonctionne le prix fixe?",
    es: "¿Cómo funciona el precio fijo?",
    tl: "Paano gumagana ang fixed na presyo?",
  },
  inside: {
    en: "What is live today?",
    fr: "Qu'est-ce qui est en service aujourd'hui?",
    es: "¿Qué está en vivo hoy?",
    tl: "Ano ang live ngayon?",
  },
  about: {
    en: "Who owns the result?",
    fr: "Qui répond du résultat?",
    es: "¿Quién responde por el resultado?",
    tl: "Sino ang nananagot sa resulta?",
  },
  workers: {
    en: "How does the printed payout work?",
    fr: "Comment fonctionne le paiement imprimé?",
    es: "¿Cómo funciona el pago impreso?",
    tl: "Paano gumagana ang nakalimbag na payout?",
  },
};

/* the typed provenance record: route + dictionary expression per page.
   composeVerified IS the implementation of each expression, so the map,
   the runtime answer and the independent test recomputation cannot drift
   from one another without a named failure. */
export const CONCIERGE_SOURCES: Record<PageKey, { route: string; dict: string; expr: string }> = {
  services: { route: "/services", dict: "SERVICES_I18N", expr: "intro" },
  how: { route: "/inside", dict: "INSIDE_I18N", expr: "model.items[1][1]" },
  inside: { route: "/inside", dict: "INSIDE_I18N", expr: "registry.available.items[*][0] joined" },
  about: { route: "/about", dict: "ABOUT_I18N", expr: "solutionLede" },
  workers: { route: "/workers", dict: "WORKERS_I18N", expr: "hero.h1 + hero.sub" },
};

export function composeVerified(page: PageKey, lang: SiteLang): { a: string; cite: string; href: string } {
  if (page === "services") {
    const d = SERVICES_I18N[lang];
    return { a: d.intro, cite: `afterdesk.co/services · ${d.eyebrow}`, href: "/services" };
  }
  if (page === "how") {
    const d = INSIDE_I18N[lang];
    return { a: d.model.items[1][1], cite: `afterdesk.co/inside · ${d.model.h2}`, href: "/inside" };
  }
  if (page === "inside") {
    const d = INSIDE_I18N[lang];
    return {
      a: d.registry.available.items.map(([claim]) => claim).join(". ") + ".",
      cite: `afterdesk.co/inside · ${d.registry.h2}`,
      href: "/inside",
    };
  }
  if (page === "about") {
    const d = ABOUT_I18N[lang];
    return { a: d.solutionLede, cite: `afterdesk.co/about · ${d.solutionHead}`, href: "/about" };
  }
  const d = WORKERS_I18N[lang];
  return { a: `${d.hero.h1} ${d.hero.sub}`, cite: `afterdesk.co/workers · ${d.ch03.label}`, href: "/workers" };
}

export function pageConcierge(page: PageKey, lang: SiteLang): ConciergeCopy {
  const base = HOME_CONCIERGE_I18N[lang];
  const v = composeVerified(page, lang);
  return {
    ask: base.ask,
    hail: base.ask,
    title: base.title,
    intro: base.intro,
    suggestions: [PAGE_QUESTION[page][lang], base.suggestions[1], base.suggestions[2]],
    answers: {
      verified: v.a,
      verifiedCite: v.cite,
      verifiedHref: v.href,
      unknown: base.answers.unknown,
      unavailable: base.answers.unavailable,
    },
    close: base.close,
  };
}
