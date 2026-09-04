export type MobileProductLocale = "fr-CA" | "en-CA";

export type MobileProductCopy = {
  tabs: { today: string; assistant: string; projects: string; calendar: string; review: string; more: string };
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
  assistantSuggestions: string[];
  assistantTrustLine: string;
  assistantAttach: string;
  assistantVoice: string;
  assistantNoWorkspace: string;
  assistantPrepared: string;
  assistantClarification: string;
  assistantProviderUnavailable: string;
  assistantHumanSupport: string;
  assistantMemory: {
    title: string; body: string; unavailable: string; confirmed: string; ask: string;
    summary: string; scope: string; people: string; dates: string; blockers: string; next: string; sources: string; contradictions: string;
    citations: string; prepared: string; recipient: string; channel: string; exactMessage: string; approval: string;
  };
  attempt: Record<"SENDING" | "REPLAYED" | "OUTCOME_UNKNOWN" | "REFUSED", string>;
  home: {
    eyebrow: string; title: string; body: string; quickAsk: string; write: string; speak: string;
    priority: string; appointments: string; toReview: string; openLoops: string;
    fullPlan: string; hidePlan: string; controlTitle: string; controlBody: string;
  };
  projectsScreen: {
    eyebrow: string; title: string; body: string; active: string; needsAttention: string;
    contacts: string; appointments: string; openLoops: string; empty: string; open: string; upToDate: string; brain: string; reviewBrain: string; askBrain: string;
  };
  projectBrain: {
    eyebrow: string; title: string; body: string; sources: string; add: string; voice: string; stop: string;
    brief: string; summary: string; scope: string; people: string; dates: string; blockers: string; next: string;
    save: string; review: string; submit: string; confirm: string; reject: string; none: string; retry: string;
    limitation: string; limits: string; created: string; back: string; protected: string; loading: string; unavailable: string;
    invalidFile: string; microphoneDenied: string; voiceInvalid: string; voiceTooLarge: string; voiceTooLong: string; voiceReadFailed: string;
    voiceMobileOnly: string; continueUpload: string; locked: string; version: string; localOnly: string; kilobytes: string;
    newVersion: string; pendingCommands: string; retryCommand: string; dismiss: string; interrupted: string; localQueueUnavailable: string; pendingSignOut: string;
    commandAction: Record<"CREATE_PROJECT_BRAIN_INTAKE" | "ADD_OWNER_BRIEF" | "SUBMIT_PROJECT_BRAIN_INTAKE" | "CONFIRM_PROJECT_BRAIN_INTAKE" | "REJECT_PROJECT_BRAIN_INTAKE", string>;
    sourceKind: Record<"PHOTO" | "DOCUMENT" | "VOICE_NOTE", string>;
    sourceState: Record<"READY" | "SENDING" | "CONFLICT" | "OUTCOME_UNKNOWN" | "REFUSED", string>;
    status: Record<"DRAFT" | "READY_FOR_REVIEW" | "CONFIRMED" | "REJECTED", string>;
  };
  projectBrainReview: {
    eyebrow: string; title: string; body: string; back: string; loading: string; unavailable: string; create: string;
    sources: string; candidates: string; noSources: string; accept: string; reject: string; contradiction: string;
    selected: string; declare: string; contradictions: string; chooseSupported: string; rejectAll: string;
    ownerResolution: string; saveResolution: string; prepare: string; confirm: string; confirmed: string;
    version: string; localOnly: string; completeEach: string; protected: string;
  };
  calendarScreen: {
    eyebrow: string; title: string; body: string; add: string; empty: string;
    verified: string; needsReview: string; rejected: string; unknown: string; connector: string;
  };
  reviewScreen: {
    eyebrow: string; title: string; body: string; safety: string; safetyBody: string;
    recipient: string; channel: string; exactMessage: string; approve: string; reject: string;
    rejectWhy: string; revoke: string; revokeWhy: string; approved: string; empty: string;
    generalAction: string; technicalDetails: string; version: string; prepared: string;
    processing: string; replayed: string; confirmed: string; conflict: string; unknown: string;
    refused: string; retry: string; protectedTitle: string; protectedBody: string; protectedEmpty: string;
  };
  auth: {
    eyebrow: string; title: string; body: string; email: string; password: string;
    submit: string; submitting: string; refused: string; unavailable: string; trust: string;
  };
};

