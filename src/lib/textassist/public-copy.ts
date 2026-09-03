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
    trustTitle: "You keep authority.",
    trustBody:
      "Consequential actions remain prepared and inspectable. This public surface describes the product under construction; it does not claim to send live messages or act in a customer system.",
    availability: "Local build only · no live provider · no published mobile app",
  },
};

export const TEXTASSIST_RELEASE_BOUNDARY = {
  providerObserved: false,
  customerObserved: false,
  published: false,
  deployed: false,
} as const;
