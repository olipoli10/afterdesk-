/**
 * The client homepage speaks English, French, Spanish and Tagalog (labelled
 * FIL) — the same four the worker page offers, from the same shared list.
 *
 * THE RULE, REVISED: the VOICE translates, and so now does anything a reader
 * has to actually UNDERSTAND to follow what's happening — including the live
 * task window's stamps and status line. The distinction that survives is
 * narrower than "machine vs voice": raw DATA (clock times, prices, filenames,
 * task IDs like task_0448) stays literal because it isn't language, but the
 * WORDS describing what that data means are voice and must translate.
 *
 * CLAIM RULES (post-repositioning, do not regress): no "any task", no
 * "by morning"/"done overnight" as a promise, no cost-base/labor-arbitrage
 * framing, no absolute "no hourly meter" (the standing-capacity storefront is
 * unpublished, but live accounts still bill weekly hours, so the absolute
 * would be false while any of them exists), and every demo artifact is
 * visibly labelled illustrative. The
 * guarantee copy states the REAL mechanism: operator review, then a dispute
 * window before any capture.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type ClientLang = SiteLang;

export const CLIENT_LANGS: { code: ClientLang; label: string }[] = SITE_LANGS;

export function clientLangOf(value: string | undefined | null): ClientLang {
  return siteLangOf(value);
}

type Dict = {
  /** `portal` replaces signIn + send once a session exists. Same key, same
   *  words as the worker storefront, so the door does not rename itself
   *  between the two sides.
   *
   *  `client` and `workers` used to sit here for the audience toggle. That
   *  toggle is gone from this header: a client landing on a page that offers
   *  to switch them to the worker side is being told, above the fold, that
   *  this is a two-sided marketplace. /about, /how-it-works and /workers each
   *  read their own dictionary, so nothing else lost a label. */
  nav: { signIn: string; send: string; portal: string };
  hero: {
    line1: string;
    line2: string;
    /** The management-fatigue hook a fast scroller hits before the CTA. */
    subtitle: string;
    cta: string;
    /** The literal answer to "what happens if I click this" — states the
     *  REAL mechanism (authorize, review by a DIFFERENT person, capture only
     *  after the dispute window). Takes the live disputeWindowHours so the
     *  published number can never drift from the enforced one, same rule the
     *  protocol page follows. Keep accurate to sweeps.ts/admin-qc.ts. */
    guarantee: (disputeHours: number) => string;
    /** sr-only description of the animated task window for anyone who
     *  cannot see it. Framed as illustrative — the window is a demo. */
    srPreview: (title: string) => string;
    /** Small visible label under the window — the sighted-reader version of
     *  srPreview's "this is a demo", same honesty convention as the ledger's
     *  ILLUSTRATIVE note. */
    previewLabel: string;
  };
  ch02: {
    label: string;
    noMeter: string;
    captions: [string, string, string];
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
     *  here may appear in the worker page's pool ($38/$48/$54/$66/$72/$120,
     *  tickets/addresses/zoning/order forms/receipts/statements) — if the two
     *  sets ever meet, the margin becomes derivable across the two pages.
     *  Rows lean verification-heavy (exception logs, sources kept) on
     *  purpose: the examples ARE the positioning. */
    rows: [string, string, string][];
    note: string;
  };
  ch04: {
    label: string;
    h2: string;
    laneYou: string;
    laneThem: string;
    /** The only DST-honest phrasing of the offset — factual, not a pitch. */
    note: string;
    steps: [string, string][];
  };
  ch05: {
    label: string;
    h2: string;
    /** Sticky legend naming the comparison itself; each row still names its
     *  own opponent. The AI row leads — it is the alternative a 2026 buyer
     *  actually weighs first. */
    legend: string;
    wall: string;
    desk: string;
    /** [WHICH ALTERNATIVE, what that costs you, what happens here]. */
    pairs: [string, string, string][];
  };
  close: {
    protocol: string;
    /** What we turn down. A page that only makes promises reads as less
     *  trustworthy than one that draws a boundary, and the reader is being
     *  asked to hand business files to a stranger. Must stay true to the
     *  NOT IN SCOPE list on /how-it-works (docs.ts scope.items). */
    limits: string;
  };
  footer: { about: string; how: string; signIn: string; work: string; services: string };
  liveWindow: {
    taskTitle: string;
    fieldScope: string;
    scopeValue: string;
    fieldReturns: string;
    fixedPrice: string;
    approve: string;
    approved: string;
    download: string;
    askQuestion: string;
    stamps: [string, string, string, string, string];
    lines: [string, string, string, string, string];
  };
  whatWeAre: {
    label: string;
    /** [before, after] around a literal "AfterDesk" the JSX inserts. */
    h2: [string, string];
    intro: string;
    steps: [string, string][];
    pillars: [string, string][];
  };
  /**
   * No `workerWord`, no `released`, and their absence is the point.
   *
   * A headcount of approved people and a total paid out are the WORKER side's
   * proof. Here they answer a question the client never asked and file the
   * page as a marketplace of people, which is the one reading this
   * positioning cannot carry. The component types both as optional
   * (public-counters.tsx), so leaving them out of this dictionary is what
   * removes the cells — not a blank string, which would still render a label.
   */
  counters: {
    taskWord: [string, string];
    toDate: string;
    moneySaved: { label: string; timeLabel: string; note: string };
  };
};

