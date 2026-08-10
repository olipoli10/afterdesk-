/**
 * The public /services hub, in the same four languages as the rest of the
 * site. This page had no i18n at all until now — English only, per
 * src/lib/offerings.ts's own comment ("full FR/ES/TL coverage is real
 * follow-up work, not done in this pass"). This is that follow-up:
 * offerings.ts stays the English slug/href source of truth (a third
 * offering added there is picked up by this page's render loop), but every
 * string a visitor actually reads now lives here, translated.
 *
 * Shares its language cookie with the two document pages (docLangOf,
 * re-exported below — see src/proxy.ts) rather than owning one: /services
 * is linked from both audience homepages, same as /about and
 * /how-it-works, so neither audience owns it and the same fallback chain
 * applies (?lang= → ss-lang-doc → ss-lang-client → ss-lang-worker → en).
 */

import type { SiteLang } from "./langs";

export { docLangOf } from "./docs";

export type ServicesLang = SiteLang;

type OfferingCopy = { audience: string; title: string; description: string };

type Dict = {
  meta: { title: string; description: string };
  header: { signIn: string; getStarted: string };
  eyebrow: string;
  h1: string;
  intro: string;
  learnMore: string;
  /**
   * Joined to src/lib/offerings.ts BY INDEX. The previous shape keyed copy by
   * slug through a Record whose lookup TypeScript treats as always-defined, so
   * a row added there with no copy here compiled and then crashed at render.
   *
   * The tuple below fixes half of that, and only half: it makes a card missing
   * from any ONE LANGUAGE a compile error. It cannot see offerings.ts, which is
   * typed Offering[], so a fifth row added there still compiles. The two lists
   * are held to the same length by a runtime assertion in
   * test/standing-capacity-unpublished.test.ts.
   */
  offerings: [OfferingCopy, OfferingCopy, OfferingCopy, OfferingCopy];
};

