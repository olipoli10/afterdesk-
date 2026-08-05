/**
 * The worker homepage speaks four languages: English, French, Spanish and
 * Tagalog (labelled FIL) — the same four the client page offers, from the
 * same shared list.
 *
 * REVISED POLICY — this file used to keep every artifact (the claim card,
 * the pool rows, the payout slip) in English on the theory that real tasks
 * arrive in English, so showing that up front was honest signaling. That
 * held for genuinely English CONTENT — a real task brief, a real pool
 * listing — but the claim card's own chrome (its labels, its control text:
 * "Claim", "Paid", "Released") was never content, it was UI, and a Tagalog
 * reader landing on the page most likely to close the language gap with a
 * new applicant was reading a page that switched back to English at the
 * exact moment it demonstrated what claiming and getting paid feel like.
 * The claim card (t.claimCard below) now translates. The mono term labels
 * in ch04 (WORK / PAYOUT / REVIEW / IDENTITY / SCORE) are a narrower case —
 * they read as fixed contract-term headings on a printed schematic, closer
 * to a form's field names than to prose — and stay English for now.
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
  /** `portal` replaces signIn + apply once a session exists: both of those
   *  doors only redirect a signed-in reader back into the app, so the header
   *  offers the one destination that is actually theirs. */
  nav: { signIn: string; apply: string; portal: string; client: string; workers: string };
  hero: {
    kill: string;
    h1: string;
    sub: string;
    cta: string;
    micro: string;
    cardCaption: string;
    ghost: [string, string][];
  };
  /** The hero's claim card (src/components/live-claim-card.tsx). Its task
   *  brief text ("Tag 1,200 support tickets by topic") is realistic EXAMPLE
   *  content and stays English on the same honest-signaling logic as ch03's
   *  ledger rows — a real brief would be. Everything else on the card is UI
   *  chrome the reader has to follow to get the card's whole argument, and
   *  now translates. */
  claimCard: {
    illustrative: string;
    taskTitle: string;
    taskDetail: string;
    labelPrinted: string;
    labelReleased: string;
    claim: string;
    claimedAt: string;
    inReview: string;
    paid: string;
  };
  /** The Academy chapter — 01/05, the acquisition argument. The one public
   *  sample question (t.sampleExam below, wired via src/lib/academy/
   *  sample-i18n.ts) now translates — see the note there for why that one
   *  exception exists while the real courses behind the account stay
   *  English. */
  chAcademy: {
    label: string;
    h2: string;
    body: string;
    caption: string;
    english: string;
    ctaLink: (courses: number) => string;
    ctaTail: string;
    stats: { courses: string; lessons: string; questions: string };
  };
  ch01: { label: string; h2: string; body: string; disclosure: string; bandCaption: string };
  /** The payout slip (03/05 THE SLIP). Field labels and the zero-cost list
   *  are UI chrome, same treatment as claimCard above, and now translate. */
  ch02: {
    label: string;
    h2: string;
    kicker: string;
    fixed: string;
    fieldTask: string;
    fieldClaimed: string;
    fieldDelivered: string;
    fieldReview: string;
    passed: string;
    released: string;
    zeros: [string, string][];
  };
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
  closing: {
    line1: string;
    line2: string;
    cta: string;
    funnel: string;
    /** The non-conditional body path to /academy. The chapter link higher up
     *  disappears when the sample exam fails to load; the closing one never
     *  does, so the not-ready-yet candidate always has a next step. */
    academyLine: string;
    academyCta: string;
  };
  footer: { about: string; how: string; signIn: string; sendWork: string };
  /** UI chrome for src/components/sample-exam.tsx — the "pick an answer"
   *  prompt, the miss message, and the correct-answer eyebrow. The question
   *  itself (prompt/options/explain) is a separate translation, in
   *  src/lib/academy/sample-i18n.ts, because it has to line up 1:1 with one
   *  specific question inside the real (English) course content. */
  sampleExamUi: {
    pickOne: string;
    notThatOne: string;
    keepGoingPrefix: string;
    freeWithAccount: string;
    correct: string;
  };
  /** Copy for the public counters strip (src/components/public-counters.tsx)
   *  under both homepage heroes. taskWord/workerWord are [singular, plural],
   *  picked by the live count. */
  counters: {
    taskWord: [string, string];
    workerWord: [string, string];
    released: string;
    toDate: string;
  };
};

