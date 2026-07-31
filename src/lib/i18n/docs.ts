/**
 * The two DOCUMENT pages — /how-it-works (the protocol) and /about (the
 * origin story) — in the same four languages as the two homepages.
 *
 * WHY THESE TWO SHARE A COOKIE OF THEIR OWN
 * Both are linked from BOTH homepage footers, so neither audience owns them.
 * A worker who chose FIL on /workers and a client who chose FR on / must each
 * land here in their own language, and changing language HERE must not flip
 * either homepage — that separation is the whole reason the two homepage
 * cookies exist (see src/proxy.ts). So these pages read, in order:
 *
 *     ?lang=  →  ss-lang-doc  →  ss-lang-client  →  ss-lang-worker  →  en
 *
 * and write only ss-lang-doc. Someone who has set both homepage cookies to
 * different languages gets the client one, because both documents are written
 * in the client's voice ("you describe a task", "one price").
 *
 * THE RULE, unchanged from the homepages: the VOICE translates, the MACHINE
 * stays English. Headings, body copy and clause text are voice. Revision
 * dates and the ISO stamp are machine.
 */

import { siteLangOf, type SiteLang } from "./langs";

export type DocLang = SiteLang;

/** The fallback chain above, resolved in one place so both pages agree. */
export function docLangOf(
  query: string | undefined | null,
  docCookie: string | undefined | null,
  clientCookie: string | undefined | null,
  workerCookie: string | undefined | null
): DocLang {
  return siteLangOf(query ?? docCookie ?? clientCookie ?? workerCookie);
}

/* ═══════════════════════════════════════════════════════════════════════
   /how-it-works — THE PROTOCOL
   ═══════════════════════════════════════════════════════════════════════ */

/** The six stages. Every figure is the LIVE setting: the published promise
 *  can never drift from the enforced value. A stage without a figure renders
 *  no figure at all rather than a placeholder. */
export type Stage = {
  label: string;
  say: string;
  val?: string;
  unit?: string;
};

export type ProtocolSettings = {
  quoteTurnaroundHours: number;
  maxQcRounds: number;
  revisionWindowHours: number;
  retentionDays: number | null;
};

type ProtocolDict = {
  meta: { title: string; description: string };
  nav: { about: string; client: string; workers: string };
  docket: string;
  h1: [string, string, string];
  deck: string;
  movement1: string;
  lanes: [string, string, string];
  stages: (s: ProtocolSettings) => Stage[];
  movement2: string;
  detail: {
    head: string;
    sub: string;
    criteria: [string, string][];
    verdict: string;
  };
  scope: { head: string; items: string[] };
  revisions: {
    head: string;
    cols: [string, string, string];
    rows: [string, string, string][];
  };
  bookend: { dim: string; lit: string; cta: string };
};

const pEn: ProtocolDict = {
  meta: {
    title: "How it works: fixed-price task outsourcing, step by step",
    description:
      "How AfterDesk outsourcing works: you describe the task, one operator sets a fixed price within four working hours, a vetted specialist does it overnight, and it is reviewed before you see it. The full protocol, versioned and dated.",
  },
  nav: { about: "About us", client: "Get work done", workers: "For workers" },
  docket: "Operating protocol",
  h1: ["One price.", "One operator.", "One standard."],
  deck: "Every price, review and payout here is set by the same person.",
  movement1: "The night, in six stages",
  lanes: ["You", "Operator", "Night"],
  stages: (s) => [
    { label: "Describe", say: "Plain English. Attach files if needed." },
    {
      label: "Price",
      say: "One fixed price. You approve or decline.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "To quote",
    },
    {
      label: "Night",
      say: "A vetted specialist works while you sleep.",
      val: "0",
      unit: "Contact",
    },
    {
      label: "Review",
      say: "The operator checks it. Back until right.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "QC rounds",
    },
    {
      label: "Morning",
      say: "It is yours before your day starts.",
      val: `${s.revisionWindowHours} h`,
      unit: "To flag",
    },
    {
      label: "Data",
      say: "Access ends with the task.",
      ...(s.retentionDays
        ? { val: `${s.retentionDays} d`, unit: "Then purged" }
        : {}),
    },
  ],
  movement2: "Two clauses",
  detail: {
    head: "Detail A",
    sub: "Stage 04: what passes",
    criteria: [
      ["Complete", "Every item the brief names."],
      ["Verified", "Checked against the source files."],
      ["Clean", "Formatted, consistent, finished."],
      ["Honest", "Gaps and judgment calls flagged."],
    ],
    verdict: "A final fail is unpaid. The worker's risk, never yours.",
  },
  scope: {
    head: "Not in scope",
    items: [
      "Live calls, or any direct contact.",
      "Anything that needs your identity to cross.",
      "Anything illegal, deceptive, or that harvests private personal data.",
    ],
  },
  revisions: {
    head: "Revisions",
    cols: ["Rev", "Date", "Change"],
    rows: [["01", "2026-07-30", "First published."]],
  },
  bookend: {
    dim: "Describe any task.",
    lit: "Get it back done by morning.",
    cta: "Describe your task",
  },
};

