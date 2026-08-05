import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { LangSwitch } from "@/components/lang-switch";
import { MobileMenu } from "@/components/mobile-menu";
import { PublicCounters } from "@/components/public-counters";
import { TrustLinks } from "@/components/trust-links";
import { arrivedFromInsideTheApp, getSessionUser, roleHome } from "@/lib/authz";
import { CLIENT_LANGS, clientLangOf } from "@/lib/i18n/client";
import { langAlternates, type SiteLang } from "@/lib/i18n/langs";
import { COMPACT_HOW_LABEL, COMPACT_SERVICES_LABEL } from "@/lib/i18n/mobile-menu-compact";
import { SITE_URL } from "@/lib/site";

type HomeCopy = {
  nav: { services: string; how: string; about: string; signIn: string; portal: string };
  hero: {
    eyebrow: string;
    line1: string;
    line2: string;
    body: string;
    cta: string;
    micro: string;
  };
  example: {
    label: string;
    title: string;
    /** The four slot labels and the stamp are voice, not data — they translate. */
    fieldInput: string;
    fieldRules: string;
    fieldReturns: string;
    fieldReview: string;
    qcStamp: string;
    input: string;
    rules: string;
    returns: string;
    review: string;
    status: string;
  };
  fit: {
    label: string;
    title: string;
    body: string;
    cards: { title: string; body: string; output: string }[];
  };
  process: {
    label: string;
    title: string;
    steps: { title: string; body: string }[];
  };
  comparison: {
    label: string;
    title: string;
    body: string;
    directTitle: string;
    direct: string[];
    managedTitle: string;
    managed: string[];
  };
  quality: {
    label: string;
    title: string;
    body: string;
    checks: string[];
    boundaryTitle: string;
    boundaryBody: string;
  };
  close: { title: string; body: string; primary: string; secondary: string };
  footer: { work: string; academy: string };
  /** Copy for the live counters strip (src/components/public-counters.tsx) —
   *  real DB aggregates; the component renders nothing below its thresholds. */
  counters: {
    taskWord: [string, string];
    workerWord: [string, string];
    released: string;
    toDate: string;
    moneySaved: { label: string; timeLabel: string; note: string };
  };
};

