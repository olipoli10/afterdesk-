export const VIRTUAL_SECRETARY_ACTIONS = [
  {
    key: "SCHEDULE_QUERY",
    title: "Répondre sur ton horaire",
    example: "Qu’est-ce que j’ai demain?",
    readiness: "Prêt avec l’horaire ENDVERA",
    effectClass: "READ",
    entry: { kind: "ASSISTANT_PROMPT", value: "Qu’est-ce que j’ai demain?", label: "Demander à ENDVERA" },
  },
  {
    key: "GOOGLE_CALENDAR_QUERY",
    title: "Répondre sur Google Calendar",
    example: "Suis-je libre mardi après-midi?",
    readiness: "Connexion Google requise",
    effectClass: "READ",
    entry: { kind: "APP_ROUTE", value: "/calendar-connections", label: "Connecter mon calendrier" },
  },
  {
    key: "CALENDAR_EVENT_CREATE",
    title: "Ajouter un rendez-vous",
    example: "Rendez-vous avec Marc mardi à 14 h pour Laval.",
    readiness: "Préparé avant l’ajout",
    effectClass: "EXTERNAL_WRITE",
    entry: { kind: "ASSISTANT_PROMPT", value: "Rendez-vous avec Marc mardi à 14 h pour Laval.", label: "Préparer dans l’assistant" },
  },
  {
    key: "PROJECT_RECORD_UPDATE",
    title: "Modifier un chantier",
    example: "Le travail du dosseret de Laval est terminé.",
    readiness: "Changement exact à approuver",
    effectClass: "INTERNAL_WRITE",
    entry: { kind: "ASSISTANT_PROMPT", value: "Le travail du dosseret de Laval est terminé.", label: "Préparer dans l’assistant" },
  },
  {
    key: "SMS_SINGLE_PREPARE",
    title: "Texter une personne",
    example: "Texte Marc que le rendez-vous est confirmé à 14 h.",
    readiness: "Message exact à approuver",
    effectClass: "EXTERNAL_WRITE",
    entry: { kind: "ASSISTANT_PROMPT", value: "Texte Marc que le rendez-vous est confirmé à 14 h.", label: "Préparer dans l’assistant" },
  },
  {
    key: "SMS_BROADCAST_PREPARE",
    title: "Texter jusqu’à 10 personnes",
    example: "Dis aux 10 gars que le chantier ouvre à 7 h.",
    readiness: "Planificateur local prêt · groupe à approuver · compréhension AI à intégrer",
    effectClass: "EXTERNAL_WRITE",
    maxRecipients: 10,
    entry: { kind: "APP_ROUTE", value: "/assistant", label: "Décrire le groupe à ENDVERA" },
  },
  {
    key: "OUTBOUND_CALL_PREPARE",
    title: "Faire un appel",
    example: "Appelle Marc pour confirmer la livraison.",
    readiness: "Appel et objectif à approuver",
    effectClass: "EXTERNAL_WRITE",
    entry: { kind: "APP_ROUTE", value: "/calls", label: "Préparer un appel" },
  },
] as const;

export function assistantPrefillFromRoute(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return null;
  const normalized = first.trim();
  if (!normalized || normalized.length > 10_000) return null;
  return normalized;
}

export const VIRTUAL_SECRETARY_EXTERNAL_EFFECTS = {
  smsSent: 0,
  callsPlaced: 0,
  calendarWrites: 0,
  projectWrites: 0,
} as const;
