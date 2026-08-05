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
 * framing, no absolute "no hourly meter" (standing capacity sells weekly
 * hours), and every demo artifact is visibly labelled illustrative. The
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
   *  words as the worker storefront — the audience toggle swaps between the
   *  two headers and the door must not rename itself. */
  nav: { signIn: string; send: string; portal: string; client: string; workers: string };
  hero: {
    line1: string;
    line2: string;
    /** The management-fatigue hook a fast scroller hits before the CTA. */
    subtitle: string;
    cta: string;
    /** The literal answer to "what happens if I click this" — states the
     *  REAL mechanism (authorize, operator review, capture only after the
     *  dispute window). Keep accurate to sweeps.ts/admin-qc.ts. */
    guarantee: string;
    /** sr-only description of the animated task window for anyone who
     *  cannot see it. Framed as illustrative — the window is a demo. */
    srPreview: (title: string) => string;
    /** Small visible label under the window — the sighted-reader version of
     *  srPreview's "this is a demo", same honesty convention as the ledger's
     *  ILLUSTRATIVE note. */
    previewLabel: string;
  };
  ch01: { label: string };
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
  close: { protocol: string };
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
  counters: {
    taskWord: [string, string];
    workerWord: [string, string];
    released: string;
    toDate: string;
    moneySaved: { label: string; timeLabel: string; note: string };
  };
};

