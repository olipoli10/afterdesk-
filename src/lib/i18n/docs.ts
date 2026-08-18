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
import type { ComparisonTableDict } from "@/components/comparison-table";

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
  nav: { about: string; client: string };
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
    title: "How it works: defined scope, fixed price, checked delivery",
    description:
      "Define the deliverable, approve the scope and price, then Endvera manages execution and quality control before delivery. The full operating protocol, versioned and dated.",
  },
  nav: { about: "About us", client: "Get work done" },
  docket: "Operating protocol",
  h1: ["Defined scope.", "Managed execution.", "Reviewed delivery."],
  deck: "Define the result, approve one fixed price, receive it checked. Below, the same task in the six stages we run internally. The approved brief, price and review standard follow it from intake to delivery.",
  movement1: "One task, in six stages",
  lanes: ["You", "Endvera", "Execution"],
  stages: (s) => [
    { label: "Describe", say: "Plain language. Attach files if needed." },
    {
      label: "Price",
      say: "Fit, access, timing and one fixed price. You approve or decline.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "To quote, working hours",
    },
    {
      label: "Execute",
      say: "Endvera runs the approved scope, and chooses the most dependable method for it.",
      val: "0",
      unit: "Contact",
    },
    {
      label: "Review",
      say: "Quality control checks completeness, critical details and format.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "QC rounds",
    },
    {
      label: "Deliver",
      say: "You receive the completed work after review.",
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
      ["Verified", "Checked against agreed sources when the brief requires it."],
      ["Clean", "Formatted, consistent, finished."],
      ["Honest", "Gaps and judgment calls flagged."],
    ],
    verdict: "Work that does not pass final review is not delivered as complete.",
  },
  scope: {
    head: "Not in scope",
    items: [
      "Live calls, or any direct contact.",
      "Anything that needs your identity to cross.",
      "High-stakes legal, medical, financial, or regulated professional judgment.",
      "Anything illegal, deceptive, or that harvests private personal data.",
    ],
  },
  revisions: {
    head: "Revisions",
    cols: ["Rev", "Date", "Change"],
    rows: [
      ["01", "2026-07-30", "First published."],
      ["02", "2026-08-05", "Repositioned around bounded deliverables; timing qualified as working hours."],
      ["03", "2026-08-10", "Execution stage restated: Endvera owns the approved scope and chooses the method for it."],
    ],
  },
  bookend: {
    dim: "Describe the deliverable.",
    lit: "Get completed, reviewed work.",
    cta: "Describe the outcome",
  },
};

const pFr: ProtocolDict = {
  meta: {
    title: "Comment ça marche : périmètre défini, prix fixe, livraison vérifiée",
    description:
      "Définissez le livrable, approuvez le périmètre et le prix, puis Endvera gère l'exécution et le contrôle qualité avant livraison. Le protocole complet, versionné et daté.",
  },
  nav: { about: "Qui nous sommes", client: "Faire faire du travail" },
  docket: "Protocole d'exploitation",
  h1: ["Cadre défini.", "Exécution gérée.", "Livraison vérifiée."],
  deck: "Définissez le résultat, approuvez un prix fixe, recevez-le vérifié. Ci-dessous, la même tâche dans les six étapes que nous exécutons en interne. Le brief approuvé, le prix et la norme de contrôle la suivent de la prise en charge à la livraison.",
  movement1: "Une tâche, en six étapes",
  lanes: ["Vous", "Endvera", "Exécution"],
  stages: (s) => [
    { label: "Décrire", say: "En clair. Joignez des fichiers au besoin." },
    {
      label: "Prix",
      say: "Adéquation, accès, délai et prix fixe. Vous approuvez ou refusez.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Pour chiffrer, heures ouvrables",
    },
    {
      label: "Exécution",
      say: "Endvera réalise le périmètre approuvé et choisit la méthode la plus fiable pour le faire.",
      val: "0",
      unit: "Contact",
    },
    {
      label: "Contrôle",
      say: "Le contrôle qualité vérifie l'exhaustivité, les détails critiques et le format.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "Rondes de contrôle",
    },
    {
      label: "Livraison",
      say: "Vous recevez le travail terminé après le contrôle.",
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
      ["Vérifié", "Recoupé avec les sources convenues lorsque le brief l'exige."],
      ["Propre", "Formaté, cohérent, terminé."],
      ["Honnête", "Les trous et les jugements sont signalés."],
    ],
    verdict: "Un travail qui ne passe pas le contrôle final n'est pas livré comme terminé.",
  },
  scope: {
    head: "Hors périmètre",
    items: [
      "Les appels en direct, ou tout contact direct.",
      "Tout ce qui exige votre identité pour traverser.",
      "Les décisions juridiques, médicales, financières ou réglementées à haut risque.",
      "Tout ce qui est illégal, trompeur, ou qui récolte des données personnelles privées.",
    ],
  },
  revisions: {
    head: "Révisions",
    cols: ["Rév", "Date", "Changement"],
    rows: [
      ["01", "2026-07-30", "Première publication."],
      ["02", "2026-08-05", "Recentré sur les livrables délimités; délai qualifié en heures ouvrables."],
      ["03", "2026-08-10", "Étape d'exécution reformulée : Endvera porte le périmètre approuvé et en choisit la méthode."],
    ],
  },
  bookend: {
    dim: "Décrivez le livrable.",
    lit: "Recevez un travail terminé et vérifié.",
    cta: "Décrire le résultat",
  },
};

