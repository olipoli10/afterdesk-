/**
 * The client homepage speaks English, French and Spanish.
 *
 * THE RULE: the VOICE translates, the MACHINE stays English. Headings, body
 * copy, CTAs, captions, terms and example task titles are voice. The live
 * artifacts (the quote window, the overnight CSV diff), their mono field
 * labels (TASK / SCOPE / TOTAL), status stamps, filenames and clock times are
 * machine output — they stay English, because the platform runs in English
 * and showing that is honest signaling, not laziness.
 */

export type ClientLang = "en" | "fr" | "es";

export const CLIENT_LANGS: { code: ClientLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
];

export function clientLangOf(value: string | undefined | null): ClientLang {
  return value === "fr" || value === "es" ? value : "en";
}

type Dict = {
  nav: { signIn: string; send: string };
  hero: { line1: string; line2: string; sub: (h: number) => string; cta: string };
  ch01: { label: string; caption: string };
  ch02: { label: string; noMeter: string; captions: [string, string, string] };
  ch03: {
    label: string;
    h2: string;
    rows: [string, string, string][];
    caption: string;
  };
  ch04: {
    label: string;
    h2: string;
    sub: string;
    barYours: string;
    barTheirs: string;
    steps: [string, string][];
  };
  ch05: {
    label: string;
    h2: string;
    body: string;
    there: string;
    here: string;
    pairs: [string, string][];
  };
  ch06: { label: string; terms: (retentionDays: number) => [string, string][] };
  footer: { how: string; signIn: string; work: string };
};

const en: Dict = {
  nav: { signIn: "Sign in", send: "Send a task" },
  hero: {
    line1: "Describe any task.",
    line2: "Get it back done by morning.",
    sub: (h) =>
      `Research, data, writing, spreadsheets, admin — priced in ${h} working hours, delivered by morning.`,
    cta: "Describe your task",
  },
  ch01: {
    label: "The overnight diff",
    caption: "“Dedupe our leads, fix the names, drop bad emails.” — sent 6:41 PM",
  },
  ch02: {
    label: "One price. Approved first.",
    noMeter: "No subscription. No minimum. No hourly meter.",
    captions: [
      "Fixed. Never hourly.",
      "You approve before work starts.",
      "Back before your first meeting.",
    ],
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
    caption: "Illustrative tasks. Every price fixed, approved first.",
  },
  ch04: {
    label: "The night",
    h2: "Your night is their working day.",
    sub: "Your team stops at 5 PM. Theirs starts, twelve hours ahead.",
    barYours: "Your working hours — New York",
    barTheirs: "Their working hours — Manila, 12 hours ahead",
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
    body: "Run by an operator, not an algorithm. One professional prices, matches and reviews every task.",
    there: "There",
    here: "Here",
    pairs: [
      ["Post a job. Read forty proposals.", "Describe it once. One price back in hours, not days."],
      ["Interview, hire, onboard, manage.", "Nothing to manage. The operator runs the night."],
      ["Hourly meters running while you sleep.", "One fixed price, approved before anything starts."],
      ["Hope it's right in the morning.", "Reviewed by a professional before you ever see it."],
    ],
  },
  ch06: {
    label: "The terms",
    terms: (retentionDays) => [
      ["PRICE", "One fixed price, approved before anything starts."],
      ["REVIEW", "Every delivery is reviewed before you see it."],
      ["IDENTITY", "You never meet the worker. That's the point."],
      ["DATA", `Access ends with the task. Files purged after ${retentionDays} days.`],
      ["REFUSALS", "Some tasks we turn down."],
    ],
  },
  footer: { how: "How it works", signIn: "Sign in", work: "Work with us" },
};