export const SERVICES_I18N: Record<ServicesLang, Dict> = {
  en: {
    meta: {
      title: "What we deliver: finished admin work at a fixed price",
      description:
        "Data and CRM, research and lists, documents, coordination. Describe the result, approve one fixed price before anything starts, and receive work checked against a written standard.",
    },
    header: { signIn: "Sign in", getStarted: "Request a fixed-price quote" },
    eyebrow: "What we deliver",
    h1: "The kinds of work we finish.",
    intro:
      "Four families, and they are the ones the platform actually takes. Describe a result in any of them and you get a written scope and one fixed price to approve. AfterDesk manages the execution and checks the finished work against the approved standard. Not everything fits, and we say so before you pay.",
    learnMore: "Get a quote",
    offerings: [
      {
        audience: "Records that have to be right",
        title: "Data & CRM",
        description:
          "Cleaning, deduplication, entry and reconciliation across exports and CRM records. Exceptions are listed, never quietly guessed.",
      },
      {
        audience: "Finding and checking, to written criteria",
        title: "Research & lists",
        description:
          "Company and contact research, list building and analysis. Every value keeps the source it came from, and anything we cannot find is marked unavailable.",
      },
      {
        audience: "Long files turned into something usable",
        title: "Documents",
        description:
          "Key terms and dates pulled out, documents rebuilt to your template, drafts written to a brief.",
      },
      {
        audience: "The recurring back-office chores",
        title: "Coordination",
        description:
          "Bounded administrative coordination: checking, compiling and keeping records in step.",
      },
    ],
  },
  fr: {
    meta: {
      title: "Ce qu'on livre : du travail administratif fini à prix fixe",
      description:
        "Données et CRM, recherche et listes, documents, coordination. Décrivez le résultat, approuvez un prix fixe avant que rien ne commence, et recevez un travail vérifié contre une norme écrite.",
    },
    header: { signIn: "Connexion", getStarted: "Demander un prix fixe" },
    eyebrow: "Ce qu'on livre",
    h1: "Les genres de travaux qu'on finit.",
    intro:
      "Quatre familles, et ce sont celles que la plateforme prend réellement. Décrivez un résultat dans l'une d'elles et vous obtenez un périmètre écrit et un prix fixe à approuver. AfterDesk pilote l'exécution et vérifie le travail fini contre la norme approuvée. Tout ne rentre pas, et on le dit avant que vous payiez.",
    learnMore: "Obtenir un prix",
    offerings: [
      {
        audience: "Des données qui doivent être justes",
        title: "Données et CRM",
        description:
          "Nettoyage, dédoublonnage, saisie et rapprochement d'exports et de fiches CRM. Les exceptions sont listées, jamais devinées en silence.",
      },
      {
        audience: "Chercher et vérifier, selon des critères écrits",
        title: "Recherche et listes",
        description:
          "Recherche d'entreprises et de contacts, constitution de listes, analyse. Chaque valeur conserve sa source, et ce qu'on ne trouve pas est marqué introuvable.",
      },
      {
        audience: "De longs fichiers rendus exploitables",
        title: "Documents",
        description:
          "Dates et clauses clés extraites, documents reconstruits dans votre gabarit, rédactions sur mandat.",
      },
      {
        audience: "Les tâches administratives récurrentes",
        title: "Coordination",
        description:
          "Coordination administrative délimitée : vérifier, compiler et tenir les dossiers à jour.",
      },
    ],
  },
  es: {
    meta: {
      title: "Lo que entregamos: trabajo administrativo terminado a precio fijo",
      description:
        "Datos y CRM, investigación y listas, documentos, coordinación. Describe el resultado, aprueba un precio fijo antes de que empiece nada, y recibe trabajo revisado contra un estándar escrito.",
    },
    header: { signIn: "Iniciar sesión", getStarted: "Pedir un precio fijo" },
    eyebrow: "Lo que entregamos",
    h1: "Los tipos de trabajo que terminamos.",
    intro:
      "Cuatro familias, y son las que la plataforma toma de verdad. Describe un resultado en cualquiera de ellas y obtienes un alcance escrito y un precio fijo que aprobar. AfterDesk gestiona la ejecución y revisa el trabajo terminado contra el estándar aprobado. No todo encaja, y lo decimos antes de que pagues.",
    learnMore: "Pedir precio",
    offerings: [
      {
        audience: "Datos que tienen que estar bien",
        title: "Datos y CRM",
        description:
          "Limpieza, deduplicación, carga y conciliación de exportaciones y fichas de CRM. Las excepciones se listan, nunca se adivinan en silencio.",
      },
      {
        audience: "Buscar y verificar, con criterios escritos",
        title: "Investigación y listas",
        description:
          "Investigación de empresas y contactos, armado de listas y análisis. Cada dato conserva su fuente, y lo que no se encuentra se marca como no disponible.",
      },
      {
        audience: "Archivos largos vueltos utilizables",
        title: "Documentos",
        description:
          "Fechas y cláusulas clave extraídas, documentos rehechos en tu plantilla, borradores escritos sobre encargo.",
      },
      {
        audience: "Las tareas administrativas recurrentes",
        title: "Coordinación",
        description:
          "Coordinación administrativa acotada: revisar, compilar y mantener los registros al día.",
      },
    ],
  },
  tl: {
    meta: {
      title: "Ang inihahatid namin: tapos nang admin na trabaho sa fixed na presyo",
      description:
        "Data at CRM, research at listahan, dokumento, koordinasyon. Ilarawan ang resulta, aprubahan ang isang fixed na presyo bago magsimula ang kahit ano, at tanggapin ang trabahong sinuri laban sa nakasulat na pamantayan.",
    },
    header: { signIn: "Mag-sign in", getStarted: "Humingi ng fixed na presyo" },
    eyebrow: "Ang inihahatid namin",
    h1: "Ang mga uri ng trabahong tinatapos namin.",
    intro:
      "Apat na pamilya, at ito ang talagang tinatanggap ng platform. Ilarawan ang isang resulta sa alinman sa mga ito at makakakuha ka ng nakasulat na scope at isang fixed na presyong aaprubahan. Ang AfterDesk ang namamahala sa execution at sumusuri sa tapos nang trabaho laban sa aprubadong pamantayan. Hindi lahat kasya, at sinasabi namin ito bago ka magbayad.",
    learnMore: "Humingi ng presyo",
    offerings: [
      {
        audience: "Mga record na dapat tama",
        title: "Data at CRM",
        description:
          "Paglilinis, deduplication, pag-encode at reconciliation ng mga export at CRM record. Nakalista ang mga exception, hindi basta hinuhulaan.",
      },
      {
        audience: "Paghahanap at pagsusuri, ayon sa nakasulat na pamantayan",
        title: "Research at listahan",
        description:
          "Research ng kumpanya at kontak, paggawa ng listahan, at analysis. May sanggunian ang bawat halaga, at minamarkahang hindi matagpuan ang hindi namin makita.",
      },
      {
        audience: "Mahahabang file na ginagawang magamit",
        title: "Mga dokumento",
        description:
          "Mahahalagang petsa at termino na hinahango, dokumentong muling binubuo sa template mo, draft na isinusulat ayon sa brief.",
      },
      {
        audience: "Ang paulit-ulit na gawaing administratibo",
        title: "Koordinasyon",
        description:
          "Limitadong administratibong koordinasyon: pagsusuri, pag-iipon, at pagpapanatiling updated ng mga record.",
      },
    ],
  },
};