export const MOBILE_PRODUCT_COPY: Record<MobileProductLocale, MobileProductCopy> = {
  "fr-CA": {
    tabs: { today: "Aujourd’hui", assistant: "Assistant", projects: "Chantiers", calendar: "Agenda", review: "À valider", more: "Plus" },
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
    assistantTitle: "Comment je peux t’aider?",
    assistantBody: "Écris ou parle. Je garde le contexte de tes chantiers et je te demande avant toute action sensible.",
    assistantProtectedTitle: "Assistant protégé",
    assistantProtectedBody: "Cette version est réservée au propriétaire et au gestionnaire de bureau.",
    assistantProtectedEmpty: "Aucune conversation ou donnée financière n’est exposée dans le rôle chantier.",
    conversation: "Conversation",
    loadingConversation: "ENDVERA retrouve la conversation…",
    emptyConversation: "Aucun message. Essaie « Qu’est-ce que j’ai demain? »",
    request: "Demande à ENDVERA",
    assistantInputLabel: "Demande à ENDVERA",
    assistantPlaceholder: "Ex. Rendez-vous avec Marc mardi à 14 h pour Laval.",
    submit: "Envoyer",
    processing: "Traitement…",
    retry: "Réessayer la même demande",
    refresh: "Recharger la conversation",
    refreshing: "Synchronisation…",
    errorRecoveryHint: "La conversation demeure conservée. Recharge-la ou réessaie exactement la même demande.",
    assistantSuggestions: ["Qu’est-ce que j’ai demain?", "Qu’est-ce qui bloque Laval?", "Prépare un suivi pour Marc"],
    assistantTrustLine: "Je prépare les messages. Tu approuves avant tout envoi.",
    assistantAttach: "Ajouter une preuve", assistantVoice: "Parler à ENDVERA", assistantNoWorkspace: "Aucun espace Construction actif.",
    assistantPrepared: "Message préparé — rien n’a été envoyé.",
    assistantClarification: "J’attends ta précision avant de modifier quoi que ce soit.",
    assistantProviderUnavailable: "La recherche externe n’est pas encore activée. Aucun résultat n’a été inventé.",
    assistantHumanSupport: "Un appui humain est disponible sur demande. Rien n’a été créé automatiquement.",
    assistantMemory: {
      title: "Mémoire confirmée du chantier", body: "Je réponds seulement avec la dernière compréhension que tu as confirmée.",
      unavailable: "Aucune compréhension confirmée n’est disponible.", confirmed: "Compréhension confirmée", ask: "Demander",
      summary: "Résumé", scope: "Portée", people: "Personnes", dates: "Dates", blockers: "Blocages", next: "Prochaine décision",
      sources: "Sources examinées", contradictions: "Contradictions résolues", citations: "Provenance", prepared: "Action préparée — rien n’a été envoyé",
      recipient: "Destinataire", channel: "Canal", exactMessage: "Message exact", approval: "Approbation requise",
    },
    attempt: {
      SENDING: "ENDVERA travaille…", REPLAYED: "Résultat récupéré sans doublon.",
      OUTCOME_UNKNOWN: "Résultat inconnu — réessaie exactement la même demande.", REFUSED: "Demande refusée sans effet inventé.",
    },
    home: {
      eyebrow: "TON CENTRE DE COMMANDE", title: "Bonjour.", body: "Voici ce qui demande ton attention aujourd’hui.",
      quickAsk: "Qu’est-ce qui doit avancer?", write: "Écrire", speak: "Parler", priority: "Priorité maintenant",
      appointments: "Rendez-vous", toReview: "À valider", openLoops: "Boucles ouvertes", fullPlan: "Voir le plan complet",
      hidePlan: "Masquer le plan", controlTitle: "Tu gardes le contrôle",
      controlBody: "ENDVERA prépare le travail. Tu approuves avant tout envoi ou changement externe.",
    },
    projectsScreen: {
      eyebrow: "TES CHANTIERS", title: "Tout au même endroit.", body: "L’état, les rendez-vous et la prochaine étape — sans reconstruire le contexte.",
      active: "Actifs", needsAttention: "À surveiller", contacts: "contacts", appointments: "rendez-vous",
      openLoops: "suivis ouverts", empty: "Aucun chantier actif.", open: "Ouvrir le chantier", upToDate: "À jour", brain: "Construire la mémoire", reviewBrain: "Vérifier la compréhension", askBrain: "Questionner la mémoire",
    },
    projectBrain: {
      eyebrow: "MÉMOIRE DU CHANTIER", title: "Vide le chantier de ta tête.",
      body: "Ajoute les plans, photos, documents, une note vocale et ton résumé. ENDVERA garde le tout ensemble.",
      sources: "1. Matériel du chantier", add: "Ajouter plusieurs fichiers", voice: "Enregistrer une note vocale", stop: "Arrêter l’enregistrement",
      brief: "2. Ce qu’ENDVERA doit retenir", summary: "Résumé du chantier *", scope: "Portée des travaux", people: "Personnes importantes",
      dates: "Dates importantes", blockers: "Blocages", next: "Prochaine décision", save: "Enregistrer mon résumé",
      review: "3. Vérifier avant de confirmer", submit: "Préparer la compréhension", confirm: "Confirmer cette version exacte",
      reject: "Rejeter cette version", none: "Aucun fichier ajouté.", retry: "Réessayer ce fichier", limitation: "Limites honnêtes",
      limits: "Les notes vocales ne sont pas transcrites. Le contenu des documents et photos n’est pas interprété dans cette version locale.",
      created: "Créer la mémoire du chantier", back: "Retour aux chantiers",
      protected: "Cette mémoire est réservée au propriétaire ou au bureau.", loading: "Mémoire du chantier…",
      unavailable: "La mémoire du chantier est indisponible pour le moment.", invalidFile: "Un fichier a été refusé : type ou taille non permis.",
      microphoneDenied: "Permission microphone refusée.", voiceInvalid: "Aucune note vocale utilisable.",
      voiceTooLarge: "Note vocale vide ou trop volumineuse.", voiceReadFailed: "La note vocale n’a pas pu être lue. Réessaie l’enregistrement.",
      voiceTooLong: "La note vocale dépasse la limite de 2 minutes. Enregistre une note plus courte.",
      voiceMobileOnly: "L’enregistrement vocal est offert dans l’application iOS ou Android.", continueUpload: "Continuer ce fichier",
      locked: "Ce résumé est verrouillé pendant la vérification de cette version exacte.", version: "Version", localOnly: "Conservé localement; aucun envoi externe.", kilobytes: "Ko",
      newVersion: "Créer une nouvelle version", pendingCommands: "Reprise sécurisée", retryCommand: "Réessayer exactement cette action",
      dismiss: "Fermer ce résultat", interrupted: "L’application a redémarré pendant cette action. Réessaie exactement la même commande.",
      localQueueUnavailable: "La reprise locale chiffrée est indisponible. Aucune action n’a été envoyée.",
      pendingSignOut: "Terminez ou refusez les actions Projet en attente avant de vous déconnecter.",
      commandAction: { CREATE_PROJECT_BRAIN_INTAKE: "Création de la mémoire", ADD_OWNER_BRIEF: "Enregistrement du résumé", SUBMIT_PROJECT_BRAIN_INTAKE: "Préparation de la compréhension", CONFIRM_PROJECT_BRAIN_INTAKE: "Confirmation exacte", REJECT_PROJECT_BRAIN_INTAKE: "Rejet de la version" },
      sourceKind: { PHOTO: "Photo", DOCUMENT: "Document", VOICE_NOTE: "Note vocale" },
      sourceState: { READY: "En attente", SENDING: "Ajout en cours…", CONFLICT: "Version changée — recharge requise", OUTCOME_UNKNOWN: "Résultat inconnu", REFUSED: "Fichier refusé" },
      status: { DRAFT: "Brouillon", READY_FOR_REVIEW: "À vérifier", CONFIRMED: "Confirmé", REJECTED: "Rejeté" },
    },
    projectBrainReview: {
      eyebrow: "COMPRÉHENSION DU CHANTIER", title: "Vérifie ce qu’ENDVERA retient.",
      body: "Chaque élément vient de ton résumé ou des métadonnées admises. Tu décides; aucune contradiction n’est réglée automatiquement.",
      back: "Retour aux chantiers", loading: "Chargement de la compréhension…", unavailable: "La vérification est indisponible.", create: "Commencer la vérification",
      sources: "Sources admises", candidates: "Éléments à décider", noSources: "Aucune source jointe.", accept: "Accepter", reject: "Rejeter", contradiction: "Contradiction",
      selected: "sélectionnés", declare: "Déclarer la contradiction", contradictions: "Contradictions conservées", chooseSupported: "Garder les éléments sélectionnés", rejectAll: "Tout rejeter",
      ownerResolution: "Écris ta résolution exacte", saveResolution: "Enregistrer la résolution", prepare: "Préparer la compréhension exacte", confirm: "Confirmer cette compréhension exacte", confirmed: "Compréhension confirmée et immuable.",
      version: "Version", localOnly: "Local seulement; aucun modèle, lecture binaire ou envoi externe.", completeEach: "Décide chaque élément et résous chaque contradiction avant de préparer.", protected: "Réservé au propriétaire et au bureau.",
    },
    calendarScreen: {
      eyebrow: "AGENDA", title: "Ce qui s’en vient.", body: "Tes rendez-vous de chantier, dans le bon fuseau horaire.",
      add: "Ajouter avec ENDVERA", empty: "Aucun rendez-vous prévu.", verified: "Confirmé", needsReview: "À vérifier",
      rejected: "Refusé", unknown: "État inconnu",
      connector: "Les calendriers externes seront affichés ici une fois connectés.",
    },
    reviewScreen: {
      eyebrow: "CONTRÔLE HUMAIN", title: "À valider", body: "Vois exactement ce qu’ENDVERA fera avant de confirmer.",
      safety: "Rien ne part sans toi", safetyBody: "Le destinataire, le canal et le message restent visibles avant chaque approbation.",
      recipient: "Destinataire", channel: "Canal", exactMessage: "Message exact", approve: "Approuver ce message",
      reject: "Refuser", rejectWhy: "Pourquoi le refuser?", revoke: "Révoquer l’approbation", revokeWhy: "Pourquoi révoquer?",
      approved: "Approuvé, mais pas encore envoyé.", empty: "Rien à valider pour le moment.", generalAction: "Action générale",
      technicalDetails: "Détails de vérification", version: "Version", prepared: "À approuver",
      processing: "Décision en cours…", replayed: "Décision déjà appliquée; aucun doublon.",
      confirmed: "Décision enregistrée; rien n’a été envoyé.", conflict: "Cette action avait changé. La version actuelle a été rechargée.",
      unknown: "Résultat inconnu — réessaie exactement la même décision.", refused: "Décision refusée; rien n’a été envoyé.",
      retry: "Réessayer la même décision", protectedTitle: "Actions protégées",
      protectedBody: "Les communications et décisions sont réservées au propriétaire et au bureau.",
      protectedEmpty: "Aucun destinataire, message ou montant sensible n’est affiché dans le rôle chantier.",
    },
    auth: {
      eyebrow: "ASSISTANT D’OPÉRATIONS", title: "Tes chantiers. Une conversation.",
      body: "Planifie, retrouve l’information et prépare tes suivis depuis ton téléphone.", email: "Courriel", password: "Mot de passe",
      submit: "Ouvrir ENDVERA", submitting: "Connexion…", refused: "Connexion refusée. Vérifie tes informations.",
      unavailable: "Connexion impossible pour le moment.", trust: "Tes actions sensibles demandent toujours ton approbation.",
    },
  },
  "en-CA": {
    tabs: { today: "Today", assistant: "Assistant", projects: "Projects", calendar: "Calendar", review: "Review", more: "More" },
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
    assistantTitle: "How can I help?",
    assistantBody: "Type or speak. I keep your project context and ask before any sensitive action.",
    assistantProtectedTitle: "Protected assistant",
    assistantProtectedBody: "This version is reserved for the owner and office manager.",
    assistantProtectedEmpty: "No conversation or financial data is exposed to the field role.",
    conversation: "Conversation",
    loadingConversation: "ENDVERA is restoring the conversation…",
    emptyConversation: "No messages yet. Try “What do I have tomorrow?”",
    request: "Ask ENDVERA",
    assistantInputLabel: "Request to ENDVERA",
    assistantPlaceholder: "Example: Appointment with Marc Tuesday at 2 p.m. for Laval.",
    submit: "Send",
    processing: "Processing…",
    retry: "Retry the same request",
    refresh: "Reload conversation",
    refreshing: "Syncing…",
    errorRecoveryHint: "The conversation remains saved. Reload it or retry the exact same request.",
    assistantSuggestions: ["What do I have tomorrow?", "What is blocking Laval?", "Prepare a follow-up for Marc"],
    assistantTrustLine: "I prepare messages. You approve before anything is sent.",
    assistantAttach: "Add evidence", assistantVoice: "Talk to ENDVERA", assistantNoWorkspace: "No active Construction workspace.",
    assistantPrepared: "Message prepared — nothing was sent.",
    assistantClarification: "I need your clarification before changing anything.",
    assistantProviderUnavailable: "External research is not enabled yet. No result was invented.",
    assistantHumanSupport: "Human support is available on request. Nothing was created automatically.",
    assistantMemory: {
      title: "Confirmed project memory", body: "I answer only from the latest understanding you confirmed.",
      unavailable: "No confirmed understanding is available.", confirmed: "Confirmed understanding", ask: "Ask",
      summary: "Summary", scope: "Scope", people: "People", dates: "Dates", blockers: "Blockers", next: "Next decision",
      sources: "Reviewed sources", contradictions: "Resolved contradictions", citations: "Provenance", prepared: "Prepared action — nothing was sent",
      recipient: "Recipient", channel: "Channel", exactMessage: "Exact message", approval: "Approval required",
    },
    attempt: {
      SENDING: "ENDVERA is working…", REPLAYED: "Result recovered without a duplicate.",
      OUTCOME_UNKNOWN: "Outcome unknown — retry the exact same request.", REFUSED: "Request refused without an invented effect.",
    },
    home: {
      eyebrow: "YOUR COMMAND CENTRE", title: "Good morning.", body: "Here’s what needs your attention today.",
      quickAsk: "What needs to move?", write: "Type", speak: "Speak", priority: "Top priority",
      appointments: "Appointments", toReview: "To review", openLoops: "Open follow-ups", fullPlan: "View the full plan",
      hidePlan: "Hide the plan", controlTitle: "You stay in control",
      controlBody: "ENDVERA prepares the work. You approve before any external send or change.",
    },
    projectsScreen: {
      eyebrow: "YOUR PROJECTS", title: "Everything in one place.", body: "Status, appointments, and the next step — without rebuilding context.",
      active: "Active", needsAttention: "Needs attention", contacts: "contacts", appointments: "appointments",
      openLoops: "open follow-ups", empty: "No active projects.", open: "Open project", upToDate: "Up to date", brain: "Build project memory", reviewBrain: "Review understanding", askBrain: "Ask project memory",
    },
    projectBrain: {
      eyebrow: "PROJECT MEMORY", title: "Get the job out of your head.",
      body: "Add plans, photos, documents, a voice note, and your summary. ENDVERA keeps them together.",
      sources: "1. Project material", add: "Add multiple files", voice: "Record a voice note", stop: "Stop recording",
      brief: "2. What ENDVERA should remember", summary: "Project summary *", scope: "Scope of work", people: "Important people",
      dates: "Important dates", blockers: "Blockers", next: "Next decision", save: "Save my summary",
      review: "3. Review before confirming", submit: "Prepare the understanding", confirm: "Confirm this exact version",
      reject: "Reject this version", none: "No files added.", retry: "Retry this file", limitation: "Honest limitations",
      limits: "Voice notes are not transcribed. Document and photo contents are not interpreted in this local version.",
      created: "Create project memory", back: "Back to projects",
      protected: "Project memory is reserved for the owner or office.", loading: "Project memory…",
      unavailable: "Project memory is unavailable right now.", invalidFile: "A file was refused: its type or size is not allowed.",
      microphoneDenied: "Microphone permission was denied.", voiceInvalid: "No usable voice note was recorded.",
      voiceTooLarge: "The voice note is empty or too large.", voiceReadFailed: "The voice note could not be read. Record it again.",
      voiceTooLong: "The voice note exceeds the 2-minute limit. Record a shorter note.",
      voiceMobileOnly: "Voice recording is available in the iOS or Android app.", continueUpload: "Continue this file",
      locked: "This summary is locked while you review this exact version.", version: "Version", localOnly: "Stored locally; nothing was sent externally.", kilobytes: "KB",
      newVersion: "Create a new version", pendingCommands: "Safe recovery", retryCommand: "Retry this exact action",
      dismiss: "Dismiss this result", interrupted: "The app restarted during this action. Retry the exact same command.",
      localQueueUnavailable: "Encrypted local recovery is unavailable. No action was sent.",
      pendingSignOut: "Finish or dismiss pending Project actions before signing out.",
      commandAction: { CREATE_PROJECT_BRAIN_INTAKE: "Create project memory", ADD_OWNER_BRIEF: "Save owner summary", SUBMIT_PROJECT_BRAIN_INTAKE: "Prepare understanding", CONFIRM_PROJECT_BRAIN_INTAKE: "Exact confirmation", REJECT_PROJECT_BRAIN_INTAKE: "Reject version" },
      sourceKind: { PHOTO: "Photo", DOCUMENT: "Document", VOICE_NOTE: "Voice note" },
      sourceState: { READY: "Waiting", SENDING: "Adding…", CONFLICT: "Version changed — reload required", OUTCOME_UNKNOWN: "Outcome unknown", REFUSED: "File refused" },
      status: { DRAFT: "Draft", READY_FOR_REVIEW: "Ready to review", CONFIRMED: "Confirmed", REJECTED: "Rejected" },
    },
    projectBrainReview: {
      eyebrow: "PROJECT UNDERSTANDING", title: "Review what ENDVERA retains.",
      body: "Every item comes from your summary or admitted metadata. You decide; no contradiction is resolved automatically.",
      back: "Back to projects", loading: "Loading project understanding…", unavailable: "The review is unavailable.", create: "Start the review",
      sources: "Admitted sources", candidates: "Items to decide", noSources: "No attached source.", accept: "Accept", reject: "Reject", contradiction: "Contradiction",
      selected: "selected", declare: "Declare contradiction", contradictions: "Preserved contradictions", chooseSupported: "Keep selected items", rejectAll: "Reject all",
      ownerResolution: "Write your exact resolution", saveResolution: "Save resolution", prepare: "Prepare exact understanding", confirm: "Confirm this exact understanding", confirmed: "Understanding confirmed and immutable.",
      version: "Version", localOnly: "Local only; no model, binary reading, or external send.", completeEach: "Decide every item and resolve every contradiction before preparing.", protected: "Reserved for the owner and office.",
    },
    calendarScreen: {
      eyebrow: "CALENDAR", title: "What’s coming up.", body: "Your project appointments, in the right time zone.",
      add: "Add with ENDVERA", empty: "No appointments scheduled.", verified: "Confirmed", needsReview: "Needs review",
      rejected: "Rejected", unknown: "Unknown state",
      connector: "External calendars will appear here once connected.",
    },
    reviewScreen: {
      eyebrow: "HUMAN CONTROL", title: "Review", body: "See exactly what ENDVERA will do before you confirm.",
      safety: "Nothing goes out without you", safetyBody: "Recipient, channel, and message remain visible before every approval.",
      recipient: "Recipient", channel: "Channel", exactMessage: "Exact message", approve: "Approve this message",
      reject: "Reject", rejectWhy: "Why reject it?", revoke: "Revoke approval", revokeWhy: "Why revoke it?",
      approved: "Approved, but not sent yet.", empty: "Nothing to review right now.", generalAction: "General action",
      technicalDetails: "Verification details", version: "Version", prepared: "Ready to review",
      processing: "Saving your decision…", replayed: "Decision already applied; no duplicate.",
      confirmed: "Decision saved; nothing was sent.", conflict: "This action changed. The current version was reloaded.",
      unknown: "Outcome unknown — retry the exact same decision.", refused: "Decision refused; nothing was sent.",
      retry: "Retry the same decision", protectedTitle: "Protected actions",
      protectedBody: "Communications and decisions are reserved for the owner and office.",
      protectedEmpty: "No recipient, message, or sensitive amount is shown to the field role.",
    },
    auth: {
      eyebrow: "OPERATING ASSISTANT", title: "Your projects. One conversation.",
      body: "Plan, retrieve information, and prepare follow-ups from your phone.", email: "Email", password: "Password",
      submit: "Open ENDVERA", submitting: "Signing in…", refused: "Sign-in refused. Check your information.",
      unavailable: "Sign-in is unavailable right now.", trust: "Sensitive actions always require your approval.",
    },
  },
};

export function mobileProductLocale(value: string | null | undefined): MobileProductLocale {
  return value === "en-CA" ? "en-CA" : "fr-CA";
}

export function mobileProductCopy(value: string | null | undefined): MobileProductCopy {
  return MOBILE_PRODUCT_COPY[mobileProductLocale(value)];
}
