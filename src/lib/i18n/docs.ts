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
    title: "How managed task execution works, step by step",
    description:
      "Define the deliverable, approve the scope and price, then AfterDesk manages execution and quality control before delivery. The full operating protocol, versioned and dated.",
  },
  nav: { about: "About us", client: "Get work done" },
  docket: "Operating protocol",
  h1: ["Defined scope.", "Managed execution.", "Reviewed delivery."],
  deck: "The approved brief, price and review standard follow the task from intake to delivery.",
  movement1: "One task, in six stages",
  lanes: ["You", "AfterDesk", "Execution"],
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
      say: "A trained specialist completes the approved scope.",
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
    title: "Comment fonctionne l'exécution gérée, étape par étape",
    description:
      "Définissez le livrable, approuvez le périmètre et le prix, puis AfterDesk gère l'exécution et le contrôle qualité avant livraison. Le protocole complet, versionné et daté.",
  },
  nav: { about: "Qui nous sommes", client: "Faire faire du travail" },
  docket: "Protocole d'exploitation",
  h1: ["Cadre défini.", "Exécution gérée.", "Livraison vérifiée."],
  deck: "Le brief approuvé, le prix et la norme de contrôle suivent la tâche du début à la livraison.",
  movement1: "Une tâche, en six étapes",
  lanes: ["Vous", "AfterDesk", "Exécution"],
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
      say: "Un spécialiste formé réalise le travail approuvé.",
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
    title: "Cómo funciona la ejecución gestionada, paso a paso",
    description:
      "Define el entregable, aprueba el alcance y el precio, y AfterDesk gestiona la ejecución y el control de calidad antes de la entrega. El protocolo completo, versionado y fechado.",
  },
  nav: { about: "Quiénes somos", client: "Haz que se haga" },
  docket: "Protocolo operativo",
  h1: ["Alcance definido.", "Ejecución gestionada.", "Entrega revisada."],
  deck: "Las instrucciones aprobadas, el precio y el estándar de revisión acompañan la tarea hasta la entrega.",
  movement1: "Una tarea, en seis etapas",
  lanes: ["Tú", "AfterDesk", "Ejecución"],
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
      say: "Un especialista capacitado completa el alcance aprobado.",
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
    title: "Paano gumagana ang managed execution, hakbang-hakbang",
    description:
      "I-define ang deliverable, aprubahan ang scope at presyo, at mina-manage ng AfterDesk ang execution at quality control bago i-deliver. Ang buong protocol, may bersyon at petsa.",
  },
  nav: { about: "Tungkol sa amin", client: "Ipagawa ang trabaho" },
  docket: "Protocol ng operasyon",
  h1: ["Malinaw na scope.", "Managed execution.", "Sinuring delivery."],
  deck: "Kasama ng task mula intake hanggang delivery ang approved brief, presyo, at review standard.",
  movement1: "Isang task, sa anim na yugto",
  lanes: ["Ikaw", "AfterDesk", "Execution"],
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
      say: "Kinukumpleto ng trained specialist ang approved scope.",
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
    title: "About us: why AfterDesk exists",
    description:
      "AfterDesk exists to close the gap between requesting remote business work and receiving a completed, reviewed deliverable.",
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
    "AfterDesk is a managed task service for bounded remote work. The approved brief and review standard stay attached to the task from scope to delivery.",
  solution: [
    [
      "Defined scope",
      "The deliverable, rules, access, timing and fixed one-off price are confirmed before work begins.",
    ],
    [
      "Managed execution",
      "AfterDesk owns coordination and exception handling against the approved brief instead of passing them back to the client.",
    ],
    [
      "Reviewed delivery",
      "Every completed task receives an operator review before the deliverable reaches the client.",
    ],
  ],
  trainingHead: "Why specialist training is part of the operating system",
  trainingA:
    "Standards only work when people can apply them. The Academy teaches data handling, research, process compliance and ",
  trainingLink: "responsible AI tool use",
  trainingB: ". Courses and exams are available to specialists whether or not they receive work through AfterDesk.",
  bookend: {
    dim: "Describe the deliverable.",
    lit: "Get completed, reviewed work.",
    cta: "Describe the outcome",
  },
  protocolNote: "Read the full operating protocol at",
  protocolLink: "How it works",
  comparisonTable: {
    eyebrow: "Comparative",
    heading: "How this actually compares",
    subline: "Five things that matter more than which platform you've heard of.",
    channels: ["Fiverr", "Upwork", "OnlineJobs.ph", "AfterDesk"],
    axes: [
      {
        axis: "Review before you pay",
        cells: [
          { label: "After the fact", tone: "weak", detail: "you judge the delivery yourself; disputes come after the money" },
          { label: "After the fact", tone: "weak", detail: "escrow exists, but you are still the reviewer" },
          { label: "None", tone: "weak", detail: "a job board: payment and quality are between you and your hire" },
          {
            label: "Built in",
            tone: "strong",
            detail: "an operator checks every delivery first, and nothing is charged until your review window closes",
          },
        ],
      },
      {
        axis: "Your effort",
        cells: [
          { label: "High", tone: "weak", detail: "you write the brief, judge the result, fix it yourself" },
          { label: "High", tone: "weak", detail: "same, plus interviews" },
          { label: "Maximal", tone: "weak", detail: "you hire, train, and supervise a remote employee" },
          {
            label: "Minimal",
            tone: "strong",
            detail: "you describe it, approve a price, receive verified work",
          },
        ],
      },
      {
        axis: "Speed",
        cells: [
          { label: "Variable", tone: null, detail: "depends on the freelancer you find" },
          { label: "Variable", tone: null, detail: "hiring cycle" },
          { label: "Slow", tone: "weak", detail: "recruiting, then a training ramp-up" },
          { label: "Scoped", tone: "strong", detail: "timing confirmed after scope; reviewed before delivery" },
        ],
      },
      {
        axis: "Vetting",
        cells: [
          { label: "Self-serve", tone: null, detail: "profiles and reviews; you weigh them yourself" },
          { label: "Self-serve", tone: null, detail: "same" },
          { label: "Yours to do", tone: "weak", detail: "you screen every candidate yourself" },
          {
            label: "Academy-trained",
            tone: "strong",
            detail: "free courses with real exams, an operator reading every application, and a review of every delivery",
          },
        ],
      },
      {
        axis: "Price",
        cells: [
          { label: "Low", tone: null, detail: "but you also pay for your own correction time" },
          { label: "Low", tone: null, detail: "same" },
          { label: "Cheapest wage", tone: null, detail: "but a huge hidden cost in your management time" },
          { label: "Fixed, as approved", tone: "strong", detail: "you pay more per task, but that's the whole point" },
        ],
      },
    ],
    footnote:
      "Every platform here is good at what it's built for. This just shows where each one actually sits, so you can pick what fits.",
  },
};