const COPY: Record<SiteLang, HomeCopy> = {
  en: {
    nav: { services: "Services", how: "How it works", about: "About", signIn: "Sign in", portal: "My account" },
    hero: {
      eyebrow: "Managed back-office execution",
      line1: "Send the work.",
      line2: "Get a reviewed deliverable.",
      body: "AfterDesk scopes and manages bounded CRM, research, data and document work. A trained specialist completes it, and an AfterDesk operator checks it before delivery.",
      cta: "Describe the outcome",
      micro: "One-off tasks are scoped and priced upfront. Timing is confirmed before work starts.",
    },
    example: {
      label: "Illustrative workflow",
      title: "CRM hygiene run",
      fieldInput: "INPUT",
      fieldRules: "RULES",
      fieldReturns: "RETURNS",
      fieldReview: "REVIEW",
      qcStamp: "QC PASSED",
      input: "1,800-row CRM export",
      rules: "Merge duplicates · normalize fields",
      returns: "Clean import · exception log",
      review: "Brief and field checks",
      status: "Ready for delivery",
    },
    fit: {
      label: "Where AfterDesk fits",
      title: "Work that is bounded, repeatable and checkable.",
      body: "The strongest fit is operational work with clear inputs, a defined deliverable and details that still need human judgment.",
      cards: [
        { title: "CRM cleanup and enrichment", body: "Normalize fields, merge duplicates, research agreed data points and flag records that need a decision.", output: "Clean import + exception log" },
        { title: "Account research and qualification", body: "Research companies against explicit criteria, retain source links and separate uncertain findings.", output: "Structured research file" },
        { title: "Data and document operations", body: "Compare files, validate structured information and prepare recurring reports from supplied material.", output: "Completed file + review notes" },
      ],
    },
    process: {
      label: "How it works",
      title: "You define the result. AfterDesk manages the work.",
      steps: [
        { title: "Describe the deliverable", body: "Tell us what must be returned, what rules matter and what a correct result looks like." },
        { title: "Approve scope and price", body: "An operator confirms fit, required access, timing and one fixed price for a one-off task." },
        { title: "The work is completed", body: "A trained specialist completes the approved scope while AfterDesk manages questions and exceptions." },
        { title: "Quality control reviews it", body: "Critical details, completeness and formatting are checked before the deliverable reaches you." },
      ],
    },
    comparison: {
      label: "After the prompt",
      title: "AI can generate an answer. The workflow may still be yours to finish.",
      body: "ChatGPT, Claude and other AI tools are powerful. AfterDesk is for work where you do not want to run the process and review every result yourself.",
      directTitle: "Use AI directly when you can",
      direct: ["provide the context and instructions", "run the steps and tools", "verify facts, fields and formatting", "repair exceptions yourself"],
      managedTitle: "Use AfterDesk when you want",
      managed: ["one approved scope", "managed execution", "exceptions surfaced clearly", "a checked, usable deliverable"],
    },
    quality: {
      label: "Quality control",
      title: "Review is part of delivery, not a task left for you.",
      body: "The exact checks depend on the brief. Every completed task receives an operator review before delivery.",
      checks: ["brief-compliance check", "field and format validation", "duplicate and consistency review", "source checks when agreed", "exception review", "final operator review"],
      boundaryTitle: "A bounded promise",
      boundaryBody: "AfterDesk handles remote work that can be scoped and verified. Timing depends on size, access, complexity and review requirements. High-stakes professional judgment and unsupported account access are not accepted.",
    },
    close: { title: "Have a workflow that keeps falling to the bottom of the list?", body: "Describe the deliverable you need. We will confirm whether it fits, how it will be reviewed, the price and the timing before work begins.", primary: "Describe the outcome", secondary: "Discuss recurring work" },
    footer: { work: "Work with us", academy: "Academy" },
    counters: {
      taskWord: ["task delivered", "tasks delivered"],
      workerWord: ["approved worker", "approved workers"],
      released: "released to workers",
      toDate: "To date,",
      moneySaved: {
        label: "saved vs. market rate",
        timeLabel: "hours handed back",
        note: "Market rate × hours on task, minus what clients actually paid. Set per task category, floored at zero, never a modest number bragged up.",
      },
    },
  },
  fr: {
    nav: { services: "Services", how: "Comment ça marche", about: "À propos", signIn: "Connexion", portal: "Mon compte" },
    hero: {
      eyebrow: "Exécution administrative gérée",
      line1: "Confiez le travail.",
      line2: "Recevez un livrable vérifié.",
      body: "AfterDesk cadre et gère des travaux délimités de CRM, de recherche, de données et de documents. Un spécialiste formé les réalise et un opérateur AfterDesk les vérifie avant livraison.",
      cta: "Décrire le résultat",
      micro: "Les tâches ponctuelles sont cadrées et tarifées à l'avance. Le délai est confirmé avant le début du travail.",
    },
    example: { label: "Flux de travail illustratif", title: "Nettoyage CRM", fieldInput: "ENTRÉE", fieldRules: "RÈGLES", fieldReturns: "LIVRAISON", fieldReview: "RÉVISION", qcStamp: "RÉVISION RÉUSSIE", input: "Export CRM de 1 800 lignes", rules: "Fusionner les doublons · normaliser les champs", returns: "Import propre · journal d'exceptions", review: "Contrôle du brief et des champs", status: "Prêt à livrer" },
    fit: {
      label: "Quand utiliser AfterDesk",
      title: "Un travail délimité, répétable et vérifiable.",
      body: "Les meilleurs cas sont les travaux opérationnels avec des entrées claires, un livrable défini et des détails qui exigent encore du jugement humain.",
      cards: [
        { title: "Nettoyage et enrichissement CRM", body: "Normaliser les champs, fusionner les doublons, rechercher les données convenues et signaler les dossiers à décider.", output: "Import propre + journal d'exceptions" },
        { title: "Recherche et qualification de comptes", body: "Rechercher les entreprises selon des critères explicites, conserver les sources et isoler les résultats incertains.", output: "Fichier de recherche structuré" },
        { title: "Opérations de données et documents", body: "Comparer des fichiers, valider des informations structurées et préparer des rapports à partir des éléments fournis.", output: "Fichier terminé + notes de contrôle" },
      ],
    },
    process: { label: "Comment ça marche", title: "Vous définissez le résultat. AfterDesk gère le travail.", steps: [
      { title: "Décrivez le livrable", body: "Précisez ce qui doit être rendu, les règles importantes et ce qui constitue un résultat correct." },
      { title: "Approuvez le périmètre et le prix", body: "Un opérateur confirme l'adéquation, les accès, le délai et un prix fixe pour une tâche ponctuelle." },
      { title: "Le travail est réalisé", body: "Un spécialiste formé réalise le travail approuvé pendant qu'AfterDesk gère les questions et exceptions." },
      { title: "Le contrôle qualité le vérifie", body: "Les détails critiques, l'exhaustivité et le format sont contrôlés avant livraison." },
    ] },
    comparison: { label: "Après le prompt", title: "L'IA peut générer une réponse. Il peut vous rester tout le flux à terminer.", body: "ChatGPT, Claude et les autres outils d'IA sont puissants. AfterDesk sert lorsque vous ne voulez pas piloter le processus et vérifier chaque résultat vous-même.", directTitle: "Utilisez l'IA directement si vous pouvez", direct: ["fournir le contexte et les instructions", "exécuter les étapes et les outils", "vérifier les faits, champs et formats", "corriger vous-même les exceptions"], managedTitle: "Utilisez AfterDesk si vous voulez", managed: ["un périmètre approuvé", "une exécution gérée", "des exceptions clairement signalées", "un livrable vérifié et utilisable"] },
    quality: { label: "Contrôle qualité", title: "La vérification fait partie de la livraison.", body: "Les contrôles précis dépendent du brief. Chaque tâche terminée est relue par un opérateur avant livraison.", checks: ["conformité au brief", "validation des champs et formats", "contrôle des doublons et de la cohérence", "vérification des sources si convenue", "examen des exceptions", "revue finale par l'opérateur"], boundaryTitle: "Une promesse délimitée", boundaryBody: "AfterDesk traite les travaux à distance qui peuvent être cadrés et vérifiés. Le délai dépend du volume, des accès, de la complexité et du contrôle requis. Les décisions professionnelles à haut risque et les accès non pris en charge sont refusés." },
    close: { title: "Un flux de travail reste toujours en bas de la liste?", body: "Décrivez le livrable voulu. Nous confirmerons l'adéquation, le contrôle, le prix et le délai avant de commencer.", primary: "Décrire le résultat", secondary: "Parler d'un besoin récurrent" },
    footer: { work: "Travailler avec nous", academy: "Académie" },
    counters: {
      taskWord: ["tâche livrée", "tâches livrées"],
      workerWord: ["spécialiste approuvé", "spécialistes approuvés"],
      released: "reversés aux spécialistes",
      toDate: "À ce jour,",
      moneySaved: {
        label: "économisés vs taux du marché",
        timeLabel: "heures récupérées",
        note: "Taux du marché × heures sur la tâche, moins ce que les clients ont réellement payé. Défini par catégorie de tâche, plancher à zéro, jamais un chiffre modeste gonflé.",
      },
    },
  },
  es: {
    nav: { services: "Servicios", how: "Cómo funciona", about: "Acerca de", signIn: "Iniciar sesión", portal: "Mi cuenta" },
    hero: { eyebrow: "Ejecución administrativa gestionada", line1: "Envía el trabajo.", line2: "Recibe un entregable revisado.", body: "AfterDesk define y gestiona trabajo acotado de CRM, investigación, datos y documentos. Un especialista capacitado lo completa y un operador de AfterDesk lo revisa antes de la entrega.", cta: "Describe el resultado", micro: "Las tareas puntuales se definen y cotizan por adelantado. El plazo se confirma antes de empezar." },
    example: { label: "Flujo ilustrativo", title: "Limpieza de CRM", fieldInput: "ENTRADA", fieldRules: "REGLAS", fieldReturns: "ENTREGA", fieldReview: "REVISIÓN", qcStamp: "QC APROBADO", input: "Exportación CRM de 1.800 filas", rules: "Fusionar duplicados · normalizar campos", returns: "Importación limpia · registro de excepciones", review: "Revisión de instrucciones y campos", status: "Listo para entregar" },
    fit: { label: "Dónde encaja AfterDesk", title: "Trabajo acotado, repetible y verificable.", body: "El mejor encaje es el trabajo operativo con entradas claras, un entregable definido y detalles que aún requieren criterio humano.", cards: [
      { title: "Limpieza y enriquecimiento de CRM", body: "Normalizar campos, fusionar duplicados, investigar datos acordados y señalar registros que requieren decisión.", output: "Importación limpia + excepciones" },
      { title: "Investigación y calificación de cuentas", body: "Investigar empresas con criterios explícitos, conservar fuentes y separar resultados inciertos.", output: "Archivo de investigación estructurado" },
      { title: "Operaciones de datos y documentos", body: "Comparar archivos, validar información estructurada y preparar informes con el material suministrado.", output: "Archivo terminado + notas de revisión" },
    ] },
    process: { label: "Cómo funciona", title: "Tú defines el resultado. AfterDesk gestiona el trabajo.", steps: [
      { title: "Describe el entregable", body: "Indica qué debe devolverse, qué reglas importan y cómo es un resultado correcto." },
      { title: "Aprueba el alcance y el precio", body: "Un operador confirma encaje, accesos, plazo y un precio fijo para la tarea puntual." },
      { title: "Se completa el trabajo", body: "Un especialista capacitado completa el alcance mientras AfterDesk gestiona preguntas y excepciones." },
      { title: "Control de calidad lo revisa", body: "Los detalles críticos, la integridad y el formato se comprueban antes de la entrega." },
    ] },
    comparison: { label: "Después del prompt", title: "La IA puede generar una respuesta. El flujo aún puede quedar en tus manos.", body: "ChatGPT, Claude y otras herramientas de IA son potentes. AfterDesk es para el trabajo cuyo proceso y revisión no quieres gestionar tú.", directTitle: "Usa IA directamente cuando puedas", direct: ["aportar contexto e instrucciones", "ejecutar los pasos y herramientas", "verificar datos, campos y formato", "corregir las excepciones"], managedTitle: "Usa AfterDesk cuando quieras", managed: ["un alcance aprobado", "ejecución gestionada", "excepciones claramente señaladas", "un entregable revisado y utilizable"] },
    quality: { label: "Control de calidad", title: "La revisión forma parte de la entrega.", body: "Las comprobaciones dependen de las instrucciones. Cada tarea terminada recibe una revisión del operador antes de entregarse.", checks: ["cumplimiento de instrucciones", "validación de campos y formato", "revisión de duplicados y coherencia", "comprobación de fuentes cuando se acuerde", "revisión de excepciones", "revisión final del operador"], boundaryTitle: "Una promesa acotada", boundaryBody: "AfterDesk gestiona trabajo remoto que puede definirse y verificarse. El plazo depende del tamaño, acceso, complejidad y revisión. No se acepta criterio profesional de alto riesgo ni acceso no admitido a cuentas." },
    close: { title: "¿Hay un flujo que siempre termina al final de la lista?", body: "Describe el entregable. Confirmaremos el encaje, la revisión, el precio y el plazo antes de empezar.", primary: "Describe el resultado", secondary: "Hablar de trabajo recurrente" },
    footer: { work: "Trabaja con nosotros", academy: "Academia" },
    counters: {
      taskWord: ["tarea entregada", "tareas entregadas"],
      workerWord: ["especialista aprobado", "especialistas aprobados"],
      released: "liberados a los especialistas",
      toDate: "Hasta la fecha,",
      moneySaved: {
        label: "ahorrados vs. tarifa de mercado",
        timeLabel: "horas recuperadas",
        note: "Tarifa de mercado × horas en la tarea, menos lo que el cliente realmente pagó. Definida por categoría de tarea, con piso en cero, nunca una cifra modesta inflada.",
      },
    },
  },
  tl: {
    nav: { services: "Mga serbisyo", how: "Paano ito gumagana", about: "Tungkol sa amin", signIn: "Mag-sign in", portal: "Account ko" },
    hero: { eyebrow: "Managed back-office execution", line1: "Ipadala ang trabaho.", line2: "Tumanggap ng sinuring deliverable.", body: "Sina-scope at mina-manage ng AfterDesk ang malinaw na CRM, research, data, at document work. Kinukumpleto ito ng trained specialist at sinusuri ng AfterDesk operator bago i-deliver.", cta: "Ilarawan ang resulta", micro: "Ang one-off tasks ay sina-scope at pinepresyuhan muna. Kinukumpirma ang timing bago magsimula." },
    example: { label: "Halimbawang workflow", title: "CRM hygiene run", fieldInput: "INPUT", fieldRules: "RULES", fieldReturns: "IBABALIK", fieldReview: "REVIEW", qcStamp: "PASADO SA QC", input: "1,800-row CRM export", rules: "Pagsamahin ang duplicates · ayusin ang fields", returns: "Malinis na import · exception log", review: "Brief at field checks", status: "Handa nang i-deliver" },
    fit: { label: "Saan bagay ang AfterDesk", title: "Trabahong malinaw, nauulit, at nasusuri.", body: "Pinakamainam ang operational work na may malinaw na input, tiyak na deliverable, at mga detalyeng kailangan pa rin ng human judgment.", cards: [
      { title: "CRM cleanup at enrichment", body: "Ayusin ang fields, pagsamahin ang duplicates, saliksikin ang napagkasunduang data, at i-flag ang records na kailangang pagdesisyunan.", output: "Malinis na import + exception log" },
      { title: "Account research at qualification", body: "Magsaliksik ng companies ayon sa malinaw na criteria, panatilihin ang source links, at ihiwalay ang hindi tiyak.", output: "Structured research file" },
      { title: "Data at document operations", body: "Ihambing ang files, i-validate ang structured information, at maghanda ng reports mula sa ibinigay na materyal.", output: "Tapos na file + review notes" },
    ] },
    process: { label: "Paano ito gumagana", title: "Ikaw ang nagtatakda ng resulta. AfterDesk ang namamahala sa trabaho.", steps: [
      { title: "Ilarawan ang deliverable", body: "Sabihin kung ano ang dapat ibalik, aling rules ang mahalaga, at ano ang tamang resulta." },
      { title: "Aprubahan ang scope at presyo", body: "Kinukumpirma ng operator ang fit, access, timing, at isang fixed price para sa one-off task." },
      { title: "Kinukumpleto ang trabaho", body: "Kinukumpleto ng trained specialist ang scope habang mina-manage ng AfterDesk ang questions at exceptions." },
      { title: "Sinusuri ng quality control", body: "Tinitingnan ang mahahalagang detalye, completeness, at formatting bago i-deliver." },
    ] },
    comparison: { label: "Pagkatapos ng prompt", title: "Kayang gumawa ng sagot ng AI. Pero maaaring ikaw pa rin ang tatapos ng workflow.", body: "Makapangyarihan ang ChatGPT, Claude, at ibang AI tools. Para ang AfterDesk sa trabahong ayaw mong ikaw pa ang magpatakbo at magsuri ng bawat resulta.", directTitle: "Gamitin ang AI nang direkta kung kaya mong", direct: ["ibigay ang context at instructions", "patakbuhin ang steps at tools", "i-verify ang facts, fields, at format", "ayusin ang exceptions"], managedTitle: "Gamitin ang AfterDesk kung gusto mo ng", managed: ["isang approved scope", "managed execution", "malinaw na exceptions", "sinuri at magagamit na deliverable"] },
    quality: { label: "Quality control", title: "Bahagi ng delivery ang review.", body: "Nakadepende sa brief ang eksaktong checks. Bawat natapos na task ay sinusuri ng operator bago i-deliver.", checks: ["brief-compliance check", "field at format validation", "duplicate at consistency review", "source checks kapag napagkasunduan", "exception review", "final operator review"], boundaryTitle: "Malinaw na hangganan", boundaryBody: "Remote work lang na kayang i-scope at i-verify ang hinahawakan ng AfterDesk. Nakadepende ang timing sa laki, access, complexity, at review. Hindi tinatanggap ang high-risk professional judgment o unsupported account access." },
    close: { title: "May workflow bang laging napupunta sa dulo ng listahan?", body: "Ilarawan ang deliverable. Kukumpirmahin namin ang fit, review, presyo, at timing bago magsimula.", primary: "Ilarawan ang resulta", secondary: "Pag-usapan ang recurring work" },
    footer: { work: "Magtrabaho sa amin", academy: "Academy" },
    counters: {
      taskWord: ["task na naihatid", "mga task na naihatid"],
      workerWord: ["inaprubahang espesyalista", "mga inaprubahang espesyalista"],
      released: "napunta sa mga espesyalista",
      toDate: "Sa ngayon,",
      moneySaved: {
        label: "naipon vs presyo sa market",
        timeLabel: "oras na nabawi",
        note: "Presyo sa market × oras sa task, bawas sa aktwal na binayad ng kliyente. Naka-set per kategorya ng task, may floor na zero, hindi kailanman pinalaki ang isang maliit na numero.",
      },
    },
  },
};

