/**
 * The public Academy page — the shareable asset. A worker sends this link to a
 * friend who has no account, and the whole curriculum is right there.
 *
 * THE RULE (same as the other two public pages): the VOICE translates, the
 * MACHINE stays English. Headings, body copy and CTAs are voice. Course
 * titles, lesson titles and the mono stat labels are the product itself and
 * stay English in every language — the courses are taught in English and the
 * work arrives in English, so showing that is honest signaling, not laziness.
 */

import { SITE_LANGS, siteLangOf, type SiteLang } from "./langs";

export type AcademyLang = SiteLang;

export const ACADEMY_LANGS: { code: AcademyLang; label: string }[] = SITE_LANGS;

export function academyLangOf(value: string | undefined | null): AcademyLang {
  return siteLangOf(value);
}

type Dict = {
  nav: { signIn: string; apply: string };
  hero: {
    kill: string;
    h1a: string;
    h1b: string;
    sub: string;
    cta: string;
    micro: string;
  };
  stats: { courses: string; lessons: string; questions: string; minutes: string };
  deal: {
    label: string;
    h2: string;
    steps: [string, string][];
  };
  why: {
    label: string;
    h2: string;
    body: string;
    pledge: string;
  };
  curriculum: {
    label: string;
    h2: string;
    foundations: string;
    foundationsNote: string;
    craft: string;
    craftNote: string;
    career: string;
    careerNote: string;
    byWork: string;
    byWorkNote: string;
    lessons: (n: number) => string;
    exam: string;
    /** The anchor into a published course page. */
    read: string;
    /** The outcomes-section heading on a course page: what the learner gets after finishing it. */
    afterThisCourse: string;
  };
  closing: { h2: string; body: string; cta: string; micro: string };
  footer: { workers: string; how: string; signIn: string };
  /** Heading over a lesson's key-points recap box. */
  remember: string;
};

const en: Dict = {
  nav: { signIn: "Sign in", apply: "Apply" },
  hero: {
    kill: "Free · No paid tier · No certificate fee",
    h1a: "Learn the work.",
    h1b: "Keep the certificate.",
    sub: "Real courses, real exams, and a certificate that stays yours, free and open before you are approved.",
    cta: "Create a free account",
    micro: "You can start the first course tonight.",
  },
  stats: { courses: "courses", lessons: "lessons", questions: "exam questions", minutes: "minutes" },
  deal: {
    label: "How it works",
    h2: "Read, sit the exam, keep the certificate.",
    steps: [
      ["Read", "Short lessons per course, written for the work rather than for a syllabus."],
      ["Sit the exam", "Twelve scenario questions. Pass at ten. Three attempts a day. The bar is the point."],
      ["Keep it", "The certificate is permanent, on your profile, and visible when we review your application."],
    ],
  },
  why: {
    label: "The catch",
    h2: "There isn't one. Here's why.",
    body: "Work that passes review the first time costs us less and pays you faster. Teaching that properly is cheaper for us than fixing it afterwards, so the training is free because it is in our own interest, not as a favour.",
    pledge: "No paid tier. No certificate fee. No upsell. Not now, not later.",
  },
  curriculum: {
    label: "The curriculum",
    h2: "Everything, and what is in it.",
    foundations: "Foundations",
    foundationsNote: "Take these first: they apply to every kind of task.",
    craft: "The toolkit",
    craftNote: "The jobs a virtual assistant is hired to do, anywhere, not only here.",
    career: "The career",
    careerNote: "Getting hired, getting paid, and lasting in this work.",
    byWork: "One per kind of work",
    byWorkNote: "Each teaches the exact standard that kind of delivery is judged against.",
    lessons: (n) => `${n} lessons`,
    exam: "exam + certificate",
    read: "Read the course",
    afterThisCourse: "After this course",
  },
  closing: {
    h2: "The courses are free. The work is real.",
    body: "Create an account and start tonight. Applying to the pool is a separate step. The Academy does not wait for it.",
    cta: "Create a free account",
    micro: "Already have one? Sign in and open the Academy.",
  },
  footer: { workers: "Work with us", how: "How it works", signIn: "Sign in" },
  remember: "Remember",
};

