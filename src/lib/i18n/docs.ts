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
 * dates, the ISO stamp, "N.T.S." and the §-numbers are machine.
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
  axis: string;
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
  titleblock: [string, string][];
  bookend: { dim: string; lit: string; cta: string };
};

const pEn: ProtocolDict = {
  meta: {
    title: "How it works — fixed-price task outsourcing, step by step",
    description:
      "How Second Shift outsourcing works: you describe the task, one operator sets a fixed price within four working hours, a vetted specialist does it overnight, and it is reviewed before you see it. The full protocol, versioned and dated.",
  },
  nav: { about: "About us", client: "Get work done", workers: "For workers" },
  docket: "Operating protocol",
  h1: ["One price.", "One operator.", "One standard."],
  deck: "Every price, review and payout here is set by the same person.",
  movement1: "The night, in six stages",
  lanes: ["You", "Operator", "Night"],
  axis: "Stage · N.T.S.",
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
    sub: "§04 Review — what passes",
    criteria: [
      ["Complete", "Every item the brief names."],
      ["Verified", "Checked against the source files."],
      ["Clean", "Formatted, consistent, finished."],
      ["Honest", "Gaps and judgment calls flagged."],
    ],
    verdict: "A final fail is unpaid — the worker's risk, never yours.",
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
  titleblock: [
    ["Document", "Operating protocol"],
    ["Plate", "01 of 01 · Scale N.T.S."],
    ["Revision", "1 · Issued 2026-07-30"],
    ["Issued by", "The operator"],
  ],
  bookend: {
    dim: "Describe any task.",
    lit: "Get it back done by morning.",
    cta: "Describe your task",
  },
};

