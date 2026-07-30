/**
 * The worker homepage speaks four languages: English, French, Spanish and
 * Tagalog (labelled FIL) — the same four the client page offers, from the
 * same shared list. The ARTIFACTS (pool rows, ledger lines, payout slip, the
 * claim card's mono controls) stay English on purpose — real tasks arrive in
 * English, and showing that is honest signaling about what the job requires.
 * The mono term labels (WORK / PAYOUT / REVIEW / IDENTITY / SCORE) belong to
 * that machine layer and stay English in every language.
 *
 * Register: natural conversational Tagalog with the loanwords Filipino
 * freelancers actually use (task, payout, review, claim, pool) — never
 * stiff textbook Filipino. French is North-American French; Spanish is
 * neutral international business Spanish.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type WorkersLang = SiteLang;

export const WORKERS_LANGS: { code: WorkersLang; label: string }[] = SITE_LANGS;

export function workersLangOf(value: string | undefined | null): WorkersLang {
  return siteLangOf(value);
}

type Dict = {
  nav: { signIn: string; apply: string };
  hero: {
    kill: string;
    h1: string;
    sub: string;
    cta: string;
    micro: string;
    cardCaption: string;
    ghost: [string, string][];
  };
  /** The Academy chapter — 01/05, the acquisition argument. The exam
   *  artifact's own strings stay English in every language (same law as the
   *  pool rows and the payout slip): the courses and exams really are in
   *  English, and a reader deserves to see that before signing up. */
  chAcademy: {
    label: string;
    h2: string;
    body: string;
    caption: string;
    english: string;
    ctaLink: string;
    ctaTail: string;
  };
  ch01: { label: string; h2: string; body: string; disclosure: string; bandCaption: string };
  ch02: { label: string; h2: string; kicker: string };
  ch03: {
    label: string;
    h2: string;
    rowPass: string;
    rowReturned: string;
    rowFail: string;
    footnote: string;
  };
  ch04: {
    label: string;
    h2: string;
    schematic: string;
    terms: (maxClaims: number, qcRounds: number) => [string, string][];
  };
  closing: { line1: string; line2: string; cta: string; funnel: string };
  footer: { how: string; signIn: string; sendWork: string };
};

const en: Dict = {
  nav: { signIn: "Sign in", apply: "Apply" },
  hero: {
    kill: "No proposals · No bidding · No commission",
    h1: "The payout is printed before you claim.",
    sub: "Overnight, tasks land priced. Pass review, get paid.",
    cta: "Apply to join the pool",
    micro: "Short application. Real vetting. The pool stays small on purpose.",
    cardCaption: "Example. Every task is priced by hand before it appears.",
    ghost: [
      ["Proposal", "not required"],
      ["Bidding", "none"],
      ["Commission", "$0.00"],
      ["Client calls", "0"],
    ],
  },
  chAcademy: {
    label: "The academy",
    h2: "12 free courses. Here is the exam.",
    body: "Every course opens the day you make an account, and your certificates are on your application when we read it.",
    caption: "One real question from the Data cleanup exam. The answer is printed on purpose.",
    english: "The courses and the exams are in English, like the work.",
    ctaLink: "See all twelve courses",
    ctaTail: "— no account needed.",
  },
  ch01: {
    label: "The pool",
    h2: "One list. Every price already on it.",
    body: "You claim what fits you. Nobody bids against you.",
    disclosure: "Example tasks. Every price is set by hand, per task.",
    bandCaption:
      "Your day is their night — Manila runs 12 hours ahead of New York (13 in winter).",
  },
  ch02: {
    label: "The slip",
    h2: "What comes out of the printed number.",
    kicker: "The printed number is the number you get.",
  },
  ch03: {
    label: "The bar",
    h2: "The bar is why the money is real.",
    rowPass: "Passes review → paid.",
    rowReturned: "Not right yet → returned with notes.",
    rowFail: "Fails final review → unpaid. Rare, by design.",
    footnote:
      "Revisions are part of the craft, not a strike. A payout is reversed only for a clear error the review missed — rare.",
  },
  ch04: {
    label: "The terms",
    h2: "You never meet the client.",
    schematic: "Everything crosses through the operator. Nothing crosses directly.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `You do the task, not the sales. Up to ${maxClaims} at once.`],
      ["PAYOUT", "The printed number. No invoices to chase."],
      ["REVIEW", `One operator reads every delivery. Sent back with notes, up to ${qcRounds} rounds.`],
      ["IDENTITY", "The client never sees your name."],
      ["SCORE", "No public stars. One reviewer, one rolling score."],
    ],
  },
  closing: {
    line1: "America goes to sleep.",
    line2: "You wake up to paid work.",
    cta: "Apply now",
    funnel:
      "Account → short application → the operator's review → the pool. Not everyone gets in. That's the point.",
  },
  footer: { how: "How it works", signIn: "Sign in", sendWork: "Send work instead" },
};

