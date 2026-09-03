import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { clientLangOf } from "@/lib/i18n/client";
import { publicConstructionOffer } from "@/lib/construction-operating-assistant-r34/public-offer";
import { TEXTASSIST_RELEASE_BOUNDARY } from "@/lib/textassist/public-copy";
import styles from "./construction.module.css";

const CONSTRUCTION_LANGS = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

type ConstructionPageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

const COPY = {
  fr: {
    navProduct: "Comment ça marche", navUses: "Ce que ça règle", access: "Demander mon accès",
    eyebrow: "L’ASSISTANT IA DES PETITS ENTREPRENEURS", headlineA: "Gère tes chantiers.", headlineB: "Par texto ou par appel.",
    promise: "Ajoute un rendez-vous, prépare un texto, organise un suivi ou demande ce qui manque avant de facturer. ENDVERA garde le bon chantier à jour et te demande ton accord avant d’agir.",
    primaryCta: "Voir un exemple concret", secondaryCta: "Voir ce qu’il peut gérer",
    trust: ["Contacts, calendrier et suivis au même endroit", "Tu approuves avant chaque envoi", "Un humain intervient si ça bloque"],
    liveLabel: "CHANTIER LAVAL", job: "Rénovation Laval", demoBoundary: "DÉMONSTRATION DU PRODUIT · AUCUN MESSAGE RÉEL N’EST ENVOYÉ",
    userMessage: "Ajoute Marc au calendrier demain à 8 h pour Laval et prépare-lui un texto.", assistantMessage: "Le rendez-vous est ajouté au chantier Laval. Le texto pour Marc est prêt à vérifier.",
    prepared: "À VÉRIFIER AVANT ENVOI", recipient: "Destinataire · Marc · Fournisseur · SMS", body: "Bonjour Marc, l’équipe sera au chantier de Laval demain à 8 h.", approve: "Approuver l’envoi",
    tomorrow: "RENDEZ-VOUS AJOUTÉ · DEMAIN À 8 H", calendarItem: "Arrivée de l’équipe", project: "Chantier · Rénovation Laval · Contact · Marc", memoryLabel: "CE QU’ENDVERA RETIENT",
    memoryRows: ["Rendez-vous · demain à 8 h", "Texto à Marc · en attente d’approbation", "Photo de fin · toujours manquante"],
    flowLabel: "TU DEMANDES. ENDVERA ORGANISE. TU DÉCIDES.", flow: ["Tu textes ou tu appelles", "Il retrouve le bon chantier", "Il prépare la suite", "Tu vérifies et approuves"],
    dayEyebrow: "CONÇU POUR TA VRAIE JOURNÉE", dayTitle: "Tes rendez-vous, tes suivis et tes dossiers prêts à facturer — dans une seule conversation.",
    dayBody: "Au lieu de fouiller dans tes textos, ton calendrier et tes notes, demande simplement à ENDVERA. Il retrouve le bon chantier et organise la prochaine étape.",
    situations: [
      { number: "01", title: "Planifier un rendez-vous", body: "Dis : « Ajoute Marc mardi à 14 h. » ENDVERA confirme le chantier et l’heure avant de l’ajouter." },
      { number: "02", title: "Aviser la bonne personne", body: "Demande un texto pour un client, un employé ou un fournisseur. Vérifie le destinataire et le message, puis approuve." },
      { number: "03", title: "Préparer la facturation", body: "Vois les photos, les approbations et les documents manquants avant d’envoyer une facture." },
    ],
    capabilityEyebrow: "PLUS QU’UN CHATBOT", capabilityTitle: "Il ne fait pas que répondre. Il garde chaque chantier à jour.",
    capabilityBody: "Contacts, rendez-vous, messages, photos, approbations et prochaines étapes restent ensemble. Tu reprends toujours là où tu étais rendu.",
    outcomes: [
      { title: "Tout reste dans le bon chantier", body: "Les contacts, rendez-vous, messages, preuves et décisions ne se mélangent pas entre tes jobs." },
      { title: "Tu sais ce qui bloque", body: "ENDVERA montre ce qui manque, qui doit s’en occuper et quelle est la prochaine étape." },
      { title: "Chaque message est prêt à vérifier", body: "Tu vois le destinataire, le canal et le texte complet avant d’autoriser l’envoi." },
      { title: "Un humain reprend au besoin", body: "Si une demande est ambiguë ou risquée, une personne reçoit le dossier complet sans te faire tout recommencer." },
    ],
    walkthroughEyebrow: "DE LA DEMANDE À L’ACTION", walkthroughTitle: "Demande une fois. ENDVERA garde la suite.",
    availableLabel: "Tu n’as plus à tout répéter chaque fois.",
    capabilities: ["Mémoire par chantier", "Calendrier et suivis", "Dossiers prêts à facturer", "Messages à approuver", "Appui humain", "Accès selon le rôle"],
    steps: [
      { title: "Tu demandes avec tes mots", body: "Par texto, appel ou dans l’application, tu dis simplement ce que tu veux faire." },
      { title: "ENDVERA trouve le bon chantier", body: "Il relie ta demande au bon projet, au bon contact et à ce qui est déjà prévu." },
      { title: "Il prépare la bonne action", body: "Un rendez-vous, un rappel, une demande de photo ou un message est préparé." },
      { title: "Tu vérifies avant que ça parte", body: "Tu vois le destinataire, l’heure, le canal et le texte complet avant d’approuver." },
      { title: "Le chantier reste à jour", body: "L’action, la preuve et la prochaine étape sont conservées pour la prochaine fois." },
    ],
    backupEyebrow: "QUAND ENDVERA N’EST PAS CERTAIN", humanLabel: "HUMAIN", humanBackupTitle: "S’il n’est pas certain, il n’invente pas.",
    humanBackupBody: "ENDVERA met l’action en attente et transmet le chantier, la demande et les preuves à une personne. Elle peut reprendre sans que tu aies à tout réexpliquer.",
    authorityEyebrow: "TU RESTES EN CONTRÔLE", trustTitle: "Rien ne part sans ton accord.",
    trustBody: "ENDVERA peut consulter ce que tu lui permets et préparer la prochaine action. Avant d’envoyer un texto, de déplacer un rendez-vous ou de toucher à une facture, il te montre exactement ce qu’il va faire.",
    permissions: ["Peut consulter ton calendrier", "Peut préparer un texto", "Ne peut pas envoyer sans ton approbation"],
    readyTitle: "Arrête de gérer tes chantiers de mémoire.",
    readyBody: "Découvre comment une simple demande devient un rendez-vous, un suivi ou un dossier prêt à facturer.",
    footerProduct: "Produit", footerCompany: "Confiance", honestLabel: "Disponibilité actuelle",
    honestStatus: "Version locale de démonstration. Les vrais textos, appels et calendriers connectés ne sont pas encore activés.",
    copyright: "ENDVERA · L’assistant IA conçu au Québec pour les entrepreneurs en construction.",
  },
  en: {
    navProduct: "How it works", navUses: "What it handles", access: "Request private access",
    eyebrow: "THE AI ASSISTANT FOR SMALL CONTRACTORS", headlineA: "Run your jobs.", headlineB: "By text or phone.",
    promise: "Add an appointment, prepare a message, organize a follow-up or ask what is missing before you invoice. ENDVERA keeps the right job up to date and asks for your approval before it acts.",
    primaryCta: "See a real example", secondaryCta: "See what it handles",
    trust: ["Contacts, schedule and follow-ups in one place", "You approve every message", "Human backup when needed"],
    liveLabel: "LAVAL JOB", job: "Laval Renovation", demoBoundary: "PRODUCT DEMO · NO LIVE MESSAGE IS SENT",
    userMessage: "Add Marc to the calendar tomorrow at 8 for the Laval job and draft a text for him.", assistantMessage: "The appointment has been added to the Laval job. The message to Marc is ready to review.",
    prepared: "READY FOR YOUR REVIEW", recipient: "Recipient · Marc · Supplier · SMS", body: "Hi Marc, the crew will be at the Laval job tomorrow at 8:00 a.m.", approve: "Approve message",
    tomorrow: "APPOINTMENT ADDED · TOMORROW AT 8:00 A.M.", calendarItem: "Crew arrival", project: "Job · Laval Renovation · Contact · Marc", memoryLabel: "WHAT ENDVERA REMEMBERS",
    memoryRows: ["Appointment · tomorrow at 8:00 a.m.", "Text to Marc · awaiting approval", "Completion photo · still missing"],
    flowLabel: "YOU ASK. ENDVERA ORGANIZES. YOU DECIDE.", flow: ["Text or call", "It finds the right job", "It prepares the next step", "You review and approve"],
    dayEyebrow: "BUILT FOR A CONTRACTOR’S REAL DAY", dayTitle: "Appointments, follow-ups and invoice-ready job files — in one conversation.",
    dayBody: "Instead of searching through texts, calendars and notes, just ask ENDVERA. It finds the right job and organizes the next step.",
    situations: [
      { number: "01", title: "Schedule an appointment", body: "Say, “Add Marc Tuesday at 2 p.m.” ENDVERA confirms the job and time before adding it." },
      { number: "02", title: "Notify the right person", body: "Ask for a text to a customer, worker or supplier. Review the recipient and message, then approve it." },
      { number: "03", title: "Get ready to invoice", body: "See which photos, approvals and documents are still missing before you send an invoice." },
    ],
    capabilityEyebrow: "MORE THAN A CHATBOT", capabilityTitle: "It does more than answer. It keeps every job up to date.",
    capabilityBody: "Contacts, appointments, messages, photos, approvals and next steps stay together. You always pick up where you left off.",
    outcomes: [
      { title: "Everything stays with the right job", body: "Contacts, appointments, messages, proof and decisions never get mixed up between jobs." },
      { title: "You know what is holding things up", body: "ENDVERA shows what is missing, who needs to handle it and what happens next." },
      { title: "Every message is ready to review", body: "See the recipient, channel and full message before you approve it." },
      { title: "A human steps in when needed", body: "If a request is unclear or risky, a person gets the full job record so you do not have to start over." },
    ],
    walkthroughEyebrow: "FROM REQUEST TO FOLLOW-THROUGH", walkthroughTitle: "Ask once. ENDVERA carries it forward.",
    availableLabel: "You do not have to explain the same job again.",
    capabilities: ["Job memory", "Scheduling and follow-ups", "Invoice-ready checks", "Messages ready for approval", "Human backup", "Role-based access"],
    steps: [
      { title: "Ask in your own words", body: "By text, phone or in the app, simply say what you need done." },
      { title: "ENDVERA finds the right job", body: "It connects your request to the right job, contact and existing schedule." },
      { title: "It prepares the right action", body: "An appointment, reminder, photo request or message is prepared." },
      { title: "Review before anything goes out", body: "See the recipient, time, channel and full message before you approve it." },
      { title: "The job stays up to date", body: "The action, proof and next step are saved for your next conversation." },
    ],
    backupEyebrow: "WHEN ENDVERA IS NOT SURE", humanLabel: "HUMAN", humanBackupTitle: "If it is not sure, it does not guess.",
    humanBackupBody: "ENDVERA pauses the action and gives the job, request and proof to a person. They can step in without making you explain everything again.",
    authorityEyebrow: "YOU STAY IN CONTROL", trustTitle: "Nothing goes out without your approval.",
    trustBody: "ENDVERA can view what you allow and prepare the next action. Before it sends a text, moves an appointment or touches an invoice, it shows you exactly what it will do.",
    permissions: ["Can view your calendar", "Can prepare a text", "Cannot send without your approval"],
    readyTitle: "Stop running your jobs from memory.",
    readyBody: "See how one request becomes an appointment, a follow-up or an invoice-ready job file.",
    footerProduct: "Product", footerCompany: "Trust and safety", honestLabel: "Available today",
    honestStatus: "Local product demo. Live texting, calling and connected calendars are not enabled yet.",
    copyright: "ENDVERA · The AI assistant built in Quebec for small construction contractors.",
  },
} as const;