const fr: Dict = {
  nav: { signIn: "Connexion", send: "Envoyer une tâche" },
  hero: {
    line1: "Décrivez n'importe quelle tâche.",
    line2: "Récupérez-la faite au matin.",
    sub: (h) =>
      `Recherche, données, rédaction, tableurs, admin — prix fixe en ${h} heures ouvrables, livré au matin.`,
    cta: "Décrivez votre tâche",
  },
  ch01: {
    label: "Une nuit de différence",
    caption:
      "« Dédoublonnez nos leads, corrigez les noms, retirez les mauvais courriels. » — envoyé 18 h 41",
  },
  ch02: {
    label: "Un prix. Approuvé d'abord.",
    noMeter: "Aucun abonnement. Aucun minimum. Aucun compteur horaire.",
    captions: [
      "Fixe. Jamais à l'heure.",
      "Vous approuvez avant que ça commence.",
      "De retour avant votre première réunion.",
    ],
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
    caption: "Tâches à titre d'exemple. Chaque prix fixe, approuvé d'abord.",
  },
  ch04: {
    label: "La nuit",
    h2: "Votre nuit est leur journée de travail.",
    sub: "Votre équipe arrête à 17 h. La leur commence, douze heures devant.",
    barYours: "Vos heures de travail — New York",
    barTheirs: "Leurs heures — Manille, 12 heures devant",
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
    body: "Dirigé par un opérateur, pas un algorithme. Une personne fixe le prix, choisit qui fait le travail et vérifie tout.",
    there: "Là-bas",
    here: "Ici",
    pairs: [
      [
        "Publier une offre. Lire quarante propositions.",
        "Décrivez une fois. Un prix en heures, pas en jours.",
      ],
      ["Entrevues, embauche, intégration, gestion.", "Rien à gérer. L'opérateur mène la nuit."],
      [
        "Des compteurs horaires qui tournent pendant que vous dormez.",
        "Un prix fixe, approuvé avant que ça commence.",
      ],
      [
        "Espérer que ce soit bon au matin.",
        "Vérifié par un professionnel avant que vous le voyiez.",
      ],
    ],
  },
  ch06: {
    label: "Les conditions",
    terms: (retentionDays) => [
      ["PRIX", "Un prix fixe, approuvé avant que ça commence."],
      ["CONTRÔLE", "Chaque livraison est vérifiée avant que vous la voyiez."],
      ["IDENTITÉ", "Vous ne rencontrez jamais le travailleur. C'est le principe."],
      ["DONNÉES", `L'accès finit avec la tâche. Fichiers purgés après ${retentionDays} jours.`],
      ["REFUS", "Certaines tâches, on les refuse."],
    ],
  },
  footer: { how: "Comment ça marche", signIn: "Connexion", work: "Travailler avec nous" },
};

const es: Dict = {
  nav: { signIn: "Iniciar sesión", send: "Enviar una tarea" },
  hero: {
    line1: "Describe cualquier tarea.",
    line2: "Recíbela lista por la mañana.",
    sub: (h) =>
      `Investigación, datos, redacción, hojas de cálculo, admin — precio fijo en ${h} horas hábiles, entregado por la mañana.`,
    cta: "Describe tu tarea",
  },
  ch01: {
    label: "El antes y después de una noche",
    caption:
      "«Depura nuestros leads, corrige los nombres, elimina los correos malos.» — enviado 6:41 PM",
  },
  ch02: {
    label: "Un precio. Aprobado primero.",
    noMeter: "Sin suscripción. Sin mínimo. Sin contador por hora.",
    captions: [
      "Fijo. Nunca por hora.",
      "Apruebas antes de que empiece.",
      "De vuelta antes de tu primera reunión.",
    ],
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
    caption: "Tareas de ejemplo. Cada precio fijo, aprobado primero.",
  },
  ch04: {
    label: "La noche",
    h2: "Tu noche es su jornada de trabajo.",
    sub: "Tu equipo para a las 5 PM. El suyo empieza, doce horas por delante.",
    barYours: "Tu horario de trabajo — Nueva York",
    barTheirs: "Su horario — Manila, 12 horas por delante",
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
    body: "Dirigido por un operador, no un algoritmo. Una persona pone el precio, asigna y revisa cada tarea.",
    there: "Allá",
    here: "Aquí",
    pairs: [
      [
        "Publicas un trabajo. Lees cuarenta propuestas.",
        "Lo describes una vez. Un precio en horas, no días.",
      ],
      ["Entrevistar, contratar, incorporar, gestionar.", "Nada que gestionar. El operador dirige la noche."],
      [
        "Contadores por hora corriendo mientras duermes.",
        "Un precio fijo, aprobado antes de empezar.",
      ],
      ["Esperar que esté bien por la mañana.", "Revisado por un profesional antes de que lo veas."],
    ],
  },
  ch06: {
    label: "Las condiciones",
    terms: (retentionDays) => [
      ["PRECIO", "Un precio fijo, aprobado antes de empezar."],
      ["REVISIÓN", "Cada entrega se revisa antes de que la veas."],
      ["IDENTIDAD", "Nunca conoces al trabajador. Ese es el punto."],
      ["DATOS", `El acceso termina con la tarea. Archivos purgados a los ${retentionDays} días.`],
      ["RECHAZOS", "Algunas tareas las rechazamos."],
    ],
  },
  footer: { how: "Cómo funciona", signIn: "Iniciar sesión", work: "Trabaja con nosotros" },
};

export const CLIENT_I18N: Record<ClientLang, Dict> = { en, fr, es };