const pFr: ProtocolDict = {
  meta: {
    title: "Comment ça marche — la sous-traitance à prix fixe, étape par étape",
    description:
      "Comment fonctionne Second Shift : vous décrivez la tâche, un seul opérateur fixe un prix en quatre heures ouvrables, un spécialiste vérifié la fait pendant la nuit, et elle est contrôlée avant que vous la voyiez. Le protocole complet, versionné et daté.",
  },
  nav: { about: "Qui nous sommes", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  docket: "Protocole d'exploitation",
  h1: ["Un prix.", "Un opérateur.", "Un standard."],
  deck: "Chaque prix, chaque contrôle et chaque paiement ici est fixé par la même personne.",
  movement1: "La nuit, en six étapes",
  lanes: ["Vous", "Opérateur", "Nuit"],
  axis: "Étape · S.É.",
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
    sub: "§04 Contrôle — ce qui passe",
    criteria: [
      ["Complet", "Chaque élément nommé dans la demande."],
      ["Vérifié", "Recoupé avec les fichiers sources."],
      ["Propre", "Formaté, cohérent, terminé."],
      ["Honnête", "Les trous et les jugements sont signalés."],
    ],
    verdict: "Un échec final n'est pas payé — le risque du travailleur, jamais le vôtre.",
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
  titleblock: [
    ["Document", "Protocole d'exploitation"],
    ["Planche", "01 de 01 · Échelle S.É."],
    ["Révision", "1 · Émise 2026-07-30"],
    ["Émis par", "L'opérateur"],
  ],
  bookend: {
    dim: "Décrivez n'importe quelle tâche.",
    lit: "Récupérez-la faite au matin.",
    cta: "Décrivez votre tâche",
  },
};

const pEs: ProtocolDict = {
  meta: {
    title: "Cómo funciona — subcontratación a precio fijo, paso a paso",
    description:
      "Cómo funciona Second Shift: describes la tarea, un solo operador fija un precio en cuatro horas hábiles, un especialista verificado la hace de noche, y se revisa antes de que la veas. El protocolo completo, versionado y fechado.",
  },
  nav: { about: "Quiénes somos", client: "Haz que se haga", workers: "Para trabajadores" },
  docket: "Protocolo operativo",
  h1: ["Un precio.", "Un operador.", "Un estándar."],
  deck: "Cada precio, cada revisión y cada pago aquí los fija la misma persona.",
  movement1: "La noche, en seis etapas",
  lanes: ["Tú", "Operador", "Noche"],
  axis: "Etapa · S.E.",
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
    sub: "§04 Revisión — qué pasa el filtro",
    criteria: [
      ["Completo", "Cada punto que nombra el encargo."],
      ["Verificado", "Contrastado con los archivos fuente."],
      ["Limpio", "Con formato, coherente, terminado."],
      ["Honesto", "Los huecos y las decisiones se señalan."],
    ],
    verdict: "Un fallo final no se paga — el riesgo es del trabajador, nunca tuyo.",
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
  titleblock: [
    ["Documento", "Protocolo operativo"],
    ["Lámina", "01 de 01 · Escala S.E."],
    ["Revisión", "1 · Emitida 2026-07-30"],
    ["Emitido por", "El operador"],
  ],
  bookend: {
    dim: "Describe cualquier tarea.",
    lit: "Recíbela lista por la mañana.",
    cta: "Describe tu tarea",
  },
};

const pTl: ProtocolDict = {
  meta: {
    title: "Paano ito gumagana — fixed-price na outsourcing, hakbang-hakbang",
    description:
      "Paano gumagana ang Second Shift: ilalarawan mo ang task, isang operator ang magtatakda ng fixed na presyo sa loob ng apat na oras ng trabaho, gagawin ito ng beripikadong espesyalista sa magdamag, at susuriin bago mo makita. Ang buong protocol, may bersyon at petsa.",
  },
  nav: { about: "Tungkol sa amin", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  docket: "Operating protocol",
  h1: ["Isang presyo.", "Isang operator.", "Isang pamantayan."],
  deck: "Isang tao lang ang nagtatakda ng bawat presyo, review at bayad dito.",
  movement1: "Ang gabi, sa anim na yugto",
  lanes: ["Ikaw", "Operator", "Gabi"],
  axis: "Yugto · N.T.S.",
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
    sub: "§04 Review — ano ang pumapasa",
    criteria: [
      ["Kumpleto", "Bawat bagay na nakasaad sa brief."],
      ["Beripikado", "Sinalungat sa mga source file."],
      ["Malinis", "May format, konsistent, tapos."],
      ["Tapat", "Nakasaad ang mga kulang at ang mga pasya."],
    ],
    verdict: "Ang huling bagsak ay hindi bayad — panganib ng manggagawa, hindi kailanman sa iyo.",
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
  titleblock: [
    ["Dokumento", "Operating protocol"],
    ["Plate", "01 ng 01 · Scale N.T.S."],
    ["Rebisyon", "1 · Inilabas 2026-07-30"],
    ["Inilabas ni", "Ang operator"],
  ],
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
  problem: [string, string][];
  bridge: string;
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
    title: "About us — why Second Shift exists",
    description:
      "Two years outsourcing work to the Philippines taught us the real problem on both sides: entrepreneurs lose hours screening resumes, and Filipino specialists too often go underpaid or unpaid. Second Shift is the fix — one fixed price, one review standard, and free training that protects the people doing the work.",
  },
  nav: { how: "How it works", client: "Get work done", workers: "For workers" },
  kicker: "About us",
  h1: "We built this because the old way was broken on both ends.",
  lede: "We have spent the last two years working directly with Filipino specialists — hiring them, managing them, and watching where that relationship kept going wrong. What we saw was not a market gap. It was a market failing two groups of people at once, for two very different reasons.",
  problemHead: "What we kept running into",
  problem: [
    [
      "For entrepreneurs",
      "Outsourcing was supposed to save time. In practice it spent it: hours lost posting a job, reading forty proposals, screening resumes that all say the same thing, and interviewing people you have no reliable way to judge before you have paid them.",
    ],
    [
      "For Filipino specialists",
      "The other side of that same market is worse. Fake job posts, unpaid “test tasks” that are really just free work, and clients who vanish before the invoice is due. A skilled specialist has no shortage of demand — they have a shortage of clients who pay what the work is worth, on time, every time.",
    ],
  ],
  bridge:
    "Neither problem is really about money. Entrepreneurs were not short on candidates — they were short on a reliable way to judge one before committing. Filipino specialists were not short on skill — they were short on clients who would pay for it honestly. Fix the trust problem on both sides and the money problem mostly solves itself.",
  solutionHead: "So we built a simpler way",
  solutionLede:
    "Second Shift is not a job board and not a freelance marketplace — both of those already exist, and neither fixed what we kept seeing. It is a portal with one job: make it simple for an entrepreneur to get a task done well, and make it safe for a Filipino specialist to get paid fairly for doing it.",
  solution: [
    [
      "One price",
      "No proposals, no bidding, no hourly meter. A task gets one fixed price before anyone starts, so an entrepreneur is never guessing what the invoice will say.",
    ],
    [
      "One standard",
      "Every delivery is checked against the same written standard before it reaches the client — not a star rating, not a popularity contest. The work either meets the bar or it goes back with notes.",
    ],
    [
      "Free training",
      "The Academy teaches the trade itself — not just how to use this platform — for free, with real exams and a certificate that stays with the worker no matter what. Training is protection: a specialist who can spot a scam and prove their skill is much harder to underpay.",
    ],
  ],
  trainingHead: "Why free training is part of the business, not a marketing line",
  trainingA:
    "A specialist who has been trained properly delivers work that passes review the first time, which costs us less and pays them faster — so the training pays for itself. But it also does something we think matters on its own: it gives a Filipino specialist a real, portable credential and the judgment to ",
  trainingLink: "recognize a fake job offer",
  trainingB:
    " before it costs them anything. That is available to anyone, free, whether or not they ever claim a task here.",
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
    title: "Qui nous sommes — pourquoi Second Shift existe",
    description:
      "Deux ans à faire affaire avec des spécialistes philippins nous ont montré le vrai problème des deux côtés : les entrepreneurs perdent des heures à trier des CV, et les spécialistes philippins sont trop souvent sous-payés ou pas payés du tout. Second Shift est la solution — un prix fixe, un standard de contrôle, et une formation gratuite qui protège ceux qui font le travail.",
  },
  nav: { how: "Comment ça marche", client: "Faire faire du travail", workers: "Pour les travailleurs" },
  kicker: "Qui nous sommes",
  h1: "On a bâti ça parce que l'ancienne façon était brisée des deux bords.",
  lede: "Ça fait deux ans qu'on travaille directement avec des spécialistes philippins — on les engage, on les gère, et on voit exactement où cette relation déraille. Ce qu'on a vu, ce n'était pas un créneau à prendre. C'était un marché qui échoue deux groupes de personnes en même temps, pour deux raisons complètement différentes.",
  problemHead: "Ce qu'on a vu revenir sans arrêt",
  problem: [
    [
      "Pour les entrepreneurs",
      "La sous-traitance était censée faire sauver du temps. En pratique, elle en coûtait : des heures à publier une offre, à lire quarante propositions, à trier des CV qui disent tous la même chose, et à interviewer des gens qu'on n'a aucun moyen fiable de juger avant de les avoir payés.",
    ],
    [
      "Pour les spécialistes philippins",
      "L'autre côté du même marché est pire. De fausses offres d'emploi, des « tâches d'essai » non payées qui sont juste du travail gratuit, et des clients qui disparaissent avant l'échéance de la facture. Un spécialiste compétent ne manque pas de demande — il manque de clients qui paient ce que le travail vaut, à temps, chaque fois.",
    ],
  ],
  bridge:
    "Ni l'un ni l'autre n'est vraiment une question d'argent. Les entrepreneurs ne manquaient pas de candidats — ils manquaient d'une façon fiable d'en juger un avant de s'engager. Les spécialistes philippins ne manquaient pas de compétence — ils manquaient de clients qui la paient honnêtement. Réglez le problème de confiance des deux côtés et le problème d'argent se règle presque tout seul.",
  solutionHead: "Alors on a bâti une façon plus simple",
  solutionLede:
    "Second Shift n'est pas un site d'offres d'emploi ni une place de marché de pigistes — ça existe déjà, et ni l'un ni l'autre n'a réglé ce qu'on voyait. C'est un portail avec une seule job : rendre ça simple pour un entrepreneur de faire faire une tâche comme du monde, et rendre ça sécuritaire pour un spécialiste philippin d'être payé correctement pour la faire.",
  solution: [
    [
      "Un prix",
      "Pas de propositions, pas d'enchères, pas de compteur horaire. Une tâche reçoit un prix fixe avant que qui que ce soit commence, donc un entrepreneur ne devine jamais ce que la facture va dire.",
    ],
    [
      "Un standard",
      "Chaque livraison est vérifiée contre le même standard écrit avant d'arriver au client — pas une cote en étoiles, pas un concours de popularité. Le travail atteint la barre, ou il repart avec des notes.",
    ],
    [
      "Formation gratuite",
      "L'Académie enseigne le métier lui-même — pas juste comment se servir de la plateforme — gratuitement, avec de vrais examens et un certificat qui reste au travailleur quoi qu'il arrive. La formation, c'est de la protection : un spécialiste capable de repérer une arnaque et de prouver sa compétence est pas mal plus dur à sous-payer.",
    ],
  ],
  trainingHead: "Pourquoi la formation gratuite fait partie du modèle, pas du marketing",
  trainingA:
    "Un spécialiste bien formé livre du travail qui passe le contrôle du premier coup, ce qui nous coûte moins cher et le paie plus vite — la formation se paie donc d'elle-même. Mais elle fait aussi quelque chose qui compte en soi : elle donne à un spécialiste philippin un vrai diplôme qu'il emporte avec lui, et le jugement pour ",
  trainingLink: "reconnaître une fausse offre d'emploi",
  trainingB:
    " avant qu'elle lui coûte quoi que ce soit. C'est offert à tout le monde, gratuitement, qu'ils prennent une tâche ici ou jamais.",
  bookend: {
    dim: "Décrivez n'importe quelle tâche.",
    lit: "Récupérez-la faite au matin.",
    cta: "Décrivez votre tâche",
  },
  protocolNote: "Lisez le protocole d'exploitation complet sur",
  protocolLink: "Comment ça marche",
};

