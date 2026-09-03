export type MobileProductLocale = "fr-CA" | "en-CA";

export type MobileProductCopy = {
  tabs: { today: string; assistant: string; projects: string; calendar: string; more: string };
  talkToEndvera: string;
  moreTitle: string;
  moreBody: string;
  moreOpenHint: string;
  moreGroups: Record<"work" | "communications" | "money" | "trust", string>;
  moreRoutes: Record<string, string>;
  assistantEyebrow: string;
  assistantTitle: string;
  assistantBody: string;
  assistantProtectedTitle: string;
  assistantProtectedBody: string;
  assistantProtectedEmpty: string;
  conversation: string;
  loadingConversation: string;
  emptyConversation: string;
  request: string;
  assistantInputLabel: string;
  assistantPlaceholder: string;
  submit: string;
  processing: string;
  retry: string;
  refresh: string;
  refreshing: string;
  errorRecoveryHint: string;
  attempt: Record<"SENDING" | "REPLAYED" | "OUTCOME_UNKNOWN" | "REFUSED", string>;
};

export const MOBILE_PRODUCT_COPY: Record<MobileProductLocale, MobileProductCopy> = {
  "fr-CA": {
    tabs: { today: "Aujourd’hui", assistant: "Assistant", projects: "Chantiers", calendar: "Agenda", more: "Plus" },
    talkToEndvera: "Parler à ENDVERA",
    moreTitle: "Plus",
    moreBody: "Tous tes outils, regroupés sans encombrer les actions principales.",
    moreOpenHint: "Ouvre cet outil sans quitter ton espace ENDVERA.",
    moreGroups: { work: "TRAVAIL", communications: "COMMUNICATIONS", money: "ARGENT ET ACTIONS", trust: "CONFIANCE ET COMPTE" },
    moreRoutes: {
      onboarding: "Démarrage", jobs: "Travaux", followUps: "Suivis", timeline: "Historique", provenance: "Provenance", evidence: "Preuves",
      calendarConnections: "Calendriers connectés", messages: "Messages", calls: "Appels", email: "Courriel", contacts: "Contacts",
      accounting: "Comptabilité", receivables: "Comptes à recevoir", actions: "Actions à approuver", outbox: "Reprise",
      permissions: "Permissions", privacy: "Confidentialité", reliability: "Fiabilité", humanSupport: "Appui humain", settings: "Réglages",
    },
    assistantEyebrow: "PARLER À ENDVERA",
    assistantTitle: "Ton assistant de chantier",
    assistantBody: "Pose une question ou demande une action. ENDVERA garde l’état; aucun message externe n’est envoyé dans cette version.",
    assistantProtectedTitle: "Assistant protégé",
    assistantProtectedBody: "Cette version est réservée au propriétaire et au gestionnaire de bureau.",
    assistantProtectedEmpty: "Aucune conversation ou donnée financière n’est exposée dans le rôle chantier.",
    conversation: "Conversation persistante",
    loadingConversation: "ENDVERA retrouve la conversation…",
    emptyConversation: "Aucun message. Essaie « Qu’est-ce que j’ai demain? »",
    request: "Ta demande",
    assistantInputLabel: "Demande à ENDVERA",
    assistantPlaceholder: "Ex. Rendez-vous avec Marc mardi à 14 h pour Laval.",
    submit: "Envoyer à ENDVERA",
    processing: "Traitement…",
    retry: "Réessayer la même demande",
    refresh: "Recharger la conversation",
    refreshing: "Synchronisation…",
    errorRecoveryHint: "La conversation demeure conservée. Recharge-la ou réessaie exactement la même demande.",
    attempt: {
      SENDING: "ENDVERA travaille…", REPLAYED: "Résultat récupéré sans doublon.",
      OUTCOME_UNKNOWN: "Résultat inconnu — réessaie exactement la même demande.", REFUSED: "Demande refusée sans effet inventé.",
    },
  },
  "en-CA": {
    tabs: { today: "Today", assistant: "Assistant", projects: "Projects", calendar: "Calendar", more: "More" },
    talkToEndvera: "Talk to ENDVERA",
    moreTitle: "More",
    moreBody: "All your tools, grouped without crowding the primary actions.",
    moreOpenHint: "Open this tool without leaving your ENDVERA workspace.",
    moreGroups: { work: "WORK", communications: "COMMUNICATIONS", money: "MONEY AND ACTIONS", trust: "TRUST AND ACCOUNT" },
    moreRoutes: {
      onboarding: "Getting started", jobs: "Jobs", followUps: "Follow-ups", timeline: "Timeline", provenance: "Provenance", evidence: "Evidence",
      calendarConnections: "Connected calendars", messages: "Messages", calls: "Calls", email: "Email", contacts: "Contacts",
      accounting: "Accounting", receivables: "Receivables", actions: "Actions to approve", outbox: "Recovery",
      permissions: "Permissions", privacy: "Privacy", reliability: "Reliability", humanSupport: "Human support", settings: "Settings",
    },
    assistantEyebrow: "TALK TO ENDVERA",
    assistantTitle: "Your job assistant",
    assistantBody: "Ask a question or request an action. ENDVERA keeps the state; no external message is sent in this version.",
    assistantProtectedTitle: "Protected assistant",
    assistantProtectedBody: "This version is reserved for the owner and office manager.",
    assistantProtectedEmpty: "No conversation or financial data is exposed to the field role.",
    conversation: "Persistent conversation",
    loadingConversation: "ENDVERA is restoring the conversation…",
    emptyConversation: "No messages yet. Try “What do I have tomorrow?”",
    request: "Your request",
    assistantInputLabel: "Request to ENDVERA",
    assistantPlaceholder: "Example: Appointment with Marc Tuesday at 2 p.m. for Laval.",
    submit: "Send to ENDVERA",
    processing: "Processing…",
    retry: "Retry the same request",
    refresh: "Reload conversation",
    refreshing: "Syncing…",
    errorRecoveryHint: "The conversation remains saved. Reload it or retry the exact same request.",
    attempt: {
      SENDING: "ENDVERA is working…", REPLAYED: "Result recovered without a duplicate.",
      OUTCOME_UNKNOWN: "Outcome unknown — retry the exact same request.", REFUSED: "Request refused without an invented effect.",
    },
  },
};

export function mobileProductLocale(value: string | null | undefined): MobileProductLocale {
  return value === "en-CA" ? "en-CA" : "fr-CA";
}

export function mobileProductCopy(value: string | null | undefined): MobileProductCopy {
  return MOBILE_PRODUCT_COPY[mobileProductLocale(value)];
}

