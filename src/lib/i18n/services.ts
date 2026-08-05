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
  offerings: { oneOff: OfferingCopy; standingCapacity: OfferingCopy };
};

export const SERVICES_I18N: Record<ServicesLang, Dict> = {
  en: {
    meta: {
      title: "Our Services",
      description:
        "Managed CRM, research, data and document work: one-off deliverables with an upfront price, or reserved weekly capacity for recurring work.",
    },
    header: { signIn: "Sign in", getStarted: "Describe the outcome" },
    eyebrow: "Our Services",
    h1: "One-off deliverables or recurring capacity.",
    intro:
      "Choose a scoped one-off task when the deliverable is defined. Use standing capacity when a recurring stream of bounded work needs reserved weekly time. Either way, you never manage a specialist directly: an operator runs every request, and every completed task is reviewed before delivery.",
    learnMore: "Learn more",
    offerings: {
      oneOff: {
        audience: "For a single task, no commitment",
        title: "Scoped one-off work",
        description:
          "Describe the deliverable, rules and source material. An operator confirms fit, timing and one fixed price before work begins, then reviews the completed result before delivery.",
      },
      standingCapacity: {
        audience: "For ongoing, recurring work",
        title: "Standing capacity",
        description:
          "Reserve a block of managed hours every week for recurring, bounded work. Account preferences and task history carry forward, and each completed task still receives quality control.",
      },
    },
  },
  fr: {
    meta: {
      title: "Nos services",
      description:
        "Travaux gérés de CRM, recherche, données et documents : livrables ponctuels à prix convenu ou capacité hebdomadaire réservée.",
    },
    header: { signIn: "Connexion", getStarted: "Décrire le résultat" },
    eyebrow: "Nos services",
    h1: "Livrables ponctuels ou capacité récurrente.",
    intro:
      "Choisissez une tâche ponctuelle lorsque le livrable est défini. Utilisez la capacité permanente lorsqu'un flux récurrent de travail délimité exige du temps réservé chaque semaine. Dans les deux cas, vous ne gérez jamais un spécialiste directement : un opérateur pilote chaque demande, et chaque tâche terminée est vérifiée avant livraison.",
    learnMore: "En savoir plus",
    offerings: {
      oneOff: {
        audience: "Pour une tâche unique, sans engagement",
        title: "Travail ponctuel cadré",
        description:
          "Décrivez le livrable, les règles et les sources. Un opérateur confirme l'adéquation, le délai et un prix fixe avant le début, puis vérifie le résultat avant livraison.",
      },
      standingCapacity: {
        audience: "Pour un travail continu et récurrent",
        title: "Capacité permanente",
        description:
          "Réservez chaque semaine un bloc d'heures gérées pour un travail récurrent et délimité. Les préférences et l'historique du compte sont conservés, et chaque tâche reste soumise au contrôle qualité.",
      },
    },
  },
  es: {
    meta: {
      title: "Nuestros servicios",
      description:
        "Trabajo gestionado de CRM, investigación, datos y documentos: entregables puntuales con precio previo o capacidad semanal reservada.",
    },
    header: { signIn: "Iniciar sesión", getStarted: "Describe el resultado" },
    eyebrow: "Nuestros servicios",
    h1: "Entregables puntuales o capacidad recurrente.",
    intro:
      "Elige una tarea puntual cuando el entregable esté definido. Usa capacidad fija cuando un flujo recurrente de trabajo acotado necesite tiempo reservado cada semana. En ambos casos nunca gestionas a un especialista directamente: un operador dirige cada solicitud y cada tarea terminada se revisa antes de entregarse.",
    learnMore: "Más información",
    offerings: {
      oneOff: {
        audience: "Para una tarea puntual, sin compromiso",
        title: "Trabajo puntual definido",
        description:
          "Describe el entregable, las reglas y las fuentes. Un operador confirma el encaje, el plazo y un precio fijo antes de empezar, y revisa el resultado antes de entregarlo.",
      },
      standingCapacity: {
        audience: "Para trabajo continuo y recurrente",
        title: "Capacidad fija",
        description:
          "Reserva un bloque de horas gestionadas cada semana para trabajo recurrente y acotado. Las preferencias y el historial se conservan, y cada tarea sigue pasando por control de calidad.",
      },
    },
  },
  tl: {
    meta: {
      title: "Ang Aming Mga Serbisyo",
      description:
        "Managed CRM, research, data, at document work: one-off deliverables na may upfront na presyo o reserved weekly capacity.",
    },
    header: { signIn: "Mag-sign in", getStarted: "Ilarawan ang resulta" },
    eyebrow: "Ang Aming Mga Serbisyo",
    h1: "One-off na deliverable o recurring capacity.",
    intro:
      "Pumili ng one-off task kapag malinaw ang deliverable. Gamitin ang standing capacity kapag may recurring at bounded work na nangangailangan ng reserved time kada linggo. Sa parehong paraan, hindi mo kailanman dinidirekta ang specialist: operator ang namamahala sa bawat request, at sinusuri ang bawat natapos na task bago i-deliver.",
    learnMore: "Alamin pa",
    offerings: {
      oneOff: {
        audience: "Para sa iisang task, walang commitment",
        title: "Scoped one-off work",
        description:
          "Ilarawan ang deliverable, rules, at source material. Kinukumpirma ng operator ang fit, timing, at fixed price bago magsimula, at sinusuri ang resulta bago i-deliver.",
      },
      standingCapacity: {
        audience: "Para sa patuloy at paulit-ulit na trabaho",
        title: "Standing Capacity",
        description:
          "Mag-reserve ng managed hours kada linggo para sa recurring at bounded work. Nananatili ang account preferences at task history, at dumadaan pa rin sa quality control ang bawat task.",
      },
    },
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