const en: Dict = {
  nav: { signIn: "Sign in", send: "Request a fixed-price quote", portal: "My account" },
  hero: {
    /**
     * WHAT, THEN THE BUYING MODEL. In six words, before the fold.
     *
     * The previous pair — "Send the work. / Get it back checked." — sold the
     * mechanism: someone does it, someone else checks. Read cold it landed as
     * a better-supervised VA agency, which is the category this business is
     * not in.
     *
     * The alternative tested against it was "Describe the result. / Get it
     * back finished." It lost on three measurable counts, not on taste. At
     * 1440px the h1 box is 604px wide: its two lines measure 691px and 707px,
     * so BOTH wrap and the hero grows to four visual lines at every width
     * (178px on mobile against 133px here). It repeats the sub-hero's own
     * opening words verbatim one line below itself. And "describe what you
     * want, get it back done" is the stock pitch of an AI agent product — the
     * second reading this rewrite has to avoid.
     *
     * This pair keeps the shipped rhythm exactly: one line wraps, three
     * visual lines, same height as before.
     */
    line1: "Finished admin work.",
    line2: "One fixed price.",
    subtitle:
      "Describe the result you need. AfterDesk defines the scope, sets one fixed price, manages the execution and verifies the finished delivery.",
    cta: "Request a fixed-price quote",
    guarantee: (h) =>
      `Your card is authorized, not charged. Nothing reaches you until it has passed our review against the approved standard, and your card is charged only ${h} hours after that, so you have time to reject it.`,
    srPreview: (title) =>
      `Illustrative product preview: a task titled “${title}” is received in the evening, scoped and priced, approved by the client, completed, and checked against the approved standard before delivery.`,
    previewLabel: "Illustrative · product preview",
  },
  whatWeAre: {
    label: "What this is",
    h2: [
      "",
      " delivers finished administrative work. You describe the result you need: clean this list, research these companies, pull the dates out of these contracts. We define the scope, quote one fixed price, and own the work until it is done and checked.",
    ],
    /**
     * THE METHOD SENTENCE, AND THE LIMIT OF WHAT IT MAY CLAIM.
     *
     * It says AfterDesk chooses the method. It does NOT say the method is
     * automation, does not say people only handle exceptions, and does not
     * imply a fleet of specialised providers being selected between. Today the
     * dependable way is usually a person working to a written standard, and
     * this sentence stays true on the day that changes.
     */
    intro:
      "The method depends on the work. AfterDesk chooses and manages the most dependable way to complete the approved scope, and answers for the result either way.",
    steps: [
      [
        "Define",
        "Plain language: what must come back, what rules matter, what a correct result looks like. We turn that into a written scope.",
      ],
      [
        "Approve",
        "One fixed price for that scope, before anything starts. It does not move with the hours the work turns out to take.",
      ],
      [
        "Receive",
        "Every delivery is checked against the approved standard before it reaches you. Work that fails goes back; you receive the version that passed.",
      ],
    ],
    pillars: [
      [
        "You manage nobody",
        "No interviews, no briefing rounds, no chasing. Questions about the work come to us, never to you.",
      ],
      [
        "The price is fixed first",
        "You approve one number before work starts. It never moves with hours worked.",
      ],
      /**
       * THE STANDARD IS WRITTEN, NOT A FEELING — AND NOBODY ELSE'S PAY IS THE
       * CLIENT'S BUSINESS.
       *
       * This read "Nobody gets paid until you are satisfied / Not AfterDesk,
       * and not the specialist." Two problems in one pillar.
       *
       * "Satisfied" replaced the mechanism the product actually runs on with a
       * subjective test we never agreed to: disputes are decided against the
       * category's written criteria (/terms says so), not against how the
       * client feels on the day. Publishing the softer promise on the home
       * page and the harder one in the terms is the wrong way round, and the
       * gap is exactly where a dispute lives.
       *
       * The second half told the client that a third party is paid per task,
       * which is internal mechanics they neither buy nor need.
       *
       * What is left is the real, verifiable sequence: authorize on approval,
       * review before release, capture only after the window closes.
       */
      [
        "You are not billed until your review window closes",
        "Your card is authorized before work starts, never charged then. It is charged only after the delivery has passed our review and your dispute window has closed.",
      ],
    ],
  },
  ch02: {
    label: "One price. Approved first.",
    noMeter: "Fixed for this task. Not hourly.",
    captions: [
      "Fixed for the approved scope.",
      "You approve before work starts.",
      "Reviewed before it reaches you.",
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
    h2: "Jobs with a clear finish line. Priced before anyone starts.",
    rows: [
      ["DATA", "4,000 duplicate CRM contacts merged, exceptions logged", "$85"],
      ["RESEARCH", "300 target accounts researched to your criteria, sources kept", "$140"],
      ["DOCS", "60 supplier agreements: key dates and totals on one sheet", "$70"],
      ["DATA", "Two customer exports compared, every mismatch flagged", "$110"],
      ["RESEARCH", "5 competitors' pricing pages, one sheet", "$95"],
      ["DOCS", "90-page proposal rebuilt in your template", "$75"],
    ],
    note: "ILLUSTRATIVE · NOT A RATE CARD ·",
  },
  /**
   * THE TIMELINE STOPPED BEING A MAP.
   *
   * This section was "The night", two lanes labelled New York and Manila with
   * a line explaining the twelve-hour offset. It sold the gap between two
   * economies — the labour-arbitrage story — and it put the client on one side
   * of a border and the work on the other. The lanes are now the two parties
   * to the transaction, which is what the client is actually buying into.
   */
  ch04: {
    label: "End to end",
    h2: "One task, from request to delivery.",
    laneYou: "You",
    laneThem: "AfterDesk",
    note: "Timings are illustrative; the confirmed date is on your quote",
    steps: [
      ["Step 1", "You describe the result you need."],
      ["Step 2", "One fixed price for a written scope. You approve it."],
      ["Step 3", "AfterDesk runs the approved scope."],
      ["Step 4", "Checked against the standard, then delivered."],
    ],
  },
  /**
   * BUYING MODELS, NOT BRANDS — AND ONLY DIFFERENCES WE CAN DEFEND.
   *
   * The earlier version named Fiverr-shaped competitors and, worse, the /about
   * table beside it rated them on price, speed and vetting. Those are claims
   * about other companies that nothing in this business measures, and naming
   * marketplaces filed AfterDesk as a fourth marketplace.
   *
   * Each row now carries ONE structural difference that is true by
   * construction here: who manages the execution and owns the result, what the
   * price is attached to, and who checks the work before the buyer sees it.
   * Nothing about anyone's speed, quality or rates.
   */
  ch05: {
    label: "The comparison",
    h2: "What changes between the models.",
    legend: "Three other ways to get this done, and what each leaves on your desk.",
    wall: "AfterDesk",
    desk: "Sometimes the first version fails the standard. When it does it goes back, and you never see that attempt: you receive the version that passed.",
    pairs: [
      [
        "Do it yourself with AI tools",
        "You write the prompts, run the steps and check every result. The output is yours to verify.",
        "One approved scope. We run it, handle what goes wrong, and check it before it reaches you.",
      ],
      [
        "Freelance marketplace",
        "You choose, brief and supervise. If the result is wrong, it is your problem to fix.",
        "You choose nobody and brief once. We own the finished result and answer for it.",
      ],
      [
        "Hourly staffing",
        "You buy time. Whether it produced the outcome is still your question.",
        "You buy the outcome. One fixed price, approved before work starts.",
      ],
    ],
  },
  close: {
    protocol: "Full protocol: six stages, versioned",
    limits:
      "Not everything fits. We turn down live calls, anything that needs your identity to cross, high-stakes legal, medical or financial judgment, and anything we cannot check against a source. If your job does not fit, we say so before you pay anything.",
  },
  footer: { about: "About us", how: "How it works", signIn: "Sign in", work: "Work with us", services: "Our Services" },
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
      "6:41 PM · result described",
      "7:15 PM · scope written · one fixed price",
      "7:22 PM · approved · execution under way",
      "5:58 AM · complete · checked against the standard",
      "7:07 AM · passed · in your inbox",
    ],
  },
  /**
   * Nothing renders until the thresholds are crossed (public-counters.tsx),
   * which is exactly why this is settled NOW: the day it switches itself on,
   * nobody will be rereading this rewrite. A client-facing "47 specialists
   * approved" would publish a headcount and file the page as a marketplace,
   * months later and with no one watching.
   */
  counters: {
    taskWord: ["task delivered", "tasks delivered"],
    toDate: "To date,",
    moneySaved: {
      label: "saved vs. market rate",
      timeLabel: "hours handed back",
      note: "Market rate × hours on task, minus what clients actually paid. Set per task category, floored at zero, never a modest number bragged up.",
    },
  },
};

