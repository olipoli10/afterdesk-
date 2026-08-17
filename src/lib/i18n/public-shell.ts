/* Phase 1.4C - the ONE public chrome vocabulary, four languages in strict
   parallel, plus the page-aware concierge corpora. Every concierge answer
   is composed from sentences already published in the approved public
   dictionaries (home-assembly, inside, workers, how-it-works, about) -
   no new commercial claim, no automation claim, no model. */
import type { ConciergeCopy } from "@/app/_home/a2-concierge";

export type SiteLang = "en" | "fr" | "es" | "tl";

export type PublicShellCopy = {
  nav: { services: string; how: string; inside: string; about: string; workers: string };
  signIn: string;
  portal: string;
  cta: string;
  footerNote: string;
};

export const PUBLIC_SHELL_I18N: Record<SiteLang, PublicShellCopy> = {
  en: {
    nav: { services: "Operations", how: "How it works", inside: "Inside", about: "About", workers: "Work with us" },
    signIn: "Sign in",
    portal: "My account",
    cta: "Request a fixed-price quote",
    footerNote: "One request in. One verified result out.",
  },
  fr: {
    nav: { services: "Opérations", how: "Comment ça marche", inside: "Sous le capot", about: "À propos", workers: "Travailler avec nous" },
    signIn: "Connexion",
    portal: "Mon compte",
    cta: "Demander un prix fixe",
    footerNote: "Une demande entre. Un résultat vérifié ressort.",
  },
  es: {
    nav: { services: "Operaciones", how: "Cómo funciona", inside: "Por dentro", about: "Quiénes somos", workers: "Trabaja con nosotros" },
    signIn: "Iniciar sesión",
    portal: "Mi cuenta",
    cta: "Pedir un precio fijo",
    footerNote: "Entra una solicitud. Sale un resultado verificado.",
  },
  tl: {
    nav: { services: "Mga operasyon", how: "Paano ito gumagana", inside: "Sa loob", about: "Tungkol sa amin", workers: "Magtrabaho sa amin" },
    signIn: "Mag-sign in",
    portal: "Account ko",
    cta: "Humingi ng fixed na presyo",
    footerNote: "Isang kahilingan ang pumapasok. Isang beripikadong resulta ang lumalabas.",
  },
};

/* ---- page-aware concierge corpora ------------------------------------- */
/* The A2 panel exposes exactly three canned exchanges per page:
   verified (a cited fact from the page's own published copy), unknown
   (the honest human fallback) and unavailable (the honest offline line).
   The unknown/unavailable lines are the approved home wording. */

const UNKNOWN = {
  en: "That is outside what this guide can answer from the approved corpus. A person can:",
  fr: "Cela dépasse ce que ce guide peut répondre depuis le corpus approuvé. Une personne peut aider :",
  es: "Eso queda fuera de lo que esta guía puede responder desde el corpus aprobado. Una persona puede ayudar:",
  tl: "Lampas iyan sa masasagot ng gabay na ito mula sa aprubadong corpus. May taong makakatulong:",
} as const;

const UNAVAILABLE = {
  en: "The guide is offline right now and fails closed: no answer is better than an invented one.",
  fr: "Le guide est hors ligne et échoue fermé : aucune réponse vaut mieux qu'une réponse inventée.",
  es: "La guía está fuera de línea y falla cerrada: ninguna respuesta es mejor que una inventada.",
  tl: "Offline ang gabay ngayon at nagsasara nang ligtas: mas mabuti ang walang sagot kaysa imbentong sagot.",
} as const;

const ASK = {
  en: "Ask AfterDesk",
  fr: "Demandez à AfterDesk",
  es: "Pregunta a AfterDesk",
  tl: "Magtanong sa AfterDesk",
} as const;

const CLOSE = { en: "Close", fr: "Fermer", es: "Cerrar", tl: "Isara" } as const;
const TITLE = { en: "AfterDesk guide", fr: "Guide AfterDesk", es: "Guía AfterDesk", tl: "Gabay ng AfterDesk" } as const;