const en: Dict = {
  nav: { signIn: "Sign in", send: "Describe the outcome", portal: "My account", client: "Get work done", workers: "For workers" },
  hero: {
    line1: "Send the work.",
    line2: "Get a reviewed deliverable.",
    subtitle:
      "Finding a worker was never the hard part. Checking their work, fixing mistakes, chasing hours: that's what we take off your plate.",
    cta: "Describe the outcome",
    guarantee:
      "Your card is authorized, not charged. An operator reviews the delivery before it reaches you, and nothing is captured until your dispute window closes.",
    srPreview: (title) =>
      `Illustrative product preview: a task titled “${title}” is received in the evening, priced by the operator, approved, completed by a vetted specialist, and passes operator review before delivery.`,
    previewLabel: "Illustrative · product preview",
  },
  whatWeAre: {
    label: "What this is",
    h2: [
      "",
      " is a managed execution service for bounded back-office work: data, research, documents and operations, completed by trained specialists and checked by an operator before delivery.",
    ],
    intro:
      "You describe the deliverable, an operator prices it, and one rule makes it safe to try: nothing is charged until the work passes review and your dispute window closes.",
    steps: [
      [
        "Describe the deliverable",
        "Plain language: what must be returned, what rules matter, what a correct result looks like. An operator prices it and you approve before anything starts.",
      ],
      [
        "It gets done",
        "A trained specialist completes the approved scope while AfterDesk manages questions and exceptions along the way.",
      ],
      [
        "Checked before you pay",
        "Your card is authorized through Stripe, not charged. An operator checks the finished work against a written standard, and nothing is billed (and the specialist isn't paid) until your dispute window closes.",
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
    h2: "Bounded work, priced before it starts.",
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
  ch04: {
    label: "The night",
    h2: "One example evening, end to end.",
    laneYou: "New York",
    laneThem: "Manila",
    note: "Manila runs 12 hours ahead of New York (13 in winter)",
    steps: [
      ["6:41 PM", "You describe the deliverable."],
      ["7:15 PM", "One fixed price. You approve it."],
      ["Overnight", "A trained specialist completes the scope."],
      ["7:07 AM", "Operator review, then delivery."],
    ],
  },
  ch05: {
    label: "The operator",
    h2: "One professional between you and the work.",
    legend: "Comparing four ways to get this done: AI tools, freelance sites, hiring someone, or one operator who runs it all.",
    wall: "Operator",
    desk: "Example: one review pass",
    pairs: [
      [
        "AI tools",
        "You prompt, run the steps, and verify every result yourself.",
        "One approved scope, checked by an operator before it reaches you.",
      ],
      [
        "Freelance site",
        "Post the job. Read forty proposals.",
        "Describe it once. One fixed price to approve.",
      ],
      [
        "Hiring someone",
        "Interview, onboard, manage, repeat.",
        "The operator runs the process. You run nothing.",
      ],
      [
        "By the hour",
        "A meter running while you wait.",
        "One fixed price, approved before work starts.",
      ],
    ],
  },
  close: { protocol: "Full protocol: six stages, versioned" },
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
      "6:41 PM · task received",
      "7:15 PM · priced by the operator",
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
      note: "Market rate × hours on task, minus what clients actually paid. Set per task category, floored at zero, never a modest number bragged up.",
    },
  },
};

const fr: Dict = {
  nav: { signIn: "Connexion", send: "Décrire le résultat", portal: "Mon compte", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  hero: {
    line1: "Confiez le travail.",
    line2: "Recevez un livrable vérifié.",
    subtitle:
      "Trouver un travailleur n'a jamais été le plus dur. Vérifier son travail, corriger ses erreurs, relancer ses heures : c'est ça qu'on retire de vos épaules.",
    cta: "Décrire le résultat",
    guarantee:
      "Votre carte est autorisée, pas débitée. Un opérateur vérifie la livraison avant qu'elle ne vous parvienne, et rien n'est prélevé tant que votre fenêtre de contestation n'est pas écoulée.",
    srPreview: (title) =>
      `Aperçu illustratif du produit : une tâche intitulée « ${title} » est reçue en soirée, chiffrée par l'opérateur, approuvée, réalisée par un spécialiste vérifié, et passe la révision de l'opérateur avant livraison.`,
    previewLabel: "Illustration · aperçu du produit",
  },
  whatWeAre: {
    label: "Ce qu'on fait",
    h2: [
      "",
      " est un service d'exécution gérée pour le travail administratif délimité : données, recherche, documents et opérations, réalisés par des spécialistes formés et vérifiés par un opérateur avant livraison.",
    ],
    intro:
      "Vous décrivez le livrable, un opérateur le chiffre, et une seule règle rend l'essai sûr : rien n'est facturé tant que le travail n'a pas passé la révision et que votre fenêtre de contestation n'est pas écoulée.",
    steps: [
      [
        "Décrivez le livrable",
        "En langage clair : ce qui doit être rendu, les règles importantes, ce qui constitue un résultat correct. Un opérateur le chiffre et vous approuvez avant que quoi que ce soit commence.",
      ],
      [
        "Le travail se fait",
        "Un spécialiste formé réalise le travail approuvé pendant qu'AfterDesk gère les questions et les exceptions en chemin.",
      ],
      [
        "Vérifié avant de payer",
        "Votre carte est autorisée via Stripe, pas débitée. Un opérateur vérifie le travail terminé selon une norme écrite, et rien n'est facturé (ni le spécialiste payé) tant que votre fenêtre de contestation n'est pas écoulée.",
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
    h2: "Un travail délimité, chiffré avant de commencer.",
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
    label: "La nuit",
    h2: "Une soirée d'exemple, du début à la fin.",
    laneYou: "New York",
    laneThem: "Manille",
    note: "Manille a 12 heures d'avance sur New York (13 en hiver)",
    steps: [
      ["6:41 PM", "Vous décrivez le livrable."],
      ["7:15 PM", "Un prix fixe. Vous l'approuvez."],
      ["La nuit", "Un spécialiste formé réalise le travail."],
      ["7:07 AM", "Révision par l'opérateur, puis livraison."],
    ],
  },
  ch05: {
    label: "L'opérateur",
    h2: "Un professionnel entre vous et le travail.",
    legend: "Comparaison de quatre façons de faire ça : outils d'IA, sites de pigistes, embauche directe, ou un seul opérateur qui gère tout.",
    wall: "Opérateur",
    desk: "Exemple : une passe de vérification",
    pairs: [
      [
        "Outils d'IA",
        "Vous écrivez les prompts, menez les étapes et vérifiez chaque résultat vous-même.",
        "Un travail approuvé, vérifié par un opérateur avant de vous parvenir.",
      ],
      [
        "Site de pigistes",
        "Publier une offre. Lire quarante propositions.",
        "Décrivez une fois. Un prix fixe à approuver.",
      ],
      [
        "Embaucher",
        "Entrevues, intégration, gestion, à recommencer.",
        "L'opérateur mène le processus. Vous ne gérez rien.",
      ],
      [
        "À l'heure",
        "Un compteur qui tourne pendant que vous attendez.",
        "Un prix fixe, approuvé avant que le travail commence.",
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
      "19 h 15 · prix fixé par l'opérateur",
      "19 h 22 · approuvé · pris en charge par un spécialiste vérifié",
      "5 h 58 · livré · révision par l'opérateur en cours",
      "7 h 07 · révision réussie · dans votre boîte de réception",
    ],
  },
  footer: { about: "Qui nous sommes", how: "Comment ça marche", signIn: "Connexion", work: "Travailler avec nous", services: "Nos services" },
  counters: {
    taskWord: ["tâche livrée", "tâches livrées"],
    workerWord: ["spécialiste approuvé", "spécialistes approuvés"],
    released: "reversés aux spécialistes",
    toDate: "À ce jour,",
    moneySaved: {
      label: "économisés vs taux du marché",
      timeLabel: "heures récupérées",
      note: "Taux du marché × heures sur la tâche, moins ce que les clients ont réellement payé. Défini par catégorie de tâche, plancher à zéro, jamais un chiffre modeste gonflé.",
    },
  },
};

const es: Dict = {
  nav: { signIn: "Iniciar sesión", send: "Describe el resultado", portal: "Mi cuenta", client: "Haz que se haga", workers: "Para trabajadores" },
  hero: {
    line1: "Envía el trabajo.",
    line2: "Recibe un entregable revisado.",
    subtitle:
      "Encontrar a alguien nunca fue lo difícil. Revisar su trabajo, corregir errores, perseguir horas: eso es lo que te quitamos de encima.",
    cta: "Describe el resultado",
    guarantee:
      "Tu tarjeta queda autorizada, no cobrada. Un operador revisa la entrega antes de que llegue a ti, y no se cobra nada hasta que se cierra tu ventana de disputa.",
    srPreview: (title) =>
      `Vista previa ilustrativa del producto: una tarea titulada “${title}” se recibe por la tarde, cotizada por el operador, aprobada, realizada por un especialista verificado, y pasa la revisión del operador antes de la entrega.`,
    previewLabel: "Ilustrativo · vista previa del producto",
  },
  whatWeAre: {
    label: "Qué es esto",
    h2: [
      "",
      " es un servicio de ejecución gestionada para trabajo administrativo acotado: datos, investigación, documentos y operaciones, realizados por especialistas capacitados y revisados por un operador antes de la entrega.",
    ],
    intro:
      "Describes el entregable, un operador lo cotiza, y una sola regla hace que sea seguro intentarlo: no se cobra nada hasta que el trabajo pasa la revisión y se cierra tu ventana de disputa.",
    steps: [
      [
        "Describe el entregable",
        "En lenguaje claro: qué debe devolverse, qué reglas importan, cómo es un resultado correcto. Un operador lo cotiza y tú apruebas antes de que empiece nada.",
      ],
      [
        "Se hace",
        "Un especialista capacitado completa el alcance aprobado mientras AfterDesk gestiona preguntas y excepciones en el camino.",
      ],
      [
        "Revisado antes de pagar",
        "Tu tarjeta queda autorizada a través de Stripe, no cobrada. Un operador revisa el trabajo terminado según un estándar escrito, y no se cobra nada (ni el especialista recibe pago) hasta que se cierra tu ventana de disputa.",
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
    h2: "Trabajo acotado, cotizado antes de empezar.",
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
    label: "La noche",
    h2: "Una tarde de ejemplo, de principio a fin.",
    laneYou: "Nueva York",
    laneThem: "Manila",
    note: "Manila va 12 horas por delante de Nueva York (13 en invierno)",
    steps: [
      ["6:41 PM", "Describes el entregable."],
      ["7:15 PM", "Un precio fijo. Lo apruebas."],
      ["De noche", "Un especialista capacitado completa el alcance."],
      ["7:07 AM", "Revisión del operador, y entrega."],
    ],
  },
  ch05: {
    label: "El operador",
    h2: "Un profesional entre tú y el trabajo.",
    legend: "Comparando cuatro formas de hacer esto: herramientas de IA, sitios de freelance, contratar a alguien, o un solo operador que lo gestiona todo.",
    wall: "Operador",
    desk: "Ejemplo: una pasada de revisión",
    pairs: [
      [
        "Herramientas de IA",
        "Tú escribes los prompts, ejecutas los pasos y verificas cada resultado.",
        "Un alcance aprobado, revisado por un operador antes de llegar a ti.",
      ],
      [
        "Sitio de freelance",
        "Publicas un trabajo. Lees cuarenta propuestas.",
        "Lo describes una vez. Un precio fijo para aprobar.",
      ],
      [
        "Contratar",
        "Entrevistar, incorporar, gestionar, repetir.",
        "El operador dirige el proceso. Tú no gestionas nada.",
      ],
      [
        "Por hora",
        "Un contador corriendo mientras esperas.",
        "Un precio fijo, aprobado antes de empezar el trabajo.",
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
      "7:15 p. m. · precio fijado por el operador",
      "7:22 p. m. · aprobado · asignado a un especialista verificado",
      "5:58 a. m. · entregado · revisión del operador en curso",
      "7:07 a. m. · pasó la revisión · en tu bandeja de entrada",
    ],
  },
  footer: { about: "Quiénes somos", how: "Cómo funciona", signIn: "Iniciar sesión", work: "Trabaja con nosotros", services: "Nuestros servicios" },
  counters: {
    taskWord: ["tarea entregada", "tareas entregadas"],
    workerWord: ["especialista aprobado", "especialistas aprobados"],
    released: "liberados a los especialistas",
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
  nav: { signIn: "Mag-sign in", send: "Ilarawan ang resulta", portal: "Account ko", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  hero: {
    line1: "Ipadala ang trabaho.",
    line2: "Tumanggap ng sinuring deliverable.",
    subtitle:
      "Ang paghahanap ng manggagawa hindi kailanman ang mahirap na bahagi. Ang pag-check ng trabaho nila, pag-ayos ng mali, paghabol sa oras nila: yun ang inaalis namin sa'yo.",
    cta: "Ilarawan ang resulta",
    guarantee:
      "Naka-authorize lang ang card mo, hindi sinisingil. Sinusuri ng operator ang delivery bago ito dumating sa iyo, at walang sinisingil hangga't hindi pa tapos ang window mo para mag-dispute.",
    srPreview: (title) =>
      `Halimbawang preview ng produkto: isang task na “${title}” ay natanggap sa gabi, pinresyuhan ng operator, inaprubahan, ginawa ng beripikadong espesyalista, at pumasa sa review ng operator bago i-deliver.`,
    previewLabel: "Halimbawa · preview ng produkto",
  },
  whatWeAre: {
    label: "Ano ito",
    h2: [
      "Ang ",
      " ay isang managed execution service para sa malinaw na back-office work: data, research, documents, at operations, ginagawa ng trained specialists at sinusuri ng operator bago i-deliver.",
    ],
    intro:
      "Ilalarawan mo ang deliverable, ipepresyo ito ng operator, at isang panuntunan ang gumagawa nitong ligtas subukan: walang sisingilin hangga't hindi pumapasa sa review ang trabaho at hindi sarado ang dispute window mo.",
    steps: [
      [
        "Ilarawan ang deliverable",
        "Simpleng salita: ano ang dapat ibalik, aling rules ang mahalaga, ano ang tamang resulta. Ipepresyo ito ng operator at aaprubahan mo bago magsimula ang kahit ano.",
      ],
      [
        "Nagagawa ito",
        "Kinukumpleto ng trained specialist ang aprubadong scope habang mina-manage ng AfterDesk ang questions at exceptions sa daan.",
      ],
      [
        "Sinuri bago ka magbayad",
        "Naka-authorize ang card mo sa Stripe, hindi sinisingil. Sinusuri ng operator ang natapos na trabaho ayon sa nakasulat na pamantayan, at walang sisingilin (at hindi babayaran ang espesyalista) hangga't hindi pa tapos ang dispute window mo.",
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
    h2: "Malinaw na trabaho, presyado bago magsimula.",
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
    label: "Ang gabi",
    h2: "Isang halimbawang gabi, mula simula hanggang dulo.",
    laneYou: "New York",
    laneThem: "Maynila",
    note: "12 oras na nauuna ang Maynila sa New York (13 kapag taglamig)",
    steps: [
      ["6:41 PM", "Ilalarawan mo ang deliverable."],
      ["7:15 PM", "Isang fixed na presyo. Aaprubahan mo."],
      ["Magdamag", "Kukumpletuhin ng trained specialist ang saklaw."],
      ["7:07 AM", "Review ng operator, tapos delivery."],
    ],
  },
  ch05: {
    label: "Ang operator",
    h2: "Isang propesyonal sa pagitan mo at ng trabaho.",
    legend: "Paghahambing ng apat na paraan: AI tools, freelance site, pag-hire, o iisang operator na bahala sa lahat.",
    wall: "Operator",
    desk: "Halimbawa: isang pasada ng review",
    pairs: [
      [
        "AI tools",
        "Ikaw ang magpo-prompt, magpapatakbo ng steps, at magve-verify ng bawat resulta.",
        "Isang aprubadong saklaw, sinuri ng operator bago dumating sa iyo.",
      ],
      [
        "Freelance site",
        "Mag-post ng job. Magbasa ng apatnapung proposal.",
        "Isang beses mong ilarawan. Isang fixed na presyo na aaprubahan.",
      ],
      [
        "Mag-hire",
        "Mag-interview, mag-onboard, mag-manage, ulit.",
        "Ang operator ang bahala sa proseso. Wala kang imamanage.",
      ],
      [
        "Kada oras",
        "Orasang tumatakbo habang naghihintay ka.",
        "Isang fixed na presyo, aprubado bago magsimula ang trabaho.",
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
      "7:15 PM · pinresyuhan ng operator",
      "7:22 PM · inaprubahan · kinuha ng beripikadong espesyalista",
      "5:58 AM · naihatid · isinasagawa ang review ng operator",
      "7:07 AM · pumasa sa review · nasa inbox mo na",
    ],
  },
  footer: { about: "Tungkol sa amin", how: "Paano ito gumagana", signIn: "Mag-sign in", work: "Magtrabaho sa amin", services: "Mga serbisyo" },
  counters: {
    taskWord: ["task na naihatid", "mga task na naihatid"],
    workerWord: ["inaprubahang espesyalista", "mga inaprubahang espesyalista"],
    released: "napunta sa mga espesyalista",
    toDate: "Sa ngayon,",
    moneySaved: {
      label: "naipon vs presyo sa market",
      timeLabel: "oras na nabawi",
      note: "Presyo sa market × oras sa task, bawas sa aktwal na binayad ng kliyente. Naka-set per kategorya ng task, may floor na zero, hindi kailanman pinalaki ang isang maliit na numero.",
    },
  },
};

export const CLIENT_I18N: Record<ClientLang, Dict> = { en, fr, es, tl };