const tl: Dict = {
  nav: { signIn: "Mag-sign in", apply: "Mag-apply" },
  hero: {
    kill: "Libre · Walang bayad na tier · Walang bayad sa certificate",
    h1a: "Matutunan ang trabaho.",
    h1b: "Sa iyo ang certificate.",
    sub: "Totoong kurso, totoong exam, at certificate na mananatiling sa iyo, libre at bukas bago ka pa ma-approve.",
    cta: "Gumawa ng libreng account",
    micro: "Pwede mong simulan ang unang kurso ngayong gabi.",
  },
  stats: { courses: "na kurso", lessons: "na leksyon", questions: "na tanong sa exam", minutes: "na minuto" },
  deal: {
    label: "Paano ito gumagana",
    h2: "Magbasa, kumuha ng exam, panatilihin ang certificate.",
    steps: [
      ["Magbasa", "Maiikling leksyon bawat kurso, isinulat para sa trabaho at hindi para sa syllabus."],
      ["Kumuha ng exam", "Labindalawang tanong na senaryo. Pasado sa sampu. Tatlong subok kada araw. Ang pamantayan ang punto."],
      ["Panatilihin", "Permanente ang certificate, nasa profile mo, at nakikita namin kapag ni-review ang application mo."],
    ],
  },
  why: {
    label: "Ang catch",
    h2: "Wala. Ito ang dahilan.",
    body: "Ang trabahong pumapasa sa review sa unang subok ay mas mura para sa amin at mas mabilis kang nababayaran. Mas mura ang magturo nang maayos kaysa ayusin ito pagkatapos, kaya libre ang training dahil ito ay para din sa amin, hindi pabor.",
    pledge: "Walang bayad na tier. Walang bayad sa certificate. Walang upsell. Ngayon at kailanman.",
  },
  curriculum: {
    label: "Ang kurikulum",
    h2: "Lahat, at kung ano ang laman.",
    foundations: "Pundasyon",
    foundationsNote: "Kunin muna ito: gamit ito sa lahat ng uri ng task.",
    craft: "Ang toolkit",
    craftNote: "Ang mga trabahong kinukuha sa isang virtual assistant, kahit saan, hindi lang dito.",
    career: "Ang karera",
    careerNote: "Pagkuha ng trabaho, pagsingil, at pagtagal sa gawaing ito.",
    byWork: "Isa bawat uri ng trabaho",
    byWorkNote: "Bawat isa ay nagtuturo ng eksaktong pamantayan kung paano husgahan ang ganoong delivery.",
    lessons: (n) => `${n} na leksyon`,
    exam: "exam + certificate",
    read: "Basahin ang kurso",
    afterThisCourse: "Pagkatapos ng kursong ito",
  },
  closing: {
    h2: "Libre ang mga kurso. Totoo ang trabaho.",
    body: "Gumawa ng account at magsimula ngayong gabi. Hiwalay na hakbang ang pag-apply sa pool. Hindi ito hinihintay ng Academy.",
    cta: "Gumawa ng libreng account",
    micro: "Meron ka na? Mag-sign in at buksan ang Academy.",
  },
  footer: { workers: "Magtrabaho kasama namin", how: "Paano ito gumagana", signIn: "Mag-sign in" },
  remember: "Tandaan",
};