const fr: Dict = {
  nav: { signIn: "Connexion", send: "Demander un prix fixe", portal: "Mon compte" },
  hero: {
    line1: "Du travail administratif fini.",
    line2: "Un prix fixe.",
    subtitle:
      "Décrivez le résultat dont vous avez besoin. AfterDesk définit le périmètre, fixe un prix unique, pilote l'exécution et vérifie la livraison terminée.",
    cta: "Demander un prix fixe",
    guarantee: (h) =>
      `Votre carte est autorisée, pas débitée. Rien ne vous parvient avant d'avoir passé notre révision selon la norme approuvée, et votre carte n'est débitée que ${h} heures plus tard, vous avez donc le temps de refuser.`,
    srPreview: (title) =>
      `Aperçu illustratif du produit : une tâche intitulée « ${title} » est reçue en soirée, cadrée et chiffrée, approuvée par le client, réalisée, puis vérifiée selon la norme approuvée avant livraison.`,
    previewLabel: "Illustration · aperçu du produit",
  },
  whatWeAre: {
    label: "Ce qu'on fait",
    h2: [
      "",
      " livre du travail administratif fini. Vous décrivez le résultat voulu : nettoyer cette liste, rechercher ces entreprises, sortir les dates de ces contrats. Nous définissons le périmètre, chiffrons un prix fixe, et nous portons le travail jusqu'à ce qu'il soit fait et vérifié.",
    ],
    intro:
      "La méthode dépend du travail. AfterDesk choisit et pilote la façon la plus fiable de réaliser le périmètre approuvé, et répond du résultat dans tous les cas.",
    steps: [
      [
        "Définir",
        "En langage clair : ce qui doit être rendu, les règles importantes, ce qui constitue un résultat correct. On en fait un périmètre écrit.",
      ],
      [
        "Approuver",
        "Un prix fixe pour ce périmètre, avant que rien ne commence. Il ne bouge pas selon les heures que le travail finit par prendre.",
      ],
      [
        "Recevoir",
        "Chaque livraison est vérifiée selon la norme approuvée avant de vous parvenir. Ce qui échoue repart, et vous recevez la version qui a passé.",
      ],
    ],
    pillars: [
      [
        "Vous ne gérez personne",
        "Aucune entrevue, aucun encadrement, aucune relance. Les questions sur le travail nous reviennent, jamais à vous.",
      ],
      [
        "Le prix est fixé d'abord",
        "Vous approuvez un seul montant avant que le travail commence. Il ne bouge jamais selon les heures travaillées.",
      ],
      [
        "Rien ne vous est facturé avant la fin de votre fenêtre de révision",
        "Votre carte est autorisée avant le début du travail, jamais débitée à ce moment-là. Elle ne l'est qu'après la révision de la livraison et la fermeture de votre fenêtre de contestation.",
      ],
    ],
  },
  ch02: {
    label: "Un prix. Approuvé d'abord.",
    noMeter: "Fixe pour cette tâche. Pas à l'heure.",
    captions: [
      "Fixe pour le travail approuvé.",
      "Vous approuvez avant que ça commence.",
      "Vérifié avant de vous parvenir.",
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
    h2: "Des tâches avec une ligne d'arrivée claire. Chiffrées avant que quiconque commence.",
    rows: [
      ["DONNÉES", "4 000 contacts CRM dédoublonnés, exceptions notées", "$85"],
      ["RECHERCHE", "300 comptes cibles étudiés selon vos critères, sources conservées", "$140"],
      ["DOCS", "60 ententes fournisseurs : dates et totaux clés sur une feuille", "$70"],
      ["DONNÉES", "Deux exports clients comparés, chaque écart signalé", "$110"],
      ["RECHERCHE", "5 pages de prix concurrentes, une feuille", "$95"],
      ["DOCS", "Proposition de 90 pages refaite au gabarit", "$75"],
    ],
    note: "À TITRE D'EXEMPLE · PAS UNE GRILLE DE PRIX ·",
  },
  ch04: {
    label: "De bout en bout",
    h2: "Une tâche, de la demande à la livraison.",
    laneYou: "Vous",
    laneThem: "AfterDesk",
    note: "Étapes illustratives ; la date confirmée figure sur votre devis",
    steps: [
      ["Étape 1", "Vous décrivez le résultat voulu."],
      ["Étape 2", "Un prix fixe pour un périmètre écrit. Vous l'approuvez."],
      ["Étape 3", "AfterDesk réalise le périmètre approuvé."],
      ["Étape 4", "Vérifié selon la norme, puis livré."],
    ],
  },
  ch05: {
    label: "La comparaison",
    h2: "Ce qui change d'un modèle à l'autre.",
    legend: "Trois autres façons de faire faire ça, et ce que chacune vous laisse sur le bureau.",
    wall: "AfterDesk",
    desk: "Parfois la première version échoue à la norme. Elle repart alors, et vous ne voyez jamais cette tentative : vous recevez la version qui a passé.",
    pairs: [
      [
        "Le faire soi-même avec l'IA",
        "Vous écrivez les prompts, menez les étapes et vérifiez chaque résultat. La sortie est à vous de valider.",
        "Un seul périmètre approuvé. On l'exécute, on gère ce qui déraille, et on le vérifie avant qu'il vous parvienne.",
      ],
      [
        "Place de marché de pigistes",
        "Vous choisissez, briefez et supervisez. Si le résultat est mauvais, c'est à vous de le corriger.",
        "Vous ne choisissez personne et briefez une fois. On porte le résultat fini et on en répond.",
      ],
      [
        "Personnel à l'heure",
        "Vous achetez du temps. Savoir s'il a produit le résultat reste votre question.",
        "Vous achetez le résultat. Un prix fixe, approuvé avant que le travail commence.",
      ],
    ],
  },
  close: {
    protocol: "Protocole complet : six étapes, versionné",
    limits:
      "Tout ne convient pas. On refuse les appels en direct, tout ce qui exige que votre identité circule, les décisions légales, médicales ou financières à enjeu élevé, et tout ce qu'on ne peut pas vérifier contre une source. Si votre tâche ne convient pas, on vous le dit avant que vous payiez quoi que ce soit.",
  },
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
      "19 h 15 · périmètre écrit · un prix fixe",
      "19 h 22 · approuvé · exécution en cours",
      "5 h 58 · terminé · vérifié selon la norme",
      "7 h 07 · révision réussie · dans votre boîte de réception",
    ],
  },
  footer: { about: "Qui nous sommes", how: "Comment ça marche", signIn: "Connexion", work: "Travailler avec nous", services: "Nos services" },
  counters: {
    taskWord: ["tâche livrée", "tâches livrées"],
    toDate: "À ce jour,",
    moneySaved: {
      label: "économisés vs taux du marché",
      timeLabel: "heures récupérées",
      note: "Taux du marché × heures sur la tâche, moins ce que les clients ont réellement payé. Défini par catégorie de tâche, plancher à zéro, jamais un chiffre modeste gonflé.",
    },
  },
};