const aEs: AboutDict = {
  meta: {
    title: "Quiénes somos — por qué existe Second Shift",
    description:
      "Dos años trabajando con especialistas filipinos nos enseñaron el problema real de ambos lados: los emprendedores pierden horas filtrando currículums, y los especialistas filipinos con demasiada frecuencia cobran de menos o no cobran. Second Shift es la solución — un precio fijo, un estándar de revisión, y formación gratuita que protege a quien hace el trabajo.",
  },
  nav: { how: "Cómo funciona", client: "Haz que se haga", workers: "Para trabajadores" },
  kicker: "Quiénes somos",
  h1: "Construimos esto porque la vieja forma estaba rota de los dos lados.",
  lede: "Llevamos dos años trabajando directamente con especialistas filipinos — contratándolos, gestionándolos, y viendo dónde esa relación se rompía una y otra vez. Lo que vimos no era un hueco de mercado. Era un mercado fallándole a dos grupos de personas a la vez, por dos razones muy distintas.",
  problemHead: "Con lo que chocábamos una y otra vez",
  problem: [
    [
      "Para los emprendedores",
      "Subcontratar debía ahorrar tiempo. En la práctica lo gastaba: horas publicando una oferta, leyendo cuarenta propuestas, filtrando currículums que dicen todos lo mismo, y entrevistando a gente que no tienes forma fiable de juzgar antes de haberla pagado.",
    ],
    [
      "Para los especialistas filipinos",
      "El otro lado de ese mismo mercado es peor. Ofertas de trabajo falsas, «tareas de prueba» sin pagar que son simplemente trabajo gratis, y clientes que desaparecen antes de que venza la factura. A un especialista competente no le falta demanda — le faltan clientes que paguen lo que vale el trabajo, a tiempo, siempre.",
    ],
  ],
  bridge:
    "Ninguno de los dos problemas es realmente de dinero. A los emprendedores no les faltaban candidatos — les faltaba una forma fiable de juzgar a uno antes de comprometerse. A los especialistas filipinos no les faltaba habilidad — les faltaban clientes que la pagaran honestamente. Arregla el problema de confianza de los dos lados y el problema de dinero se arregla casi solo.",
  solutionHead: "Así que construimos algo más simple",
  solutionLede:
    "Second Shift no es un portal de empleo ni un mercado de freelancers — los dos ya existen, y ninguno arregló lo que veíamos. Es un portal con un solo trabajo: hacer simple para un emprendedor que una tarea salga bien, y hacer seguro para un especialista filipino cobrar justamente por hacerla.",
  solution: [
    [
      "Un precio",
      "Sin propuestas, sin pujas, sin contador por hora. Una tarea recibe un precio fijo antes de que nadie empiece, así que el emprendedor nunca adivina lo que dirá la factura.",
    ],
    [
      "Un estándar",
      "Cada entrega se contrasta con el mismo estándar escrito antes de llegar al cliente — no una calificación de estrellas, no un concurso de popularidad. El trabajo cumple la barra, o vuelve con notas.",
    ],
    [
      "Formación gratuita",
      "La Academia enseña el oficio en sí — no solo cómo usar esta plataforma — gratis, con exámenes reales y un certificado que se queda con el trabajador pase lo que pase. La formación es protección: a un especialista que sabe detectar una estafa y demostrar su nivel es mucho más difícil pagarle de menos.",
    ],
  ],
  trainingHead: "Por qué la formación gratuita es parte del negocio, no una frase de marketing",
  trainingA:
    "Un especialista bien formado entrega trabajo que pasa la revisión a la primera, lo que nos cuesta menos y le paga más rápido — así que la formación se paga sola. Pero además hace algo que nos importa por sí mismo: le da a un especialista filipino una credencial real y portátil, y el criterio para ",
  trainingLink: "reconocer una oferta de trabajo falsa",
  trainingB:
    " antes de que le cueste nada. Está disponible para cualquiera, gratis, tome o no tome nunca una tarea aquí.",
  bookend: {
    dim: "Describe cualquier tarea.",
    lit: "Recíbela lista por la mañana.",
    cta: "Describe tu tarea",
  },
  protocolNote: "Lee el protocolo operativo completo en",
  protocolLink: "Cómo funciona",
};

