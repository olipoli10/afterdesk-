import Link from "next/link";
import { cookies } from "next/headers";
import { LangSwitch } from "@/components/lang-switch";
import { Wordmark } from "@/components/logo";
import { clientLangOf } from "@/lib/i18n/client";
import { publicConstructionOffer } from "@/lib/construction-operating-assistant-r34/public-offer";
import { TEXTASSIST_PUBLIC_COPY, TEXTASSIST_RELEASE_BOUNDARY } from "@/lib/textassist/public-copy";
import styles from "./construction.module.css";

const CONSTRUCTION_LANGS = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
] as const;

export const metadata = {
  title: "ENDVERA Construction — ton adjoint IA de chantier",
  description: "L’assistant opérationnel qui garde tes chantiers, rendez-vous, suivis et messages en mouvement.",
};

const COPY = {
  fr: {
    navProduct: "Le produit", navUses: "Ce qu’il fait", access: "Demander un accès",
    eyebrow: "L’ADJOINT IA DES ENTREPRENEURS", headlineA: "Tu fais le métier.", headlineB: "ENDVERA tient le fil.",
    promise: "Texte ou parle comme tu le ferais à un adjoint. ENDVERA garde le bon chantier en tête, organise la suite et te montre exactement ce qui demande ton accord.",
    primaryCta: "Voir le produit en action", secondaryCta: "Essayer TextAssist",
    trust: ["Mémoire par chantier", "Rien ne part sans ton accord", "Un humain si ça bloque"],
    liveLabel: "CHANTIER ACTIF", job: "Rénovation Laval", demoBoundary: "EXEMPLE ILLUSTRATIF · AUCUN ENVOI RÉEL",
    userMessage: "Texte Marc : l’équipe arrive à 8 h demain.", assistantMessage: "C’est prêt. Vérifie avant que ça parte.",
    prepared: "MESSAGE PRÉPARÉ", recipient: "À · Marc, fournisseur", body: "L’équipe sera sur place demain à 8 h.", approve: "Approuver",
    tomorrow: "DEMAIN · 8 H 00", calendarItem: "Équipe sur place", project: "Rénovation Laval · Marc", memoryLabel: "MÉMOIRE DU CHANTIER",
    memoryRows: ["Rendez-vous ajouté", "Marc avisé — en attente", "Photo de fin manquante"],
    flowLabel: "UNE DEMANDE. UNE SUITE CLAIRE.", flow: ["Tu demandes", "ENDVERA comprend", "Le chantier se met à jour", "Tu gardes le contrôle"],
    dayEyebrow: "PENSÉ POUR LE TERRAIN", dayTitle: "Ton bureau tient dans une conversation.",
    dayBody: "Plus besoin de rouvrir cinq applications pour te rappeler qui attend quoi. ENDVERA réunit le contexte, l’action et la décision au même endroit.",
    situations: [
      { number: "01", title: "Sur la route", body: "Demande ce que tu as demain. Le calendrier répond avec le bon chantier et la bonne source." },
      { number: "02", title: "Entre deux jobs", body: "Fais préparer un message à un client, un employé ou un fournisseur sans perdre le contexte." },
      { number: "03", title: "Avant de facturer", body: "Vois les preuves manquantes, les contradictions et la prochaine personne responsable." },
    ],
    capabilityEyebrow: "PAS JUSTE UN CHATBOT", capabilityTitle: "Il transforme une demande en état opérationnel.",
    capabilityBody: "La conversation est la porte d’entrée. Derrière, ENDVERA maintient une mémoire vérifiable du chantier.",
    walkthroughEyebrow: "COMMENT ÇA MARCHE", walkthroughTitle: "Parle. Vérifie. Continue ta journée.",
    availableLabel: "Une mémoire opérationnelle qui travaille avec toi", backupEyebrow: "QUAND L’IA NE DEVRAIT PAS DEVINER",
    authorityEyebrow: "TON ENTREPRISE. TES RÈGLES.", readyTitle: "Moins de suivis dans ta tête. Plus de chantiers qui avancent.",
    readyBody: "Découvre l’expérience ENDVERA en accès privé pendant que les connexions texte, appel et calendrier sont finalisées.",
    footerProduct: "Produit", footerCompany: "Confiance", honestLabel: "Disponibilité actuelle",
    honestStatus: "Aperçu local. Aucun vrai texto, appel ou connecteur externe ne part encore de cette version.",
    copyright: "ENDVERA · Conçu au Québec pour les entrepreneurs qui travaillent pour vrai.",
  },
  en: {
    navProduct: "Product", navUses: "What it does", access: "Request access",
    eyebrow: "THE AI OPERATIONS ASSISTANT FOR CONTRACTORS", headlineA: "You do the trade.", headlineB: "ENDVERA keeps the thread.",
    promise: "Text or talk like you would to an assistant. ENDVERA keeps the right job in mind, organizes what comes next and shows exactly what needs your approval.",
    primaryCta: "See the product in action", secondaryCta: "Try TextAssist",
    trust: ["Memory for every job", "Nothing leaves without approval", "A human when work gets stuck"],
    liveLabel: "ACTIVE JOB", job: "Laval Renovation", demoBoundary: "ILLUSTRATIVE EXAMPLE · NO LIVE SENDING",
    userMessage: "Text Marc: the crew will arrive at 8 tomorrow.", assistantMessage: "It’s ready. Review it before it goes out.",
    prepared: "PREPARED MESSAGE", recipient: "To · Marc, supplier", body: "The crew will be on site tomorrow at 8 a.m.", approve: "Approve",
    tomorrow: "TOMORROW · 8:00 A.M.", calendarItem: "Crew on site", project: "Laval Renovation · Marc", memoryLabel: "JOB MEMORY",
    memoryRows: ["Appointment added", "Marc notified — pending", "Completion photo missing"],
    flowLabel: "ONE REQUEST. ONE CLEAR NEXT MOVE.", flow: ["You ask", "ENDVERA understands", "The job updates", "You stay in control"],
    dayEyebrow: "BUILT FOR THE FIELD", dayTitle: "Your office fits in one conversation.",
    dayBody: "Stop reopening five apps just to remember who is waiting for what. ENDVERA puts context, action and decision in one place.",
    situations: [
      { number: "01", title: "On the road", body: "Ask what is happening tomorrow. The calendar answers with the right job and source." },
      { number: "02", title: "Between jobs", body: "Prepare a message for a customer, worker or supplier without losing the context." },
      { number: "03", title: "Before invoicing", body: "See missing evidence, contradictions and the next person responsible." },
    ],
    capabilityEyebrow: "NOT JUST A CHATBOT", capabilityTitle: "It turns a request into operational state.",
    capabilityBody: "Conversation is the front door. Behind it, ENDVERA maintains a verifiable memory of the job.",
    walkthroughEyebrow: "HOW IT WORKS", walkthroughTitle: "Talk. Review. Get back to work.",
    availableLabel: "Operational memory that works alongside you", backupEyebrow: "WHEN AI SHOULD NOT GUESS",
    authorityEyebrow: "YOUR BUSINESS. YOUR RULES.", readyTitle: "Fewer follow-ups in your head. More jobs moving forward.",
    readyBody: "Explore ENDVERA through private access while live text, calling and calendar connections are being finalized.",
    footerProduct: "Product", footerCompany: "Trust", honestLabel: "Current availability",
    honestStatus: "Honest status: Local preview. No live text, call or external connector leaves this version yet.",
    copyright: "ENDVERA · Built in Quebec for contractors who do real work.",
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

export default async function ConstructionPublicPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const sp = await searchParams;
  const queryLang = Array.isArray(sp.lang) ? sp.lang[0] : sp.lang;
  const raw = queryLang ?? (await cookies()).get("ss-lang-client")?.value;
  const requestedLang = clientLangOf(raw);
  const lang = requestedLang === "fr" ? "fr" : "en";
  const french = lang === "fr";
  const locale = french ? "fr-CA" as const : "en-CA" as const;
  const offer = publicConstructionOffer(locale);
  const textAssist = TEXTASSIST_PUBLIC_COPY[french ? "fr" : "en"];
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
            <a href="#demo">{copy.navProduct}</a><a href="#uses">{copy.navUses}</a><Link href="/textassist">TextAssist</Link>
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
                <Link href="/textassist" className={styles.secondaryCta}>{copy.secondaryCta}</Link>
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
            {textAssist.outcomes.map((outcome, index) => <article key={outcome.title} className={styles.capabilityRow}><span>{String(index + 1).padStart(2, "0")}</span><h3>{outcome.title}</h3><p>{outcome.body}</p></article>)}
          </div>
        </section>

        <section className={styles.walkthroughSection}>
          <div className={styles.walkthroughInner}>
            <div className={styles.walkthroughIntro}>
              <p className={styles.darkEyebrow}>{copy.walkthroughEyebrow}</p><h2>{copy.walkthroughTitle}</h2><p>{copy.availableLabel}</p>
              <div className={styles.capabilityChips}>{offer.capabilities.map((capability) => <span key={capability.code}><CheckIcon />{capability.title}</span>)}</div>
            </div>
            <ol className={styles.stepList}>
              {textAssist.steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title.replace(/^\d+\.\s*/, "")}</h3><p>{step.body}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className={styles.controlSection}>
          <article className={styles.controlCard}>
            <p className={styles.eyebrow}><span />{copy.backupEyebrow}</p><h2>{textAssist.humanBackupTitle}</h2><p>{textAssist.humanBackupBody}</p>
            <div className={styles.handoffDiagram} aria-hidden><span>AI</span><i /><strong>HUMAIN</strong><i /><span>✓</span></div>
          </article>
          <article className={`${styles.controlCard} ${styles.authorityCard}`}>
            <p className={styles.eyebrow}><span />{copy.authorityEyebrow}</p><h2>{textAssist.trustTitle}</h2><p>{textAssist.trustBody}</p>
            <div className={styles.permissionPreview}><span><CheckIcon />{french ? "Lire le calendrier" : "Read calendar"}</span><span><CheckIcon />{french ? "Préparer un message" : "Prepare a message"}</span><span className={styles.locked}>× {french ? "Envoyer sans accord" : "Send without approval"}</span></div>
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