const pFr: ProtocolDict = {
  meta: {
    title: "Comment ça marche : la sous-traitance à prix fixe, étape par étape",
    description:
      "Comment fonctionne AfterDesk : vous décrivez la tâche, un seul opérateur fixe un prix en quatre heures ouvrables, un spécialiste vérifié la fait pendant la nuit, et elle est contrôlée avant que vous la voyiez. Le protocole complet, versionné et daté.",
  },
  nav: { about: "Qui nous sommes", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  docket: "Protocole d'exploitation",
  h1: ["Un prix.", "Un opérateur.", "Un standard."],
  deck: "Chaque prix, chaque contrôle et chaque paiement ici est fixé par la même personne.",
  movement1: "La nuit, en six étapes",
  lanes: ["Vous", "Opérateur", "Nuit"],
  stages: (s) => [
    { label: "Décrire", say: "En clair. Joignez des fichiers au besoin." },
    {
      label: "Prix",
      say: "Un prix fixe. Vous approuvez ou vous refusez.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Pour chiffrer",
    },
    {
      label: "Nuit",
      say: "Un spécialiste vérifié travaille pendant que vous dormez.",
      val: "0",
      unit: "Contact",
    },
    {
      label: "Contrôle",
      say: "L'opérateur vérifie. Renvoyé jusqu'à ce que ce soit bon.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "Rondes de contrôle",
    },
    {
      label: "Matin",
      say: "C'est à vous avant que votre journée commence.",
      val: `${s.revisionWindowHours} h`,
      unit: "Pour signaler",
    },
    {
      label: "Données",
      say: "L'accès finit avec la tâche.",
      ...(s.retentionDays
        ? { val: `${s.retentionDays} j`, unit: "Puis purgé" }
        : {}),
    },
  ],
  movement2: "Deux clauses",
  detail: {
    head: "Détail A",
    sub: "Étape 04 : ce qui passe",
    criteria: [
      ["Complet", "Chaque élément nommé dans la demande."],
      ["Vérifié", "Recoupé avec les fichiers sources."],
      ["Propre", "Formaté, cohérent, terminé."],
      ["Honnête", "Les trous et les jugements sont signalés."],
    ],
    verdict: "Un échec final n'est pas payé. Le risque du travailleur, jamais le vôtre.",
  },
  scope: {
    head: "Hors périmètre",
    items: [
      "Les appels en direct, ou tout contact direct.",
      "Tout ce qui exige votre identité pour traverser.",
      "Tout ce qui est illégal, trompeur, ou qui récolte des données personnelles privées.",
    ],
  },
  revisions: {
    head: "Révisions",
    cols: ["Rév", "Date", "Changement"],
    rows: [["01", "2026-07-30", "Première publication."]],
  },
  bookend: {
    dim: "Décrivez n'importe quelle tâche.",
    lit: "Récupérez-la faite au matin.",
    cta: "Décrivez votre tâche",
  },
};

const pEs: ProtocolDict = {
  meta: {
    title: "Cómo funciona: subcontratación a precio fijo, paso a paso",
    description:
      "Cómo funciona AfterDesk: describes la tarea, un solo operador fija un precio en cuatro horas hábiles, un especialista verificado la hace de noche, y se revisa antes de que la veas. El protocolo completo, versionado y fechado.",
  },
  nav: { about: "Quiénes somos", client: "Haz que se haga", workers: "Para trabajadores" },
  docket: "Protocolo operativo",
  h1: ["Un precio.", "Un operador.", "Un estándar."],
  deck: "Cada precio, cada revisión y cada pago aquí los fija la misma persona.",
  movement1: "La noche, en seis etapas",
  lanes: ["Tú", "Operador", "Noche"],
  stages: (s) => [
    { label: "Describir", say: "En lenguaje claro. Adjunta archivos si hacen falta." },
    {
      label: "Precio",
      say: "Un precio fijo. Lo apruebas o lo rechazas.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Para cotizar",
    },
    {
      label: "Noche",
      say: "Un especialista verificado trabaja mientras duermes.",
      val: "0",
      unit: "Contacto",
    },
    {
      label: "Revisión",
      say: "El operador lo revisa. Vuelve hasta que esté bien.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "Rondas de QC",
    },
    {
      label: "Mañana",
      say: "Es tuyo antes de que empiece tu día.",
      val: `${s.revisionWindowHours} h`,
      unit: "Para avisar",
    },
    {
      label: "Datos",
      say: "El acceso termina con la tarea.",
      ...(s.retentionDays
        ? { val: `${s.retentionDays} d`, unit: "Luego purgado" }
        : {}),
    },
  ],
  movement2: "Dos cláusulas",
  detail: {
    head: "Detalle A",
    sub: "Etapa 04: qué pasa el filtro",
    criteria: [
      ["Completo", "Cada punto que nombra el encargo."],
      ["Verificado", "Contrastado con los archivos fuente."],
      ["Limpio", "Con formato, coherente, terminado."],
      ["Honesto", "Los huecos y las decisiones se señalan."],
    ],
    verdict: "Un fallo final no se paga. El riesgo es del trabajador, nunca tuyo.",
  },
  scope: {
    head: "Fuera de alcance",
    items: [
      "Llamadas en vivo, o cualquier contacto directo.",
      "Cualquier cosa que necesite tu identidad para cruzar.",
      "Cualquier cosa ilegal, engañosa, o que recolecte datos personales privados.",
    ],
  },
  revisions: {
    head: "Revisiones",
    cols: ["Rev", "Fecha", "Cambio"],
    rows: [["01", "2026-07-30", "Primera publicación."]],
  },
  bookend: {
    dim: "Describe cualquier tarea.",
    lit: "Recíbela lista por la mañana.",
    cta: "Describe tu tarea",
  },
};

const pTl: ProtocolDict = {
  meta: {
    title: "Paano ito gumagana: fixed-price na outsourcing, hakbang-hakbang",
    description:
      "Paano gumagana ang AfterDesk: ilalarawan mo ang task, isang operator ang magtatakda ng fixed na presyo sa loob ng apat na oras ng trabaho, gagawin ito ng beripikadong espesyalista sa magdamag, at susuriin bago mo makita. Ang buong protocol, may bersyon at petsa.",
  },
  nav: { about: "Tungkol sa amin", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  docket: "Operating protocol",
  h1: ["Isang presyo.", "Isang operator.", "Isang pamantayan."],
  deck: "Isang tao lang ang nagtatakda ng bawat presyo, review at bayad dito.",
  movement1: "Ang gabi, sa anim na yugto",
  lanes: ["Ikaw", "Operator", "Gabi"],
  stages: (s) => [
    { label: "Ilarawan", say: "Simpleng salita. Maglakip ng file kung kailangan." },
    {
      label: "Presyo",
      say: "Isang fixed na presyo. Aaprubahan mo o hindi.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Para magpresyo",
    },
    {
      label: "Gabi",
      say: "May beripikadong espesyalistang gumagawa habang tulog ka.",
      val: "0",
      unit: "Kontak",
    },
    {
      label: "Review",
      say: "Sinusuri ito ng operator. Ibinabalik hanggang tama.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "QC rounds",
    },
    {
      label: "Umaga",
      say: "Sa iyo na ito bago magsimula ang araw mo.",
      val: `${s.revisionWindowHours} h`,
      unit: "Para magsabi",
    },
    {
      label: "Data",
      say: "Nagtatapos ang access kasabay ng task.",
      ...(s.retentionDays
        ? { val: `${s.retentionDays} d`, unit: "Tapos buburahin" }
        : {}),
    },
  ],
  movement2: "Dalawang kondisyon",
  detail: {
    head: "Detail A",
    sub: "Yugto 04: ano ang pumapasa",
    criteria: [
      ["Kumpleto", "Bawat bagay na nakasaad sa brief."],
      ["Beripikado", "Sinalungat sa mga source file."],
      ["Malinis", "May format, konsistent, tapos."],
      ["Tapat", "Nakasaad ang mga kulang at ang mga pasya."],
    ],
    verdict: "Ang huling bagsak ay hindi bayad. Panganib ng manggagawa, hindi kailanman sa iyo.",
  },
  scope: {
    head: "Wala sa saklaw",
    items: [
      "Live na tawag, o anumang direktang kontak.",
      "Anumang nangangailangan ng pagkakakilanlan mo para tumawid.",
      "Anumang ilegal, mapanlinlang, o kumukuha ng pribadong personal na datos.",
    ],
  },
  revisions: {
    head: "Mga rebisyon",
    cols: ["Rev", "Petsa", "Pagbabago"],
    rows: [["01", "2026-07-30", "Unang inilathala."]],
  },
  bookend: {
    dim: "Ilarawan ang kahit anong task.",
    lit: "Tapos na ito pagsapit ng umaga.",
    cta: "Ilarawan ang task mo",
  },
};

export const PROTOCOL_I18N: Record<DocLang, ProtocolDict> = {
  en: pEn,
  fr: pFr,
  es: pEs,
  tl: pTl,
};

/* ═══════════════════════════════════════════════════════════════════════
   /about — THE ORIGIN STORY
   Corporate "we" throughout, in every language: no first person, no founder
   name, no photo. A company can be small and still speak as "we".
   ═══════════════════════════════════════════════════════════════════════ */

type AboutDict = {
  meta: { title: string; description: string };
  nav: { how: string; client: string; workers: string };
  kicker: string;
  h1: string;
  lede: string;
  problemHead: string;
  /** A heading and three FACTS — not a heading and a 55-word paragraph.
   *  The first version of this page told the story in five block
   *  paragraphs and the verdict was "still too much bloc text, c'est laid
   *  et donne pas envie de lire". Correct. Everything below is now the
   *  shortest true sentence that still carries the point. */
  problem: [string, string[]][];
  /** The turn, in two lines, set at heading size. This used to be a
   *  60-word paragraph in the same grey as everything around it. */
  bridge: [string, string];
  solutionHead: string;
  solutionLede: string;
  solution: [string, string][];
  trainingHead: string;
  /** Split around an inline link to the scam course — the one piece of
   *  evidence on this page that the problem it describes is real. */
  trainingA: string;
  trainingLink: string;
  trainingB: string;
  bookend: { dim: string; lit: string; cta: string };
  protocolNote: string;
  protocolLink: string;
};

const aEn: AboutDict = {
  meta: {
    title: "About us: why AfterDesk exists",
    description:
      "Two years outsourcing work to the Philippines taught us the real problem on both sides: entrepreneurs lose hours screening resumes, and Filipino specialists too often go underpaid or unpaid. AfterDesk is the fix: one fixed price, one review standard, and free training that protects the people doing the work.",
  },
  nav: { how: "How it works", client: "Get work done", workers: "For workers" },
  kicker: "About us",
  h1: "We built this because the old way was broken on both ends.",
  lede: "Two years hiring and managing Filipino specialists showed us the same thing over and over. Not a gap in the market. A market failing both sides at once.",
  problemHead: "What we kept running into",
  problem: [
    [
      "For entrepreneurs",
      [
        "Hundreds of proposals to read.",
        "Resumes that all say the same thing.",
        "No way to know if any of them are good until you've already paid.",
      ],
    ],
    [
      "For Filipino specialists",
      [
        "Fake job posts.",
        "Unpaid \u201Ctest tasks\u201D that are really just free work.",
        "Clients who vanish before the invoice is due.",
      ],
    ],
  ],
  bridge: ["Neither side was short on people.", "Both sides were short on trust."],
  solutionHead: "So we built a simpler way",
  solutionLede:
    "Not a job board. Not a freelance marketplace. Both already exist, and neither fixed what we kept seeing.",
  solution: [
    [
      "One price",
      "One fixed price before anyone starts. No proposals, no bidding, no hourly meter.",
    ],
    [
      "One standard",
      "Every delivery is checked against the same written standard before the client sees it. It meets the bar, or it goes back with notes.",
    ],
    [
      "Free training",
      "The Academy teaches the trade itself, free, with real exams and a certificate the worker keeps.",
    ],
  ],
  trainingHead: "Why free training is part of the business, not a marketing line",
  trainingA:
    "A specialist who was trained properly passes review the first time. That costs us less and pays them faster. It also hands them a credential they keep, and the judgment to ",
  trainingLink: "recognize a fake job offer",
  trainingB: " before it costs them anything. Free to anyone, task or no task.",
  bookend: {
    dim: "Describe any task.",
    lit: "Get it back done by morning.",
    cta: "Describe your task",
  },
  protocolNote: "Read the full operating protocol at",
  protocolLink: "How it works",
};

const aFr: AboutDict = {
  meta: {
    title: "Qui nous sommes : pourquoi AfterDesk existe",
    description:
      "Deux ans \u00E0 faire affaire avec des sp\u00E9cialistes philippins nous ont montr\u00E9 le vrai probl\u00E8me des deux c\u00F4t\u00E9s : les entrepreneurs perdent des heures \u00E0 trier des CV, et les sp\u00E9cialistes philippins sont trop souvent sous-pay\u00E9s ou pas pay\u00E9s du tout. AfterDesk est la solution : un prix fixe, un standard de contr\u00F4le, et une formation gratuite qui prot\u00E8ge ceux qui font le travail.",
  },
  nav: { how: "Comment \u00E7a marche", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  kicker: "Qui nous sommes",
  h1: "On a b\u00E2ti \u00E7a parce que l'ancienne fa\u00E7on \u00E9tait bris\u00E9e des deux bords.",
  lede: "Deux ans \u00E0 engager et \u00E0 g\u00E9rer des sp\u00E9cialistes philippins nous ont montr\u00E9 la m\u00EAme affaire chaque fois. Pas un cr\u00E9neau \u00E0 prendre : un march\u00E9 qui \u00E9choue les deux bords en m\u00EAme temps.",
  problemHead: "Ce qu'on a vu revenir sans arr\u00EAt",
  problem: [
    [
      "Pour les entrepreneurs",
      [
        "Des centaines de propositions \u00E0 lire.",
        "Des CV qui disent tous la m\u00EAme chose.",
        "Aucun moyen de savoir si elles sont bonnes avant de les avoir pay\u00E9es.",
      ],
    ],
    [
      "Pour les sp\u00E9cialistes philippins",
      [
        "De fausses offres d'emploi.",
        "Des \u00AB t\u00E2ches d'essai \u00BB non pay\u00E9es qui sont juste du travail gratuit.",
        "Des clients qui disparaissent avant l'\u00E9ch\u00E9ance de la facture.",
      ],
    ],
  ],
  bridge: ["Personne ne manquait de monde.", "Les deux bords manquaient de confiance."],
  solutionHead: "Alors on a b\u00E2ti une fa\u00E7on plus simple",
  solutionLede:
    "Pas un site d'offres d'emploi. Pas une place de march\u00E9 de pigistes. \u00C7a existe d\u00E9j\u00E0, et \u00E7a n'a rien r\u00E9gl\u00E9 de ce qu'on voyait.",
  solution: [
    [
      "Un prix",
      "Un prix fixe avant que qui que ce soit commence. Pas de propositions, pas d'ench\u00E8res, pas de compteur horaire.",
    ],
    [
      "Un standard",
      "Chaque livraison est v\u00E9rifi\u00E9e contre le m\u00EAme standard \u00E9crit avant que le client la voie. Elle passe, ou elle repart avec des notes.",
    ],
    [
      "Formation gratuite",
      "L'Acad\u00E9mie enseigne le m\u00E9tier lui-m\u00EAme, gratuitement, avec de vrais examens et un certificat que le travailleur garde.",
    ],
  ],
  trainingHead: "Pourquoi la formation gratuite fait partie du mod\u00E8le, pas du marketing",
  trainingA:
    "Un sp\u00E9cialiste bien form\u00E9 passe le contr\u00F4le du premier coup. \u00C7a nous co\u00FBte moins cher et \u00E7a le paie plus vite. \u00C7a lui donne aussi un dipl\u00F4me qu'il garde, et le jugement pour ",
  trainingLink: "reconna\u00EEtre une fausse offre d'emploi",
  trainingB: " avant qu'elle lui co\u00FBte quoi que ce soit. Gratuit pour tout le monde, t\u00E2che ou pas.",
  bookend: {
    dim: "D\u00E9crivez n'importe quelle t\u00E2che.",
    lit: "R\u00E9cup\u00E9rez-la faite au matin.",
    cta: "D\u00E9crivez votre t\u00E2che",
  },
  protocolNote: "Lisez le protocole d'exploitation complet sur",
  protocolLink: "Comment \u00E7a marche",
};

const aEs: AboutDict = {
  meta: {
    title: "Qui\u00E9nes somos: por qu\u00E9 existe AfterDesk",
    description:
      "Dos a\u00F1os trabajando con especialistas filipinos nos ense\u00F1aron el problema real de ambos lados: los emprendedores pierden horas filtrando curr\u00EDculums, y los especialistas filipinos con demasiada frecuencia cobran de menos o no cobran. AfterDesk es la soluci\u00F3n: un precio fijo, un est\u00E1ndar de revisi\u00F3n, y formaci\u00F3n gratuita que protege a quien hace el trabajo.",
  },
  nav: { how: "C\u00F3mo funciona", client: "Haz que se haga", workers: "Para trabajadores" },
  kicker: "Qui\u00E9nes somos",
  h1: "Construimos esto porque la vieja forma estaba rota de los dos lados.",
  lede: "Dos a\u00F1os contratando y gestionando especialistas filipinos nos mostraron lo mismo una y otra vez. No un hueco de mercado: un mercado fall\u00E1ndole a los dos lados a la vez.",
  problemHead: "Con lo que chocábamos una y otra vez",
  problem: [
    [
      "Para los emprendedores",
      [
        "Cientos de propuestas que leer.",
        "Curr\u00EDculums que dicen todos lo mismo.",
        "Ninguna forma de saber si son buenas antes de haberlas pagado.",
      ],
    ],
    [
      "Para los especialistas filipinos",
      [
        "Ofertas de trabajo falsas.",
        "\u00ABTareas de prueba\u00BB sin pagar que son trabajo gratis.",
        "Clientes que desaparecen antes de que venza la factura.",
      ],
    ],
  ],
  bridge: ["A nadie le faltaba gente.", "A los dos lados les faltaba confianza."],
  solutionHead: "As\u00ED que construimos algo m\u00E1s simple",
  solutionLede:
    "No es un portal de empleo. No es un mercado de freelancers. Los dos ya existen, y ninguno arregl\u00F3 lo que ve\u00EDamos.",
  solution: [
    [
      "Un precio",
      "Un precio fijo antes de que nadie empiece. Sin propuestas, sin pujas, sin contador por hora.",
    ],
    [
      "Un est\u00E1ndar",
      "Cada entrega se contrasta con el mismo est\u00E1ndar escrito antes de que la vea el cliente. Cumple, o vuelve con notas.",
    ],
    [
      "Formaci\u00F3n gratuita",
      "La Academia ense\u00F1a el oficio en s\u00ED, gratis, con ex\u00E1menes reales y un certificado que el trabajador se queda.",
    ],
  ],
  trainingHead: "Por qu\u00E9 la formaci\u00F3n gratuita es parte del negocio, no una frase de marketing",
  trainingA:
    "Un especialista bien formado pasa la revisi\u00F3n a la primera. Eso nos cuesta menos y le paga m\u00E1s r\u00E1pido. Tambi\u00E9n le da una credencial que se queda con \u00E9l, y el criterio para ",
  trainingLink: "reconocer una oferta de trabajo falsa",
  trainingB: " antes de que le cueste nada. Gratis para cualquiera, con tarea o sin ella.",
  bookend: {
    dim: "Describe cualquier tarea.",
    lit: "Rec\u00EDbela lista por la ma\u00F1ana.",
    cta: "Describe tu tarea",
  },
  protocolNote: "Lee el protocolo operativo completo en",
  protocolLink: "C\u00F3mo funciona",
};

const aTl: AboutDict = {
  meta: {
    title: "Tungkol sa amin: bakit umiiral ang AfterDesk",
    description:
      "Dalawang taon ng pakikipagtrabaho sa mga Pilipinong espesyalista ang nagturo sa amin ng totoong problema sa magkabilang panig: nauubos ang oras ng mga negosyante sa pagsala ng resume, at madalas kulang ang bayad o walang bayad ang mga Pilipinong espesyalista. Ang AfterDesk ang sagot: isang fixed na presyo, isang pamantayan sa review, at libreng pagsasanay na nagpoprotekta sa gumagawa ng trabaho.",
  },
  nav: { how: "Paano ito gumagana", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  kicker: "Tungkol sa amin",
  h1: "Ginawa namin ito dahil sira ang lumang paraan sa magkabilang dulo.",
  lede: "Dalawang taon ng pagkuha at pag-manage ng mga Pilipinong espesyalista ang nagpakita sa amin ng parehong bagay nang paulit-ulit. Hindi ito puwang sa merkado: merkadong pumapalpak sa magkabilang panig nang sabay.",
  problemHead: "Ang paulit-ulit naming nakikita",
  problem: [
    [
      "Para sa mga negosyante",
      [
        "Daan-daang proposal na babasahin.",
        "Mga resume na pare-pareho ang sinasabi.",
        "Walang paraan para malaman kung maganda sila bago mo pa sila mabayaran.",
      ],
    ],
    [
      "Para sa mga Pilipinong espesyalista",
      [
        "Pekeng job post.",
        "Walang bayad na \u201Ctest task\u201D na libreng trabaho lang talaga.",
        "Mga kliyenteng naglalaho bago sumapit ang bayaran.",
      ],
    ],
  ],
  bridge: ["Walang kulang sa tao ang kahit sinong panig.", "Ang kulang sa dalawa ay tiwala."],
  solutionHead: "Kaya gumawa kami ng mas simpleng paraan",
  solutionLede:
    "Hindi job board. Hindi freelance marketplace. Meron na niyan, at wala sa dalawa ang umayos sa nakikita namin.",
  solution: [
    [
      "Isang presyo",
      "Isang fixed na presyo bago magsimula ang kahit sino. Walang proposal, walang bidding, walang orasang tumatakbo.",
    ],
    [
      "Isang pamantayan",
      "Bawat delivery ay sinusukat sa parehong nakasulat na pamantayan bago makita ng kliyente. Pumasa, o babalik ito na may tala.",
    ],
    [
      "Libreng pagsasanay",
      "Nagtuturo ang Academy ng mismong hanapbuhay, libre, may tunay na eksaminasyon at sertipikong mananatili sa manggagawa.",
    ],
  ],
  trainingHead: "Bakit bahagi ng negosyo ang libreng pagsasanay, hindi lang pang-marketing",
  trainingA:
    "Ang espesyalistang maayos na nasanay ay pumapasa sa review sa unang subok. Mas mura iyon para sa amin at mas mabilis siyang nababayaran. Binibigyan din siya nito ng kredensyal na dala-dala niya, at ng pag-iisip para ",
  trainingLink: "makilala ang pekeng alok ng trabaho",
  trainingB: " bago pa ito magdulot ng gastos sa kanya. Libre sa kahit sino, may task man o wala.",
  bookend: {
    dim: "Ilarawan ang kahit anong task.",
    lit: "Tapos na ito pagsapit ng umaga.",
    cta: "Ilarawan ang task mo",
  },
  protocolNote: "Basahin ang buong operating protocol sa",
  protocolLink: "Paano ito gumagana",
};

export const ABOUT_I18N: Record<DocLang, AboutDict> = {
  en: aEn,
  fr: aFr,
  es: aEs,
  tl: aTl,
};