const es: Dict = {
  nav: { signIn: "Iniciar sesión", send: "Pedir un precio fijo", portal: "Mi cuenta" },
  hero: {
    line1: "Trabajo administrativo terminado.",
    line2: "Un precio fijo.",
    subtitle:
      "Describe el resultado que necesitas. AfterDesk define el alcance, fija un precio único, gestiona la ejecución y verifica la entrega terminada.",
    cta: "Pedir un precio fijo",
    guarantee: (h) =>
      `Tu tarjeta queda autorizada, no cobrada. Nada te llega antes de pasar nuestra revisión contra el estándar aprobado, y tu tarjeta se cobra solo ${h} horas después de eso, así que tienes tiempo de rechazarlo.`,
    srPreview: (title) =>
      `Vista previa ilustrativa del producto: una tarea titulada “${title}” se recibe por la tarde, se acota y se cotiza, la aprueba el cliente, se realiza, y se verifica contra el estándar aprobado antes de la entrega.`,
    previewLabel: "Ilustrativo · vista previa del producto",
  },
  whatWeAre: {
    label: "Qué es esto",
    h2: [
      "",
      " entrega trabajo administrativo terminado. Tú describes el resultado que necesitas: limpiar esta lista, investigar estas empresas, sacar las fechas de estos contratos. Nosotros definimos el alcance, cotizamos un precio fijo y sostenemos el trabajo hasta que esté hecho y revisado.",
    ],
    intro:
      "El método depende del trabajo. AfterDesk elige y gestiona la forma más fiable de completar el alcance aprobado, y responde por el resultado en cualquier caso.",
    steps: [
      [
        "Definir",
        "En lenguaje claro: qué debe devolverse, qué reglas importan, cómo es un resultado correcto. Lo convertimos en un alcance escrito.",
      ],
      [
        "Aprobar",
        "Un precio fijo para ese alcance, antes de que empiece nada. No se mueve con las horas que el trabajo acabe tomando.",
      ],
      [
        "Recibir",
        "Cada entrega se verifica contra el estándar aprobado antes de llegarte. Lo que falla vuelve atrás, y recibes la versión que pasó.",
      ],
    ],
    pillars: [
      [
        "No gestionas a nadie",
        "Sin entrevistas, sin instrucciones, sin perseguir. Las preguntas sobre el trabajo nos llegan a nosotros, nunca a ti.",
      ],
      [
        "El precio se fija primero",
        "Apruebas un solo número antes de que empiece el trabajo. Nunca se mueve según las horas trabajadas.",
      ],
      [
        "No se te cobra hasta que cierre tu ventana de revisión",
        "Tu tarjeta se autoriza antes de que empiece el trabajo, nunca se cobra en ese momento. Solo se cobra después de que la entrega pase nuestra revisión y se cierre tu ventana de disputa.",
      ],
    ],
  },
  ch02: {
    label: "Un precio. Aprobado primero.",
    noMeter: "Fijo para esta tarea. No por hora.",
    captions: [
      "Fijo para el alcance aprobado.",
      "Apruebas antes de que empiece.",
      "Revisado antes de llegar a ti.",
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
    h2: "Tareas con una meta clara. Cotizadas antes de que nadie empiece.",
    rows: [
      ["DATOS", "4.000 contactos CRM duplicados fusionados, excepciones anotadas", "$85"],
      ["INVESTIGACIÓN", "300 cuentas objetivo investigadas según tus criterios, con fuentes", "$140"],
      ["DOCS", "60 acuerdos de proveedores: fechas y totales clave en una hoja", "$70"],
      ["DATOS", "Dos exportaciones de clientes comparadas, cada desajuste señalado", "$110"],
      ["INVESTIGACIÓN", "5 páginas de precios de la competencia, una hoja", "$95"],
      ["DOCS", "Propuesta de 90 páginas rehecha en tu plantilla", "$75"],
    ],
    note: "ILUSTRATIVO · NO ES UNA LISTA DE PRECIOS ·",
  },
  ch04: {
    label: "De principio a fin",
    h2: "Una tarea, de la solicitud a la entrega.",
    laneYou: "Tú",
    laneThem: "AfterDesk",
    note: "Pasos ilustrativos; la fecha confirmada aparece en tu presupuesto",
    steps: [
      ["Paso 1", "Describes el resultado que necesitas."],
      ["Paso 2", "Un precio fijo para un alcance escrito. Lo apruebas."],
      ["Paso 3", "AfterDesk ejecuta el alcance aprobado."],
      ["Paso 4", "Verificado contra el estándar, y entregado."],
    ],
  },
  ch05: {
    label: "La comparación",
    h2: "Qué cambia de un modelo a otro.",
    legend: "Otras tres formas de hacer esto, y lo que cada una te deja en el escritorio.",
    wall: "AfterDesk",
    desk: "A veces la primera versión no pasa el estándar. Cuando pasa eso vuelve atrás, y nunca ves ese intento: recibes la versión que pasó.",
    pairs: [
      [
        "Hacerlo tú con IA",
        "Tú escribes los prompts, ejecutas los pasos y revisas cada resultado. La salida es tuya para validar.",
        "Un solo alcance aprobado. Lo ejecutamos, resolvemos lo que falla y lo revisamos antes de que te llegue.",
      ],
      [
        "Mercado de freelancers",
        "Tú eliges, instruyes y supervisas. Si el resultado está mal, es tuyo el problema de arreglarlo.",
        "No eliges a nadie y explicas una vez. Sostenemos el resultado terminado y respondemos por él.",
      ],
      [
        "Personal por horas",
        "Compras tiempo. Si produjo el resultado sigue siendo tu pregunta.",
        "Compras el resultado. Un precio fijo, aprobado antes de que empiece el trabajo.",
      ],
    ],
  },
  close: {
    protocol: "Protocolo completo: seis etapas, versionado",
    limits:
      "No todo encaja. Rechazamos llamadas en vivo, cualquier cosa que exija que tu identidad circule, decisiones legales, médicas o financieras de alto riesgo, y todo lo que no podamos verificar contra una fuente. Si tu tarea no encaja, te lo decimos antes de que pagues nada.",
  },
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
      "7:15 p. m. · alcance escrito · un precio fijo",
      "7:22 p. m. · aprobado · ejecución en curso",
      "5:58 a. m. · completado · verificado contra el estándar",
      "7:07 a. m. · pasó la revisión · en tu bandeja de entrada",
    ],
  },
  footer: { about: "Quiénes somos", how: "Cómo funciona", signIn: "Iniciar sesión", work: "Trabaja con nosotros", services: "Nuestros servicios" },
  counters: {
    taskWord: ["tarea entregada", "tareas entregadas"],
    toDate: "Hasta la fecha,",
    moneySaved: {
      label: "ahorrados vs. tarifa de mercado",
      timeLabel: "horas recuperadas",
      note: "Tarifa de mercado × horas en la tarea, menos lo que el cliente realmente pagó. Definida por categoría de tarea, con piso en cero, nunca una cifra modesta inflada.",
    },
  },
};

