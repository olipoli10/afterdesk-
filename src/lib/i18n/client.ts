/**
 * The client homepage speaks English, French, Spanish and Tagalog (labelled
 * FIL) — the same four the worker page offers, from the same shared list.
 *
 * THE RULE: the VOICE translates, the MACHINE stays English. Headings, body
 * copy, CTAs, captions, terms and example task titles are voice. The live
 * artifacts (the quote window, the overnight CSV diff), their mono field
 * labels (TASK / SCOPE / TOTAL), status stamps, filenames and clock times are
 * machine output — they stay English, because the platform runs in English
 * and showing that is honest signaling, not laziness.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type ClientLang = SiteLang;

export const CLIENT_LANGS: { code: ClientLang; label: string }[] = SITE_LANGS;

export function clientLangOf(value: string | undefined | null): ClientLang {
  return siteLangOf(value);
}

type Dict = {
  nav: { signIn: string; send: string };
  hero: { line1: string; line2: string; sub: (h: number) => string; cta: string };
  ch01: { label: string; caption: string };
  ch02: { label: string; noMeter: string; captions: [string, string, string] };
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
    there: string;
    here: string;
    pairs: [string, string][];
  };
  ch06: {
    label: string;
    notes: string;
    /** A clause renders only when the setting behind it exists — no
     *  placeholders, no invented numbers. */
    terms: (retentionDays: number | null) => [string, string][];
  };
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
    note: "ILLUSTRATIVE — NOT A RATE CARD ·",
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
    desk: "Example — one review pass",
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
    notes: "General notes",
    terms: (retentionDays) => [
      ["PRICE", "One fixed price, approved before anything starts."],
      ["REVIEW", "Every delivery is reviewed before you see it."],
      ["IDENTITY", "You never meet the worker. That's the point."],
      ...(retentionDays
        ? ([
            ["DATA", `Access ends with the task. Files purged after ${retentionDays} days.`],
          ] as [string, string][])
        : []),
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
    note: "À TITRE D'EXEMPLE — PAS UNE GRILLE DE PRIX ·",
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
    desk: "Exemple — une passe de vérification",
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
    notes: "Notes générales",
    terms: (retentionDays) => [
      ["PRIX", "Un prix fixe, approuvé avant que ça commence."],
      ["CONTRÔLE", "Chaque livraison est vérifiée avant que vous la voyiez."],
      ["IDENTITÉ", "Vous ne rencontrez jamais le travailleur. C'est le principe."],
      ...(retentionDays
        ? ([
            [
              "DONNÉES",
              `L'accès finit avec la tâche. Fichiers purgés après ${retentionDays} jours.`,
            ],
          ] as [string, string][])
        : []),
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
    note: "ILUSTRATIVO — NO ES UNA LISTA DE PRECIOS ·",
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
    desk: "Ejemplo — una pasada de revisión",
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
    notes: "Notas generales",
    terms: (retentionDays) => [
      ["PRECIO", "Un precio fijo, aprobado antes de empezar."],
      ["REVISIÓN", "Cada entrega se revisa antes de que la veas."],
      ["IDENTIDAD", "Nunca conoces al trabajador. Ese es el punto."],
      ...(retentionDays
        ? ([
            [
              "DATOS",
              `El acceso termina con la tarea. Archivos purgados a los ${retentionDays} días.`,
            ],
          ] as [string, string][])
        : []),
      ["RECHAZOS", "Algunas tareas las rechazamos."],
    ],
  },
  footer: { how: "Cómo funciona", signIn: "Iniciar sesión", work: "Trabaja con nosotros" },
};

/* Tagalog, labelled FIL. Register: conversational Filipino with the English
   loanwords the market actually speaks (task, review, approve, fixed), never
   textbook Filipino. That register decides the ledger tags too — DATA /
   RESEARCH / MEDIA / DOCS are the words used out loud, while the textbook
   renderings (PANANALIKSIK, DOKUMENTO) read as stilted and overrun the tag
   column. The task titles beside them, where the meaning lives, are fully
   translated. */
const tl: Dict = {
  nav: { signIn: "Mag-sign in", send: "Magpadala ng task" },
  hero: {
    line1: "Ilarawan ang kahit anong task.",
    line2: "Tapos na ito pagsapit ng umaga.",
    sub: (h) =>
      `Research, data, pagsusulat, spreadsheets, admin — may presyo sa loob ng ${h} oras ng trabaho, hatid sa umaga.`,
    cta: "Ilarawan ang task mo",
  },
  ch01: {
    label: "Ang diff ng magdamag",
    caption:
      "“Alisin ang doble sa leads namin, ayusin ang mga pangalan, tanggalin ang mga sirang email.” — ipinadala 6:41 PM",
  },
  ch02: {
    label: "Isang presyo. Aprubado muna.",
    noMeter: "Walang subscription. Walang minimum. Walang orasang tumatakbo.",
    captions: [
      "Fixed. Hindi kada oras.",
      "Ikaw ang mag-a-approve bago magsimula.",
      "Balik bago ang unang meeting mo.",
    ],
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
    note: "HALIMBAWA LANG — HINDI ITO RATE CARD ·",
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
    desk: "Halimbawa — isang pasada ng review",
    there: "Doon",
    here: "Dito",
    pairs: [
      [
        "Mag-post ng job. Magbasa ng apatnapung proposal.",
        "Isang beses mong ilarawan. Presyo sa loob ng oras, hindi araw.",
      ],
      [
        "Mag-interview, mag-hire, mag-onboard, mag-manage.",
        "Walang i-manage. Ang operator ang bahala sa gabi.",
      ],
      [
        "Orasang tumatakbo habang natutulog ka.",
        "Isang fixed na presyo, aprubado bago magsimula ang kahit ano.",
      ],
      ["Umasa na tama ito sa umaga.", "Sinuri ng propesyonal bago mo pa ito makita."],
    ],
  },
  ch06: {
    label: "Ang mga kondisyon",
    notes: "Pangkalahatang tala",
    terms: (retentionDays) => [
      ["PRESYO", "Isang fixed na presyo, aprubado bago magsimula ang kahit ano."],
      ["REVIEW", "Bawat delivery ay dumadaan sa review bago mo makita."],
      ["IDENTITY", "Hindi mo kailanman makikilala ang manggagawa. Iyon ang punto."],
      ...(retentionDays
        ? ([
            [
              "DATA",
              `Nagtatapos ang access kasabay ng task. Buburahin ang files pagkatapos ng ${retentionDays} araw.`,
            ],
          ] as [string, string][])
        : []),
      ["PAGTANGGI", "May mga task na tinatanggihan namin."],
    ],
  },
  footer: { how: "Paano ito gumagana", signIn: "Mag-sign in", work: "Magtrabaho sa amin" },
};

export const CLIENT_I18N: Record<ClientLang, Dict> = { en, fr, es, tl };