const aFr: AboutDict = {
  meta: {
    title: "Qui nous sommes : pourquoi AfterDesk existe",
    description:
      "AfterDesk existe pour combler l'écart entre une demande de travail à distance et la réception d'un livrable terminé et vérifié.",
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
    "AfterDesk est un service de tâches gérées pour le travail à distance délimité. Le brief et la norme de contrôle suivent la tâche du cadrage à la livraison.",
  solution: [
    [
      "Cadre défini",
      "Le livrable, les règles, les accès, le délai et le prix ponctuel sont confirmés avant le début.",
    ],
    [
      "Exécution gérée",
      "AfterDesk gère la coordination et les exceptions selon le brief approuvé plutôt que de les renvoyer au client.",
    ],
    [
      "Livraison vérifiée",
      "Chaque tâche terminée reçoit une revue par un opérateur avant d'être livrée au client.",
    ],
  ],
  trainingHead: "Pourquoi la formation des spécialistes fait partie du système",
  trainingA:
    "Les normes ne fonctionnent que si les gens savent les appliquer. L'Académie enseigne le traitement des données, la recherche, la conformité des processus et ",
  trainingLink: "l'utilisation responsable des outils d'IA",
  trainingB: ". Les cours et examens restent accessibles aux spécialistes, qu'ils reçoivent ou non du travail par AfterDesk.",
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
    subline: "Cinq choses qui comptent plus que la plateforme dont vous avez entendu parler.",
    channels: ["Fiverr", "Upwork", "OnlineJobs.ph", "AfterDesk"],
    axes: [
      {
        axis: "Contr\u00F4le avant paiement",
        cells: [
          { label: "Apr\u00E8s coup", tone: "weak", detail: "vous jugez la livraison vous-m\u00EAme; le litige vient apr\u00E8s l'argent" },
          { label: "Apr\u00E8s coup", tone: "weak", detail: "il y a un s\u00E9questre, mais le r\u00E9viseur, c'est encore vous" },
          {
            label: "Aucun",
            tone: "weak",
            detail: "un babillard d'offres : le paiement et la qualit\u00E9 restent entre vous et votre embauche",
          },
          {
            label: "Int\u00E9gr\u00E9",
            tone: "strong",
            detail: "un op\u00E9rateur v\u00E9rifie chaque livraison d'abord, et rien n'est factur\u00E9 avant la fin de votre fen\u00EAtre de r\u00E9vision",
          },
        ],
      },
      {
        axis: "Effort",
        cells: [
          { label: "\u00C9lev\u00E9", tone: "weak", detail: "vous r\u00E9digez le brief, jugez le r\u00E9sultat, corrigez vous-m\u00EAme" },
          { label: "\u00C9lev\u00E9", tone: "weak", detail: "pareil, plus les entrevues" },
          { label: "Maximal", tone: "weak", detail: "vous embauchez, formez et supervisez un employ\u00E9 \u00E0 distance" },
          {
            label: "Minimal",
            tone: "strong",
            detail: "vous d\u00E9crivez, approuvez un prix, recevez un travail v\u00E9rifi\u00E9",
          },
        ],
      },
      {
        axis: "Vitesse",
        cells: [
          { label: "Variable", tone: null, detail: "selon le freelance que vous trouvez" },
          { label: "Variable", tone: null, detail: "cycle d'embauche" },
          { label: "Lent", tone: "weak", detail: "recrutement, puis une mont\u00E9e en comp\u00E9tence" },
          { label: "Cadré", tone: "strong", detail: "délai confirmé après cadrage; contrôle avant livraison" },
        ],
      },
      {
        axis: "V\u00E9rification",
        cells: [
          { label: "Autonome", tone: null, detail: "profils et avis; c'est vous qui les pesez" },
          { label: "Autonome", tone: null, detail: "pareil" },
          { label: "\u00C0 votre charge", tone: "weak", detail: "vous filtrez chaque candidat vous-m\u00EAme" },
          {
            label: "Form\u00E9s \u00E0 l'Acad\u00E9mie",
            tone: "strong",
            detail: "cours gratuits avec de vrais examens, un op\u00E9rateur qui lit chaque candidature, et une r\u00E9vision de chaque livraison",
          },
        ],
      },
      {
        axis: "Prix",
        cells: [
          { label: "Bas", tone: null, detail: "mais vous payez aussi votre propre temps de correction" },
          { label: "Bas", tone: null, detail: "pareil" },
          { label: "Salaire le plus bas", tone: null, detail: "mais un co\u00FBt cach\u00E9 \u00E9norme en temps de gestion" },
          { label: "Fixe, tel qu'approuv\u00E9", tone: "strong", detail: "plus cher par t\u00E2che, mais c'est tout l'argument" },
        ],
      },
    ],
    footnote:
      "Chaque plateforme ici est bonne dans ce pour quoi elle a \u00E9t\u00E9 con\u00E7ue. Ceci montre simplement o\u00F9 chacune se situe r\u00E9ellement, pour que vous choisissiez selon vos besoins.",
  },
};

