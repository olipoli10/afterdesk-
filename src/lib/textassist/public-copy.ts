export type TextAssistLocale = "fr" | "en";

export type TextAssistPublicCopy = {
  eyebrow: string;
  headline: string;
  promise: string;
  primaryCta: string;
  secondaryCta: string;
  channelsTitle: string;
  channels: ReadonlyArray<{ title: string; body: string; status: string }>;
  outcomesTitle: string;
  outcomes: ReadonlyArray<{ title: string; body: string }>;
  stepsTitle: string;
  steps: ReadonlyArray<{ title: string; body: string }>;
  humanBackupTitle: string;
  humanBackupBody: string;
  pricingTitle: string;
  pricingBody: string;
  pricingCta: string;
  faqTitle: string;
  faq: ReadonlyArray<{ question: string; answer: string }>;
  trustTitle: string;
  trustBody: string;
  availability: string;
};

export const TEXTASSIST_PUBLIC_COPY: Record<TextAssistLocale, TextAssistPublicCopy> = {
  fr: {
    eyebrow: "ENDVERA TEXTASSIST · APERÇU LOCAL",
    headline: "L’assistant IA qui garde tes chantiers en mouvement",
    promise:
      "Conçu pour les petits entrepreneurs en construction. Parle-lui comme à un adjoint : ENDVERA transforme tes demandes en rendez-vous, suivis, messages préparés et prochaines décisions, tout en gardant le contexte du bon chantier.",
    primaryCta: "Essayer l’expérience locale",
    secondaryCta: "Voir ENDVERA Construction",
    channelsTitle: "Une conversation, plusieurs portes d’entrée",
    channels: [
      { title: "Texte", body: "Écris une demande rapide depuis le terrain, sans reconstruire le dossier.", status: "Préparé localement" },
      { title: "Voix", body: "Dicte une note ou une intention; ENDVERA demande une précision quand elle est nécessaire.", status: "Interface locale" },
      { title: "Portail", body: "Inspecte le projet, la provenance et l’action exacte avant de l’approuver.", status: "Disponible localement" },
    ],
    outcomesTitle: "Ce que l’assistant doit réellement faire",
    outcomes: [
      { title: "Garder le contexte", body: "Contacts, rendez-vous, preuves, contradictions et décisions restent liés au bon chantier." },
      { title: "Faire avancer le travail", body: "Il indique ce qui manque, qui doit agir et quelle est la prochaine décision utile." },
      { title: "Préparer les communications", body: "Le destinataire, le canal et le texte restent visibles avant toute autorisation." },
      { title: "Savoir quand demander de l’aide", body: "Une exception ambiguë ou risquée peut être dirigée vers un humain, avec son contexte." },
    ],
    stepsTitle: "Comment ta journée avance",
    steps: [
      { title: "1. Tu demandes", body: "Par texte, voix ou portail, tu expliques le résultat voulu avec tes mots." },
      { title: "2. ENDVERA rattache le contexte", body: "La demande est liée au bon chantier, au bon contact et à l’état déjà connu." },
      { title: "3. Le système prépare la suite", body: "Rendez-vous, rappel, demande de preuve ou message sont structurés sans inventer ce qui manque." },
      { title: "4. Tu autorises ce qui compte", body: "Le destinataire, le canal et le contenu sont visibles avant une action à conséquence." },
      { title: "5. Le dossier reste à jour", body: "La décision, la preuve et le prochain responsable restent reconstruisibles pour la prochaine conversation." },
    ],
    humanBackupTitle: "Appui humain quand le jugement compte",
    humanBackupBody:
      "Une ambiguïté, une exception ou un risque peut être remis à un opérateur avec le contexte utile. L’humain n’est pas un centre d’appels caché : il intervient seulement quand son jugement améliore réellement le résultat.",
    pricingTitle: "Tarification en préparation",
    pricingBody:
      "Les plans et le prix de lancement ne sont pas encore validés. ENDVERA ne présente donc aucun faux rabais ni forfait inventé. L’inscription sert aujourd’hui à accéder à l’expérience disponible et à signaler ton intérêt.",
    pricingCta: "Créer un compte",
    faqTitle: "Questions fréquentes",
    faq: [
      { question: "Est-ce seulement un chatbot?", answer: "Non. Le produit vise à maintenir l’état des chantiers, les décisions, les preuves et les suivis entre les conversations." },
      { question: "Est-ce qu’ENDVERA envoie déjà de vrais textos ou appels?", answer: "Non. Les parcours locaux préparent et inspectent les actions; les fournisseurs réels ne sont pas encore activés ni observés." },
      { question: "Puis-je garder le contrôle?", answer: "Oui. Une action à conséquence doit respecter une autorisation et rester visible avant son exécution." },
      { question: "À qui le produit s’adresse-t-il d’abord?", answer: "Aux petits entrepreneurs en construction qui gèrent leurs chantiers, contacts et suivis depuis le terrain." },
    ],
    trustTitle: "Tu gardes l’autorité.",
    trustBody:
      "Les actions à conséquence demeurent préparées et inspectables. Cette version publique décrit le produit en construction; elle ne prétend pas envoyer de vrais messages ni agir dans les systèmes d’un client.",
    availability: "Build locale seulement · aucun fournisseur réel · aucune publication mobile",
  },
  en: {
    eyebrow: "ENDVERA TEXTASSIST · LOCAL PREVIEW",
    headline: "The AI assistant that keeps your jobs moving",
    promise:
      "Built for small construction contractors. Talk to it like an operations assistant: ENDVERA turns requests into appointments, follow-ups, prepared messages and next decisions while keeping the right job context.",
    primaryCta: "Try the local experience",
    secondaryCta: "See ENDVERA Construction",
    channelsTitle: "One conversation, several entry points",
    channels: [
      { title: "Text", body: "Send a quick field request without rebuilding the job file.", status: "Prepared locally" },
      { title: "Voice", body: "Dictate a note or intent; ENDVERA asks for clarification when it matters.", status: "Local interface" },
      { title: "Portal", body: "Inspect the project, provenance and exact action before approval.", status: "Available locally" },
    ],
    outcomesTitle: "What the assistant must actually do",
    outcomes: [
      { title: "Keep context", body: "Contacts, appointments, evidence, contradictions and decisions stay attached to the right job." },
      { title: "Move work forward", body: "It identifies what is missing, who owns it and the next useful decision." },
      { title: "Prepare communications", body: "Recipient, channel and message remain visible before authorization." },
      { title: "Know when to ask for help", body: "An ambiguous or risky exception can reach a human with its operational context." },
    ],
    stepsTitle: "How your day moves",
    steps: [
      { title: "1. You ask", body: "By text, voice or portal, describe the outcome you need in your own words." },
      { title: "2. ENDVERA attaches context", body: "The request is linked to the right job, contact and already-known state." },
      { title: "3. The system prepares the next move", body: "An appointment, reminder, evidence request or message is structured without inventing missing facts." },
      { title: "4. You authorize what matters", body: "Recipient, channel and content are visible before a consequential action." },
      { title: "5. The job file stays current", body: "The decision, evidence and next owner remain reconstructible for the next conversation." },
    ],
    humanBackupTitle: "Human backup when judgment matters",
    humanBackupBody:
      "An ambiguity, exception or risk can reach an operator with the useful context. The human is not a hidden call centre: they step in only when judgment materially improves the outcome.",
    pricingTitle: "Pricing in preparation",
    pricingBody:
      "Launch plans and pricing are not validated yet, so ENDVERA does not show a fabricated package or discount. Registration currently provides access to the available experience and records interest.",
    pricingCta: "Create an account",
    faqTitle: "Frequently asked questions",
    faq: [
      { question: "Is this only a chatbot?", answer: "No. The product is designed to maintain job state, decisions, evidence and follow-ups across conversations." },
      { question: "Does ENDVERA already send live texts or calls?", answer: "No. Local workflows prepare and inspect actions; live providers have not yet been enabled or observed." },
      { question: "Do I keep control?", answer: "Yes. A consequential action must satisfy an authorization policy and remain visible before execution." },
      { question: "Who is the product for first?", answer: "Small construction contractors who manage jobs, contacts and follow-ups from the field." },
    ],
    trustTitle: "You keep authority.",
    trustBody:
      "Consequential actions remain prepared and inspectable. This public surface describes the product under construction; it does not claim to send live messages or act in a customer system.",
    availability: "Local build only · no live provider · no published mobile app",
  },
};

export const TEXTASSIST_RELEASE_BOUNDARY = {
  providerObserved: false,
  customerObserved: false,
  pricingValidated: false,
  published: false,
  deployed: false,
} as const;