/* Tagalog, labelled FIL. Register: conversational Filipino with the English
   loanwords the market actually speaks (task, review, approve, fixed), never
   textbook Filipino. */
const tl: Dict = {
  nav: { signIn: "Mag-sign in", send: "Humingi ng fixed na presyo", portal: "Account ko" },
  hero: {
    line1: "Tapos nang admin na trabaho.",
    line2: "Isang fixed na presyo.",
    subtitle:
      "Ilarawan ang resultang kailangan mo. Tinutukoy ng AfterDesk ang scope, nagtatakda ng iisang fixed na presyo, namamahala sa execution, at sinusuri ang tapos nang delivery.",
    cta: "Humingi ng fixed na presyo",
    guarantee: (h) =>
      `Naka-authorize lang ang card mo, hindi sinisingil. Walang nakakarating sa iyo hangga't hindi ito pumapasa sa aming review laban sa aprubadong pamantayan, at sisingilin lang ang card mo ${h} oras pagkatapos noon, kaya may oras ka pang tumanggi.`,
    srPreview: (title) =>
      `Halimbawang preview ng produkto: isang task na “${title}” ay natanggap sa gabi, tinukoy ang scope at pinresyuhan, inaprubahan ng kliyente, ginawa, at sinuri laban sa aprubadong pamantayan bago i-deliver.`,
    previewLabel: "Halimbawa · preview ng produkto",
  },
  whatWeAre: {
    label: "Ano ito",
    h2: [
      "Ang ",
      " ay naghahatid ng tapos nang administratibong trabaho. Inilalarawan mo ang resultang kailangan mo: linisin ang listahang ito, saliksikin ang mga kumpanyang ito, kunin ang mga petsa sa mga kontratang ito. Kami ang tumutukoy ng scope, nagpepresyo nang fixed, at kami ang may hawak nito hanggang tapos at nasuri na.",
    ],
    intro:
      "Nakadepende sa trabaho ang paraan. Ang AfterDesk ang pumipili at namamahala sa pinaka-maaasahang paraan para tapusin ang aprubadong scope, at kami ang sumasagot sa resulta anuman ang paraan.",
    steps: [
      [
        "Tukuyin",
        "Simpleng salita: ano ang dapat ibalik, aling rules ang mahalaga, ano ang tamang resulta. Ginagawa namin itong nakasulat na scope.",
      ],
      [
        "Aprubahan",
        "Isang fixed na presyo para sa scope na iyon, bago magsimula ang kahit ano. Hindi ito gumagalaw base sa oras na kinakain ng trabaho.",
      ],
      [
        "Tanggapin",
        "Bawat delivery ay sinusuri laban sa aprubadong pamantayan bago ito makarating sa iyo. Ang bumabagsak ay bumabalik, at ang natatanggap mo ay ang bersyong pumasa.",
      ],
    ],
    pillars: [
      [
        "Wala kang pinamamahalaang tao",
        "Walang interview, walang pag-brief, walang paghabol. Sa amin dumarating ang mga tanong tungkol sa trabaho, hindi sa iyo.",
      ],
      [
        "Nauuna ang presyo",
        "Isang numero ang aaprubahan mo bago magsimula ang trabaho. Hindi ito gumagalaw base sa oras na ginugol.",
      ],
      [
        "Hindi ka sisingilin hangga't bukas ang iyong review window",
        "Ina-authorize ang card mo bago magsimula ang trabaho, hindi sinisingil doon. Sisingilin lang matapos makapasa sa review ang delivery at magsara ang iyong dispute window.",
      ],
    ],
  },
  ch02: {
    label: "Isang presyo. Aprubado muna.",
    noMeter: "Fixed para sa task na ito. Hindi kada oras.",
    captions: [
      "Fixed para sa aprubadong saklaw.",
      "Ikaw ang mag-a-approve bago magsimula.",
      "Sinuri bago dumating sa iyo.",
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
    h2: "Mga task na may malinaw na finish line. Presyado bago pa may magsimula.",
    rows: [
      ["DATA", "4,000 dobleng CRM contacts pinagsama, may exception log", "$85"],
      ["RESEARCH", "300 target accounts sinaliksik ayon sa criteria mo, may sources", "$140"],
      ["DOCS", "60 supplier agreements: mga pangunahing petsa at total sa isang sheet", "$70"],
      ["DATA", "Dalawang customer export inihambing, bawat mismatch na-flag", "$110"],
      ["RESEARCH", "5 pricing page ng kakumpitensya, isang sheet", "$95"],
      ["DOCS", "90-pahinang proposal, ginawa sa template ninyo", "$75"],
    ],
    note: "HALIMBAWA LANG · HINDI ITO RATE CARD ·",
  },
  ch04: {
    label: "Simula hanggang dulo",
    h2: "Isang task, mula request hanggang delivery.",
    laneYou: "Ikaw",
    laneThem: "AfterDesk",
    note: "Ilustratibo ang mga hakbang; nasa quote mo ang kumpirmadong petsa",
    steps: [
      ["Hakbang 1", "Ilalarawan mo ang resultang kailangan mo."],
      ["Hakbang 2", "Isang fixed na presyo para sa nakasulat na scope. Aaprubahan mo."],
      ["Hakbang 3", "Isinasagawa ng AfterDesk ang aprubadong scope."],
      ["Hakbang 4", "Sinuri laban sa pamantayan, tapos inihatid."],
    ],
  },
  ch05: {
    label: "Ang paghahambing",
    h2: "Ano ang nagbabago sa bawat modelo.",
    legend: "Tatlong ibang paraan para maipagawa ito, at kung ano ang naiiwan sa mesa mo ng bawat isa.",
    wall: "AfterDesk",
    desk: "Minsan hindi pumapasa ang unang bersyon sa pamantayan. Kapag nangyari iyon, bumabalik ito at hindi mo na nakikita ang tangkang iyon: ang bersyong pumasa ang natatanggap mo.",
    pairs: [
      [
        "Gawin mo mismo gamit ang AI",
        "Ikaw ang sumusulat ng prompts, nagpapatakbo ng hakbang, at sumusuri ng bawat resulta. Sa iyo ang pagpapatunay ng output.",
        "Isang aprubadong scope. Kami ang nagpapatakbo, humahawak sa nagkakamali, at sumusuri bago ito makarating sa iyo.",
      ],
      [
        "Freelance marketplace",
        "Ikaw ang pumipili, nagbi-brief at nagbabantay. Kapag mali ang resulta, problema mo itong ayusin.",
        "Wala kang pipiliin at isang beses ka lang magbi-brief. Kami ang may hawak ng tapos nang resulta at kami ang sumasagot.",
      ],
      [
        "Hourly staffing",
        "Oras ang binibili mo. Kung nakabuo ba ito ng resulta, tanong mo pa rin iyon.",
        "Ang resulta ang binibili mo. Isang fixed na presyo, aprubado bago magsimula ang trabaho.",
      ],
    ],
  },
  close: {
    protocol: "Buong protocol: anim na yugto, may bersyon",
    limits:
      "Hindi lahat bagay sa amin. Tinatanggihan namin ang live calls, anumang nangangailangan na dumaan ang pagkakakilanlan mo, high-stakes na legal, medical o financial na desisyon, at anumang hindi namin masusuri laban sa isang source. Kung hindi bagay ang task mo, sasabihin namin bago ka pa magbayad ng kahit ano.",
  },
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
      "7:15 PM · nakasulat na scope · isang fixed na presyo",
      "7:22 PM · inaprubahan · isinasagawa na",
      "5:58 AM · tapos na · sinuri laban sa pamantayan",
      "7:07 AM · pumasa sa review · nasa inbox mo na",
    ],
  },
  footer: { about: "Tungkol sa amin", how: "Paano ito gumagana", signIn: "Mag-sign in", work: "Magtrabaho sa amin", services: "Mga serbisyo" },
  counters: {
    taskWord: ["task na naihatid", "mga task na naihatid"],
    toDate: "Sa ngayon,",
    moneySaved: {
      label: "naipon vs presyo sa market",
      timeLabel: "oras na nabawi",
      note: "Presyo sa market × oras sa task, bawas sa aktwal na binayad ng kliyente. Naka-set per kategorya ng task, may floor na zero, hindi kailanman pinalaki ang isang maliit na numero.",
    },
  },
};

export const CLIENT_I18N: Record<ClientLang, Dict> = { en, fr, es, tl };