const tl: Dict = {
  nav: { signIn: "Mag-sign in", apply: "Mag-apply" },
  hero: {
    kill: "Walang proposal · Walang bidding · Walang komisyon",
    h1: "Nakalimbag ang payout bago ka mag-claim.",
    sub: "Magdamag, dumarating ang mga task na may presyo. Pumasa sa review, may bayad.",
    cta: "Mag-apply sa pool",
    micro: "Maikling application. Totoong pagsala. Sadyang maliit ang pool.",
    cardCaption: "Halimbawa. Bawat task ay presyado nang manu-mano bago lumabas.",
    ghost: [
      ["Proposal", "hindi kailangan"],
      ["Bidding", "wala"],
      ["Komisyon", "$0.00"],
      ["Tawag ng client", "0"],
    ],
  },
  chAcademy: {
    label: "Ang academy",
    h2: "12 libreng kurso. Heto ang exam.",
    body: "Bukas ang bawat kurso sa araw na gumawa ka ng account, at nasa application mo na ang mga certificate mo kapag binasa namin ito.",
    caption: "Isang totoong tanong mula sa Data cleanup exam. Sadyang nakalimbag ang sagot.",
    english: "Nasa Ingles ang mga kurso at exam, tulad ng trabaho.",
    ctaLink: "Tingnan ang lahat ng labindalawang kurso",
    ctaTail: "— hindi kailangan ng account.",
  },
  ch01: {
    label: "Ang pool",
    h2: "Isang listahan. Nakalagay na ang bawat presyo.",
    body: "Kukunin mo ang bagay sa iyo. Walang makikipag-bidding sa iyo.",
    disclosure: "Mga halimbawang task. Bawat presyo ay itinatakda nang manu-mano, kada task.",
    bandCaption:
      "Ang araw mo ay gabi nila — 12 oras na nauuna ang Maynila sa New York (13 kapag taglamig).",
  },
  ch02: {
    label: "Ang slip",
    h2: "Ano ang lumalabas sa nakalimbag na numero.",
    kicker: "Ang nakalimbag na numero ang numerong makukuha mo.",
  },
  ch03: {
    label: "Ang pamantayan",
    h2: "Ang taas ng pamantayan ang dahilan kung bakit totoo ang pera.",
    rowPass: "Pumasa sa review → bayad.",
    rowReturned: "Hindi pa tama → ibinabalik na may notes.",
    rowFail: "Bagsak sa huling review → walang bayad. Bihira, sadya.",
    footnote:
      "Bahagi ng craft ang revision, hindi ito bawas sa iyo. Babawiin lang ang payout kung may malinaw na pagkakamaling nalampasan ng review — bihira.",
  },
  ch04: {
    label: "Ang mga kondisyon",
    h2: "Hindi mo kailanman makikita ang client.",
    schematic: "Lahat dumadaan sa operator. Walang direktang daanan.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Ikaw ang gagawa ng task, hindi ng benta. Hanggang ${maxClaims} nang sabay.`],
      ["PAYOUT", "Ang nakalimbag na numero. Walang invoice na hahabulin."],
      [
        "REVIEW",
        `Isang operator ang bumabasa ng bawat delivery. Ibinabalik na may notes, hanggang ${qcRounds} round.`,
      ],
      ["IDENTITY", "Hindi makikita ng client ang pangalan mo."],
      ["SCORE", "Walang public stars. Isang reviewer, isang rolling score."],
    ],
  },
  closing: {
    line1: "Natutulog na ang Amerika.",
    line2: "Gumigising ka sa may bayad na trabaho.",
    cta: "Mag-apply na",
    funnel:
      "Account → maikling application → review ng operator → ang pool. Hindi lahat nakakapasok. Iyon mismo ang punto.",
  },
  footer: { how: "Paano ito gumagana", signIn: "Mag-sign in", sendWork: "Magpadala ng trabaho" },
};