const INTRO = {
  en: "A site guide with approved answers and citations. It never invents; when it does not know, it says so.",
  fr: "Un guide du site avec réponses approuvées et citations. Il n'invente jamais; quand il ne sait pas, il le dit.",
  es: "Una guía del sitio con respuestas aprobadas y citas. Nunca inventa; cuando no sabe, lo dice.",
  tl: "Gabay ng site na may aprubadong sagot at citation. Hindi ito nag-iimbento; kapag hindi alam, sinasabi nito.",
} as const;

const CITE_INSIDE = {
  en: "afterdesk.co/inside · Operating standard",
  fr: "afterdesk.co/inside · Standard d'exploitation",
  es: "afterdesk.co/inside · Estándar operativo",
  tl: "afterdesk.co/inside · Pamantayan ng operasyon",
} as const;

type PageKey = "services" | "how" | "inside" | "about" | "workers";

/* verified answers quote the page's own published sentences */
const VERIFIED: Record<PageKey, Record<SiteLang, { q: string; a: string; cite: string; href: string }>> = {
  services: {
    en: { q: "What can AfterDesk take on?", a: "Four families, and they are the ones the platform actually takes: Data & CRM, Research & lists, Documents, and bounded Coordination. Not everything fits, and we say so before you pay.", cite: CITE_INSIDE.en, href: "/inside" },
    fr: { q: "Que peut prendre AfterDesk?", a: "Quatre familles, celles que la plateforme prend réellement : Données & CRM, Recherche & listes, Documents et Coordination bornée. Tout ne convient pas, et nous le disons avant que vous payiez.", cite: CITE_INSIDE.fr, href: "/inside" },
    es: { q: "¿Qué puede tomar AfterDesk?", a: "Cuatro familias, las que la plataforma realmente toma: Datos & CRM, Investigación & listas, Documentos y Coordinación acotada. No todo encaja, y lo decimos antes de que pague.", cite: CITE_INSIDE.es, href: "/inside" },
    tl: { q: "Ano ang kayang gawin ng AfterDesk?", a: "Apat na pamilya, at iyon ang tunay na tinatanggap ng platform: Data & CRM, Research & lists, Documents, at hangganang Coordination. Hindi lahat ay kasya, at sinasabi namin bago ka magbayad.", cite: CITE_INSIDE.tl, href: "/inside" },
  },
  how: {
    en: { q: "How does the fixed price work?", a: "AfterDesk clarifies the request and freezes a written scope with one fixed price. You approve before anything starts, and nothing added later can quietly grow what you agreed to.", cite: CITE_INSIDE.en, href: "/inside" },
    fr: { q: "Comment fonctionne le prix fixe?", a: "AfterDesk clarifie la demande et gèle une portée écrite avec un prix fixe. Vous approuvez avant tout début, et rien d'ajouté ensuite ne peut grossir en douce ce que vous avez accepté.", cite: CITE_INSIDE.fr, href: "/inside" },
    es: { q: "¿Cómo funciona el precio fijo?", a: "AfterDesk aclara la solicitud y congela un alcance escrito con un precio fijo. Usted aprueba antes de que empiece nada, y nada añadido después puede crecer en silencio.", cite: CITE_INSIDE.es, href: "/inside" },
    tl: { q: "Paano gumagana ang fixed na presyo?", a: "Nililinaw ng AfterDesk ang kahilingan at nagyeyelo ng nakasulat na saklaw na may isang fixed na presyo. Aprubado mo bago magsimula, at walang idinagdag pagkatapos ang tahimik na makakapagpalaki nito.", cite: CITE_INSIDE.tl, href: "/inside" },
  },
  inside: {
    en: { q: "What is live today?", a: "A written scope and one fixed price, managed execution to a written standard, a person reviewing every delivery, evidence kept, and clear refusals. The registry on this page is the source of truth.", cite: CITE_INSIDE.en, href: "/inside" },
    fr: { q: "Qu'est-ce qui est en service aujourd'hui?", a: "Une portée écrite et un prix fixe, une exécution gérée selon un standard écrit, une personne qui revoit chaque livraison, des preuves conservées et des refus clairs. Le registre de cette page fait foi.", cite: CITE_INSIDE.fr, href: "/inside" },
    es: { q: "¿Qué está en vivo hoy?", a: "Un alcance escrito y un precio fijo, ejecución gestionada según un estándar escrito, una persona que revisa cada entrega, evidencia conservada y rechazos claros. El registro de esta página es la fuente de verdad.", cite: CITE_INSIDE.es, href: "/inside" },
    tl: { q: "Ano ang live ngayon?", a: "Nakasulat na saklaw at isang fixed na presyo, pinamamahalaang execution ayon sa nakasulat na pamantayan, taong nagrerebyu ng bawat delivery, iniingatang ebidensya, at malinaw na pagtanggi. Ang registry sa pahinang ito ang pinagmumulan ng katotohanan.", cite: CITE_INSIDE.tl, href: "/inside" },
  },
  about: {
    en: { q: "Who owns the result?", a: "AfterDesk does. The approved brief and review standard stay attached to the task from scope to delivery, and the finished work is checked against that standard before it reaches you.", cite: CITE_INSIDE.en, href: "/inside" },
    fr: { q: "Qui répond du résultat?", a: "AfterDesk. Le brief approuvé et le standard de revue restent attachés à la tâche de la portée à la livraison, et le travail fini est vérifié contre ce standard avant de vous parvenir.", cite: CITE_INSIDE.fr, href: "/inside" },
    es: { q: "¿Quién responde por el resultado?", a: "AfterDesk. El brief aprobado y el estándar de revisión permanecen unidos a la tarea del alcance a la entrega, y el trabajo terminado se verifica contra ese estándar antes de llegarle.", cite: CITE_INSIDE.es, href: "/inside" },
    tl: { q: "Sino ang nananagot sa resulta?", a: "Ang AfterDesk. Ang aprubadong brief at pamantayan ng review ay nakakabit sa gawain mula saklaw hanggang delivery, at ang tapos na trabaho ay sinusuri laban sa pamantayang iyon bago umabot sa iyo.", cite: CITE_INSIDE.tl, href: "/inside" },
  },
  workers: {
    en: { q: "How does the printed payout work?", a: "Tasks arrive with a defined scope and printed payout - no bidding, no proposals, no commission. Pass review, get paid; not right yet comes back with notes.", cite: "afterdesk.co/workers · The standard", href: "/workers" },
    fr: { q: "Comment fonctionne le paiement imprimé?", a: "Les tâches arrivent avec une portée définie et un paiement imprimé - sans enchères, sans propositions, sans commission. La revue passe, vous êtes payé; pas encore juste revient avec des notes.", cite: "afterdesk.co/workers · Le standard", href: "/workers" },
    es: { q: "¿Cómo funciona el pago impreso?", a: "Las tareas llegan con un alcance definido y un pago impreso - sin pujas, sin propuestas, sin comisión. Pasa la revisión, cobra; lo que aún no está bien vuelve con notas.", cite: "afterdesk.co/workers · El estándar", href: "/workers" },
    tl: { q: "Paano gumagana ang nakalimbag na payout?", a: "Dumarating ang mga gawain na may tiyak na saklaw at nakalimbag na payout - walang bidding, walang proposal, walang komisyon. Pumasa sa review, bayad ka; ang hindi pa tama ay bumabalik na may notes.", cite: "afterdesk.co/workers · Ang pamantayan", href: "/workers" },
  },
};

const GUIDE_DOWN_Q = {
  en: "What if the guide is unavailable?",
  fr: "Et si le guide est indisponible?",
  es: "¿Y si la guía no está disponible?",
  tl: "Paano kung hindi available ang gabay?",
} as const;

const HUMAN_Q = {
  en: "Can a person help me directly?",
  fr: "Une personne peut-elle m'aider directement?",
  es: "¿Puede ayudarme una persona directamente?",
  tl: "May tao bang makakatulong sa akin nang direkta?",
} as const;

export function pageConcierge(page: PageKey, lang: SiteLang): ConciergeCopy {
  const v = VERIFIED[page][lang];
  return {
    ask: ASK[lang],
    hail: ASK[lang],
    title: TITLE[lang],
    intro: INTRO[lang],
    suggestions: [v.q, HUMAN_Q[lang], GUIDE_DOWN_Q[lang]],
    answers: {
      verified: v.a,
      verifiedCite: v.cite,
      verifiedHref: v.href,
      unknown: UNKNOWN[lang],
      unavailable: UNAVAILABLE[lang],
    },
    close: CLOSE[lang],
  };
}