const aTl: AboutDict = {
  meta: {
    title: "Tungkol sa amin — bakit umiiral ang Second Shift",
    description:
      "Dalawang taon ng pakikipagtrabaho sa mga Pilipinong espesyalista ang nagturo sa amin ng totoong problema sa magkabilang panig: nauubos ang oras ng mga negosyante sa pagsala ng resume, at madalas kulang ang bayad o walang bayad ang mga Pilipinong espesyalista. Ang Second Shift ang sagot — isang fixed na presyo, isang pamantayan sa review, at libreng pagsasanay na nagpoprotekta sa gumagawa ng trabaho.",
  },
  nav: { how: "Paano ito gumagana", client: "Ipagawa ang trabaho", workers: "Para sa manggagawa" },
  kicker: "Tungkol sa amin",
  h1: "Ginawa namin ito dahil sira ang lumang paraan sa magkabilang dulo.",
  lede: "Dalawang taon na kaming direktang nakikipagtrabaho sa mga Pilipinong espesyalista — kinukuha sila, minamanage sila, at nakikita namin kung saan paulit-ulit nasisira ang ugnayang iyon. Ang nakita namin ay hindi puwang sa merkado. Isa itong merkadong pumapalpak sa dalawang grupo ng tao nang sabay, sa dalawang magkaibang dahilan.",
  problemHead: "Ang paulit-ulit naming nakikita",
  problem: [
    [
      "Para sa mga negosyante",
      "Dapat sanang nakakatipid ng oras ang outsourcing. Sa totoo lang, nauubos nito ang oras: oras sa pagpo-post ng job, sa pagbabasa ng apatnapung proposal, sa pagsala ng mga resume na pare-pareho ang sinasabi, at sa pag-interview ng taong wala kang maaasahang paraan para husgahan bago mo pa mabayaran.",
    ],
    [
      "Para sa mga Pilipinong espesyalista",
      "Mas malala ang kabilang panig ng parehong merkado. Pekeng job post, walang bayad na “test task” na libreng trabaho lang talaga, at mga kliyenteng naglalaho bago pa sumapit ang bayaran. Hindi kulang sa demand ang mahusay na espesyalista — kulang sila sa kliyenteng nagbabayad ng tamang halaga, sa tamang oras, sa tuwina.",
    ],
  ],
  bridge:
    "Ang totoo, hindi tungkol sa pera ang dalawang problemang ito. Hindi kulang sa kandidato ang mga negosyante — kulang sila ng maaasahang paraan para husgahan ang isa bago mangako. Hindi kulang sa galing ang mga Pilipinong espesyalista — kulang sila ng kliyenteng magbabayad nang tapat. Ayusin ang problema sa tiwala sa magkabilang panig at halos kusa nang naaayos ang problema sa pera.",
  solutionHead: "Kaya gumawa kami ng mas simpleng paraan",
  solutionLede:
    "Ang Second Shift ay hindi job board at hindi freelance marketplace — meron na niyan, at wala sa dalawa ang umayos sa nakikita namin. Isa itong portal na may iisang trabaho: gawing simple para sa negosyante na maipagawa nang maayos ang isang task, at gawing ligtas para sa Pilipinong espesyalista na mabayaran nang patas sa paggawa nito.",
  solution: [
    [
      "Isang presyo",
      "Walang proposal, walang bidding, walang orasang tumatakbo. May isang fixed na presyo ang task bago pa magsimula ang kahit sino, kaya hindi hinuhulaan ng negosyante kung magkano ang lalabas sa invoice.",
    ],
    [
      "Isang pamantayan",
      "Bawat delivery ay sinusukat sa parehong nakasulat na pamantayan bago makarating sa kliyente — hindi star rating, hindi popularity contest. Umaabot ang trabaho sa pamantayan, o babalik ito na may tala.",
    ],
    [
      "Libreng pagsasanay",
      "Ang Academy ay nagtuturo ng mismong hanapbuhay — hindi lang kung paano gamitin ang platform na ito — nang libre, may tunay na eksaminasyon at sertipikong mananatili sa manggagawa kahit ano ang mangyari. Proteksyon ang pagsasanay: mas mahirap kulangan sa bayad ang espesyalistang marunong tumukoy ng scam at makapagpatunay ng galing niya.",
    ],
  ],
  trainingHead: "Bakit bahagi ng negosyo ang libreng pagsasanay, hindi lang pang-marketing",
  trainingA:
    "Ang espesyalistang maayos na nasanay ay naghahatid ng trabahong pumapasa sa review sa unang subok, na mas mura para sa amin at mas mabilis siyang nababayaran — kaya kusang nababayaran ng pagsasanay ang sarili nito. Pero may ginagawa rin itong mahalaga mag-isa: binibigyan nito ang Pilipinong espesyalista ng tunay na kredensyal na dala-dala niya, at ng pag-iisip para ",
  trainingLink: "makilala ang pekeng alok ng trabaho",
  trainingB:
    " bago pa ito magdulot ng gastos sa kanya. Bukas ito sa kahit sino, libre, kumuha man sila ng task dito o hindi kailanman.",
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