const pEs: ProtocolDict = {
  meta: {
    title: "Cómo funciona: alcance definido, precio fijo, entrega verificada",
    description:
      "Define el entregable, aprueba el alcance y el precio, y Endvera gestiona la ejecución y el control de calidad antes de la entrega. El protocolo completo, versionado y fechado.",
  },
  nav: { about: "Quiénes somos", client: "Haz que se haga" },
  docket: "Protocolo operativo",
  h1: ["Alcance definido.", "Ejecución gestionada.", "Entrega revisada."],
  deck: "Define el resultado, aprueba un precio fijo, recíbelo revisado. Abajo, la misma tarea en las seis etapas que ejecutamos internamente. Las instrucciones aprobadas, el precio y el estándar de revisión la acompañan hasta la entrega.",
  movement1: "Una tarea, en seis etapas",
  lanes: ["Tú", "Endvera", "Ejecución"],
  stages: (s) => [
    { label: "Describir", say: "En lenguaje claro. Adjunta archivos si hacen falta." },
    {
      label: "Precio",
      say: "Encaje, acceso, plazo y precio fijo. Lo apruebas o rechazas.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Para cotizar, horas hábiles",
    },
    {
      label: "Ejecución",
      say: "Endvera ejecuta el alcance aprobado y elige el método más fiable para hacerlo.",
      val: "0",
      unit: "Contacto",
    },
    {
      label: "Revisión",
      say: "Control de calidad comprueba integridad, detalles críticos y formato.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "Rondas de QC",
    },
    {
      label: "Entrega",
      say: "Recibes el trabajo completado después de la revisión.",
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
      ["Verificado", "Contrastado con las fuentes acordadas cuando las instrucciones lo exigen."],
      ["Limpio", "Con formato, coherente, terminado."],
      ["Honesto", "Los huecos y las decisiones se señalan."],
    ],
    verdict: "El trabajo que no pasa la revisión final no se entrega como terminado.",
  },
  scope: {
    head: "Fuera de alcance",
    items: [
      "Llamadas en vivo, o cualquier contacto directo.",
      "Cualquier cosa que necesite tu identidad para cruzar.",
      "Criterio legal, médico, financiero o regulado de alto riesgo.",
      "Cualquier cosa ilegal, engañosa, o que recolecte datos personales privados.",
    ],
  },
  revisions: {
    head: "Revisiones",
    cols: ["Rev", "Fecha", "Cambio"],
    rows: [
      ["01", "2026-07-30", "Primera publicación."],
      ["02", "2026-08-05", "Reenfocado en entregables acotados; plazo calificado en horas hábiles."],
      ["03", "2026-08-10", "Etapa de ejecución reformulada: Endvera sostiene el alcance aprobado y elige el método."],
    ],
  },
  bookend: {
    dim: "Describe el entregable.",
    lit: "Recibe trabajo terminado y revisado.",
    cta: "Describe el resultado",
  },
};