const HOME_META: Record<SiteLang, { title: string; description: string }> = {
  en: {
    title: "Managed back-office execution for data, research and CRM work",
    description:
      "AfterDesk scopes, manages and reviews bounded CRM, research, data and document work. Approve the scope and price, then receive a checked, usable deliverable.",
  },
  fr: {
    title: "Exécution administrative gérée pour le CRM, la recherche et les données",
    description:
      "AfterDesk cadre, gère et vérifie des travaux délimités de CRM, recherche, données et documents. Approuvez le périmètre et le prix, puis recevez un livrable utilisable.",
  },
  es: {
    title: "Ejecución administrativa gestionada para CRM, investigación y datos",
    description:
      "AfterDesk define, gestiona y revisa trabajo acotado de CRM, investigación, datos y documentos. Aprueba el alcance y el precio, y recibe un entregable utilizable.",
  },
  tl: {
    title: "Managed back-office execution para sa CRM, research, at data work",
    description:
      "Sina-scope, mina-manage, at sinusuri ng AfterDesk ang bounded CRM, research, data, at document work. Aprubahan ang scope at presyo, saka tumanggap ng magagamit na deliverable.",
  },
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  // Metadata language comes from ?lang= ONLY, never the cookie — the bare "/"
  // URL is declared to crawlers as the EN/x-default rendering (langAlternates),
  // so a cookie-carrying visitor must not flip its indexed title. The PAGE
  // renders in the cookie language; the metadata describes the URL.
  const lang = clientLangOf(sp.lang);
  return { ...HOME_META[lang], alternates: langAlternates("/", sp.lang) };
}