function CheckIcon() {
  return <svg aria-hidden viewBox="0 0 20 20" className={styles.checkIcon}><path d="m4.2 10.4 3.4 3.4 8.2-8.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden viewBox="0 0 20 20" className={styles.arrowIcon}><path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" /></svg>;
}

function PhoneSignal() {
  return <svg aria-hidden viewBox="0 0 18 18" className={styles.phoneSignal}><path d="M3 12.5V15h2.5M3.7 14.3a7.6 7.6 0 0 0 10.6-10.6M5.9 12.1a4.5 4.5 0 0 0 6.2-6.2M8.1 9.9a1.4 1.4 0 0 0 1.8-1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" /></svg>;
}

async function resolveConstructionLanguage(searchParams: ConstructionPageProps["searchParams"]) {
  const sp = await searchParams;
  const queryLang = Array.isArray(sp.lang) ? sp.lang[0] : sp.lang;
  const raw = queryLang ?? (await cookies()).get("ss-lang-client")?.value;
  const requestedLang = clientLangOf(raw);
  return requestedLang === "fr" ? "fr" as const : "en" as const;
}

export async function generateMetadata({ searchParams }: ConstructionPageProps): Promise<Metadata> {
  const lang = await resolveConstructionLanguage(searchParams);
  return lang === "fr"
    ? {
        title: "ENDVERA Construction — l’assistant IA des entrepreneurs",
        description: "Gère tes rendez-vous, textos, suivis et dossiers à facturer par texto, appel ou application.",
      }
    : {
        title: "ENDVERA Construction — the AI assistant for contractors",
        description: "Manage appointments, messages, follow-ups and invoice-ready job files by text, phone or app.",
      };
}

