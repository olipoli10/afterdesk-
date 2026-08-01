/**
 * The client homepage speaks English, French, Spanish and Tagalog (labelled
 * FIL) — the same four the worker page offers, from the same shared list.
 *
 * THE RULE, REVISED: the VOICE translates, and so now does anything a reader
 * has to actually UNDERSTAND to follow what's happening — including the live
 * task window's stamps and status line. The distinction that survives is
 * narrower than "machine vs voice": raw DATA (clock times, prices, filenames,
 * task IDs like task_0448) stays literal because it isn't language, but the
 * WORDS describing what that data means are voice and must translate. The
 * original rule read "6:41 PM · task received" as machine output because it
 * looks like a log line — but a Filipino-speaking visitor reading only
 * "task received" in English mid-sentence doesn't experience a log, they
 * experience a gap in a page that was otherwise speaking to them. Literal
 * data (t.liveWindow does not translate "task_0448" or "$74") stays put;
 * every word around it now lives in t.liveWindow below.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type ClientLang = SiteLang;

export const CLIENT_LANGS: { code: ClientLang; label: string }[] = SITE_LANGS;

export function clientLangOf(value: string | undefined | null): ClientLang {
  return siteLangOf(value);
}

type Dict = {
  /** `portal` replaces signIn + send once a session exists: both of those
   *  doors only redirect a signed-in reader back into the app, so the header
   *  offers the one destination that is actually theirs. Same key, same words
   *  as the worker storefront (src/lib/i18n/workers.ts) — the audience toggle
   *  swaps between the two headers and the door must not rename itself. */
  nav: { signIn: string; send: string; portal: string; client: string; workers: string };
  hero: {
    line1: string;
    line2: string;
    cta: string;
    /** Sits directly under the CTA, same micro-copy convention as the
     *  Academy hero's "You can start the first course tonight." — the
     *  literal answer to "so what actually happens if I click this": the
     *  card is authorized, not charged, and stays that way on both sides
     *  (you, and the specialist) until you approve the delivery. */
    guarantee: string;
    /** The hero's sr-only description of the animated live task window, for
     *  anyone who cannot see it. Takes liveWindow.taskTitle so the quoted
     *  task matches the window itself; the price ($74) and clock times stay
     *  literal data, same as everywhere else on this page.
     *
     *  A small EXAMPLE chip used to restate that title and that $74 in text
     *  right under the CTA, because the window was desktop-only and a phone
     *  would otherwise never see a real number. The window plays on phones
     *  now, directly under the headline, so the chip was two more lines
     *  saying what the picture above them already said. */
    srPreview: (title: string) => string;
  };
  /* NO CAPTION. This chapter had two in a row and both said nothing the
     picture wasn't already saying: first an invented client quote, then a
     museum label ("one file, before and after one night") describing a
     before/after of one file. The artifact prints its own filename, both
     clock times and an OVERNIGHT divider; the chapter label above it says
     "the overnight diff". A third restatement is not a caption, it is
     throat-clearing. The sr-only paragraph in page.tsx carries the full
     description for anyone who cannot see the artifact. */
  ch01: { label: string };
  ch02: {
    label: string;
    noMeter: string;
    captions: [string, string, string];
    /** The quote slip's own field labels and controls. "QUOTE #0412" and the
     *  RETURNS value ("7:07 AM ET") are literal data and don't move. */
    fixed: string;
    fieldTask: string;
    taskValue: string;
    fieldScope: string;
    scopeValue: string;
    fieldReturns: string;
    fieldTotal: string;
    approve: string;
    askQuestion: string;
  };
  ch03: {
    label: string;
    h2: string;
    /** Illustrative examples. HARD RULE: neither an amount nor a task domain
     *  here may appear in the worker page's pool (src/app/workers/page.tsx —
     *  $38/$48/$54/$66/$72/$120, tickets/addresses/zoning/order forms/
     *  receipts/statements). If the two sets ever meet, the margin becomes
     *  derivable across the two pages. The published range below is computed
     *  from these rows, so it inherits the same rule. */
    rows: [string, string, string][];
    /** Honesty label under the computed range. Translated on purpose: a
     *  label nobody can read is not a disclosure. */
    note: string;
  };
  ch04: {
    label: string;
    h2: string;
    laneYou: string;
    laneThem: string;
    /** The only DST-honest phrasing of the offset. The live needle makes it
     *  load-bearing: the lane actually shifts by an hour in winter. */
    note: string;
    steps: [string, string][];
  };
  ch05: {
    label: string;
    h2: string;
    /** Vertical label on the hatched operator wall. */
    wall: string;
    /** Caption above the review artifact — EXAMPLE, outside the artifact. */
    desk: string;
    /**
     * [WHICH ALTERNATIVE, what that costs you, what happens here].
     *
     * The first slot is the fix for the thing that made this table
     * unreadable: a single pair of column headers ("Hiring a freelancer" /
     * "Sending a task") sat above the rows and scrolled away after the
     * first one, so anyone moving at reading speed met four unattributed
     * sentences either side of a hatch. Worse, that one header was a lie of
     * omission — the left column silently mixed a freelance marketplace
     * (read forty proposals, hourly meters) with employing somebody
     * (interview, onboard, manage), which are different alternatives with
     * different costs.
     *
     * So every row now names its own opponent, and the label travels with
     * the sentence it belongs to. It cannot scroll away, it needs no sticky
     * positioning to survive a phone, and across four rows the reader sees
     * that three different ways of getting this done all lose — which is
     * the actual argument, and it was previously invisible.
     */
    pairs: [string, string, string][];
  };
  /** The trim edge. The old chapter 06 (GENERAL NOTES) restated chapters
   *  02–05 in smaller type; the two clauses that carried NEW information
   *  (retention, refusals) now live on /how-it-works as §06 and NOT IN
   *  SCOPE, so this is the pointer to them rather than a sixth chapter. */
  close: { protocol: string };
  footer: { about: string; how: string; signIn: string; work: string };
  /** The hero's live task window (src/components/live-task-window.tsx). Five
   *  stamps and their status lines, in the STEPS order the component plays
   *  them: Intake → Quote ready → In progress → In review → Delivered. Clock
   *  times inside each line are literal data and do not move between
   *  languages — only the words are translated per language below. */
  liveWindow: {
    taskTitle: string;
    /** "SCOPE" field label and its value ("merge duplicates, fix units"). */
    fieldScope: string;
    scopeValue: string;
    /** "RETURNS" field label. Its value, "7:00 AM ET", is literal and lives
     *  in the component — a timezone abbreviation is not a word to translate. */
    fieldReturns: string;
    fixedPrice: string;
    approve: string;
    approved: string;
    download: string;
    askQuestion: string;
    stamps: [string, string, string, string, string];
    lines: [string, string, string, string, string];
  };
  /** Right under the hero, the very next thing on the page: who we are,
   *  what we offer, and the one rule that makes it safe to try. Three short
   *  numbered beats, same shape as /about's `solution` array — a reader
   *  should be able to place this company in the time it takes to scroll
   *  one screen, not five. */
  whatWeAre: {
    label: string;
    /** [before, after] around a literal, un-translated "AfterDesk" the JSX
     *  inserts between them, styled like the wordmark (mono, uppercase,
     *  tracked) so the brand name reads as a mark, not a sentence word. The
     *  split exists because word order isn't the same across languages —
     *  Tagalog's "Ang AfterDesk ay..." puts a word BEFORE the brand name,
     *  which a simple prefix-strip would have missed. Brand names are data,
     *  not voice, so neither half ever contains the word "AfterDesk" itself. */
    h2: [string, string];
    intro: string;
    steps: [string, string][];
    /** The three guarantees, compressed. Distinct axis from `steps` above:
     *  steps is the chronological process (describe → done → pay), this is
     *  the standing promise regardless of where a task is in that process.
     *  Kept visually smaller than the numbered steps so two "three things"
     *  lists back to back don't read as the same list twice. */
    pillars: [string, string][];
  };
  /** Copy for the public counters strip (src/components/public-counters.tsx)
   *  under both homepage heroes. taskWord/workerWord are [singular, plural],
   *  picked by the live count. */
  counters: {
    taskWord: [string, string];
    workerWord: [string, string];
    released: string;
    toDate: string;
    moneySaved: { label: string; timeLabel: string; note: string };
  };
};