const fr: Dict = {
  nav: { signIn: "Connexion", apply: "Postuler" },
  hero: {
    kill: "Gratuit · Aucune formule payante · Aucuns frais de certificat",
    h1a: "Apprenez le métier.",
    h1b: "Gardez le certificat.",
    sub: "De vrais cours, de vrais examens, et un certificat qui reste le vôtre, gratuit et accessible avant même votre approbation.",
    cta: "Créer un compte gratuit",
    micro: "Vous pouvez commencer le premier cours ce soir.",
  },
  stats: { courses: "cours", lessons: "leçons", questions: "questions d'examen", minutes: "minutes" },
  deal: {
    label: "Comment ça marche",
    h2: "Lisez, passez l'examen, gardez le certificat.",
    steps: [
      ["Lire", "De courtes leçons par cours, écrites pour le travail et non pour un programme scolaire."],
      ["Passer l'examen", "Douze mises en situation. Réussite à dix. Trois essais par jour. La barre, c'est le but."],
      ["Le garder", "Le certificat est permanent, sur votre profil, et visible quand nous révisons votre candidature."],
    ],
  },
  why: {
    label: "L'attrape",
    h2: "Il n'y en a pas. Voici pourquoi.",
    body: "Un travail qui passe la révision du premier coup nous coûte moins cher et vous paie plus vite. Bien l'enseigner nous coûte moins que de le corriger après, la formation est donc gratuite par intérêt, pas par faveur.",
    pledge: "Aucune formule payante. Aucuns frais de certificat. Aucune vente incitative. Ni maintenant, ni plus tard.",
  },
  curriculum: {
    label: "Le programme",
    h2: "Tout, et ce qu'il contient.",
    foundations: "Fondations",
    foundationsNote: "À faire en premier : elles servent à tous les types de tâches.",
    craft: "La boîte à outils",
    craftNote: "Les tâches pour lesquelles on engage un adjoint virtuel, partout, pas seulement ici.",
    career: "La carrière",
    careerNote: "Se faire engager, se faire payer, et durer dans ce métier.",
    byWork: "Un par type de travail",
    byWorkNote: "Chacun enseigne la norme exacte selon laquelle ce type de livraison est jugé.",
    lessons: (n) => `${n} leçons`,
    exam: "examen + certificat",
    read: "Lire le cours",
    afterThisCourse: "Après ce cours",
  },
  closing: {
    h2: "Les cours sont gratuits. Le travail est réel.",
    body: "Créez un compte et commencez ce soir. Postuler au bassin est une étape distincte. L'Académie ne l'attend pas.",
    cta: "Créer un compte gratuit",
    micro: "Vous en avez déjà un ? Connectez-vous et ouvrez l'Académie.",
  },
  footer: { workers: "Travailler avec nous", how: "Comment ça marche", signIn: "Connexion" },
  remember: "À retenir",
};

const es: Dict = {
  nav: { signIn: "Iniciar sesión", apply: "Postular" },
  hero: {
    kill: "Gratis · Sin plan de pago · Sin costo de certificado",
    h1a: "Aprende el oficio.",
    h1b: "Quédate el certificado.",
    sub: "Cursos reales, exámenes reales y un certificado que es tuyo, gratis y abierto antes de que te aprueben.",
    cta: "Crear una cuenta gratis",
    micro: "Puedes empezar el primer curso esta noche.",
  },
  stats: { courses: "cursos", lessons: "lecciones", questions: "preguntas de examen", minutes: "minutos" },
  deal: {
    label: "Cómo funciona",
    h2: "Lee, presenta el examen, quédate el certificado.",
    steps: [
      ["Leer", "Lecciones cortas por curso, escritas para el trabajo y no para un programa."],
      ["Presentar el examen", "Doce preguntas de escenario. Apruebas con diez. Tres intentos al día. El estándar es el punto."],
      ["Quedártelo", "El certificado es permanente, está en tu perfil y lo vemos al revisar tu postulación."],
    ],
  },
  why: {
    label: "La trampa",
    h2: "No hay. Esta es la razón.",
    body: "El trabajo que pasa la revisión a la primera nos cuesta menos y te paga más rápido. Enseñarlo bien nos sale más barato que corregirlo después, así que la formación es gratis por conveniencia nuestra, no como favor.",
    pledge: "Sin plan de pago. Sin costo de certificado. Sin ventas adicionales. Ni ahora ni después.",
  },
  curriculum: {
    label: "El plan de estudios",
    h2: "Todo, y lo que contiene.",
    foundations: "Fundamentos",
    foundationsNote: "Toma estos primero: sirven para todo tipo de tarea.",
    craft: "La caja de herramientas",
    craftNote: "Los trabajos para los que se contrata a un asistente virtual, en cualquier lugar, no solo aquí.",
    career: "La carrera",
    careerNote: "Conseguir trabajo, cobrar, y durar en este oficio.",
    byWork: "Uno por tipo de trabajo",
    byWorkNote: "Cada uno enseña el estándar exacto con el que se juzga ese tipo de entrega.",
    lessons: (n) => `${n} lecciones`,
    exam: "examen + certificado",
    read: "Leer el curso",
    afterThisCourse: "Después de este curso",
  },
  closing: {
    h2: "Los cursos son gratis. El trabajo es real.",
    body: "Crea una cuenta y empieza esta noche. Postular al grupo es un paso aparte. La Academia no lo espera.",
    cta: "Crear una cuenta gratis",
    micro: "¿Ya tienes una? Inicia sesión y abre la Academia.",
  },
  footer: { workers: "Trabaja con nosotros", how: "Cómo funciona", signIn: "Iniciar sesión" },
  remember: "Recuerda",
};

export const ACADEMY_I18N: Record<AcademyLang, Dict> = { en, fr, es, tl };