export default async function ConstructionPublicPage({ searchParams }: ConstructionPageProps) {
  const lang = await resolveConstructionLanguage(searchParams);
  const french = lang === "fr";
  const locale = french ? "fr-CA" as const : "en-CA" as const;
  const offer = publicConstructionOffer(locale);
  const copy = COPY[french ? "fr" : "en"];
  const noExternalTransport = !TEXTASSIST_RELEASE_BOUNDARY.providerObserved;

  return (
    <main className={styles.page}>
      <a className={styles.skipLink} href="#main-content">{french ? "Aller au contenu" : "Skip to content"}</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label={french ? "Accueil ENDVERA" : "ENDVERA home"} className={styles.brandLink}>
            <Wordmark tone="paper" plate /><span className={styles.brandDivision}>CONSTRUCTION</span>
          </Link>
          <nav className={styles.desktopNav} aria-label={french ? "Navigation principale" : "Primary navigation"}>
            <a href="#demo">{copy.navProduct}</a><a href="#uses">{copy.navUses}</a><a href="#control">{french ? "Contrôle" : "Control"}</a>
          </nav>
          <div className={styles.headerActions}>
            <LangSwitch path="/construction" current={lang} options={[...CONSTRUCTION_LANGS]} tone="onyx" />
            <Link href="/register" className={styles.headerCta}>{copy.access}<ArrowIcon /></Link>
          </div>
        </div>
      </header>

      <div id="main-content">
        <section className={styles.hero} aria-labelledby="construction-title">
          <div className={styles.heroGrid} aria-hidden /><div className={styles.heroGlow} aria-hidden />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span />{copy.eyebrow}</p>
              <h1 id="construction-title" className={styles.heroTitle}><span>{copy.headlineA}</span><strong>{copy.headlineB}</strong></h1>
              <p className={styles.heroPromise}>{copy.promise}</p>
              <div className={styles.heroActions}>
                <a href="#demo" className={styles.primaryCta}>{copy.primaryCta}<ArrowIcon /></a>
                <a href="#uses" className={styles.secondaryCta}>{copy.secondaryCta}</a>
              </div>
              <ul className={styles.trustList} aria-label={french ? "Principes du produit" : "Product principles"}>
                {copy.trust.map((item) => <li key={item}><CheckIcon />{item}</li>)}
              </ul>
            </div>

            <div id="demo" className={styles.productScene} aria-label={french ? "Aperçu du produit ENDVERA" : "ENDVERA product preview"}>
              <div className={styles.sceneHalo} aria-hidden />
              <article className={styles.phone}>
                <div className={styles.phoneTop} aria-hidden><span>9:41</span><span className={styles.dynamicIsland} /><span>5G</span></div>
                <div className={styles.phoneHeader}>
                  <span className={styles.assistantMark}>N</span>
                  <span><b>ENDVERA</b><small><i />{copy.liveLabel}</small></span>
                  <span className={styles.signal}><PhoneSignal /></span>
                </div>
                <div className={styles.jobPill}><span>{copy.job}</span><b>LAVAL-001</b></div>
                <div className={styles.conversation}>
                  <p className={styles.userBubble}>{copy.userMessage}</p>
                  <div className={styles.assistantBubble}><span className={styles.miniMark}>N</span><p>{copy.assistantMessage}</p></div>
                  <div className={styles.approvalCard}>
                    <span className={styles.cardLabel}>{copy.prepared}</span><b>{copy.recipient}</b><p>“{copy.body}”</p>
                    <span className={styles.fakeButton} aria-hidden>{copy.approve}<ArrowIcon /></span>
                  </div>
                </div>
                <div className={styles.composer} aria-hidden><span>＋</span><p>{french ? "Demande quelque chose…" : "Ask for something…"}</p><b>↑</b></div>
              </article>

              <article className={styles.calendarCard}>
                <div className={styles.previewHeading}><span className={styles.calendarGlyph}>17</span><p><small>{copy.tomorrow}</small><b>{copy.calendarItem}</b></p><i /></div>
                <p className={styles.previewMeta}>{copy.project}</p>
              </article>
              <article className={styles.memoryCard}>
                <p className={styles.memoryHeading}><span>{copy.memoryLabel}</span><b>03</b></p>
                <ul>{copy.memoryRows.map((row, index) => <li key={row}><span className={index === 2 ? styles.warningDot : styles.doneDot} />{row}</li>)}</ul>
              </article>
              <p className={styles.demoBoundary}>{copy.demoBoundary}</p>
            </div>
          </div>
        </section>

        <section className={styles.flowStrip} aria-label={copy.flowLabel}>
          <div className={styles.flowInner}><p>{copy.flowLabel}</p><ol>{copy.flow.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}{index < copy.flow.length - 1 && <ArrowIcon />}</li>)}</ol></div>
        </section>

        <section id="uses" className={styles.daySection}>
          <div className={styles.sectionIntro}><p className={styles.darkEyebrow}>{copy.dayEyebrow}</p><h2>{copy.dayTitle}</h2><p>{copy.dayBody}</p></div>
          <div className={styles.situationGrid}>
            {copy.situations.map((situation) => <article key={situation.number} className={styles.situationCard}><span>{situation.number}</span><h3>{situation.title}</h3><p>{situation.body}</p></article>)}
          </div>
        </section>

        <section className={styles.capabilitySection}>
          <div className={styles.capabilityIntro}><p className={styles.eyebrow}><span />{copy.capabilityEyebrow}</p><h2>{copy.capabilityTitle}</h2><p>{copy.capabilityBody}</p></div>
          <div className={styles.capabilityList}>
            {copy.outcomes.map((outcome, index) => <article key={outcome.title} className={styles.capabilityRow}><span>{String(index + 1).padStart(2, "0")}</span><h3>{outcome.title}</h3><p>{outcome.body}</p></article>)}
          </div>
        </section>

        <section className={styles.walkthroughSection}>
          <div className={styles.walkthroughInner}>
            <div className={styles.walkthroughIntro}>
              <p className={styles.darkEyebrow}>{copy.walkthroughEyebrow}</p><h2>{copy.walkthroughTitle}</h2><p>{copy.availableLabel}</p>
              <div className={styles.capabilityChips}>{copy.capabilities.map((capability) => <span key={capability}><CheckIcon />{capability}</span>)}</div>
            </div>
            <ol className={styles.stepList}>
              {copy.steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section id="control" className={styles.controlSection}>
          <article className={styles.controlCard}>
            <p className={styles.eyebrow}><span />{copy.backupEyebrow}</p><h2>{copy.humanBackupTitle}</h2><p>{copy.humanBackupBody}</p>
            <div className={styles.handoffDiagram} aria-hidden><span>AI</span><i /><strong>{copy.humanLabel}</strong><i /><span>✓</span></div>
          </article>
          <article className={`${styles.controlCard} ${styles.authorityCard}`}>
            <p className={styles.eyebrow}><span />{copy.authorityEyebrow}</p><h2>{copy.trustTitle}</h2><p>{copy.trustBody}</p>
            <div className={styles.permissionPreview}><span><CheckIcon />{copy.permissions[0]}</span><span><CheckIcon />{copy.permissions[1]}</span><span className={styles.locked}>× {copy.permissions[2]}</span></div>
          </article>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.finalGrid} aria-hidden />
          <div><p className={styles.eyebrow}><span />ENDVERA CONSTRUCTION</p><h2>{copy.readyTitle}</h2><p>{copy.readyBody}</p></div>
          <Link href="/register" className={styles.primaryCta}>{copy.access}<ArrowIcon /></Link>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div><Link href="/" aria-label={french ? "Accueil ENDVERA" : "ENDVERA home"}><Wordmark tone="paper" plate /></Link><p>{copy.copyright}</p></div>
          <nav aria-label={copy.footerProduct}><b>{copy.footerProduct}</b><Link href="/textassist">TextAssist</Link><Link href="/register">{copy.access}</Link><Link href="/">ENDVERA</Link></nav>
          <nav aria-label={copy.footerCompany}><b>{copy.footerCompany}</b><Link href="/privacy">{french ? "Confidentialité" : "Privacy"}</Link><Link href="/account-deletion">{french ? "Suppression du compte" : "Account deletion"}</Link><Link href="/construction/support">{french ? "Soutien" : "Support"}</Link></nav>
        </div>
        <details className={styles.availability}><summary>{copy.honestLabel}</summary><p>{noExternalTransport ? copy.honestStatus : offer.unavailable[0]}</p></details>
      </footer>
    </main>
  );
}
