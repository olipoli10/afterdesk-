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
    eyebrow: "L’ASSISTANT IA DES PETITS ENTREPRENEURS", headlineA: "Notre cible : gérer tes chantiers.", headlineB: "À terme, par texto ou appel.",
    promise: "Notre vision : ajouter un rendez-vous, préparer un texto, organiser un suivi ou vérifier ce qui manque avant de facturer, avec le bon chantier et ton accord avant d’agir. Voici le parcours visé.",
    primaryCta: "Voir une illustration", secondaryCta: "Voir le parcours visé",
    trust: ["Objectif : contacts, calendrier et suivis au même endroit", "Ton accord avant tout envoi dans le parcours visé", "Dans le parcours visé, un dossier serait préparé pour une revue humaine"],
    liveLabel: "CHANTIER FICTIF · LAVAL", job: "Rénovation Laval", demoBoundary: "ILLUSTRATION DU PARCOURS VISÉ · NON EXÉCUTÉ · AUCUN ENVOI RÉEL",
    userMessage: "Ajoute Marc au calendrier demain à 8 h pour Laval et prépare-lui un texto.", assistantMessage: "Résultat visé, non exécuté : un rendez-vous pour Laval et un brouillon pour Marc, à vérifier avant toute action.",
    prepared: "BROUILLON ILLUSTRATIF", recipient: "Destinataire fictif · Marc · Fournisseur · SMS", body: "Bonjour Marc, l’équipe sera au chantier de Laval demain à 8 h.", approve: "Illustration — aucun envoi",
    tomorrow: "RENDEZ-VOUS ILLUSTRÉ · NON AJOUTÉ", calendarItem: "Arrivée de l’équipe", project: "Chantier fictif · Rénovation Laval · Contact fictif · Marc", memoryLabel: "MÉMOIRE ILLUSTRÉE · NON ENREGISTRÉE",
    memoryRows: ["Rendez-vous illustré · demain à 8 h", "Texto illustré · non envoyé", "Photo manquante · exemple fictif"],
    flowLabel: "PARCOURS VISÉ · AUCUNE ACTION EXÉCUTÉE", flow: ["À terme : texto ou appel", "Le chantier serait retrouvé", "La suite serait préparée", "Tu vérifierais avant d’approuver"],
    dayEyebrow: "OBJECTIF POUR TA JOURNÉE", dayTitle: "La cible : tes rendez-vous, tes suivis et tes dossiers dans une seule conversation.",
    dayBody: "Le parcours visé réunirait tes demandes et la prochaine étape du bon chantier. La démonstration actuelle illustre ce fonctionnement; elle n’exécute pas ces actions.",
    situations: [
      { number: "01", title: "Consulter le calendrier de demain", body: "Exemple simple reconnu localement : « Qu’est-ce que j’ai demain? » Cette phrase demande une consultation du calendrier local; elle ne crée aucun rendez-vous et ne prouve aucune connexion externe." },
      { number: "02", title: "Objectif : aviser la bonne personne", body: "Dans le parcours visé, tu demanderais un texto pour un client, un employé ou un fournisseur, puis tu vérifierais le destinataire et le message avant approbation. Cette illustration n’envoie rien." },
      { number: "03", title: "Objectif : préparer la facturation", body: "Le parcours visé montrerait les photos, les approbations et les documents manquants avant facturation. Cette démonstration ne crée ni n’envoie de facture." },
    ],
    capabilityEyebrow: "LE PRODUIT VISÉ", capabilityTitle: "Notre objectif : garder chaque chantier à jour.",
    capabilityBody: "À terme, contacts, rendez-vous, messages, photos, approbations et prochaines étapes seraient réunis. Les actions illustrées sur cette page ne sont pas enregistrées.",
    outcomes: [
      { title: "Objectif : le bon dossier pour chaque chantier", body: "Dans le produit visé, contacts, rendez-vous, messages, preuves et décisions resteraient liés au bon chantier." },
      { title: "Objectif : savoir ce qui bloque", body: "ENDVERA montrerait ce qui manque et la prochaine étape proposée. La démonstration n’attribue aucun travail réel." },
      { title: "Objectif : vérifier chaque message", body: "Dans le parcours visé, tu verrais le destinataire, le canal et le texte avant toute autorisation. Le brouillon illustré ne peut pas être envoyé." },
      { title: "Objectif : un dossier pour la revue humaine", body: "Dans le parcours visé, un dossier serait préparé pour une revue humaine si une demande est ambiguë ou risquée. Cette illustration ne prépare aucun dossier réel et ne confirme ni attribution ni réception par une personne." },
    ],
    walkthroughEyebrow: "PARCOURS VISÉ · NON EXÉCUTÉ", walkthroughTitle: "Ce que nous voulons rendre possible.",
    availableLabel: "La démonstration actuelle ne reçoit aucun texto ni appel réel; elle n’envoie aucun message, ne modifie aucun calendrier et n’enregistre aucune action accomplie.",
    capabilities: ["Mémoire visée par chantier", "Calendrier illustré", "Vérifications visées avant facturation", "Brouillons illustratifs", "Dossier de revue humaine", "Accès selon le rôle"],
    steps: [
      { title: "Tu demanderais avec tes mots", body: "À terme, tu pourrais décrire ta demande par texto, appel ou dans l’application. Ici, la conversation est fictive et aucune demande réelle n’est reçue." },
      { title: "ENDVERA retrouverait le bon chantier", body: "Dans le parcours visé, il relierait ta demande au projet, au contact et au calendrier pertinents, ou demanderait une clarification." },
      { title: "Il proposerait les actions", body: "Dans le parcours visé, rendez-vous, rappel, demande de photo ou message seraient préparés pour vérification. Ils ne sont pas exécutés ici." },
      { title: "Tu vérifierais avant toute action", body: "Le parcours visé montrerait le destinataire, l’heure, le canal et le texte avant approbation. Le bouton de cette illustration reste désactivé." },
      { title: "Le dossier pourrait être mis à jour", body: "Après une action réelle vérifiée, le produit visé en conserverait la preuve et la prochaine étape. Cette illustration n’enregistre aucune action accomplie." },
    ],
    backupEyebrow: "QUAND ENDVERA N’EST PAS CERTAIN", humanLabel: "DOSSIER", humanBackupTitle: "S’il n’est pas certain, il n’invente pas.",
    humanBackupBody: "Dans le parcours visé, un dossier serait préparé avec le chantier, la demande et les preuves pour une revue humaine. Aucun dossier réel n’est préparé par cette page. Aucune réception ni prise en charge humaine n’est confirmée. Le soutien de production n’est pas activé; une personne devrait être désignée pour reprendre un dossier réel.",
    authorityEyebrow: "TU RESTES EN CONTRÔLE", trustTitle: "Ici, rien ne part. À terme, ton accord serait requis.",
    trustBody: "Dans le parcours visé, ENDVERA montrerait toute proposition de texto, de modification de rendez-vous ou de facture avant ton accord. Les permissions et les contrôles déterministes resteraient nécessaires; cette démonstration ne fait aucun de ces changements.",
    permissions: ["Calendrier de démonstration", "Brouillon à vérifier", "Aucun envoi réel, même après approbation"],
    readyTitle: "Découvre le parcours que nous préparons.",
    readyBody: "Une illustration de ce qu’une demande pourrait devenir : un rendez-vous, un suivi ou un dossier à vérifier, sans action exécutée dans cette démonstration.",
    footerProduct: "Produit", footerCompany: "Confiance", honestLabel: "Disponibilité actuelle",
    honestStatus: "Version locale de démonstration. Les vrais textos, appels et calendriers connectés ne sont pas encore activés.",
    copyright: "ENDVERA · L’assistant IA conçu au Québec pour les entrepreneurs en construction.",
  },
  en: {
    navProduct: "How it works", navUses: "What it handles", access: "Request private access",
    eyebrow: "THE AI ASSISTANT FOR SMALL CONTRACTORS", headlineA: "Our goal: manage your jobs.", headlineB: "Eventually, by text or phone.",
    promise: "Our vision: add an appointment, prepare a message, organize a follow-up or check what is missing before invoicing, with the right job and your approval before acting. This is the target workflow.",
    primaryCta: "See an illustration", secondaryCta: "See the target workflow",
    trust: ["Goal: contacts, schedule and follow-ups in one place", "Your approval before sending in the target workflow", "In the target workflow, a file would be prepared for human review"],
    liveLabel: "FICTIONAL LAVAL JOB", job: "Laval Renovation", demoBoundary: "TARGET WORKFLOW ILLUSTRATION · NOT EXECUTED · NO LIVE SENDING",
    userMessage: "Add Marc to the calendar tomorrow at 8 for the Laval job and draft a text for him.", assistantMessage: "Target result, not executed: an appointment for Laval and a draft for Marc, to review before any action.",
    prepared: "ILLUSTRATIVE DRAFT", recipient: "Fictional recipient · Marc · Supplier · SMS", body: "Hi Marc, the crew will be at the Laval job tomorrow at 8:00 a.m.", approve: "Illustration — no sending",
    tomorrow: "ILLUSTRATIVE APPOINTMENT · NOT ADDED", calendarItem: "Crew arrival", project: "Fictional job · Laval Renovation · Fictional contact · Marc", memoryLabel: "ILLUSTRATIVE MEMORY · NOT SAVED",
    memoryRows: ["Illustrative appointment · tomorrow at 8:00 a.m.", "Illustrative text · not sent", "Missing photo · fictional example"],
    flowLabel: "TARGET WORKFLOW · NO ACTION EXECUTED", flow: ["Eventually: text or phone", "The job would be identified", "Next steps would be prepared", "You would review before approval"],
    dayEyebrow: "THE GOAL FOR YOUR WORKDAY", dayTitle: "The goal: appointments, follow-ups and job files in one conversation.",
    dayBody: "The target workflow would connect your requests with the next step for the right job. The current demo illustrates this workflow; it does not execute those actions.",
    situations: [
      { number: "01", title: "Check tomorrow’s calendar", body: "A simple phrase recognized locally: “What do I have tomorrow?” This requests a local calendar lookup; it does not create an appointment or prove an external connection." },
      { number: "02", title: "Goal: notify the right person", body: "In the target workflow, you would request a text for a customer, worker or supplier, then review the recipient and message before approval. This illustration sends nothing." },
      { number: "03", title: "Goal: prepare for invoicing", body: "The target workflow would show missing photos, approvals and documents before invoicing. This demo does not create or send invoices." },
    ],
    capabilityEyebrow: "THE TARGET PRODUCT", capabilityTitle: "Our goal: keep each job up to date.",
    capabilityBody: "Eventually, contacts, appointments, messages, photos, approvals and next steps would stay together. Actions illustrated on this page are not saved.",
    outcomes: [
      { title: "Goal: the right file for each job", body: "In the target product, contacts, appointments, messages, proof and decisions would remain linked to the right job." },
      { title: "Goal: know what is holding things up", body: "ENDVERA would show what is missing and the proposed next step. The demo assigns no real work." },
      { title: "Goal: review each message", body: "In the target workflow, you would see the recipient, channel and full text before authorization. The illustrated draft cannot be sent." },
      { title: "Goal: a file for human review", body: "In the target workflow, a file would be prepared for human review if a request is unclear or risky. This illustration prepares no real file and confirms neither assignment nor receipt by a person." },
    ],
    walkthroughEyebrow: "TARGET WORKFLOW · NOT EXECUTED", walkthroughTitle: "What we aim to make possible.",
    availableLabel: "The current demo does not receive live texts or calls; it does not send messages, change calendars or save completed actions.",
    capabilities: ["Intended job memory", "Illustrated calendar", "Intended pre-invoice checks", "Illustrative drafts", "Human-review file", "Role-based access"],
    steps: [
      { title: "You would ask in your own words", body: "Eventually, you could describe your request by text, phone or in the app. This conversation is fictional and receives no real request." },
      { title: "ENDVERA would identify the right job", body: "In the target workflow, it would link the request to the relevant job, contact and calendar, or ask for clarification." },
      { title: "It would propose actions", body: "In the target workflow, appointments, reminders, photo requests or messages would be prepared for review. They are not executed here." },
      { title: "You would review before any action", body: "The target workflow would show the recipient, time, channel and text before approval. This illustration’s button remains disabled." },
      { title: "The job file could be updated", body: "After a verified real action, the target product would save its proof and next step. This illustration saves no completed action." },
    ],
    backupEyebrow: "WHEN ENDVERA IS NOT SURE", humanLabel: "FILE", humanBackupTitle: "If it is not sure, it does not guess.",
    humanBackupBody: "In the target workflow, a file would be prepared with the job, request and proof for human review. This page prepares no real file. No human receipt or handling is confirmed. Production support is not enabled; a person would need to be assigned to take over a real file.",
    authorityEyebrow: "YOU STAY IN CONTROL", trustTitle: "Nothing is sent here. Future actions would require approval.",
    trustBody: "In the target workflow, ENDVERA would show any proposed text, appointment change or invoice before your approval. Permissions and deterministic controls would still be required; this demo makes none of those changes.",
    permissions: ["Demo calendar", "Draft for review", "No live sending, even after approval"],
    readyTitle: "Explore the workflow we are preparing.",
    readyBody: "An illustration of what a request could become: an appointment, follow-up or file to review, with no action executed in this demo.",
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
        description: "Démonstration locale d’ENDVERA : découvre le parcours visé pour gérer tes chantiers. Textos et appels réels non activés.",
      }
    : {
        title: "ENDVERA Construction — the AI assistant for contractors",
        description: "Local demonstration of ENDVERA’s intended job-management workflow. Live texting and calling are not enabled.",
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
              <p className={styles.heroPromise}><strong>{copy.honestLabel} : </strong>{copy.honestStatus}</p>
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
                    <button className={styles.fakeButton} type="button" disabled>{copy.approve}<ArrowIcon /></button>
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

        <section id="walkthrough" className={styles.walkthroughSection}>
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
            <div className={styles.handoffDiagram} aria-hidden><span>AI</span><i /><strong>{copy.humanLabel}</strong><i /><span>…</span></div>
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