const pTl: ProtocolDict = {
  meta: {
    title: "Paano gumagana: tiyak na scope, fixed na presyo, sinuring delivery",
    description:
      "I-define ang deliverable, aprubahan ang scope at presyo, at mina-manage ng Endvera ang execution at quality control bago i-deliver. Ang buong protocol, may bersyon at petsa.",
  },
  nav: { about: "Tungkol sa amin", client: "Ipagawa ang trabaho" },
  docket: "Protocol ng operasyon",
  h1: ["Malinaw na scope.", "Managed execution.", "Sinuring delivery."],
  deck: "Kasama ng task mula intake hanggang delivery ang approved brief, presyo, at review standard.",
  movement1: "Isang task, sa anim na yugto",
  lanes: ["Ikaw", "Endvera", "Execution"],
  stages: (s) => [
    { label: "Ilarawan", say: "Simpleng salita. Maglakip ng file kung kailangan." },
    {
      label: "Presyo",
      say: "Fit, access, timing, at fixed price. Aaprubahan mo o hindi.",
      val: `≤ ${s.quoteTurnaroundHours} h`,
      unit: "Para magpresyo, working hours",
    },
    {
      label: "Execution",
      say: "Isinasagawa ng Endvera ang approved scope, at pinipili nito ang pinaka-maaasahang paraan para dito.",
      val: "0",
      unit: "Kontak",
    },
    {
      label: "Review",
      say: "Sinusuri ng quality control ang completeness, critical details, at format.",
      val: `≤ ${s.maxQcRounds} ×`,
      unit: "Mga round ng QC",
    },
    {
      label: "Delivery",
      say: "Matatanggap mo ang completed work pagkatapos ng review.",
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
    head: "Detalye A",
    sub: "Yugto 04: ano ang pumapasa",
    criteria: [
      ["Kumpleto", "Bawat bagay na nakasaad sa brief."],
      ["Beripikado", "Sinuri laban sa agreed sources kapag kailangan sa brief."],
      ["Malinis", "May format, konsistent, tapos."],
      ["Tapat", "Nakasaad ang mga kulang at ang mga pasya."],
    ],
    verdict: "Ang trabahong hindi pumasa sa final review ay hindi dini-deliver bilang kumpleto.",
  },
  scope: {
    head: "Wala sa saklaw",
    items: [
      "Live na tawag, o anumang direktang kontak.",
      "Anumang nangangailangan ng pagkakakilanlan mo para tumawid.",
      "High-risk na legal, medical, financial, o regulated professional judgment.",
      "Anumang ilegal, mapanlinlang, o kumukuha ng pribadong personal na datos.",
    ],
  },
  revisions: {
    head: "Mga rebisyon",
    cols: ["Rev", "Petsa", "Pagbabago"],
    rows: [
      ["01", "2026-07-30", "Unang inilathala."],
      ["02", "2026-08-05", "Ini-refocus sa bounded deliverables; ang timing ay naka-qualify sa working hours."],
      ["03", "2026-08-10", "Muling isinaad ang execution stage: hawak ng Endvera ang aprubadong scope at pumipili ng paraan."],
    ],
  },
  bookend: {
    dim: "Ilarawan ang deliverable.",
    lit: "Tumanggap ng completed at reviewed na work.",
    cta: "Ilarawan ang resulta",
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
  nav: { how: string; client: string };
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
  /** Split around an inline link to the ai-tools course — the one piece of
   *  evidence on this page that the training claim above it is real. */
  trainingA: string;
  trainingLink: string;
  trainingB: string;
  bookend: { dim: string; lit: string; cta: string };
  protocolNote: string;
  protocolLink: string;
  /** The comparison table — /about's comparison section, after `solution`. */
  comparisonTable: ComparisonTableDict;
};

const aEn: AboutDict = {
  meta: {
    title: "About Endvera: finished work, not hired time",
    description:
      "Endvera exists to close the gap between asking for administrative work and receiving a finished, checked deliverable.",
  },
  nav: { how: "How it works", client: "Get work done" },
  kicker: "About us",
  h1: "Built for work that needs an owner, not another tool.",
  lede: "AI tools, freelancers and assistants can all help produce work. The unresolved gap is the process between a request and a checked, usable deliverable.",
  problemHead: "Where the work still breaks",
  problem: [
    [
      "For business teams",
      [
        "AI output still needs context and verification.",
        "Marketplaces still require selection and management.",
        "Hourly help can leave quality control with the buyer.",
      ],
    ],
    [
      "For operations",
      [
        "Exceptions disappear between handoffs.",
        "Broad requests are hard to scope and repeat.",
        "Quality standards vary from one task to the next.",
      ],
    ],
  ],
  bridge: ["Access to people and tools was not missing.", "Accountability for completion was."],
  solutionHead: "The operating idea",
  solutionLede:
    "Endvera delivers finished administrative work at a fixed price. The approved brief and review standard stay attached to the task from scope to delivery.",
  solution: [
    [
      "Defined scope",
      "The deliverable, rules, access, timing and fixed one-off price are confirmed before work begins.",
    ],
    [
      "Managed execution",
      "Endvera owns coordination and exception handling against the approved brief instead of passing them back to the client.",
    ],
    [
      "Reviewed delivery",
      "Every completed task is checked against the approved standard before the deliverable reaches the client.",
    ],
  ],
  trainingHead: "Why specialist training is part of the operating system",
  trainingA:
    "Standards only work when people can apply them. The Academy runs six full courses on ",
  trainingLink: "working with AI",
  trainingB: ", covering where a model invents facts, how to check a run of hundreds of rows rather than one, and exactly where client data may never go. Courses and exams are available to specialists whether or not they receive work through Endvera.",
  bookend: {
    dim: "Describe the deliverable.",
    lit: "Get completed, reviewed work.",
    cta: "Describe the outcome",
  },
  protocolNote: "Read the full operating protocol at",
  protocolLink: "How it works",
  /**
   * THREE AXES WERE REMOVED, NOT REWORDED: Speed, Vetting and Price.
   *
   * They asserted things about other companies that we cannot substantiate.
   * "Slow" for a job board, "Low" and "Cheapest wage" for two marketplaces —
   * competitive claims about someone else's pricing and delivery speed, with
   * no measurement behind them anywhere in this business.
   *
   * Vetting went for a second reason on top of that one: its Endvera cell
   * ("Academy-trained... an operator reading every application") sold the
   * client on the quality of our worker recruitment. That is an argument for
   * buying access to vetted people, which is precisely what this service is
   * not.
   *
   * What survives describes MECHANISMS, and only ones this repo enforces:
   * whether a delivery is checked before money moves (the QC gate is
   * structural here, not a policy) and how much of the work lands on the
   * buyer. The table still needs rebuilding around the alternatives clients
   * actually weigh; that is a positioning decision, deliberately not made in
   * this pass.
   */
  comparisonTable: {
    eyebrow: "Comparative",
    heading: "How this actually compares",
    subline: "What changes between the models, not which brand you have heard of.",
    channels: ["DIY with AI tools", "Freelance marketplace", "Hourly staffing", "Endvera"],
    axes: [
      {
        axis: "Who manages the execution",
        cells: [
          { label: "You", tone: "weak", detail: "you write the prompts, run the steps and decide when it is done" },
          { label: "You", tone: "weak", detail: "you choose, brief and supervise whoever takes it" },
          { label: "You", tone: "weak", detail: "you direct the time you are buying" },
          {
            label: "Endvera",
            tone: "strong",
            detail: "we choose the method, run it, and handle what the brief did not cover",
          },
        ],
      },
      {
        axis: "What the price is attached to",
        cells: [
          { label: "Usage", tone: null, detail: "tokens, seats or subscriptions, whatever the work turns out to need" },
          { label: "A bid", tone: null, detail: "agreed per engagement, renegotiated when scope moves" },
          { label: "Time", tone: null, detail: "hours, whether or not they produced the outcome" },
          {
            label: "The outcome",
            tone: "strong",
            detail: "one fixed price for a written scope, approved before work starts",
          },
        ],
      },
      {
        axis: "Who owns the finished result",
        cells: [
          { label: "You", tone: "weak", detail: "the output is yours to verify and fix" },
          { label: "You", tone: "weak", detail: "if it is wrong, correcting it is your problem" },
          { label: "You", tone: "weak", detail: "you bought time; the result stays your responsibility" },
          {
            label: "Endvera",
            tone: "strong",
            detail: "checked against the approved standard before delivery, and ours to put right",
          },
        ],
      },
    ],
    footnote:
      "Every one of these is good at what it is built for, and the differences above are structural, not judgements about price, speed or quality. This shows which model puts the finished result on your desk and which puts it on ours.",
  },
};

const aFr: AboutDict = {
  meta: {
    title: "À propos d'Endvera : du travail fini, pas du temps loué",
    description:
      "Endvera existe pour combler l'écart entre une demande de travail administratif et la réception d'un livrable fini et vérifié.",
  },
  nav: { how: "Comment \u00E7a marche", client: "Faire faire du travail" },
  kicker: "Qui nous sommes",
  h1: "Conçu pour le travail qui a besoin d'un responsable, pas d'un autre outil.",
  lede: "Les outils d'IA, les pigistes et les assistants peuvent tous produire du travail. Le vide persistant se trouve entre la demande et un livrable vérifié et utilisable.",
  problemHead: "Là où le travail se brise encore",
  problem: [
    [
      "Pour les équipes",
      [
        "Les sorties d'IA exigent encore du contexte et une vérification.",
        "Les places de marché exigent encore sélection et gestion.",
        "L'aide horaire peut laisser le contrôle qualité au client.",
      ],
    ],
    [
      "Pour les opérations",
      [
        "Les demandes générales sont difficiles à cadrer et à répéter.",
        "Les exceptions se perdent entre les étapes.",
        "Les normes de qualité varient d'une tâche à l'autre.",
      ],
    ],
  ],
  bridge: ["L'accès aux personnes et aux outils ne manquait pas.", "La responsabilité de terminer le travail, oui."],
  solutionHead: "L'idée opérationnelle",
  solutionLede:
    "Endvera livre du travail administratif fini à prix fixe. Le brief et la norme de contrôle suivent la tâche du cadrage à la livraison.",
  solution: [
    [
      "Cadre défini",
      "Le livrable, les règles, les accès, le délai et le prix ponctuel sont confirmés avant le début.",
    ],
    [
      "Exécution gérée",
      "Endvera gère la coordination et les exceptions selon le brief approuvé plutôt que de les renvoyer au client.",
    ],
    [
      "Livraison vérifiée",
      "Chaque tâche terminée est vérifiée selon la norme approuvée avant d'être livrée au client.",
    ],
  ],
  trainingHead: "Pourquoi la formation des spécialistes fait partie du système",
  trainingA:
    "Les normes ne fonctionnent que si les gens savent les appliquer. L'Académie donne six cours complets sur le ",
  trainingLink: "travail avec l'IA",
  trainingB: ", couvrant les endroits où un modèle invente des faits, comment vérifier une série de centaines de lignes plutôt qu'une seule, et exactement où les données du client ne peuvent jamais aller. Les cours et examens restent accessibles aux spécialistes, qu'ils reçoivent ou non du travail par Endvera.",
  bookend: {
    dim: "Décrivez le livrable.",
    lit: "Recevez un travail terminé et vérifié.",
    cta: "Décrire le résultat",
  },
  protocolNote: "Lisez le protocole d'exploitation complet sur",
  protocolLink: "Comment \u00E7a marche",
  comparisonTable: {
    eyebrow: "Comparatif",
    heading: "Ce que \u00E7a donne, concr\u00E8tement",
    subline: "Ce qui change d'un modèle à l'autre, pas la marque dont vous avez entendu parler.",
    channels: ["Le faire soi-même avec l'IA", "Place de marché freelance", "Personnel à l'heure", "Endvera"],
    axes: [
      {
        axis: "Qui pilote l'exécution",
        cells: [
          { label: "Vous", tone: "weak", detail: "vous écrivez les prompts, enchaînez les étapes et décidez quand c'est fini" },
          { label: "Vous", tone: "weak", detail: "vous choisissez, briefez et supervisez la personne qui prend le travail" },
          { label: "Vous", tone: "weak", detail: "vous dirigez le temps que vous achetez" },
          { label: "Endvera", tone: "strong", detail: "nous choisissons la méthode, l'exécutons et traitons ce que le mandat n'avait pas prévu" },
        ],
      },
      {
        axis: "À quoi le prix est attaché",
        cells: [
          { label: "À l'usage", tone: null, detail: "jetons, sièges ou abonnements, selon ce que le travail exige" },
          { label: "À une offre", tone: null, detail: "convenue par mandat, renégociée dès que le périmètre bouge" },
          { label: "Au temps", tone: null, detail: "des heures, qu'elles produisent le résultat ou non" },
          { label: "Au résultat", tone: "strong", detail: "un prix fixe pour un périmètre écrit, approuvé avant tout démarrage" },
        ],
      },
      {
        axis: "À qui appartient le résultat fini",
        cells: [
          { label: "À vous", tone: "weak", detail: "la sortie est à vous à vérifier et à corriger" },
          { label: "À vous", tone: "weak", detail: "si c'est faux, la correction est votre problème" },
          { label: "À vous", tone: "weak", detail: "vous avez acheté du temps ; le résultat reste votre responsabilité" },
          { label: "À Endvera", tone: "strong", detail: "vérifié contre le standard approuvé avant livraison, et à nous de le reprendre" },
        ],
      },
    ],
    footnote:
      "Chacun de ces modèles est bon dans ce pour quoi il est conçu, et les différences ci-dessus sont structurelles, pas des jugements sur le prix, la vitesse ou la qualité. Le tableau montre lequel dépose le résultat fini sur votre bureau, et lequel le dépose sur le nôtre.",
  },
};

const aEs: AboutDict = {
  meta: {
    title: "Sobre Endvera: trabajo terminado, no tiempo contratado",
    description:
      "Endvera existe para cerrar la brecha entre pedir trabajo administrativo y recibir un entregable terminado y revisado.",
  },
  nav: { how: "C\u00F3mo funciona", client: "Haz que se haga" },
  kicker: "Qui\u00E9nes somos",
  h1: "Creado para el trabajo que necesita un responsable, no otra herramienta.",
  lede: "Las herramientas de IA, los freelancers y los asistentes pueden producir trabajo. La brecha pendiente está entre la solicitud y un entregable revisado y utilizable.",
  problemHead: "Dónde sigue rompiéndose el trabajo",
  problem: [
    [
      "Para los equipos",
      [
        "La salida de IA todavía necesita contexto y verificación.",
        "Los mercados todavía requieren selección y gestión.",
        "La ayuda por horas puede dejar el control de calidad al comprador.",
      ],
    ],
    [
      "Para operaciones",
      [
        "Las solicitudes amplias son difíciles de definir y repetir.",
        "Las excepciones se pierden entre entregas.",
        "Los estándares de calidad varían entre tareas.",
      ],
    ],
  ],
  bridge: ["No faltaba acceso a personas y herramientas.", "Faltaba responsabilidad por completar el trabajo."],
  solutionHead: "La idea operativa",
  solutionLede:
    "Endvera entrega trabajo administrativo terminado a precio fijo. Las instrucciones y el estándar de revisión siguen a la tarea desde el alcance hasta la entrega.",
  solution: [
    [
      "Alcance definido",
      "El entregable, las reglas, el acceso, el plazo y el precio puntual se confirman antes de empezar.",
    ],
    [
      "Ejecución gestionada",
      "Endvera gestiona la coordinación y las excepciones según las instrucciones aprobadas, sin devolverlas al cliente.",
    ],
    [
      "Entrega revisada",
      "Cada tarea terminada se verifica contra el estándar aprobado antes de llegar al cliente.",
    ],
  ],
  trainingHead: "Por qué la formación de especialistas forma parte del sistema",
  trainingA:
    "Los estándares solo funcionan cuando las personas saben aplicarlos. La Academia imparte seis cursos completos sobre ",
  trainingLink: "trabajar con IA",
  trainingB: ", que cubren dónde un modelo inventa datos, cómo revisar una serie de cientos de filas en lugar de una, y exactamente dónde nunca pueden ir los datos del cliente. Los cursos y exámenes están disponibles aunque el especialista no reciba trabajo mediante Endvera.",
  bookend: {
    dim: "Describe el entregable.",
    lit: "Recibe trabajo terminado y revisado.",
    cta: "Describe el resultado",
  },
  protocolNote: "Lee el protocolo operativo completo en",
  protocolLink: "C\u00F3mo funciona",
  comparisonTable: {
    eyebrow: "Comparativa",
    heading: "C\u00F3mo se compara esto en realidad",
    subline: "Lo que cambia entre los modelos, no la marca que ya conoces.",
    channels: ["Hacerlo tú con IA", "Mercado de freelancers", "Personal por horas", "Endvera"],
    axes: [
      {
        axis: "Quién gestiona la ejecución",
        cells: [
          { label: "Tú", tone: "weak", detail: "escribes los prompts, ejecutas los pasos y decides cuándo está listo" },
          { label: "Tú", tone: "weak", detail: "eliges, informas y supervisas a quien lo tome" },
          { label: "Tú", tone: "weak", detail: "diriges el tiempo que estás comprando" },
          { label: "Endvera", tone: "strong", detail: "elegimos el método, lo ejecutamos y resolvemos lo que el encargo no cubría" },
        ],
      },
      {
        axis: "A qué va atado el precio",
        cells: [
          { label: "Al uso", tone: null, detail: "tokens, licencias o suscripciones, según lo que el trabajo requiera" },
          { label: "A una oferta", tone: null, detail: "acordada por encargo y renegociada cuando cambia el alcance" },
          { label: "Al tiempo", tone: null, detail: "horas, produzcan o no el resultado" },
          { label: "Al resultado", tone: "strong", detail: "un precio fijo por un alcance escrito, aprobado antes de empezar" },
        ],
      },
      {
        axis: "De quién es el resultado terminado",
        cells: [
          { label: "Tuyo", tone: "weak", detail: "la salida es tuya para verificar y corregir" },
          { label: "Tuyo", tone: "weak", detail: "si está mal, corregirlo es tu problema" },
          { label: "Tuyo", tone: "weak", detail: "compraste tiempo; el resultado sigue siendo tu responsabilidad" },
          { label: "De Endvera", tone: "strong", detail: "revisado contra el estándar aprobado antes de entregarse, y nuestro para rehacerlo" },
        ],
      },
    ],
    footnote:
      "Cada uno de estos modelos es bueno para aquello para lo que fue creado, y las diferencias de arriba son estructurales, no juicios sobre precio, velocidad o calidad. Esto muestra qué modelo deja el resultado terminado en tu escritorio y cuál lo deja en el nuestro.",
  },
};

const aTl: AboutDict = {
  meta: {
    title: "Tungkol sa Endvera: tapos na trabaho, hindi inupahang oras",
    description:
      "Umiiral ang Endvera para punan ang pagitan ng pag-request ng admin na trabaho at pagtanggap ng tapos at sinuring deliverable.",
  },
  nav: { how: "Paano ito gumagana", client: "Ipagawa ang trabaho" },
  kicker: "Tungkol sa amin",
  h1: "Ginawa para sa trabahong kailangan ng may-ari, hindi ng isa pang tool.",
  lede: "Kayang gumawa ng output ng AI tools, freelancers, at assistants. Ang kulang ay ang proseso mula request hanggang sa checked at usable na deliverable.",
  problemHead: "Saan pa rin nasisira ang trabaho",
  problem: [
    [
      "Para sa business teams",
      [
        "Kailangan pa rin ng context at verification ang AI output.",
        "Kailangan pa rin ng selection at management ang marketplaces.",
        "Maaaring maiwan sa buyer ang quality control ng hourly help.",
      ],
    ],
    [
      "Para sa operations",
      [
        "Mahirap i-scope at ulitin ang malalawak na request.",
        "Nawawala ang exceptions sa pagitan ng handoffs.",
        "Nag-iiba ang quality standard sa bawat task.",
      ],
    ],
  ],
  bridge: ["Hindi kulang ang access sa tao at tools.", "Ang kulang ay accountability sa pagkumpleto."],
  solutionHead: "Ang operating idea",
  solutionLede:
    "Naghahatid ang Endvera ng tapos nang administratibong trabaho sa fixed na presyo. Kasama ng task ang approved brief at review standard mula scope hanggang delivery.",
  solution: [
    [
      "Malinaw na scope",
      "Kinukumpirma ang deliverable, rules, access, timing, at one-off price bago magsimula.",
    ],
    [
      "Managed execution",
      "Mina-manage ng Endvera ang coordination at exceptions ayon sa approved brief sa halip na ibalik sa client.",
    ],
    [
      "Sinuring delivery",
      "Bawat natapos na task ay sinusuri laban sa aprubadong pamantayan bago makarating sa client.",
    ],
  ],
  trainingHead: "Bakit bahagi ng operating system ang specialist training",
  trainingA:
    "Gumagana lang ang standards kapag marunong ang mga tao na gamitin ang mga ito. May anim na buong kurso ang Academy tungkol sa ",
  trainingLink: "pagtatrabaho gamit ang AI",
  trainingB: ", saklaw kung saan nag-iimbento ng facts ang isang modelo, paano suriin ang daan-daang rows sa halip na isa, at kung saan talaga hindi puwedeng dalhin ang data ng kliyente. Available ang courses at exams kahit hindi makatanggap ng work sa Endvera ang specialist.",
  bookend: {
    dim: "Ilarawan ang deliverable.",
    lit: "Tumanggap ng completed at reviewed na work.",
    cta: "Ilarawan ang resulta",
  },
  protocolNote: "Basahin ang buong protocol ng operasyon sa",
  protocolLink: "Paano ito gumagana",
  comparisonTable: {
    eyebrow: "Paghahambing",
    heading: "Ito ang totoong paghahambing",
    subline: "Ang pagkakaiba ng mga modelo, hindi kung anong brand ang narinig mo na.",
    channels: ["DIY gamit ang AI tools", "Freelance marketplace", "Staffing kada oras", "Endvera"],
    axes: [
      {
        axis: "Sino ang namamahala sa execution",
        cells: [
          { label: "Ikaw", tone: "weak", detail: "ikaw ang sumusulat ng prompt, nagpapatakbo ng bawat hakbang, at nagdedesisyon kung tapos na" },
          { label: "Ikaw", tone: "weak", detail: "ikaw ang pumipili, nagbi-brief at nagsu-supervise sa kukuha nito" },
          { label: "Ikaw", tone: "weak", detail: "ikaw ang nagdidirekta sa oras na binibili mo" },
          { label: "Endvera", tone: "strong", detail: "kami ang pumipili ng paraan, nagpapatakbo nito, at humahawak sa hindi nasakop ng brief" },
        ],
      },
      {
        axis: "Saan nakakabit ang presyo",
        cells: [
          { label: "Sa paggamit", tone: null, detail: "tokens, seats o subscription, depende sa kailangan ng trabaho" },
          { label: "Sa bid", tone: null, detail: "napagkasunduan kada engagement, muling pinag-uusapan kapag nagbago ang scope" },
          { label: "Sa oras", tone: null, detail: "oras, nakagawa man ito ng resulta o hindi" },
          { label: "Sa resulta", tone: "strong", detail: "isang fixed na presyo para sa nakasulat na scope, aprubado bago magsimula" },
        ],
      },
      {
        axis: "Kanino ang tapos na resulta",
        cells: [
          { label: "Sa iyo", tone: "weak", detail: "ikaw ang magbe-verify at magtatama ng output" },
          { label: "Sa iyo", tone: "weak", detail: "kung mali, ikaw ang may problema sa pag-aayos" },
          { label: "Sa iyo", tone: "weak", detail: "oras ang binili mo; sa iyo pa rin ang resulta" },
          { label: "Sa Endvera", tone: "strong", detail: "sinusuri laban sa aprubadong pamantayan bago ihatid, at amin itong ayusin" },
        ],
      },
    ],
    footnote:
      "Mahusay ang bawat modelong ito sa layuning pinaggawaan nito, at ang mga pagkakaiba sa itaas ay structural, hindi paghatol sa presyo, bilis o kalidad. Ipinapakita nito kung aling modelo ang naglalagay ng tapos na resulta sa mesa mo at alin ang naglalagay nito sa amin.",
  },
};

export const ABOUT_I18N: Record<DocLang, AboutDict> = {
  en: aEn,
  fr: aFr,
  es: aEs,
  tl: aTl,
};