type StandingDict = {
  meta: { title: string; description: string };
  header: { services: string; signIn: string; cta: string };
  eyebrow: string;
  h1: string;
  intro: string;
  setup: string;
  week: string;
  tiers: string[];
  pillars: { title: string; body: string }[];
  fit: { eyebrow: string; h2: string; items: string[] };
  pricing: { eyebrow: string; h2: string; body: string };
};

/**
 * NO CONSUMER TODAY, AND KEPT ON PURPOSE.
 *
 * Its only reader was the public standing-capacity page, deleted when the
 * offer was unpublished (the path itself is left unwritten here on purpose:
 * the depublication test sweeps src/ for it and should keep finding nothing). These four language versions are the whole
 * page body — the expensive half of bringing the offer back — so they stay
 * with the card copy above rather than being retyped later. Delete them only
 * as a deliberate decision that the offer is not returning.
 */
export const STANDING_I18N: Record<ServicesLang, StandingDict> = {
  en: {
    meta: {
      title: "Standing Capacity",
      description:
        "Reserve managed weekly hours for recurring, bounded data, research and document work, with quality control on every completed task.",
    },
    header: { services: "Services", signIn: "Sign in", cta: "Discuss capacity" },
    eyebrow: "Standing capacity",
    h1: "Reserved weekly capacity for recurring work.",
    intro:
      "Reserve a block of managed hours for a recurring stream of bounded back-office work. Requests draw down the weekly allocation, account context carries forward, and each completed task is reviewed before delivery.",
    setup:
      "Operator-assisted setup. Billing and allocation are confirmed with you; this is not a self-serve subscription checkout.",
    week: "/week",
    tiers: [
      "A small, recurring operational backlog.",
      "A steady stream of data, research or document work.",
      "Reserved capacity for a larger recurring workload.",
    ],
    pillars: [
      { title: "Reserved managed hours", body: "One weekly allocation covers approved work inside the block. It is a capacity service, not outcome pricing." },
      { title: "Account context carries forward", body: "Preferences, instructions and task history stay with the account even when staffing changes." },
      { title: "Quality control remains included", body: "Each completed task still receives an operator review before it reaches you." },
    ],
    fit: {
      eyebrow: "Good fit",
      h2: "A recurring queue with clear boundaries.",
      items: ["CRM and spreadsheet maintenance", "Defined account or market research", "Recurring data and document preparation", "Work that can be estimated, completed remotely and checked"],
    },
    pricing: {
      eyebrow: "Not the same as outcome pricing",
      h2: "You are reserving capacity.",
      body: "Usage is recorded against a weekly hour block. If a request exceeds the remaining allocation, it can wait for the next block, be scoped separately as a one-off task, or move to a larger tier.",
    },
  },
  fr: {
    meta: {
      title: "Capacité permanente",
      description:
        "Réservez des heures gérées chaque semaine pour un travail récurrent et délimité de données, recherche et documents, avec contrôle qualité.",
    },
    header: { services: "Services", signIn: "Connexion", cta: "Discuter de la capacité" },
    eyebrow: "Capacité permanente",
    h1: "Une capacité hebdomadaire réservée pour le travail récurrent.",
    intro:
      "Réservez un bloc d'heures gérées pour un flux récurrent de travail administratif délimité. Les demandes utilisent l'allocation hebdomadaire, le contexte du compte est conservé et chaque tâche terminée est vérifiée avant livraison.",
    setup:
      "Mise en place assistée par un opérateur. La facturation et l'allocation sont confirmées avec vous; il ne s'agit pas d'un abonnement libre-service.",
    week: "/semaine",
    tiers: ["Un petit arriéré opérationnel récurrent.", "Un flux régulier de données, recherche ou documents.", "Une capacité réservée pour une charge récurrente plus importante."],
    pillars: [
      { title: "Heures gérées réservées", body: "Une allocation hebdomadaire couvre le travail approuvé dans le bloc. C'est un service de capacité, pas une tarification au résultat." },
      { title: "Le contexte du compte est conservé", body: "Les préférences, instructions et l'historique restent avec le compte même lorsque l'affectation change." },
      { title: "Le contrôle qualité reste inclus", body: "Chaque tâche terminée est toujours vérifiée par un opérateur avant de vous parvenir." },
    ],
    fit: {
      eyebrow: "Bonne adéquation",
      h2: "Une file récurrente aux limites claires.",
      items: ["Maintenance de CRM et de feuilles de calcul", "Recherche de comptes ou de marché bien définie", "Préparation récurrente de données et documents", "Travail estimable, réalisable à distance et vérifiable"],
    },
    pricing: {
      eyebrow: "Différent d'un prix au résultat",
      h2: "Vous réservez de la capacité.",
      body: "L'utilisation est comptabilisée dans un bloc d'heures hebdomadaire. Si une demande dépasse le solde, elle peut attendre le bloc suivant, être chiffrée comme tâche ponctuelle ou passer à un palier supérieur.",
    },
  },
  es: {
    meta: {
      title: "Capacidad fija",
      description:
        "Reserva horas gestionadas cada semana para trabajo recurrente y acotado de datos, investigación y documentos, con control de calidad.",
    },
    header: { services: "Servicios", signIn: "Iniciar sesión", cta: "Hablar de capacidad" },
    eyebrow: "Capacidad fija",
    h1: "Capacidad semanal reservada para trabajo recurrente.",
    intro:
      "Reserva un bloque de horas gestionadas para un flujo recurrente de trabajo administrativo acotado. Las solicitudes consumen la asignación semanal, el contexto de la cuenta se conserva y cada tarea terminada se revisa antes de entregarse.",
    setup:
      "Configuración asistida por un operador. La facturación y la asignación se confirman contigo; no es una suscripción de autoservicio.",
    week: "/semana",
    tiers: ["Un pequeño trabajo operativo pendiente y recurrente.", "Un flujo constante de datos, investigación o documentos.", "Capacidad reservada para una carga recurrente mayor."],
    pillars: [
      { title: "Horas gestionadas reservadas", body: "Una asignación semanal cubre el trabajo aprobado dentro del bloque. Es un servicio de capacidad, no precio por resultado." },
      { title: "El contexto de la cuenta continúa", body: "Las preferencias, instrucciones y el historial permanecen con la cuenta aunque cambie la asignación." },
      { title: "El control de calidad sigue incluido", body: "Cada tarea terminada recibe una revisión de un operador antes de llegar a ti." },
    ],
    fit: {
      eyebrow: "Buen encaje",
      h2: "Una cola recurrente con límites claros.",
      items: ["Mantenimiento de CRM y hojas de cálculo", "Investigación definida de cuentas o mercados", "Preparación recurrente de datos y documentos", "Trabajo estimable, remoto y verificable"],
    },
    pricing: {
      eyebrow: "No es precio por resultado",
      h2: "Estás reservando capacidad.",
      body: "El uso se registra contra un bloque semanal de horas. Si una solicitud supera la asignación restante, puede esperar al siguiente bloque, cotizarse como tarea puntual o pasar a un nivel mayor.",
    },
  },
  tl: {
    meta: {
      title: "Standing Capacity",
      description:
        "Mag-reserve ng managed hours kada linggo para sa recurring at bounded data, research, at document work na may quality control.",
    },
    header: { services: "Mga serbisyo", signIn: "Mag-sign in", cta: "Pag-usapan ang capacity" },
    eyebrow: "Standing capacity",
    h1: "Reserved weekly capacity para sa recurring work.",
    intro:
      "Mag-reserve ng managed hours para sa recurring at bounded back-office work. Ibinabawas ang requests sa weekly allocation, nananatili ang account context, at sinusuri ang bawat natapos na task bago i-deliver.",
    setup:
      "Operator-assisted ang setup. Kinukumpirma sa iyo ang billing at allocation; hindi ito self-serve subscription checkout.",
    week: "/linggo",
    tiers: ["Maliit at recurring na operational backlog.", "Tuloy-tuloy na data, research, o document work.", "Reserved capacity para sa mas malaking recurring workload."],
    pillars: [
      { title: "Reserved managed hours", body: "Saklaw ng isang weekly allocation ang aprubadong work sa loob ng block. Capacity service ito, hindi outcome pricing." },
      { title: "Nananatili ang account context", body: "Kasama ng account ang preferences, instructions, at task history kahit magbago ang assignment." },
      { title: "Kasama pa rin ang quality control", body: "Sinusuri pa rin ng operator ang bawat natapos na task bago ito makarating sa iyo." },
    ],
    fit: {
      eyebrow: "Magandang fit",
      h2: "Recurring queue na may malinaw na boundaries.",
      items: ["CRM at spreadsheet maintenance", "Defined account o market research", "Recurring data at document preparation", "Work na kayang i-estimate, tapusin remotely, at suriin"],
    },
    pricing: {
      eyebrow: "Iba sa outcome pricing",
      h2: "Capacity ang nire-reserve mo.",
      body: "Itinatala ang usage laban sa weekly hour block. Kapag lumampas ang request sa natitirang allocation, puwede itong maghintay sa susunod na block, i-scope bilang one-off task, o lumipat sa mas malaking tier.",
    },
  },
};