/* North-American French: "courriel" over "email", business register, no
   France-only idioms. */
const fr: Dict = {
  nav: { signIn: "Connexion", apply: "Postuler" },
  hero: {
    kill: "Aucune proposition · Aucune enchère · Aucune commission",
    h1: "Le montant est imprimé avant que vous preniez la tâche.",
    sub: "La nuit, les tâches arrivent déjà chiffrées. Passez la révision, vous êtes payé.",
    cta: "Postuler au bassin",
    micro: "Candidature courte. Vraie sélection. Le bassin reste petit, exprès.",
    cardCaption: "Exemple. Chaque tâche est chiffrée à la main avant d'apparaître.",
    ghost: [
      ["Proposition", "non requise"],
      ["Enchères", "aucune"],
      ["Commission", "$0.00"],
      ["Appels clients", "0"],
    ],
  },
  chAcademy: {
    label: "L'académie",
    h2: "12 cours gratuits. Voici l'examen.",
    body: "Chaque cours s'ouvre le jour où vous créez un compte, et vos certificats sont sur votre candidature quand nous la lisons.",
    caption: "Une vraie question de l'examen Data cleanup. La réponse est imprimée exprès.",
    english: "Les cours et les examens sont en anglais, comme le travail.",
    ctaLink: "Voir les douze cours",
    ctaTail: "— aucun compte requis.",
  },
  ch01: {
    label: "Le bassin",
    h2: "Une seule liste. Tous les prix déjà dessus.",
    body: "Vous prenez ce qui vous convient. Personne n'enchérit contre vous.",
    disclosure: "Tâches à titre d'exemple. Chaque prix est fixé à la main, tâche par tâche.",
    bandCaption:
      "Votre journée est leur nuit — Manille a 12 heures d'avance sur New York (13 en hiver).",
  },
  ch02: {
    label: "Le bordereau",
    h2: "Ce qui sort du montant imprimé.",
    kicker: "Le montant imprimé est le montant que vous recevez.",
  },
  ch03: {
    label: "La barre",
    h2: "La barre, c'est ce qui rend l'argent réel.",
    rowPass: "Passe la révision → payé.",
    rowReturned: "Pas encore correct → retourné avec des notes.",
    rowFail: "Échoue à la révision finale → non payé. Rare, par conception.",
    footnote:
      "Les révisions font partie du métier, pas une faute au dossier. Un paiement n'est renversé que pour une erreur claire échappée à la révision — rare.",
  },
  ch04: {
    label: "Les conditions",
    h2: "Vous ne rencontrez jamais le client.",
    schematic: "Tout passe par l'opérateur. Rien ne passe directement.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Vous faites la tâche, pas la vente. Jusqu'à ${maxClaims} à la fois.`],
      ["PAYOUT", "Le montant imprimé. Aucune facture à courir après."],
      [
        "REVIEW",
        `Un opérateur lit chaque livraison. Retournée avec des notes, jusqu'à ${qcRounds} rondes.`,
      ],
      ["IDENTITY", "Le client ne voit jamais votre nom."],
      ["SCORE", "Aucune étoile publique. Un réviseur, une note continue."],
    ],
  },
  closing: {
    line1: "L'Amérique s'endort.",
    line2: "Vous vous réveillez avec du travail payé.",
    cta: "Postuler maintenant",
    funnel:
      "Compte → courte candidature → la révision de l'opérateur → le bassin. Tout le monde n'entre pas. C'est voulu.",
  },
  footer: { how: "Comment ça marche", signIn: "Connexion", sendWork: "Envoyer du travail" },
};