const en: Dict = {
  nav: { signIn: "Sign in", send: "Send a task", portal: "My account", client: "Get work done", workers: "For workers" },
  hero: {
    line1: "Describe any task.",
    line2: "Get it back done by morning.",
    cta: "Describe your task",
    guarantee:
      "Your card is authorized, not charged, and the specialist is only paid once you approve the work.",
    srPreview: (title) =>
      `Product preview: a task titled “${title}” is received at 6:41 PM, priced $74 by the operator 34 minutes later, approved, done overnight by a vetted specialist, and passes review by 7:07 AM.`,
  },
  whatWeAre: {
    label: "What this is",
    h2: [
      "",
      " is a task outsourcing service built around vetted specialists in the Philippines: fluent English, trained to a written standard, working while you sleep.",
    ],
    intro:
      "Entrepreneurs send a task, a specialist here prices it, and one rule makes it safe to try: you don't pay for work that isn't right.",
    steps: [
      [
        "Describe it",
        "Plain language, any admin, data, research or writing task. A specialist here prices it and you approve before anything starts.",
      ],
      [
        "It gets done",
        "A vetted specialist in the Philippines does the work overnight, checked by an operator before it reaches you.",
      ],
      [
        "You only pay if it's right",
        "Your card is authorized through Stripe, not charged. Nothing is billed, and the specialist isn't paid, until you approve the finished work.",
      ],
    ],
    pillars: [
      [
        "Zero direct contact",
        "You never manage the specialist directly. Every message and file goes through an operator.",
      ],
      [
        "Fixed pricing",
        "The price is approved before work starts. It never changes based on hours worked.",
      ],
      [
        "Reviewed before delivery",
        "An operator checks every deliverable against a written standard before it reaches you.",
      ],
    ],
  },
  ch01: { label: "The overnight diff" },
  ch02: {
    label: "One price. Approved first.",
    noMeter: "No subscription. No minimum. No hourly meter.",
    captions: [
      "Fixed. Never hourly.",
      "You approve before work starts.",
      "Back before your first meeting.",
    ],
    fixed: "FIXED",
    fieldTask: "TASK",
    taskValue: "Dedupe 142-row lead export",
    fieldScope: "SCOPE",
    scopeValue: "Merge on email, fix names, verify",
    fieldReturns: "RETURNS",
    fieldTotal: "TOTAL",
    approve: "APPROVE",
    askQuestion: "ASK A QUESTION",
  },
  ch03: {
    label: "The ledger",
    h2: "If you can describe it, it gets done.",
    rows: [
      ["DATA", "4,000 duplicate CRM contacts, cleaned", "$85"],
      ["RESEARCH", "300 dental clinics with owner emails", "$140"],
      ["WRITING", "12 product descriptions from spec sheets", "$70"],
      ["MEDIA", "8 hours of interviews, transcribed and tagged", "$110"],
      ["RESEARCH", "5 competitors' pricing pages, one sheet", "$95"],
      ["DOCS", "90-page proposal rebuilt in our template", "$75"],
    ],
    note: "ILLUSTRATIVE · NOT A RATE CARD ·",
  },
  ch04: {
    label: "The night",
    h2: "Your night is their working day.",
    laneYou: "New York",
    laneThem: "Manila",
    note: "Manila runs 12 hours ahead of New York (13 in winter)",
    steps: [
      ["6:41 PM", "You describe the task."],
      ["7:15 PM", "One fixed price. You approve it."],
      ["Overnight", "A vetted specialist does the work."],
      ["7:07 AM", "It is checked, then it is yours."],
    ],
  },
  ch05: {
    label: "The operator",
    h2: "One professional between you and the work.",
    wall: "Operator",
    desk: "Example: one review pass",
    pairs: [
      [
        "Freelance site",
        "Post the job. Read forty proposals.",
        "Describe it once. One price back the same day.",
      ],
      [
        "Hiring someone",
        "Interview, onboard, manage, repeat.",
        "The operator runs the night. You run nothing.",
      ],
      [
        "By the hour",
        "A meter running while you sleep.",
        "One fixed price, approved before work starts.",
      ],
      [
        "Any of them",
        "You find out in the morning whether it's right.",
        "A professional checked it before you ever see it.",
      ],
    ],
  },
  close: { protocol: "Full protocol: six stages, versioned" },
  footer: { about: "About us", how: "How it works", signIn: "Sign in", work: "Work with us" },
  liveWindow: {
    taskTitle: "Clean a 1,800-row supplier price list",
    fieldScope: "SCOPE",
    scopeValue: "merge duplicates, fix units",
    fieldReturns: "RETURNS",
    fixedPrice: "Fixed price",
    approve: "Approve",
    approved: "Approved ✓",
    download: "Download delivery",
    askQuestion: "Ask a question",
    stamps: ["Intake", "Quote ready", "In progress", "In review", "Delivered"],
    lines: [
      "6:41 PM · task received",
      "7:15 PM · priced by the operator · 34 min after intake",
      "7:22 PM · approved · claimed by a vetted specialist",
      "5:58 AM · delivered · operator review in progress",
      "7:07 AM · passed review · in your inbox",
    ],
  },
  counters: {
    taskWord: ["task delivered", "tasks delivered"],
    workerWord: ["approved worker", "approved workers"],
    released: "released to workers",
    toDate: "To date,",
    moneySaved: {
      label: "saved vs. market rate",
      timeLabel: "hours handed back",
      note: "Market rate × hours on task, minus what clients actually paid. Set per task category, floored at zero — never a modest number bragged up.",
    },
  },
};