const aEs: AboutDict = {
  meta: {
    title: "Qui\u00E9nes somos: por qu\u00E9 existe AfterDesk",
    description:
      "AfterDesk existe para cerrar la brecha entre solicitar trabajo empresarial remoto y recibir un entregable terminado y revisado.",
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
    "AfterDesk es un servicio de tareas gestionadas para trabajo remoto acotado. Las instrucciones y el estándar de revisión siguen a la tarea desde el alcance hasta la entrega.",
  solution: [
    [
      "Alcance definido",
      "El entregable, las reglas, el acceso, el plazo y el precio puntual se confirman antes de empezar.",
    ],
    [
      "Ejecución gestionada",
      "AfterDesk gestiona la coordinación y las excepciones según las instrucciones aprobadas, sin devolverlas al cliente.",
    ],
    [
      "Entrega revisada",
      "Cada tarea terminada recibe una revisión del operador antes de llegar al cliente.",
    ],
  ],
  trainingHead: "Por qué la formación de especialistas forma parte del sistema",
  trainingA:
    "Los estándares solo funcionan cuando las personas saben aplicarlos. La Academia enseña manejo de datos, investigación, cumplimiento de procesos y ",
  trainingLink: "uso responsable de herramientas de IA",
  trainingB: ". Los cursos y exámenes están disponibles aunque el especialista no reciba trabajo mediante AfterDesk.",
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
    subline: "Cinco cosas que importan m\u00E1s que la plataforma que ya conoces.",
    channels: ["Fiverr", "Upwork", "OnlineJobs.ph", "AfterDesk"],
    axes: [
      {
        axis: "Revisi\u00F3n antes de pagar",
        cells: [
          { label: "Despu\u00E9s del hecho", tone: "weak", detail: "t\u00FA juzgas la entrega; la disputa llega despu\u00E9s del dinero" },
          { label: "Despu\u00E9s del hecho", tone: "weak", detail: "hay dep\u00F3sito en garant\u00EDa, pero el revisor sigues siendo t\u00FA" },
          { label: "Ninguna", tone: "weak", detail: "un portal de empleo: pago y calidad quedan entre t\u00FA y tu contratado" },
          {
            label: "Integrada",
            tone: "strong",
            detail: "un operador revisa cada entrega primero, y no se cobra nada hasta que cierra tu ventana de revisi\u00F3n",
          },
        ],
      },
      {
        axis: "Esfuerzo",
        cells: [
          { label: "Alto", tone: "weak", detail: "escribes el brief, eval\u00FAas el resultado, lo corriges t\u00FA mismo" },
          { label: "Alto", tone: "weak", detail: "igual, m\u00E1s entrevistas" },
          { label: "M\u00E1ximo", tone: "weak", detail: "contratas, capacitas y supervisas a un empleado remoto" },
          {
            label: "Mínimo",
            tone: "strong",
            detail: "lo describes, apruebas un precio, recibes trabajo verificado",
          },
        ],
      },
      {
        axis: "Rapidez",
        cells: [
          { label: "Variable", tone: null, detail: "depende del freelancer que encuentres" },
          { label: "Variable", tone: null, detail: "ciclo de contrataci\u00F3n" },
          { label: "Lento", tone: "weak", detail: "reclutamiento y luego una curva de capacitaci\u00F3n" },
          { label: "Definido", tone: "strong", detail: "plazo confirmado después del alcance; revisión antes de entregar" },
        ],
      },
      {
        axis: "Verificaci\u00F3n",
        cells: [
          { label: "Por tu cuenta", tone: null, detail: "perfiles y rese\u00F1as; t\u00FA los eval\u00FAas" },
          { label: "Por tu cuenta", tone: null, detail: "lo mismo" },
          { label: "Te toca a ti", tone: "weak", detail: "t\u00FA eval\u00FAas a cada candidato" },
          {
            label: "Formados en la Academia",
            tone: "strong",
            detail: "cursos gratis con ex\u00E1menes reales, un operador que lee cada postulaci\u00F3n y una revisi\u00F3n de cada entrega",
          },
        ],
      },
      {
        axis: "Precio",
        cells: [
          { label: "Bajo", tone: null, detail: "pero tambi\u00E9n pagas con tu propio tiempo de correcci\u00F3n" },
          { label: "Bajo", tone: null, detail: "lo mismo" },
          { label: "Sueldo m\u00E1s bajo", tone: null, detail: "pero un costo oculto enorme en tu tiempo de gesti\u00F3n" },
          { label: "Fijo, seg\u00FAn lo aprobado", tone: "strong", detail: "m\u00E1s por tarea, pero esa es la propuesta" },
        ],
      },
    ],
    footnote: "Cada plataforma aqu\u00ED es buena en lo suyo. Esto solo muestra d\u00F3nde se ubica cada una, para que elijas lo que te sirve.",
  },
};