/* Neutral international business Spanish — tuteo, matching the client page. */
const es: Dict = {
  nav: { signIn: "Iniciar sesión", apply: "Postular" },
  hero: {
    kill: "Sin propuestas · Sin pujas · Sin comisión",
    h1: "El pago está impreso antes de que tomes la tarea.",
    sub: "De noche llegan tareas ya con precio. Pasa la revisión y cobras.",
    cta: "Postula al grupo",
    micro: "Postulación corta. Selección real. El grupo se mantiene pequeño a propósito.",
    cardCaption: "Ejemplo. Cada tarea se cotiza a mano antes de aparecer.",
    ghost: [
      ["Propuesta", "no requerida"],
      ["Pujas", "ninguna"],
      ["Comisión", "$0.00"],
      ["Llamadas de cliente", "0"],
    ],
  },
  chAcademy: {
    label: "La academia",
    h2: "12 cursos gratis. Aquí está el examen.",
    body: "Cada curso se abre el día que creas una cuenta, y tus certificados están en tu postulación cuando la leemos.",
    caption: "Una pregunta real del examen de Data cleanup. La respuesta está impresa a propósito.",
    english: "Los cursos y los exámenes son en inglés, como el trabajo.",
    ctaLink: "Ver los doce cursos",
    ctaTail: "— sin cuenta.",
  },
  ch01: {
    label: "El grupo",
    h2: "Una lista. Todos los precios ya puestos.",
    body: "Tomas lo que te queda bien. Nadie puja contra ti.",
    disclosure: "Tareas de ejemplo. Cada precio se fija a mano, tarea por tarea.",
    bandCaption:
      "Tu día es su noche — Manila va 12 horas por delante de Nueva York (13 en invierno).",
  },
  ch02: {
    label: "El comprobante",
    h2: "Qué sale del número impreso.",
    kicker: "El número impreso es el número que recibes.",
  },
  ch03: {
    label: "El estándar",
    h2: "El estándar es lo que hace real el dinero.",
    rowPass: "Pasa la revisión → pagado.",
    rowReturned: "Aún no está bien → devuelto con notas.",
    rowFail: "Falla la revisión final → sin pago. Poco común, por diseño.",
    footnote:
      "Las revisiones son parte del oficio, no una falta. Un pago se revierte solo por un error claro que la revisión no vio — poco común.",
  },
  ch04: {
    label: "Las condiciones",
    h2: "Nunca conoces al cliente.",
    schematic: "Todo pasa por el operador. Nada pasa directo.",
    terms: (maxClaims, qcRounds) => [
      ["WORK", `Haces la tarea, no la venta. Hasta ${maxClaims} a la vez.`],
      ["PAYOUT", "El número impreso. Sin facturas que perseguir."],
      [
        "REVIEW",
        `Un operador lee cada entrega. Devuelta con notas, hasta ${qcRounds} rondas.`,
      ],
      ["IDENTITY", "El cliente nunca ve tu nombre."],
      ["SCORE", "Sin estrellas públicas. Un revisor, un puntaje continuo."],
    ],
  },
  closing: {
    line1: "América se va a dormir.",
    line2: "Tú despiertas con trabajo pagado.",
    cta: "Postula ahora",
    funnel:
      "Cuenta → postulación corta → la revisión del operador → el grupo. No todos entran. Ese es el punto.",
  },
  footer: { how: "Cómo funciona", signIn: "Iniciar sesión", sendWork: "Enviar trabajo" },
};

export const WORKERS_I18N: Record<WorkersLang, Dict> = { en, fr, es, tl };