const fr: Dict = {
  nav: { signIn: "Connexion", send: "Envoyer une tâche", portal: "Mon compte", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  hero: {
    line1: "Décrivez n'importe quelle tâche.",
    line2: "Récupérez-la faite au matin.",
    cta: "Décrivez votre tâche",
    guarantee:
      "Votre carte est autorisée, pas débitée, et le spécialiste n'est payé qu'une fois que vous approuvez le travail.",
    srPreview: (title) =>
      `Aperçu du produit : une tâche intitulée “${title}” est reçue à 18 h 41, chiffrée à $74 par l'opérateur 34 minutes plus tard, approuvée, réalisée pendant la nuit par un spécialiste vérifié, et passe la révision avant 7 h 07.`,
  },
  whatWeAre: {
    label: "Ce qu'on fait",
    h2: [
      "",
      " est un service de sous-traitance de tâches bâti autour de spécialistes vérifiés aux Philippines : anglais courant, formés selon une norme écrite, qui travaillent pendant que vous dormez.",
    ],
    intro:
      "Les entrepreneurs envoient une tâche, un spécialiste ici la chiffre, et une seule règle rend ça sûr d'essayer : vous ne payez pas pour un travail qui ne fait pas l'affaire.",
    steps: [
      [
        "Décrivez-la",
        "En langage clair, admin, données, recherche ou rédaction. Un spécialiste ici la chiffre et vous l'approuvez avant que quoi que ce soit commence.",
      ],
      [
        "Elle se fait",
        "Un spécialiste vérifié aux Philippines fait le travail pendant la nuit, vérifié par un opérateur avant de vous parvenir.",
      ],
      [
        "Vous ne payez que si c'est bon",
        "Votre carte est autorisée via Stripe, pas débitée. Rien n'est facturé, et le spécialiste n'est pas payé, tant que vous n'approuvez pas le travail livré.",
      ],
    ],
    pillars: [
      [
        "Zéro contact direct",
        "Vous ne gérez jamais le spécialiste directement. Chaque message et fichier passe par un opérateur.",
      ],
      [
        "Prix fixe",
        "Le prix est approuvé avant que le travail commence. Il ne change jamais selon les heures travaillées.",
      ],
      [
        "Vérifié avant livraison",
        "Un opérateur vérifie chaque livrable selon une norme écrite avant qu'il ne vous parvienne.",
      ],
    ],
  },
  ch01: { label: "Une nuit de différence" },
  ch02: {
    label: "Un prix. Approuvé d'abord.",
    noMeter: "Aucun abonnement. Aucun minimum. Aucun compteur horaire.",
    captions: [
      "Fixe. Jamais à l'heure.",
      "Vous approuvez avant que ça commence.",
      "De retour avant votre première réunion.",
    ],
    fixed: "FIXE",
    fieldTask: "TÂCHE",
    taskValue: "Déduplication d'un export de 142 prospects",
    fieldScope: "PORTÉE",
    scopeValue: "Fusion par courriel, correction des noms, vérification",
    fieldReturns: "LIVRAISON",
    fieldTotal: "TOTAL",
    approve: "APPROUVER",
    askQuestion: "POSER UNE QUESTION",
  },
  ch03: {
    label: "Le registre",
    h2: "Si vous pouvez le décrire, ça se fait.",
    rows: [
      ["DONNÉES", "4 000 contacts CRM dédoublonnés", "$85"],
      ["RECHERCHE", "300 cliniques dentaires avec courriels", "$140"],
      ["RÉDACTION", "12 fiches produits à partir des specs", "$70"],
      ["MÉDIAS", "8 heures d'entrevues transcrites et indexées", "$110"],
      ["RECHERCHE", "5 pages de prix concurrentes, une feuille", "$95"],
      ["DOCS", "Proposition de 90 pages refaite au gabarit", "$75"],
    ],
    note: "À TITRE D'EXEMPLE · PAS UNE GRILLE DE PRIX ·",
  },
  ch04: {
    label: "La nuit",
    h2: "Votre nuit est leur journée de travail.",
    laneYou: "New York",
    laneThem: "Manille",
    note: "Manille a 12 heures d'avance sur New York (13 en hiver)",
    steps: [
      ["6:41 PM", "Vous décrivez la tâche."],
      ["7:15 PM", "Un prix fixe. Vous l'approuvez."],
      ["La nuit", "Un spécialiste vérifié fait le travail."],
      ["7:07 AM", "C'est vérifié, puis c'est à vous."],
    ],
  },
  ch05: {
    label: "L'opérateur",
    h2: "Un professionnel entre vous et le travail.",
    wall: "Opérateur",
    desk: "Exemple : une passe de vérification",
    pairs: [
      [
        "Site de pigistes",
        "Publier une offre. Lire quarante propositions.",
        "Décrivez une fois. Un prix le jour même.",
      ],
      [
        "Embaucher",
        "Entrevues, intégration, gestion, à recommencer.",
        "L'opérateur mène la nuit. Vous ne gérez rien.",
      ],
      [
        "À l'heure",
        "Un compteur qui tourne pendant que vous dormez.",
        "Un prix fixe, approuvé avant que le travail commence.",
      ],
      [
        "N'importe lequel",
        "Vous découvrez au matin si c'est bon.",
        "Un professionnel l'a vérifié avant que vous le voyiez.",
      ],
    ],
  },
  close: { protocol: "Protocole complet : six étapes, versionné" },
  liveWindow: {
    taskTitle: "Nettoyer une liste de prix fournisseur de 1 800 lignes",
    fieldScope: "PORTÉE",
    scopeValue: "fusionner les doublons, corriger les unités",
    fieldReturns: "LIVRAISON",
    fixedPrice: "Prix fixe",
    approve: "Approuver",
    approved: "Approuvé ✓",
    download: "Télécharger la livraison",
    askQuestion: "Poser une question",
    stamps: ["Réception", "Prix prêt", "En cours", "En révision", "Livré"],
    lines: [
      "18 h 41 · tâche reçue",
      "19 h 15 · prix fixé par l'opérateur · 34 min après réception",
      "19 h 22 · approuvé · pris en charge par un spécialiste vérifié",
      "5 h 58 · livré · révision par l'opérateur en cours",
      "7 h 07 · révision réussie · dans votre boîte de réception",
    ],
  },
  footer: { about: "Qui nous sommes", how: "Comment ça marche", signIn: "Connexion", work: "Travailler avec nous" },
  counters: {
    taskWord: ["tâche livrée", "tâches livrées"],
    workerWord: ["spécialiste approuvé", "spécialistes approuvés"],
    released: "reversés aux spécialistes",
    toDate: "À ce jour,",
    moneySaved: {
      label: "économisés vs taux du marché",
      timeLabel: "heures récupérées",
      note: "Taux du marché × heures sur la tâche, moins ce que les clients ont réellement payé. Défini par catégorie de tâche, plancher à zéro — jamais un chiffre modeste gonflé.",
    },
  },
};

const es: Dict = {
  nav: { signIn: "Iniciar sesión", send: "Enviar una tarea", portal: "Mi cuenta", client: "Haz que se haga", workers: "Para trabajadores" },
  hero: {
    line1: "Describe cualquier tarea.",
    line2: "Recíbela lista por la mañana.",
    cta: "Describe tu tarea",
    guarantee:
      "Tu tarjeta queda autorizada, no cobrada, y el especialista solo cobra cuando tú apruebas el trabajo.",
    srPreview: (title) =>
      `Vista previa del producto: una tarea titulada “${title}” se recibe a las 6:41 p. m., cotizada en $74 por el operador 34 minutos después, aprobada, realizada durante la noche por un especialista verificado, y pasa la revisión antes de las 7:07 a. m.`,
  },
  whatWeAre: {
    label: "Qué es esto",
    h2: [
      "",
      " es un servicio de subcontratación de tareas construido alrededor de especialistas verificados en Filipinas: inglés fluido, formados según un estándar escrito, que trabajan mientras tú duermes.",
    ],
    intro:
      "Los emprendedores envían una tarea, un especialista aquí la cotiza, y una sola regla hace que sea seguro intentarlo: no pagas por un trabajo que no está bien.",
    steps: [
      [
        "Descríbela",
        "En lenguaje claro: administración, datos, investigación o redacción. Un especialista aquí la cotiza y tú la apruebas antes de que empiece nada.",
      ],
      [
        "Se hace",
        "Un especialista verificado en Filipinas hace el trabajo durante la noche, revisado por un operador antes de llegar a ti.",
      ],
      [
        "Solo pagas si está bien",
        "Tu tarjeta queda autorizada a través de Stripe, no cobrada. No se cobra nada, y el especialista no recibe pago, hasta que apruebas el trabajo entregado.",
      ],
    ],
    pillars: [
      [
        "Cero contacto directo",
        "Nunca gestionas al especialista directamente. Cada mensaje y archivo pasa por un operador.",
      ],
      [
        "Precio fijo",
        "El precio se aprueba antes de que empiece el trabajo. Nunca cambia según las horas trabajadas.",
      ],
      [
        "Revisado antes de la entrega",
        "Un operador revisa cada entregable según un estándar escrito antes de que llegue a ti.",
      ],
    ],
  },
  ch01: { label: "El antes y después de una noche" },
  ch02: {
    label: "Un precio. Aprobado primero.",
    noMeter: "Sin suscripción. Sin mínimo. Sin contador por hora.",
    captions: [
      "Fijo. Nunca por hora.",
      "Apruebas antes de que empiece.",
      "De vuelta antes de tu primera reunión.",
    ],
    fixed: "FIJO",
    fieldTask: "TAREA",
    taskValue: "Deduplicar exportación de 142 contactos",
    fieldScope: "ALCANCE",
    scopeValue: "Fusionar por correo, corregir nombres, verificar",
    fieldReturns: "ENTREGA",
    fieldTotal: "TOTAL",
    approve: "APROBAR",
    askQuestion: "HACER UNA PREGUNTA",
  },
  ch03: {
    label: "El registro",
    h2: "Si puedes describirlo, se hace.",
    rows: [
      ["DATOS", "4.000 contactos CRM duplicados, depurados", "$85"],
      ["INVESTIGACIÓN", "300 clínicas dentales con correos del dueño", "$140"],
      ["REDACCIÓN", "12 descripciones de producto desde las fichas", "$70"],
      ["MEDIOS", "8 horas de entrevistas transcritas y etiquetadas", "$110"],
      ["INVESTIGACIÓN", "5 páginas de precios de la competencia, una hoja", "$95"],
      ["DOCS", "Propuesta de 90 páginas rehecha en tu plantilla", "$75"],
    ],
    note: "ILUSTRATIVO · NO ES UNA LISTA DE PRECIOS ·",
  },
  ch04: {
    label: "La noche",
    h2: "Tu noche es su jornada de trabajo.",
    laneYou: "Nueva York",
    laneThem: "Manila",
    note: "Manila va 12 horas por delante de Nueva York (13 en invierno)",
    steps: [
      ["6:41 PM", "Describes la tarea."],
      ["7:15 PM", "Un precio fijo. Lo apruebas."],
      ["De noche", "Un especialista verificado hace el trabajo."],
      ["7:07 AM", "Se revisa, y es tuyo."],
    ],
  },
  ch05: {
    label: "El operador",
    h2: "Un profesional entre tú y el trabajo.",
    wall: "Operador",
    desk: "Ejemplo: una pasada de revisión",
    pairs: [
      [
        "Sitio de freelance",
        "Publicas un trabajo. Lees cuarenta propuestas.",
        "Lo describes una vez. Un precio el mismo día.",
      ],
      [
        "Contratar",
        "Entrevistar, incorporar, gestionar, repetir.",
        "El operador dirige la noche. Tú no gestionas nada.",
      ],
      [
        "Por hora",
        "Un contador corriendo mientras duermes.",
        "Un precio fijo, aprobado antes de empezar el trabajo.",
      ],
      [
        "Cualquiera",
        "Te enteras por la mañana si está bien.",
        "Un profesional lo revisó antes de que lo vieras.",
      ],
    ],
  },
  close: { protocol: "Protocolo completo: seis etapas, versionado" },
  liveWindow: {
    taskTitle: "Limpiar una lista de precios de proveedor de 1800 filas",
    fieldScope: "ALCANCE",
    scopeValue: "fusionar duplicados, corregir unidades",
    fieldReturns: "ENTREGA",
    fixedPrice: "Precio fijo",
    approve: "Aprobar",
    approved: "Aprobado ✓",
    download: "Descargar entrega",
    askQuestion: "Hacer una pregunta",
    stamps: ["Recepción", "Precio listo", "En curso", "En revisión", "Entregado"],
    lines: [
      "6:41 p. m. · tarea recibida",
      "7:15 p. m. · precio fijado por el operador · 34 min después de la recepción",
      "7:22 p. m. · aprobado · asignado a un especialista verificado",
      "5:58 a. m. · entregado · revisión del operador en curso",
      "7:07 a. m. · pasó la revisión · en tu bandeja de entrada",
    ],
  },
  footer: { about: "Quiénes somos", how: "Cómo funciona", signIn: "Iniciar sesión", work: "Trabaja con nosotros" },
  counters: {
    taskWord: ["tarea entregada", "tareas entregadas"],
    workerWord: ["especialista aprobado", "especialistas aprobados"],
    released: "liberados a los especialistas",
    toDate: "Hasta la fecha,",
    moneySaved: {
      label: "ahorrados vs. tarifa de mercado",
      timeLabel: "horas recuperadas",
      note: "Tarifa de mercado × horas en la tarea, menos lo que el cliente realmente pagó. Definida por categoría de tarea, con piso en cero — nunca una cifra modesta inflada.",
    },
  },
};

/* Tagalog, labelled FIL. Register: conversational Filipino with the English
   loanwords the market actually speaks (task, review, approve, fixed), never
   textbook Filipino. That register decides the ledger tags too — DATA /
   RESEARCH / MEDIA / DOCS are the words used out loud, while the textbook
   renderings (PANANALIKSIK, DOKUMENTO) read as stilted and overrun the tag
   column. The task titles beside them, where the meaning lives, are fully
   translated. */
const tl: Dict = {
  nav: { signIn: "Mag-sign in", send: "Magpadala ng task", portal: "Account ko", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  hero: {
    line1: "Ilarawan ang kahit anong task.",
    line2: "Tapos na ito pagsapit ng umaga.",
    cta: "Ilarawan ang task mo",
    guarantee:
      "Naka-authorize lang ang card mo, hindi sinisingil, at babayaran lang ang espesyalista kapag na-approve mo na ang trabaho.",
    srPreview: (title) =>
      `Preview ng produkto: isang task na may pamagat na “${title}” ay natanggap nang 6:41 PM, pinresyuhan ng $74 ng operator 34 min pagkatapos, inaprubahan, ginawa magdamag ng beripikadong espesyalista, at pumasa sa review bago mag-7:07 AM.`,
  },
  whatWeAre: {
    label: "Ano ito",
    h2: [
      "Ang ",
      " ay isang task outsourcing service na binuo sa paligid ng beripikadong espesyalista sa Pilipinas: matatas sa Ingles, sinanay sa isang nakasulat na pamantayan, gumagawa habang natutulog ka.",
    ],
    intro:
      "Nagpapadala ang mga negosyante ng task, ipepresyo ito ng espesyalista dito, at isang panuntunan ang gumagawa nitong ligtas subukan: hindi ka nagbabayad para sa trabahong hindi maayos.",
    steps: [
      [
        "Ilarawan ito",
        "Simpleng salita, kahit anong admin, data, research o writing task. Ipepresyo ito ng espesyalista dito at aaprubahan mo bago magsimula ang kahit ano.",
      ],
      [
        "Nagagawa ito",
        "Isang beripikadong espesyalista sa Pilipinas ang gumagawa ng trabaho magdamag, sinusuri ng operator bago ito dumating sa iyo.",
      ],
      [
        "Babayaran mo lang kung tama ito",
        "Naka-authorize ang card mo sa pamamagitan ng Stripe, hindi sinisingil. Walang sisingilin, at hindi babayaran ang espesyalista, hanggang sa aprubahan mo ang natapos na trabaho.",
      ],
    ],
    pillars: [
      [
        "Zero direktang contact",
        "Hindi mo kailanman pinamamahalaan ang espesyalista nang direkta. Dumadaan sa operator ang bawat mensahe at file.",
      ],
      [
        "Fixed na presyo",
        "Inaaprubahan ang presyo bago magsimula ang trabaho. Hindi ito nagbabago base sa oras na ginugol.",
      ],
      [
        "Sinuri bago ihatid",
        "Sinusuri ng operator ang bawat natapos na trabaho ayon sa nakasulat na pamantayan bago ito dumating sa iyo.",
      ],
    ],
  },
  ch01: { label: "Ang diff ng magdamag" },
  ch02: {
    label: "Isang presyo. Aprubado muna.",
    noMeter: "Walang subscription. Walang minimum. Walang orasang tumatakbo.",
    captions: [
      "Fixed. Hindi kada oras.",
      "Ikaw ang mag-a-approve bago magsimula.",
      "Balik bago ang unang meeting mo.",
    ],
    fixed: "FIXED",
    fieldTask: "TASK",
    taskValue: "Pag-dedupe ng 142-row na lead export",
    fieldScope: "SAKLAW",
    scopeValue: "I-merge base sa email, ayusin ang mga pangalan, i-verify",
    fieldReturns: "PAGBABALIK",
    fieldTotal: "TOTAL",
    approve: "APRUBAHAN",
    askQuestion: "MAGTANONG",
  },
  ch03: {
    label: "Ang talaan",
    h2: "Kung kaya mong ilarawan, magagawa ito.",
    rows: [
      ["DATA", "4,000 dobleng CRM contacts, nalinis", "$85"],
      ["RESEARCH", "300 dental clinic, may email ng may-ari", "$140"],
      ["SULAT", "12 product description mula sa spec sheets", "$70"],
      ["MEDIA", "8 oras na panayam, na-transcribe at na-tag", "$110"],
      ["RESEARCH", "5 pricing page ng kakumpitensya, isang sheet", "$95"],
      ["DOCS", "90-pahinang proposal, ginawa sa template ninyo", "$75"],
    ],
    note: "HALIMBAWA LANG · HINDI ITO RATE CARD ·",
  },
  ch04: {
    label: "Ang gabi",
    h2: "Ang gabi mo ang araw ng trabaho nila.",
    laneYou: "New York",
    laneThem: "Maynila",
    note: "12 oras na nauuna ang Maynila sa New York (13 kapag taglamig)",
    steps: [
      ["6:41 PM", "Ilalarawan mo ang task."],
      ["7:15 PM", "Isang fixed na presyo. Aaprubahan mo."],
      ["Magdamag", "Isang beripikadong espesyalista ang gagawa."],
      ["7:07 AM", "Nasuri na ito, sa iyo na."],
    ],
  },
  ch05: {
    label: "Ang operator",
    h2: "Isang propesyonal sa pagitan mo at ng trabaho.",
    wall: "Operator",
    desk: "Halimbawa: isang pasada ng review",
    pairs: [
      [
        "Freelance site",
        "Mag-post ng job. Magbasa ng apatnapung proposal.",
        "Isang beses mong ilarawan. Presyo sa parehong araw.",
      ],
      [
        "Mag-hire",
        "Mag-interview, mag-onboard, mag-manage, ulit.",
        "Ang operator ang bahala sa gabi. Wala kang imamanage.",
      ],
      [
        "Kada oras",
        "Orasang tumatakbo habang natutulog ka.",
        "Isang fixed na presyo, aprubado bago magsimula ang trabaho.",
      ],
      [
        "Alin man dito",
        "Sa umaga mo pa malalaman kung tama.",
        "Sinuri ng propesyonal bago mo pa ito makita.",
      ],
    ],
  },
  close: { protocol: "Buong protocol: anim na yugto, may bersyon" },
  liveWindow: {
    taskTitle: "Linisin ang 1,800-row na listahan ng presyo ng supplier",
    fieldScope: "SAKLAW",
    scopeValue: "pagsamahin ang mga duplicate, ayusin ang mga unit",
    fieldReturns: "PAGBABALIK",
    fixedPrice: "Fixed na presyo",
    approve: "Aprubahan",
    approved: "Inaprubahan ✓",
    download: "I-download ang delivery",
    askQuestion: "Magtanong",
    stamps: ["Natanggap", "Presyo handa na", "Isinasagawa", "Sinusuri", "Naihatid"],
    lines: [
      "6:41 PM · natanggap ang task",
      "7:15 PM · pinresyuhan ng operator · 34 min pagkatapos matanggap",
      "7:22 PM · inaprubahan · kinuha ng beripikadong espesyalista",
      "5:58 AM · naihatid · isinasagawa ang review ng operator",
      "7:07 AM · pumasa sa review · nasa inbox mo na",
    ],
  },
  footer: { about: "Tungkol sa amin", how: "Paano ito gumagana", signIn: "Mag-sign in", work: "Magtrabaho sa amin" },
  counters: {
    taskWord: ["task na naihatid", "mga task na naihatid"],
    workerWord: ["inaprubahang espesyalista", "mga inaprubahang espesyalista"],
    released: "napunta sa mga espesyalista",
    toDate: "Sa ngayon,",
    moneySaved: {
      label: "naipon vs presyo sa market",
      timeLabel: "oras na nabawi",
      note: "Presyo sa market × oras sa task, bawas sa aktwal na binayad ng kliyente. Naka-set per kategorya ng task, may floor na zero — hindi kailanman pinalaki ang isang maliit na numero.",
    },
  },
};

export const CLIENT_I18N: Record<ClientLang, Dict> = { en, fr, es, tl };