const aTl: AboutDict = {
  meta: {
    title: "Tungkol sa amin: bakit umiiral ang AfterDesk",
    description:
      "Umiiral ang AfterDesk para punan ang pagitan ng pag-request ng remote business work at pagtanggap ng completed at reviewed na deliverable.",
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
    "Ang AfterDesk ay managed task service para sa bounded remote work. Kasama ng task ang approved brief at review standard mula scope hanggang delivery.",
  solution: [
    [
      "Malinaw na scope",
      "Kinukumpirma ang deliverable, rules, access, timing, at one-off price bago magsimula.",
    ],
    [
      "Managed execution",
      "Mina-manage ng AfterDesk ang coordination at exceptions ayon sa approved brief sa halip na ibalik sa client.",
    ],
    [
      "Sinuring delivery",
      "Bawat natapos na task ay nire-review ng operator bago makarating sa client.",
    ],
  ],
  trainingHead: "Bakit bahagi ng operating system ang specialist training",
  trainingA:
    "Gumagana lang ang standards kapag marunong ang mga tao na gamitin ang mga ito. Itinuturo ng Academy ang data handling, research, process compliance, at ",
  trainingLink: "responsableng paggamit ng AI tools",
  trainingB: ". Available ang courses at exams kahit hindi makatanggap ng work sa AfterDesk ang specialist.",
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
    subline: "Limang bagay na mas mahalaga kaysa sa kung anong platform ang narinig mo na.",
    channels: ["Fiverr", "Upwork", "OnlineJobs.ph", "AfterDesk"],
    axes: [
      {
        axis: "Review bago magbayad",
        cells: [
          { label: "Pagkatapos na", tone: "weak", detail: "ikaw ang susuri sa delivery; dumarating ang dispute pagkatapos ng pera" },
          { label: "Pagkatapos na", tone: "weak", detail: "may escrow, pero ikaw pa rin ang reviewer" },
          {
            label: "Wala",
            tone: "weak",
            detail: "job board ito: ang bayad at kalidad ay nasa pagitan mo at ng hire mo",
          },
          {
            label: "Built in",
            tone: "strong",
            detail: "sinusuri muna ng operator ang bawat delivery, at walang sisingilin hangga't hindi sarado ang review window mo",
          },
        ],
      },
      {
        axis: "Effort",
        cells: [
          { label: "Mataas", tone: "weak", detail: "ikaw ang gagawa ng brief, ikaw ang susuri sa resulta, at ikaw din ang mag-aayos kung mali" },
          { label: "Mataas", tone: "weak", detail: "pareho rin, may dagdag pang interviews" },
          { label: "Pinakamataas", tone: "weak", detail: "ikaw ang mag-hire, mag-train, at mag-supervise ng remote employee" },
          {
            label: "Minimal",
            tone: "strong",
            detail: "ilalarawan mo lang ang kailangan, aaprubahan ang presyo, tapos matatanggap mo na ang verified na trabaho",
          },
        ],
      },
      {
        axis: "Bilis",
        cells: [
          { label: "Nag-iiba", tone: null, detail: "depende sa freelancer na mahanap mo" },
          { label: "Nag-iiba", tone: null, detail: "may hiring cycle pa" },
          { label: "Mabagal", tone: "weak", detail: "mangre-recruit ka muna, tapos may training ramp-up pa" },
          { label: "Scoped", tone: "strong", detail: "timing confirmed pagkatapos ng scope; reviewed bago i-deliver" },
        ],
      },
      {
        axis: "Pag-vet",
        cells: [
          { label: "Ikaw ang bahala", tone: null, detail: "profiles at reviews; ikaw ang magtitimbang" },
          { label: "Ikaw ang bahala", tone: null, detail: "pareho rin" },
          { label: "Sa'yo ang trabaho", tone: "weak", detail: "ikaw mismo ang magsusuri sa bawat kandidato" },
          {
            label: "Academy-trained",
            tone: "strong",
            detail: "libreng courses na may tunay na exams, operator na nagbabasa ng bawat application, at review sa bawat delivery",
          },
        ],
      },
      {
        axis: "Presyo",
        cells: [
          { label: "Mababa", tone: null, detail: "pero babayaran mo rin ang oras mong gugulin sa pag-aayos" },
          { label: "Mababa", tone: null, detail: "pareho rin" },
          { label: "Pinakamababang sweldo", tone: null, detail: "pero malaking hidden cost sa oras mong gugulin sa pangangasiwa" },
          { label: "Fixed, ayon sa inaprubahan", tone: "strong", detail: "mas mahal bawat task, pero iyan ang pitch namin" },
        ],
      },
    ],
    footnote:
      "Magaling ang bawat platform dito sa dapat nilang gawin. Ipinapakita lang nito kung saan talaga sila nakaposisyon, para mapili mo kung ano ang bagay sa'yo.",
  },
};

export const ABOUT_I18N: Record<DocLang, AboutDict> = {
  en: aEn,
  fr: aFr,
  es: aEs,
  tl: aTl,
};