const en: Dict = {
  nav: { signIn: "Sign in", apply: "Apply", portal: "My account", client: "Get work done", workers: "For workers" },
  hero: {
    kill: "No proposals · No bidding · No commission",
    h1: "The payout is printed before you claim.",
    sub: "Tasks arrive with a defined scope and printed payout. Pass review, get paid.",
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
  claimCard: {
    illustrative: "Illustrative",
    taskTitle: "Tag 1,200 support tickets by topic",
    taskDetail: "One sheet, topic per row, every ticket tagged",
    labelPrinted: "Payout, printed",
    labelReleased: "Released",
    claim: "Claim",
    claimedAt: "Claimed 7:22 AM",
    inReview: "In review",
    paid: "Paid",
  },
  chAcademy: {
    label: "The virtual assistant academy",
    h2: "Free courses. Here is the exam.",
    body: "Every course opens the day you make an account, and your certificates are on your application when we read it.",
    caption: "One real question from the Data cleanup exam. Answer it yourself. Nothing is hidden.",
    english: "The courses and the exams are in English, like the work.",
    ctaLink: (n) => `See all ${n} free courses`,
    ctaTail: "· no account needed.",
    stats: { courses: "courses", lessons: "lessons", questions: "exam questions" },
  },
  ch01: {
    label: "The pool",
    h2: "One list. Every price already on it.",
    body: "You claim what fits you. Nobody bids against you.",
    disclosure: "Example tasks. Every price is set by hand, per task.",
    bandCaption:
      "Your day is their night: Manila, Philippines runs 12 hours ahead of New York (13 in winter).",
  },
  ch02: {
    label: "The slip",
    h2: "What comes out of the printed number.",
    kicker: "The printed number is the number you get.",
    fixed: "Fixed",
    fieldTask: "TASK",
    fieldClaimed: "CLAIMED",
    fieldDelivered: "DELIVERED",
    fieldReview: "REVIEW",
    passed: "PASSED",
    released: "RELEASED",
    zeros: [
      ["Bidding fee", "$0.00"],
      ["Proposal writing", "$0.00"],
      ["Commission off your rate", "$0.00"],
      ["Client calls", "0"],
    ],
  },
  ch03: {
    /* "The bar" meant the quality bar, and English was the last language
       still saying it that way — fr/es/tl had all already moved to
       standard/estándar/pamantayan. It read as a noun with three other
       meanings and sent at least one reader looking for a claim about
       earning potential, which is not what this chapter is about: pass the
       review and you are paid, and that is why the printed number holds. */
    label: "The standard",
    h2: "The standard is why the payout is real.",
    rowPass: "Passes review → paid.",
    rowReturned: "Not right yet → returned with notes.",
    rowFail: "Fails final review → unpaid. Rare, by design.",
    footnote:
      "Revisions are part of the craft, not a strike. A payout is reversed only for a clear error the review missed. Rare.",
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
    academyLine: "Not ready to apply yet?",
    academyCta: "Start with the free training",
  },
  footer: { about: "About us", how: "How it works", signIn: "Sign in", sendWork: "Send work instead" },
  sampleExamUi: {
    pickOne: "Pick an answer",
    notThatOne: "Not that one.",
    keepGoingPrefix: "Keep going, or take the course it comes from,",
    freeWithAccount: "free with an account",
    correct: "CORRECT",
  },
  counters: {
    taskWord: ["task delivered", "tasks delivered"],
    workerWord: ["approved worker", "approved workers"],
    released: "released to workers",
    toDate: "To date,",
  },
};

const tl: Dict = {
  nav: { signIn: "Mag-sign in", apply: "Mag-apply", portal: "Account ko", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  hero: {
    kill: "Walang proposal · Walang bidding · Walang komisyon",
    h1: "Nakalimbag ang payout bago ka mag-claim.",
    sub: "Dumarating ang mga task na may malinaw na scope at payout. Pumasa sa review, may bayad.",
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
  claimCard: {
    illustrative: "Halimbawa",
    taskTitle: "Tag 1,200 support tickets by topic",
    taskDetail: "One sheet, topic per row, every ticket tagged",
    labelPrinted: "Payout, nakalimbag na",
    labelReleased: "Napalabas na",
    claim: "I-claim",
    claimedAt: "Na-claim 7:22 AM",
    inReview: "Sinusuri",
    paid: "Bayad na",
  },
  chAcademy: {
    label: "Ang virtual assistant academy",
    h2: "Libreng kurso. Heto ang exam.",
    body: "Bukas ang bawat kurso sa araw na gumawa ka ng account, at nasa application mo na ang mga certificate mo kapag binasa namin ito.",
    caption: "Isang totoong tanong mula sa Data cleanup exam. Sagutin mo mismo. Walang itinatago.",
    english: "Nasa Ingles ang mga kurso at exam, tulad ng trabaho.",
    ctaLink: (n) => `Tingnan ang lahat ng ${n} libreng kurso`,
    ctaTail: "· hindi kailangan ng account.",
    stats: { courses: "na kurso", lessons: "na leksyon", questions: "na tanong sa exam" },
  },
  ch01: {
    label: "Ang pool",
    h2: "Isang listahan. Nakalagay na ang bawat presyo.",
    body: "Kukunin mo ang bagay sa iyo. Walang makikipag-bidding sa iyo.",
    disclosure: "Mga halimbawang task. Bawat presyo ay itinatakda nang manu-mano, kada task.",
    bandCaption:
      "Ang araw mo ay gabi nila: 12 oras na nauuna ang Maynila, Pilipinas sa New York (13 kapag taglamig).",
  },
  ch02: {
    label: "Ang slip",
    h2: "Ano ang lumalabas sa nakalimbag na numero.",
    kicker: "Ang nakalimbag na numero ang numerong makukuha mo.",
    fixed: "Fixed",
    fieldTask: "TASK",
    fieldClaimed: "NA-CLAIM",
    fieldDelivered: "NAIHATID",
    fieldReview: "REVIEW",
    passed: "PUMASA",
    released: "NAPALABAS",
    zeros: [
      ["Bidding fee", "$0.00"],
      ["Pagsulat ng proposal", "$0.00"],
      ["Komisyon sa rate mo", "$0.00"],
      ["Tawag ng client", "0"],
    ],
  },
  ch03: {
    label: "Ang pamantayan",
    h2: "Ang taas ng pamantayan ang dahilan kung bakit totoo ang pera.",
    rowPass: "Pumasa sa review → bayad.",
    rowReturned: "Hindi pa tama → ibinabalik na may notes.",
    rowFail: "Bagsak sa huling review → walang bayad. Bihira, sadya.",
    footnote:
      "Bahagi ng craft ang revision, hindi ito bawas sa iyo. Babawiin lang ang payout kung may malinaw na pagkakamaling nalampasan ng review. Bihira.",
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
    academyLine: "Hindi ka pa handang mag-apply?",
    academyCta: "Magsimula sa libreng training",
  },
  footer: { about: "Tungkol sa amin", how: "Paano ito gumagana", signIn: "Mag-sign in", sendWork: "Magpadala ng trabaho" },
  sampleExamUi: {
    pickOne: "Pumili ng sagot",
    notThatOne: "Hindi iyan.",
    keepGoingPrefix: "Tuloy lang, o kunin ang kurso kung saan ito galing,",
    freeWithAccount: "libre kasama ang account",
    correct: "TAMA",
  },
  counters: {
    taskWord: ["task na naihatid", "mga task na naihatid"],
    workerWord: ["inaprubahang manggagawa", "mga inaprubahang manggagawa"],
    released: "napunta sa mga manggagawa",
    toDate: "Sa ngayon,",
  },
};

/* North-American French: "courriel" over "email", business register, no
   France-only idioms. */
const fr: Dict = {
  nav: { signIn: "Connexion", apply: "Postuler", portal: "Mon compte", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  hero: {
    kill: "Aucune proposition · Aucune enchère · Aucune commission",
    h1: "Le montant est imprimé avant que vous preniez la tâche.",
    sub: "Les tâches arrivent avec un périmètre défini et un montant imprimé. Passez la révision, vous êtes payé.",
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
  claimCard: {
    illustrative: "Illustratif",
    taskTitle: "Tag 1,200 support tickets by topic",
    taskDetail: "One sheet, topic per row, every ticket tagged",
    labelPrinted: "Paiement, imprimé",
    labelReleased: "Libéré",
    claim: "Réclamer",
    claimedAt: "Réclamée 7 h 22",
    inReview: "En révision",
    paid: "Payé",
  },
  chAcademy: {
    label: "L'académie d'adjoint virtuel",
    h2: "Des cours gratuits. Voici l'examen.",
    body: "Chaque cours s'ouvre le jour où vous créez un compte, et vos certificats sont sur votre candidature quand nous la lisons.",
    caption: "Une vraie question de l'examen Data cleanup. Répondez vous-même. Rien n'est caché.",
    english: "Les cours et les examens sont en anglais, comme le travail.",
    ctaLink: (n) => `Voir les ${n} cours gratuits`,
    ctaTail: "· aucun compte requis.",
    stats: { courses: "cours", lessons: "leçons", questions: "questions d'examen" },
  },
  ch01: {
    label: "Le bassin",
    h2: "Une seule liste. Tous les prix déjà dessus.",
    body: "Vous prenez ce qui vous convient. Personne n'enchérit contre vous.",
    disclosure: "Tâches à titre d'exemple. Chaque prix est fixé à la main, tâche par tâche.",
    bandCaption:
      "Votre journée est leur nuit : Manille, aux Philippines, a 12 heures d'avance sur New York (13 en hiver).",
  },
  ch02: {
    label: "Le bordereau",
    h2: "Ce qui sort du montant imprimé.",
    kicker: "Le montant imprimé est le montant que vous recevez.",
    fixed: "Fixe",
    fieldTask: "TÂCHE",
    fieldClaimed: "RÉCLAMÉE",
    fieldDelivered: "LIVRÉE",
    fieldReview: "RÉVISION",
    passed: "RÉUSSIE",
    released: "LIBÉRÉ",
    zeros: [
      ["Frais d'enchère", "$0.00"],
      ["Rédaction de proposition", "$0.00"],
      ["Commission sur votre tarif", "$0.00"],
      ["Appels clients", "0"],
    ],
  },
  ch03: {
    /* "La barre" was a literal translation of "the bar" and it means
       nothing in French — a barre is a rod, a helm, or a courtroom. The
       other two locales already had the right word (El estándar / Ang
       pamantayan); French was the only one still wearing the calque. */
    label: "Le standard",
    h2: "C'est le standard qui rend votre paye fiable.",
    rowPass: "Passe la révision → payé.",
    rowReturned: "Pas encore correct → retourné avec des notes.",
    rowFail: "Échoue à la révision finale → non payé. Rare, par conception.",
    footnote:
      "Les révisions font partie du métier, pas une faute au dossier. Un paiement n'est renversé que pour une erreur claire échappée à la révision. Rare.",
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
    academyLine: "Pas encore prêt à postuler ?",
    academyCta: "Commencez par la formation gratuite",
  },
  footer: { about: "Qui nous sommes", how: "Comment ça marche", signIn: "Connexion", sendWork: "Envoyer du travail" },
  sampleExamUi: {
    pickOne: "Choisissez une réponse",
    notThatOne: "Pas celle-là.",
    keepGoingPrefix: "Continuez, ou suivez le cours dont elle vient,",
    freeWithAccount: "gratuit avec un compte",
    correct: "CORRECT",
  },
  counters: {
    taskWord: ["tâche livrée", "tâches livrées"],
    workerWord: ["travailleur approuvé", "travailleurs approuvés"],
    released: "reversés aux travailleurs",
    toDate: "À ce jour,",
  },
};

/* Neutral international business Spanish — tuteo, matching the client page. */
const es: Dict = {
  nav: { signIn: "Iniciar sesión", apply: "Postular", portal: "Mi cuenta", client: "Haz que se haga", workers: "Para trabajadores" },
  hero: {
    kill: "Sin propuestas · Sin pujas · Sin comisión",
    h1: "El pago está impreso antes de que tomes la tarea.",
    sub: "Las tareas llegan con alcance y pago definidos. Pasa la revisión y cobras.",
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
  claimCard: {
    illustrative: "Ilustrativo",
    taskTitle: "Tag 1,200 support tickets by topic",
    taskDetail: "One sheet, topic per row, every ticket tagged",
    labelPrinted: "Pago, impreso",
    labelReleased: "Liberado",
    claim: "Reclamar",
    claimedAt: "Reclamada 7:22 a. m.",
    inReview: "En revisión",
    paid: "Pagado",
  },
  chAcademy: {
    label: "La academia de asistente virtual",
    h2: "Cursos gratis. Aquí está el examen.",
    body: "Cada curso se abre el día que creas una cuenta, y tus certificados están en tu postulación cuando la leemos.",
    caption: "Una pregunta real del examen de Data cleanup. Respóndela tú mismo. Nada está oculto.",
    english: "Los cursos y los exámenes son en inglés, como el trabajo.",
    ctaLink: (n) => `Ver los ${n} cursos gratis`,
    ctaTail: "· sin cuenta.",
    stats: { courses: "cursos", lessons: "lecciones", questions: "preguntas de examen" },
  },
  ch01: {
    label: "El grupo",
    h2: "Una lista. Todos los precios ya puestos.",
    body: "Tomas lo que te queda bien. Nadie puja contra ti.",
    disclosure: "Tareas de ejemplo. Cada precio se fija a mano, tarea por tarea.",
    bandCaption:
      "Tu día es su noche: Manila, Filipinas, va 12 horas por delante de Nueva York (13 en invierno).",
  },
  ch02: {
    label: "El comprobante",
    h2: "Qué sale del número impreso.",
    kicker: "El número impreso es el número que recibes.",
    fixed: "Fijo",
    fieldTask: "TAREA",
    fieldClaimed: "RECLAMADA",
    fieldDelivered: "ENTREGADA",
    fieldReview: "REVISIÓN",
    passed: "APROBADA",
    released: "LIBERADO",
    zeros: [
      ["Cuota de puja", "$0.00"],
      ["Redacción de propuesta", "$0.00"],
      ["Comisión sobre tu tarifa", "$0.00"],
      ["Llamadas de cliente", "0"],
    ],
  },
  ch03: {
    label: "El estándar",
    h2: "El estándar es lo que hace real el dinero.",
    rowPass: "Pasa la revisión → pagado.",
    rowReturned: "Aún no está bien → devuelto con notas.",
    rowFail: "Falla la revisión final → sin pago. Poco común, por diseño.",
    footnote:
      "Las revisiones son parte del oficio, no una falta. Un pago se revierte solo por un error claro que la revisión no vio. Poco común.",
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
    academyLine: "¿Aún no listo para postular?",
    academyCta: "Empieza con la formación gratuita",
  },
  footer: { about: "Quiénes somos", how: "Cómo funciona", signIn: "Iniciar sesión", sendWork: "Enviar trabajo" },
  sampleExamUi: {
    pickOne: "Elige una respuesta",
    notThatOne: "Esa no.",
    keepGoingPrefix: "Sigue intentando, o toma el curso de donde viene,",
    freeWithAccount: "gratis con una cuenta",
    correct: "CORRECTO",
  },
  counters: {
    taskWord: ["tarea entregada", "tareas entregadas"],
    workerWord: ["trabajador aprobado", "trabajadores aprobados"],
    released: "liberados a los trabajadores",
    toDate: "Hasta la fecha,",
  },
};

export const WORKERS_I18N: Record<WorkersLang, Dict> = { en, fr, es, tl };
