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
  forSpecialists: {
    eyebrow: string;
    h2: string;
    academy: { eyebrow: string; title: string; description: string; cta: string };
    assistant: { eyebrow: string; title: string; description: string; cta: string };
  };
};

export const SERVICES_I18N: Record<ServicesLang, Dict> = {
  en: {
    meta: {
      title: "Our Services",
      description:
        "Every way to get work done through AfterDesk: a single task with a fixed price, or standing weekly capacity.",
    },
    header: { signIn: "Sign in", getStarted: "Get started" },
    eyebrow: "Our Services",
    h1: "One team. Two ways to send it work.",
    intro:
      "Every offering below runs on the same rule: you never manage a specialist directly, and an operator checks the work before it reaches you.",
    learnMore: "Learn more",
    offerings: {
      oneOff: {
        audience: "For a single task, no commitment",
        title: "One-off task",
        description:
          "Describe any task in plain language, get a fixed price, approve it, and get it back done by morning, reviewed by an operator before it reaches you.",
      },
      standingCapacity: {
        audience: "For ongoing, recurring work",
        title: "Standing capacity",
        description:
          "Reserve a block of hours every week at one fixed price. Submit tasks as they come up all week, with a running account history so a new specialist never starts cold.",
      },
    },
    forSpecialists: {
      eyebrow: "For specialists, not clients",
      h2: "Everything above is what a client buys. Here's what a worker gets, free, either way.",
      academy: {
        eyebrow: "Free, no account required to preview",
        title: "The Academy",
        description:
          "Real courses in data cleanup, research, writing and admin work, with real exams and a certificate you keep, whether or not you ever take a task through AfterDesk. Training, not a funnel.",
        cta: "See the courses",
      },
      assistant: {
        eyebrow: "Included on every active task",
        title: "The AfterDesk Assistant",
        description:
          "Caught between two valid ways to interpret the brief? Ask the assistant, trained on the same standards QC checks against. It never sees client data, never sets a price, and hands off to an operator the moment a question is genuinely task-specific.",
        cta: "See how it works",
      },
    },
  },
  fr: {
    meta: {
      title: "Nos services",
      description:
        "Toutes les façons de confier votre travail à AfterDesk : une tâche unique à prix fixe, ou une capacité hebdomadaire permanente.",
    },
    header: { signIn: "Connexion", getStarted: "Commencer" },
    eyebrow: "Nos services",
    h1: "Une équipe. Deux façons de lui envoyer du travail.",
    intro:
      "Chaque offre ci-dessous repose sur la même règle : vous ne gérez jamais un spécialiste directement, et un opérateur vérifie le travail avant qu'il ne vous parvienne.",
    learnMore: "En savoir plus",
    offerings: {
      oneOff: {
        audience: "Pour une tâche unique, sans engagement",
        title: "Tâche ponctuelle",
        description:
          "Décrivez n'importe quelle tâche en langage clair, obtenez un prix fixe, approuvez-le, et récupérez le travail terminé dès le lendemain matin, vérifié par un opérateur avant qu'il ne vous parvienne.",
      },
      standingCapacity: {
        audience: "Pour un travail continu et récurrent",
        title: "Capacité permanente",
        description:
          "Réservez un bloc d'heures chaque semaine à un prix fixe unique. Soumettez vos tâches au fil de la semaine, avec un historique de compte continu pour qu'un nouveau spécialiste ne parte jamais de zéro.",
      },
    },
    forSpecialists: {
      eyebrow: "Pour les spécialistes, pas pour les clients",
      h2: "Tout ce qui précède, c'est ce qu'achète un client. Voici ce qu'obtient un travailleur, gratuitement, dans tous les cas.",
      academy: {
        eyebrow: "Gratuit, aucun compte requis pour un aperçu",
        title: "L'Académie",
        description:
          "De vrais cours en nettoyage de données, en recherche, en rédaction et en travail administratif, avec de vrais examens et un certificat que vous conservez, que vous effectuiez ou non une tâche via AfterDesk. De la formation, pas un entonnoir de vente.",
        cta: "Voir les cours",
      },
      assistant: {
        eyebrow: "Inclus sur chaque tâche active",
        title: "L'assistant AfterDesk",
        description:
          "Coincé entre deux façons valables d'interpréter le mandat? Demandez à l'assistant, formé sur la même norme qu'un opérateur utilise pour vérifier chaque livrable. Il ne voit jamais les données du client, ne fixe jamais de prix, et transmet la question à un opérateur dès qu'elle est véritablement spécifique à la tâche.",
        cta: "Voir comment ça marche",
      },
    },
  },
  es: {
    meta: {
      title: "Nuestros servicios",
      description:
        "Todas las formas de completar tu trabajo a través de AfterDesk: una tarea puntual a precio fijo, o capacidad semanal fija.",
    },
    header: { signIn: "Iniciar sesión", getStarted: "Comenzar" },
    eyebrow: "Nuestros servicios",
    h1: "Un equipo. Dos maneras de enviarle trabajo.",
    intro:
      "Cada oferta a continuación se rige por la misma regla: nunca gestionas a un especialista directamente, y un operador revisa el trabajo antes de que llegue a ti.",
    learnMore: "Más información",
    offerings: {
      oneOff: {
        audience: "Para una tarea puntual, sin compromiso",
        title: "Tarea puntual",
        description:
          "Describe cualquier tarea en lenguaje sencillo, obtén un precio fijo, apruébalo y recíbela terminada por la mañana, revisada por un operador antes de que llegue a ti.",
      },
      standingCapacity: {
        audience: "Para trabajo continuo y recurrente",
        title: "Capacidad fija",
        description:
          "Reserva un bloque de horas cada semana a un precio fijo. Envía tareas a medida que surjan durante toda la semana, con un historial de cuenta continuo para que un nuevo especialista nunca empiece de cero.",
      },
    },
    forSpecialists: {
      eyebrow: "Para especialistas, no para clientes",
      h2: "Todo lo anterior es lo que compra un cliente. Esto es lo que recibe un trabajador, gratis, en cualquier caso.",
      academy: {
        eyebrow: "Gratis, sin necesidad de cuenta para ver una vista previa",
        title: "La Academia",
        description:
          "Cursos reales de limpieza de datos, investigación, redacción y trabajo administrativo, con exámenes reales y un certificado que conservas, sin importar si alguna vez haces una tarea a través de AfterDesk. Formación, no un embudo.",
        cta: "Ver los cursos",
      },
      assistant: {
        eyebrow: "Incluido en cada tarea activa",
        title: "El Asistente de AfterDesk",
        description:
          "¿Atrapado entre dos formas válidas de interpretar las instrucciones? Pregúntale al asistente, entrenado con los mismos estándares con los que un operador revisa cada entregable. Nunca ve datos del cliente, nunca fija un precio, y deriva a un operador en el momento en que una pregunta es genuinamente específica de la tarea.",
        cta: "Ver cómo funciona",
      },
    },
  },
  tl: {
    meta: {
      title: "Ang Aming Mga Serbisyo",
      description:
        "Lahat ng paraan para matapos ang trabaho gamit ang AfterDesk: isang task na may fixed na presyo, o standing weekly capacity.",
    },
    header: { signIn: "Mag-sign in", getStarted: "Magsimula na" },
    eyebrow: "Ang Aming Mga Serbisyo",
    h1: "Isang team. Dalawang paraan para ipadala rito ang trabaho.",
    intro:
      "Iisang patakaran ang sinusunod ng bawat offering sa ibaba: hindi mo direktang mina-manage ang isang espesyalista, at sinusuri ng operator ang trabaho bago ito makarating sa'yo.",
    learnMore: "Alamin pa",
    offerings: {
      oneOff: {
        audience: "Para sa iisang task, walang commitment",
        title: "One-off na Task",
        description:
          "Ilarawan ang kahit anong task gamit ang simpleng wika, makakuha ng fixed na presyo, i-approve ito, at matatanggap mo itong tapos na sa umaga, sinuri ng operator bago ito makarating sa'yo.",
      },
      standingCapacity: {
        audience: "Para sa patuloy at paulit-ulit na trabaho",
        title: "Standing Capacity",
        description:
          "Mag-reserve ng ilang oras kada linggo sa iisang fixed na presyo. Mag-submit ng mga task sa buong linggo sa tuwing kakailanganin ito, kasama ang patuloy na account history para hindi na magsisimula nang blangko ang bagong espesyalista.",
      },
    },
    forSpecialists: {
      eyebrow: "Para sa mga espesyalista, hindi sa mga kliyente",
      h2: "Ang lahat sa itaas ay ang binibili ng kliyente. Narito naman ang natatanggap ng manggagawa, libre, kahit alin sa dalawa.",
      academy: {
        eyebrow: "Libre, hindi kailangan ng account para mag-preview",
        title: "Ang Academy",
        description:
          "Tunay na mga course tungkol sa data cleanup, research, writing, at admin work, may tunay na exams at certificate na mapapasaiyo, kumuha ka man ng task sa AfterDesk o hindi. Training ito, hindi funnel.",
        cta: "Tingnan ang mga course",
      },
      assistant: {
        eyebrow: "Kasama sa bawat aktibong task",
        title: "Ang AfterDesk Assistant",
        description:
          "Nalilito ka ba sa pagitan ng dalawang tamang paraan ng pagbasa sa brief? Tanungin ang assistant, sinanay ito gamit ang parehong pamantayan na ginagamit ng operator para suriin ang bawat trabaho. Hindi nito nakikita ang data ng kliyente, hindi ito nagtatakda ng presyo, at ipinapasa nito agad sa operator ang tanong sa sandaling ito ay talagang task-specific na.",
        cta: "Tingnan kung paano ito gumagana",
      },
    },
  },
};