const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "AfterDesk",
  url: SITE_URL,
  description: "Managed back-office execution for repeatable data, research and document workflows.",
});

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const user = await getSessionUser();
  if (user?.emailVerified && !(await arrivedFromInsideTheApp())) redirect(roleHome(user.role));

  const portal = user ? (user.emailVerified ? roleHome(user.role) : "/verify-email") : undefined;
  const sp = await searchParams;
  const jar = await cookies();
  const lang = clientLangOf(sp.lang ?? jar.get("ss-lang-client")?.value);
  const t = COPY[lang];

  return (
    <div lang={lang} className="min-h-screen overflow-x-clip bg-[#0A0B0D] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_JSONLD }} />

      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0A0B0D]/92 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="AfterDesk home"><Wordmark tone="paper" /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-6 text-[13px] font-medium md:flex">
            <Link href="/services" className="text-[#9AA1AB] transition-colors hover:text-white">{t.nav.services}</Link>
            <Link href="/how-it-works" className="text-[#9AA1AB] transition-colors hover:text-white">{t.nav.how}</Link>
            <Link href="/about" className="text-[#9AA1AB] transition-colors hover:text-white">{t.nav.about}</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitch path="/" current={lang} options={CLIENT_LANGS} tone="night" />
            <Link href={portal ?? "/login"} className="hidden min-h-11 items-center px-2 text-[13px] font-medium text-[#9AA1AB] hover:text-white sm:inline-flex">{portal ? t.nav.portal : t.nav.signIn}</Link>
            <Link href="/register" className="inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 text-[13px] font-semibold text-[#14161A] transition-transform hover:-translate-y-0.5 hover:bg-white">{t.hero.cta}</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/8">
          <div aria-hidden className="night-grid pointer-events-none absolute inset-0" />
          <div aria-hidden className="glow-dusk pointer-events-none absolute -left-32 -top-48 h-[620px] w-[760px] opacity-60" />
          <div className="relative mx-auto grid w-full max-w-[1120px] gap-10 px-6 pb-20 pt-8 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:py-28">
            <div>
              {/* md:hidden, not sm:hidden — the primary header nav only appears
                  at md, so this fallback must cover the 640-767px band too. The
                  sign-in link inside it hides at sm+ where the header already
                  shows its own. */}
              <div className="mb-8 flex items-center justify-between md:hidden">
                <MobileMenu tone="night" aboutLabel={t.nav.about} servicesLabel={COMPACT_SERVICES_LABEL[lang]} howLabel={COMPACT_HOW_LABEL[lang]} />
                <Link href={portal ?? "/login"} className="inline-flex min-h-11 items-center text-[12px] font-medium text-[#9AA1AB] sm:hidden">{portal ? t.nav.portal : t.nav.signIn}</Link>
              </div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8A9099]">{t.hero.eyebrow}</p>
              <h1 className="mt-5 max-w-[14ch] text-[clamp(2.7rem,6.5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
                <span className="block text-[#8A9099]">{t.hero.line1}</span>
                <span className="block text-white">{t.hero.line2}</span>
              </h1>
              <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.6] text-[#B1B6BE] sm:text-[19px]">{t.hero.body}</p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/register" className="inline-flex min-h-12 items-center rounded-full bg-[#F7F6F3] px-6 text-[15px] font-semibold text-[#14161A] transition-transform hover:-translate-y-0.5 hover:bg-white">{t.hero.cta}</Link>
                <Link href="/how-it-works" className="inline-flex min-h-12 items-center text-[14px] font-medium text-[#C9CDD3] underline decoration-white/25 underline-offset-4 hover:decoration-white">{t.nav.how}</Link>
              </div>
              <p className="mt-4 max-w-[62ch] font-mono text-[12px] leading-[1.6] text-[#767C86]">{t.hero.micro}</p>
            </div>

            <div className="rounded-xl border border-white/12 bg-[#111317] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.32)]">
              <div className="flex items-center justify-between border-b border-white/8 pb-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8A9099]">
                <span>{t.example.label}</span><span>WF-CRM-01</span>
              </div>
              <h2 className="mt-5 text-[20px] font-semibold text-white">{t.example.title}</h2>
              <dl className="mt-5 divide-y divide-white/8 text-[13px]">
                {[[t.example.fieldInput, t.example.input], [t.example.fieldRules, t.example.rules], [t.example.fieldReturns, t.example.returns], [t.example.fieldReview, t.example.review]].map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[72px_1fr] gap-4 py-3"><dt className="font-mono text-[10px] tracking-[0.1em] text-[#767C86]">{key}</dt><dd className="text-[#C9CDD3]">{value}</dd></div>
                ))}
              </dl>
              <div className="mt-5 flex items-center justify-between rounded-md border border-[#1E7F5C]/30 bg-[#1E7F5C]/10 px-4 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#79C7A8]">{t.example.qcStamp}</span><span className="text-[12px] text-[#C9CDD3]">{t.example.status}</span>
              </div>
            </div>
          </div>
          {/* Live counters — real DB aggregates, the proof at the moment of the
              promise. The component renders nothing until the ledger is deep
              enough to be meaningful (>=10 tasks, >=5 workers), so this stays
              armed rather than showing a fabricated number. */}
          <div className="relative mx-auto w-full max-w-[1120px] px-6 pb-14">
            <PublicCounters tone="night" variant="strip" copy={t.counters} />
          </div>
        </section>

        <section className="bg-[#F7F6F3] text-[#14161A]">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-20 sm:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#5B6069]">{t.fit.label}</p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_0.8fr] lg:items-end">
              <h2 className="max-w-[18ch] text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{t.fit.title}</h2>
              <p className="max-w-[56ch] text-[16px] leading-[1.65] text-[#5B6069]">{t.fit.body}</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-black/10 bg-black/10 lg:grid-cols-3">
              {t.fit.cards.map((card) => <article key={card.title} className="flex flex-col bg-white p-6"><h3 className="text-[18px] font-semibold">{card.title}</h3><p className="mt-3 flex-1 text-[14px] leading-[1.6] text-[#5B6069]">{card.body}</p><p className="mt-6 border-t border-black/8 pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5B6069]">{card.output}</p></article>)}
            </div>
          </div>
        </section>

        <section className="border-y border-white/8 bg-[#0A0B0D]">
          <div className="mx-auto w-full max-w-[1120px] px-6 py-20 sm:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8A9099]">{t.process.label}</p>
            <h2 className="mt-4 max-w-[18ch] text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{t.process.title}</h2>
            <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {t.process.steps.map((step, index) => <li key={step.title}><p className="font-mono text-[12px] tabular-nums text-[#767C86]">{String(index + 1).padStart(2, "0")}</p><h3 className="mt-3 text-[17px] font-semibold">{step.title}</h3><p className="mt-2 text-[14px] leading-[1.6] text-[#9AA1AB]">{step.body}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="bg-[#F7F6F3] text-[#14161A]">
          <div className="mx-auto w-full max-w-[1000px] px-6 py-20 sm:py-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#5B6069]">{t.comparison.label}</p>
            <h2 className="mt-4 max-w-[23ch] text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{t.comparison.title}</h2>
            <p className="mt-5 max-w-[68ch] text-[16px] leading-[1.65] text-[#5B6069]">{t.comparison.body}</p>
            <div className="mt-10 grid overflow-hidden rounded-xl border border-black/10 sm:grid-cols-2">
              {[[t.comparison.directTitle, t.comparison.direct, "bg-white"], [t.comparison.managedTitle, t.comparison.managed, "bg-[#14161A] text-white"]].map(([title, items, cls]) => (
                <article key={title as string} className={`p-6 sm:p-8 ${cls}`}><h3 className="text-[17px] font-semibold">{title as string}</h3><ul className="mt-5 space-y-3">{(items as string[]).map((item) => <li key={item} className="flex gap-3 text-[14px] leading-[1.5]"><span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E7F5C]" />{item}</li>)}</ul></article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-black/8 bg-white text-[#14161A]">
          <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1fr_0.9fr]">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#5B6069]">{t.quality.label}</p><h2 className="mt-4 max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{t.quality.title}</h2><p className="mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-[#5B6069]">{t.quality.body}</p></div>
            <div><ul className="grid gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 sm:grid-cols-2">{t.quality.checks.map((check) => <li key={check} className="flex min-h-20 items-center gap-3 bg-[#F7F6F3] p-4 text-[14px]"><span aria-hidden className="font-mono text-[#1E7F5C]">✓</span>{check}</li>)}</ul><div className="mt-6 border-l-2 border-[#14161A] pl-5"><h3 className="font-semibold">{t.quality.boundaryTitle}</h3><p className="mt-2 text-[13px] leading-[1.6] text-[#5B6069]">{t.quality.boundaryBody}</p></div></div>
          </div>
        </section>

        <section className="border-t border-white/8 bg-[#0A0B0D]">
          <div className="mx-auto w-full max-w-[900px] px-6 py-20 text-center sm:py-24"><h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.035em]">{t.close.title}</h2><p className="mx-auto mt-5 max-w-[58ch] text-[16px] leading-[1.65] text-[#9AA1AB]">{t.close.body}</p><div className="mt-8 flex flex-wrap justify-center gap-4"><Link href="/register" className="inline-flex min-h-12 items-center rounded-full bg-[#F7F6F3] px-6 text-[15px] font-semibold text-[#14161A] hover:bg-white">{t.close.primary}</Link><Link href="/services/standing-capacity" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-6 text-[15px] font-semibold text-white hover:border-white/40">{t.close.secondary}</Link></div></div>
        </section>
      </main>

      <footer className="border-t border-white/8 bg-[#0A0B0D]">
        <div className="mx-auto grid w-full max-w-[1120px] gap-5 px-6 py-8 sm:grid-cols-[auto_1fr] sm:items-center"><Wordmark tone="paper" /><nav aria-label="Company" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] sm:justify-end"><Link href="/about" className="inline-flex min-h-11 items-center text-[#9AA1AB] hover:text-white">{t.nav.about}</Link><Link href="/how-it-works" className="inline-flex min-h-11 items-center text-[#9AA1AB] hover:text-white">{t.nav.how}</Link><Link href="/services" className="inline-flex min-h-11 items-center text-[#9AA1AB] hover:text-white">{t.nav.services}</Link><Link href="/workers" className="inline-flex min-h-11 items-center text-[#9AA1AB] hover:text-white">{t.footer.work}</Link><Link href="/academy" className="inline-flex min-h-11 items-center text-[#9AA1AB] hover:text-white">{t.footer.academy}</Link></nav><div className="text-[12px] sm:col-span-2 sm:border-t sm:border-white/8 sm:pt-4"><TrustLinks lang={lang} tone="night" /></div></div>
      </footer>
    </div>
  );
}
