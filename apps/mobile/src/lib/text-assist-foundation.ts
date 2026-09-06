export const TEXT_ASSIST_FOUNDATION = {
  productMode: "ASSISTANT_FIRST",
  sms: {
    title: "Numéro ENDVERA dédié",
    detail: "Tu textes ENDVERA comme un contact. L’app n’a pas besoin de lire tes autres textos.",
    readiness: "Numéro réel à provisionner",
    number: null as string | null,
    providerCandidate: "TWILIO",
    smsVerified: false,
    voiceVerified: false,
    devicePermissions: [] as string[],
  },
  gateway: {
    title: "Cerveau AI dirigé par ENDVERA",
    detail: "ENDVERA choisit le bon outil ou modèle. Les permissions, coûts et actions restent contrôlés par ENDVERA.",
    candidate: "OpenRouter",
    readiness: "Désactivé dans cette version locale",
    secretLocation: "SERVER_ONLY",
  },
  actions: {
    assistant: { label: "Parler à ENDVERA maintenant", route: "/assistant" },
    permissions: { label: "Connecter mon téléphone", route: "/device-access" },
  },
  permissions: [
    { key: "CALENDAR", title: "Calendrier", detail: "Autoriser les calendriers du téléphone, puis connecter Google directement si nécessaire.", route: "/device-access" },
    { key: "CONTACTS", title: "Contacts choisis", detail: "Autoriser les contacts du téléphone sans les téléverser automatiquement.", route: "/device-access" },
    { key: "MICROPHONE", title: "Microphone", detail: "Écouter seulement quand tu appuies pour parler.", route: "/calls" },
    { key: "FILES", title: "Photos et documents choisis", detail: "Comprendre seulement ce que tu ajoutes au chantier.", route: "/evidence" },
    { key: "NOTIFICATIONS", title: "Notifications", detail: "Te prévenir des suivis et décisions importantes.", route: "/settings" },
  ],
  forbiddenDevicePermissions: ["READ_SMS", "WRITE_SMS", "READ_CALL_LOG", "WRITE_CALL_LOG"],
  loop: ["Tu textes ou tu parles", "ENDVERA vérifie ton identité et ton contexte", "ENDVERA choisit le bon modèle AI ou le bon outil", "Les actions sensibles sont préparées", "Tu vois et approuves l’action exacte"],
  externalTransportPerformed: false,
} as const;
