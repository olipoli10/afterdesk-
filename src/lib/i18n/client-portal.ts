import type { ClientStatus } from "@/lib/status";
import { SITE_LANGS, siteLangOf, type SiteLang } from "@/lib/i18n/langs";

export type ClientPortalLang = SiteLang;
export const CLIENT_PORTAL_LANGS = SITE_LANGS;
export const clientPortalLangOf = siteLangOf;

export type ClientPortalVoiceCopy = {
  speak: string;
  checking: string;
  disclosureTitle: string;
  disclosure: string;
  consent: string;
  start: string;
  recording: string;
  paused: string;
  pause: string;
  resume: string;
  finish: string;
  cancel: string;
  transcribing: string;
  readyTitle: string;
  readyHelp: string;
  disabled: string;
  permissionDenied: string;
  deviceMissing: string;
  limit: string;
  incomplete: string;
  uncertain: string;
  unavailable: string;
  cancelConfirmation: string;
  confirmCancel: string;
  keepRecording: string;
  recordAgain: string;
};

export type ClientPortalIntakeCopy = {
  kicker: string;
  title: string;
  sub: string;
  switchToForm: string;
  switchToChat: string;
  disclosure: string;
  privacy: string;
  a2Label: string;
  a2Status: string;
  opener: string;
  conversation: string;
  writing: string;
  inputLabel: string;
  placeholder: string;
  start: string;
  send: string;
  sendToA2: string;
  sendingReply: string;
  keyboard: string;
  fallback: string;
  briefHeading: string;
  titleLabel: string;
  descriptionLabel: string;
  quantityLabel: string;
  deadlineLabel: string;
  deadlineSaid: string;
  deadlineOptional: string;
  filesLabel: string;
  filesHint: string;
  submit: string;
  submitting: string;
  keepTalking: string;
  approvalNote: string;
  stages: [string, string, string, string];
  voice: ClientPortalVoiceCopy;
};

export type ClientPortalAuthFormCopy = {
  googleSignIn: string;
  googleSignUp: string;
  googleBusy: string;
  or: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: string;
  hidePassword: string;
  remember: string;
  signIn: string;
  signingIn: string;
  create: string;
  creating: string;
  minCharacters: string;
  moreCharacters: string;
  passwordsMatch: string;
  passwordTooShort: string;
  passwordMismatch: string;
  signInFailed: string;
  signUpFailed: string;
  emailSignupUnavailable: string;
  workerNote: string;
};

type ClientPortalAuthCopy = {
  backToSite: string;
  loginKicker: string;
  loginTitle: string;
  loginSub: string;
  noAccount: string;
  clientSignup: string;
  specialistApplication: string;
  applicationReceived: string;
  registerKicker: string;
  registerTitle: string;
  registerSub: string;
  alreadyRegistered: string;
  signInLink: string;
  registerAside: { title: string; body: string }[];
  form: ClientPortalAuthFormCopy;
};

type ClientPortalDictionary = {
  shell: {
    area: string;
    tasks: string;
    newTask: string;
    standingCapacity: string;
    notifications: string;
    signOut: string;
    signingOut: string;
  };
  dashboard: {
    kicker: string;
    title: string;
    sub: string;
    requestKicker: string;
    requestTitle: string;
    requestBody: string;
    requestCta: string;
    overview: string;
    needsAction: string;
    inMotion: string;
    inReview: string;
    delivered: string;
    submitted: string;
    deadline: string;
    noTasks: string;
    noTasksBody: string;
    firstTask: string;
    sectionTitles: Record<ClientStatus, string>;
    statusLabels: Record<ClientStatus, string>;
  };
  auth: ClientPortalAuthCopy;
  intake: ClientPortalIntakeCopy;
};

const en: ClientPortalDictionary = {
  shell: {
    area: "Workspace",
    tasks: "Workflows",
    newTask: "Talk to A2",
    standingCapacity: "Standing capacity",
    notifications: "Notifications",
    signOut: "Sign out",
    signingOut: "Signing out…",
  },
  dashboard: {
    kicker: "Entrepreneur workspace",
    title: "Your work, from request to result.",
    sub: "See what needs your approval, what Endvera is managing, and what is ready to download.",
    requestKicker: "Start with the problem",
    requestTitle: "Tell A2 what needs to be finished.",
    requestBody: "A2 asks the useful questions and structures a brief for you to review. An operator still confirms fit, scope, timing and one fixed price before work starts.",
    requestCta: "Describe a workflow",
    overview: "At a glance",
    needsAction: "Needs you",
    inMotion: "In motion",
    inReview: "In review",
    delivered: "Delivered",
    submitted: "Submitted",
    deadline: "Deadline",
    noTasks: "No workflows yet",
    noTasksBody: "Start with the business problem or result you need. A2 will turn the conversation into a brief you can edit before it reaches an operator.",
    firstTask: "Talk to A2",
    sectionTitles: {
      quote_ready: "Action needed — price ready",
      awaiting_payment: "Action needed — payment",
      being_priced: "Scope and price review",
      awaiting_routing: "Queued",
      in_progress: "In progress",
      revision_in_progress: "Revision in progress",
      under_review: "Final review",
      completed: "Finished work",
      declined: "Declined",
      expired: "Expired",
      cancelled: "Cancelled",
    },
    statusLabels: {
      quote_ready: "Price ready",
      awaiting_payment: "Payment needed",
      being_priced: "Being scoped",
      awaiting_routing: "Queued",
      in_progress: "In progress",
      revision_in_progress: "Revising",
      under_review: "In review",
      completed: "Delivered",
      declined: "Declined",
      expired: "Expired",
      cancelled: "Cancelled",
    },
  },
  auth: {
    backToSite: "Back to site",
    loginKicker: "Sign in",
    loginTitle: "Welcome back.",
    loginSub: "Sign in to your dashboard.",
    noAccount: "No account yet?",
    clientSignup: "Client sign-up",
    specialistApplication: "Specialist application",
    applicationReceived: "Application received — sign in to continue.",
    registerKicker: "Client sign-up",
    registerTitle: "Create your account.",
    registerSub: "Describe deliverables, approve one-off pricing, and download reviewed work.",
    alreadyRegistered: "Already registered?",
    signInLink: "Sign in",
    registerAside: [
      { title: "Scope and price come first", body: "Describe the deliverable, receive one fixed price for a one-off task, and approve it before work begins." },
      { title: "Reviewed before you see it", body: "Every delivery is checked against your brief before it reaches you. You get the corrected version, not the first attempt." },
      { title: "One-off work needs no subscription", body: "Use a one-off task without a retainer or minimum. You approve one fixed price per deliverable before anything starts." },
    ],
    form: {
      googleSignIn: "Continue with Google", googleSignUp: "Sign up with Google", googleBusy: "Redirecting…", or: "or",
      name: "Company or contact name", email: "Email", password: "Password", confirmPassword: "Confirm password",
      showPassword: "Show password", hidePassword: "Hide password", remember: "Keep me signed in on this device",
      signIn: "Sign in", signingIn: "Signing in…", create: "Create account", creating: "Creating account…",
      minCharacters: "At least {min} characters.", moreCharacters: "{count} more to add.", passwordsMatch: "Passwords match.",
      passwordTooShort: "Password must be at least {min} characters.", passwordMismatch: "Passwords do not match.",
      signInFailed: "Sign-in failed.", signUpFailed: "Sign-up failed.",
      emailSignupUnavailable: "Email sign-up is temporarily unavailable. Use Google to create your client account.",
      workerNote: "Specialist accounts sign in with email and password — Google sign-in always opens a client account.",
    },
  },
  intake: {
    kicker: "A2 intake",
    title: "Hi. What can I help you finish?",
    sub: "I’ll ask a few useful questions and turn the conversation into a brief for you to review.",
    switchToForm: "Write the brief myself",
    switchToChat: "Talk it through with A2",
    disclosure: "A2 structures this intake conversation; it does not complete the task. Review the brief before submitting and avoid unnecessary sensitive information.",
    privacy: "Privacy policy",
    a2Label: "A2",
    a2Status: "Ready when you are",
    opener: "Describe the issue, the workflow you do today, or the result you want back. Start wherever it makes sense.",
    conversation: "Conversation with A2",
    writing: "A2 is thinking…",
    inputLabel: "Describe your problem or workflow",
    placeholder: "Describe your issue or workflow…",
    start: "Send to A2",
    send: "Send to A2",
    sendToA2: "Send to A2",
    sendingReply: "Thinking",
    keyboard: "Enter to send · Shift+Enter for a new line",
    fallback: "Write the brief myself",
    briefHeading: "Brief prepared by A2 — review every detail",
    titleLabel: "Result title",
    descriptionLabel: "Deliverable, rules and definition of done",
    quantityLabel: "Quantity / volume",
    deadlineLabel: "Deadline",
    deadlineSaid: "You said: {hint}. Set the exact time ({timezone}).",
    deadlineOptional: "Optional. Your local time ({timezone}).",
    filesLabel: "Source files",
    filesHint: "The export, list, spreadsheet or documents the work operates on.",
    submit: "Send this brief",
    submitting: "Sending…",
    keepTalking: "Keep talking",
    approvalNote: "A2 prepares the brief. An operator confirms scope, timing and one fixed price before work starts.",
    stages: ["Describe", "Review brief", "Approve scope + price", "Receive checked result"],
    voice: {
      speak: "Speak instead",
      checking: "Checking voice input…",
      disclosureTitle: "Describe it out loud",
      disclosure: "When you finish, your recording is sent for transcription. Review the text before you send it to A2.",
      consent: "I’m ready to send this recording for transcription.",
      start: "Start recording",
      recording: "Recording · {time} of 10:00",
      paused: "Paused",
      pause: "Pause",
      resume: "Resume",
      finish: "Finish and transcribe",
      cancel: "Cancel recording",
      transcribing: "Transcribing {current} of {total}…",
      readyTitle: "Transcript ready",
      readyHelp: "Review and edit the text. Send it only when it says what you mean.",
      disabled: "Voice input isn’t available yet. You can still type your request.",
      permissionDenied: "Microphone access is off. Allow it in your browser, or type your request instead.",
      deviceMissing: "No microphone was found. Connect one, or type your request instead.",
      limit: "You reached the 10-minute limit. We’ll transcribe what you recorded.",
      incomplete: "One part couldn’t be transcribed. Nothing was sent to A2. Record again or finish the description by typing.",
      uncertain: "We can’t confirm one part yet. Nothing was sent to A2. Keep this page open or continue by typing.",
      unavailable: "Transcription isn’t available right now. Your text hasn’t been sent. Try again or type your request.",
      cancelConfirmation: "Cancel this recording? The unsent recording and draft transcript will be discarded.",
      confirmCancel: "Cancel recording",
      keepRecording: "Keep recording",
      recordAgain: "Record again",
    },
  },
};

const fr: ClientPortalDictionary = {
  shell: {
    area: "Espace client",
    tasks: "Workflows",
    newTask: "Parler à A2",
    standingCapacity: "Capacité réservée",
    notifications: "Notifications",
    signOut: "Déconnexion",
    signingOut: "Déconnexion…",
  },
  dashboard: {
    kicker: "Espace entrepreneur",
    title: "Votre travail, de la demande au résultat.",
    sub: "Voyez ce qui attend votre approbation, ce qu’Endvera gère et ce qui est prêt à télécharger.",
    requestKicker: "Commencez par le problème",
    requestTitle: "Expliquez à A2 ce qui doit être terminé.",
    requestBody: "A2 pose les questions utiles et structure un brief que vous révisez. Un opérateur confirme toujours l’adéquation, le périmètre, le délai et un prix fixe avant le début du travail.",
    requestCta: "Décrire un workflow",
    overview: "Vue d’ensemble",
    needsAction: "À vous de jouer",
    inMotion: "En cours",
    inReview: "En révision",
    delivered: "Livrés",
    submitted: "Soumis",
    deadline: "Échéance",
    noTasks: "Aucun workflow pour le moment",
    noTasksBody: "Commencez par le problème d’affaires ou le résultat voulu. A2 transforme la discussion en brief modifiable avant qu’un opérateur le reçoive.",
    firstTask: "Parler à A2",
    sectionTitles: {
      quote_ready: "Action requise — prix prêt",
      awaiting_payment: "Action requise — paiement",
      being_priced: "Révision du périmètre et du prix",
      awaiting_routing: "En file",
      in_progress: "En cours",
      revision_in_progress: "Correction en cours",
      under_review: "Révision finale",
      completed: "Travail terminé",
      declined: "Refusés",
      expired: "Expirés",
      cancelled: "Annulés",
    },
    statusLabels: {
      quote_ready: "Prix prêt",
      awaiting_payment: "Paiement requis",
      being_priced: "Cadrage en cours",
      awaiting_routing: "En file",
      in_progress: "En cours",
      revision_in_progress: "En correction",
      under_review: "En révision",
      completed: "Livré",
      declined: "Refusé",
      expired: "Expiré",
      cancelled: "Annulé",
    },
  },
  auth: {
    backToSite: "Retour au site",
    loginKicker: "Connexion",
    loginTitle: "Bon retour.",
    loginSub: "Connectez-vous à votre espace client.",
    noAccount: "Pas encore de compte?",
    clientSignup: "Créer un compte client",
    specialistApplication: "Candidature spécialiste",
    applicationReceived: "Candidature reçue — connectez-vous pour continuer.",
    registerKicker: "Compte client",
    registerTitle: "Créez votre compte.",
    registerSub: "Décrivez vos livrables, approuvez un prix unique et téléchargez le travail vérifié.",
    alreadyRegistered: "Déjà inscrit?",
    signInLink: "Se connecter",
    registerAside: [
      { title: "Le périmètre et le prix d’abord", body: "Décrivez le livrable, recevez un prix fixe pour la demande et approuvez-le avant le début du travail." },
      { title: "Vérifié avant la livraison", body: "Chaque livraison est comparée à votre brief. Vous recevez la version corrigée, pas une première tentative." },
      { title: "Aucun abonnement requis", body: "Demandez un travail ponctuel sans forfait ni minimum. Vous approuvez un prix fixe par livrable." },
    ],
    form: {
      googleSignIn: "Continuer avec Google", googleSignUp: "S’inscrire avec Google", googleBusy: "Redirection…", or: "ou",
      name: "Entreprise ou nom du contact", email: "Courriel", password: "Mot de passe", confirmPassword: "Confirmer le mot de passe",
      showPassword: "Afficher", hidePassword: "Masquer", remember: "Garder ma session ouverte sur cet appareil",
      signIn: "Se connecter", signingIn: "Connexion…", create: "Créer le compte", creating: "Création…",
      minCharacters: "Au moins {min} caractères.", moreCharacters: "Encore {count} à ajouter.", passwordsMatch: "Les mots de passe correspondent.",
      passwordTooShort: "Le mot de passe doit contenir au moins {min} caractères.", passwordMismatch: "Les mots de passe ne correspondent pas.",
      signInFailed: "Échec de la connexion.", signUpFailed: "Échec de l’inscription.",
      emailSignupUnavailable: "L’inscription par courriel est temporairement indisponible. Utilisez Google pour créer votre compte client.",
      workerNote: "Les spécialistes se connectent avec leur courriel et leur mot de passe; Google ouvre toujours un compte client.",
    },
  },
  intake: {
    kicker: "Prise en charge A2",
    title: "Bonjour. Qu’est-ce que je peux vous aider à terminer?",
    sub: "Je poserai quelques questions utiles et transformerai la discussion en brief à réviser.",
    switchToForm: "Rédiger le brief moi-même",
    switchToChat: "En parler avec A2",
    disclosure: "A2 structure cette discussion de prise en charge; il n’exécute pas la tâche. Révisez le brief avant l’envoi et évitez les données sensibles inutiles.",
    privacy: "Politique de confidentialité",
    a2Label: "A2",
    a2Status: "Prêt quand vous l’êtes",
    opener: "Décrivez le problème, votre workflow actuel ou le résultat que vous voulez recevoir. Commencez où cela vous semble naturel.",
    conversation: "Discussion avec A2",
    writing: "A2 réfléchit…",
    inputLabel: "Décrivez votre problème ou workflow",
    placeholder: "Décrivez votre problème ou workflow…",
    start: "Envoyer à A2",
    send: "Envoyer à A2",
    sendToA2: "Envoyer à A2",
    sendingReply: "Réflexion",
    keyboard: "Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne",
    fallback: "Rédiger le brief moi-même",
    briefHeading: "Brief préparé par A2 — révisez chaque détail",
    titleLabel: "Titre du résultat",
    descriptionLabel: "Livrable, règles et définition de terminé",
    quantityLabel: "Quantité / volume",
    deadlineLabel: "Échéance",
    deadlineSaid: "Vous avez dit : {hint}. Fixez l’heure exacte ({timezone}).",
    deadlineOptional: "Facultatif. Votre heure locale ({timezone}).",
    filesLabel: "Fichiers sources",
    filesHint: "L’export, la liste, le tableur ou les documents sur lesquels porte le travail.",
    submit: "Envoyer ce brief",
    submitting: "Envoi…",
    keepTalking: "Continuer la discussion",
    approvalNote: "A2 prépare le brief. Un opérateur confirme le périmètre, le délai et un prix fixe avant le début du travail.",
    stages: ["Décrire", "Réviser le brief", "Approuver périmètre + prix", "Recevoir le résultat vérifié"],
    voice: {
      speak: "Parler au lieu d’écrire",
      checking: "Vérification de la saisie vocale…",
      disclosureTitle: "Décrivez-le à voix haute",
      disclosure: "Quand vous terminez, votre enregistrement est envoyé pour transcription. Relisez le texte avant de l’envoyer à A2.",
      consent: "Je suis prêt à envoyer cet enregistrement pour transcription.",
      start: "Commencer l’enregistrement",
      recording: "Enregistrement · {time} sur 10:00",
      paused: "En pause",
      pause: "Mettre en pause",
      resume: "Reprendre",
      finish: "Terminer et transcrire",
      cancel: "Annuler l’enregistrement",
      transcribing: "Transcription {current} sur {total}…",
      readyTitle: "Transcription prête",
      readyHelp: "Relisez et modifiez le texte. Envoyez-le seulement lorsqu’il exprime bien votre demande.",
      disabled: "La saisie vocale n’est pas encore disponible. Vous pouvez quand même écrire votre demande.",
      permissionDenied: "L’accès au microphone est désactivé. Autorisez-le dans votre navigateur ou écrivez votre demande.",
      deviceMissing: "Aucun microphone n’a été détecté. Branchez-en un ou écrivez votre demande.",
      limit: "Vous avez atteint la limite de 10 minutes. Nous allons transcrire ce qui a été enregistré.",
      incomplete: "Une partie n’a pas pu être transcrite. Rien n’a été envoyé à A2. Recommencez ou complétez la description par écrit.",
      uncertain: "Nous ne pouvons pas encore confirmer une partie. Rien n’a été envoyé à A2. Gardez cette page ouverte ou continuez par écrit.",
      unavailable: "La transcription est indisponible pour le moment. Votre texte n’a pas été envoyé. Réessayez ou écrivez votre demande.",
      cancelConfirmation: "Annuler cet enregistrement? L’enregistrement non envoyé et le brouillon seront supprimés.",
      confirmCancel: "Annuler l’enregistrement",
      keepRecording: "Continuer l’enregistrement",
      recordAgain: "Recommencer",
    },
  },
};

const es: ClientPortalDictionary = {
  ...en,
  shell: {
    area: "Espacio cliente",
    tasks: "Flujos",
    newTask: "Hablar con A2",
    standingCapacity: "Capacidad reservada",
    notifications: "Notificaciones",
    signOut: "Cerrar sesión",
    signingOut: "Cerrando sesión…",
  },
  dashboard: {
    ...en.dashboard,
    kicker: "Espacio del emprendedor",
    title: "Tu trabajo, de la solicitud al resultado.",
    sub: "Ve qué necesita tu aprobación, qué está gestionando Endvera y qué está listo para descargar.",
    requestKicker: "Empieza por el problema",
    requestTitle: "Cuéntale a A2 qué hay que terminar.",
    requestBody: "A2 hace las preguntas útiles y estructura un brief para que lo revises. Un operador confirma encaje, alcance, plazo y precio fijo antes de empezar.",
    requestCta: "Describir un flujo",
    overview: "De un vistazo",
    needsAction: "Te necesita",
    inMotion: "En curso",
    inReview: "En revisión",
    delivered: "Entregados",
    submitted: "Enviado",
    deadline: "Plazo",
    noTasks: "Todavía no hay flujos",
    noTasksBody: "Empieza por el problema de negocio o el resultado que necesitas. A2 convertirá la conversación en un brief editable.",
    firstTask: "Hablar con A2",
    sectionTitles: {
      quote_ready: "Acción necesaria — precio listo",
      awaiting_payment: "Acción necesaria — pago",
      being_priced: "Revisión de alcance y precio",
      awaiting_routing: "En cola",
      in_progress: "En curso",
      revision_in_progress: "Corrección en curso",
      under_review: "Revisión final",
      completed: "Trabajo terminado",
      declined: "Rechazados",
      expired: "Vencidos",
      cancelled: "Cancelados",
    },
    statusLabels: {
      quote_ready: "Precio listo",
      awaiting_payment: "Pago necesario",
      being_priced: "Definiendo alcance",
      awaiting_routing: "En cola",
      in_progress: "En curso",
      revision_in_progress: "En corrección",
      under_review: "En revisión",
      completed: "Entregado",
      declined: "Rechazado",
      expired: "Vencido",
      cancelled: "Cancelado",
    },
  },
  auth: {
    backToSite: "Volver al sitio",
    loginKicker: "Iniciar sesión",
    loginTitle: "Qué bueno verte de nuevo.",
    loginSub: "Entra a tu espacio de trabajo.",
    noAccount: "¿Aún no tienes cuenta?",
    clientSignup: "Crear cuenta de cliente",
    specialistApplication: "Solicitud de especialista",
    applicationReceived: "Solicitud recibida — inicia sesión para continuar.",
    registerKicker: "Cuenta de cliente",
    registerTitle: "Crea tu cuenta.",
    registerSub: "Describe entregables, aprueba un precio único y descarga el trabajo revisado.",
    alreadyRegistered: "¿Ya tienes cuenta?",
    signInLink: "Iniciar sesión",
    registerAside: [
      { title: "Primero, alcance y precio", body: "Describe el entregable, recibe un precio fijo y apruébalo antes de que empiece el trabajo." },
      { title: "Revisado antes de la entrega", body: "Cada entrega se comprueba contra tu brief. Recibes la versión corregida, no el primer intento." },
      { title: "Sin suscripción obligatoria", body: "Pide un trabajo puntual sin cuota ni mínimo. Apruebas un precio fijo por entregable." },
    ],
    form: {
      googleSignIn: "Continuar con Google", googleSignUp: "Registrarse con Google", googleBusy: "Redirigiendo…", or: "o",
      name: "Empresa o persona de contacto", email: "Correo electrónico", password: "Contraseña", confirmPassword: "Confirmar contraseña",
      showPassword: "Mostrar", hidePassword: "Ocultar", remember: "Mantener mi sesión abierta en este dispositivo",
      signIn: "Iniciar sesión", signingIn: "Iniciando…", create: "Crear cuenta", creating: "Creando…",
      minCharacters: "Al menos {min} caracteres.", moreCharacters: "Faltan {count}.", passwordsMatch: "Las contraseñas coinciden.",
      passwordTooShort: "La contraseña debe tener al menos {min} caracteres.", passwordMismatch: "Las contraseñas no coinciden.",
      signInFailed: "No se pudo iniciar sesión.", signUpFailed: "No se pudo crear la cuenta.",
      emailSignupUnavailable: "El registro por correo no está disponible temporalmente. Usa Google para crear tu cuenta de cliente.",
      workerNote: "Los especialistas entran con correo y contraseña; Google siempre abre una cuenta de cliente.",
    },
  },
  intake: {
    ...en.intake,
    kicker: "Recepción con A2",
    title: "Hola. ¿Qué puedo ayudarte a terminar?",
    sub: "Haré algunas preguntas útiles y convertiré la conversación en un brief para que lo revises.",
    switchToForm: "Escribir el brief yo",
    switchToChat: "Hablarlo con A2",
    disclosure: "A2 estructura esta conversación; no completa la tarea. Revisa el brief antes de enviarlo y evita datos sensibles innecesarios.",
    privacy: "Política de privacidad",
    a2Status: "Listo cuando tú lo estés",
    opener: "Describe el problema, el flujo que haces hoy o el resultado que quieres recibir. Empieza por donde te resulte natural.",
    conversation: "Conversación con A2",
    writing: "A2 está pensando…",
    inputLabel: "Describe tu problema o flujo",
    placeholder: "Describe tu problema o flujo…",
    start: "Enviar a A2",
    send: "Enviar a A2",
    sendToA2: "Enviar a A2",
    sendingReply: "Pensando",
    keyboard: "Enter para enviar · Mayús+Enter para nueva línea",
    fallback: "Escribir el brief yo",
    briefHeading: "Brief preparado por A2 — revisa cada detalle",
    titleLabel: "Título del resultado",
    descriptionLabel: "Entregable, reglas y definición de terminado",
    quantityLabel: "Cantidad / volumen",
    deadlineLabel: "Plazo",
    deadlineSaid: "Dijiste: {hint}. Indica la hora exacta ({timezone}).",
    deadlineOptional: "Opcional. Tu hora local ({timezone}).",
    filesLabel: "Archivos fuente",
    filesHint: "La exportación, lista, hoja o documentos sobre los que se trabaja.",
    submit: "Enviar este brief",
    submitting: "Enviando…",
    keepTalking: "Seguir hablando",
    approvalNote: "A2 prepara el brief. Un operador confirma alcance, plazo y precio fijo antes de empezar.",
    stages: ["Describir", "Revisar brief", "Aprobar alcance + precio", "Recibir resultado revisado"],
    voice: {
      speak: "Hablar en vez de escribir",
      checking: "Comprobando la entrada de voz…",
      disclosureTitle: "Descríbelo en voz alta",
      disclosure: "Cuando termines, tu grabación se enviará para transcribirla. Revisa el texto antes de enviarlo a A2.",
      consent: "Estoy listo para enviar esta grabación para su transcripción.",
      start: "Iniciar grabación",
      recording: "Grabando · {time} de 10:00",
      paused: "En pausa",
      pause: "Pausar",
      resume: "Continuar",
      finish: "Finalizar y transcribir",
      cancel: "Cancelar grabación",
      transcribing: "Transcribiendo {current} de {total}…",
      readyTitle: "Transcripción lista",
      readyHelp: "Revisa y edita el texto. Envíalo solo cuando exprese lo que quieres decir.",
      disabled: "La entrada de voz aún no está disponible. Puedes escribir tu solicitud.",
      permissionDenied: "El acceso al micrófono está desactivado. Actívalo en el navegador o escribe tu solicitud.",
      deviceMissing: "No se encontró ningún micrófono. Conecta uno o escribe tu solicitud.",
      limit: "Llegaste al límite de 10 minutos. Transcribiremos lo que grabaste.",
      incomplete: "No se pudo transcribir una parte. No se envió nada a A2. Graba de nuevo o completa la descripción por escrito.",
      uncertain: "Aún no podemos confirmar una parte. No se envió nada a A2. Mantén esta página abierta o continúa escribiendo.",
      unavailable: "La transcripción no está disponible ahora. Tu texto no se envió. Inténtalo de nuevo o escribe tu solicitud.",
      cancelConfirmation: "¿Cancelar esta grabación? Se descartarán la grabación no enviada y el borrador.",
      confirmCancel: "Cancelar grabación",
      keepRecording: "Seguir grabando",
      recordAgain: "Grabar de nuevo",
    },
  },
};

const tl: ClientPortalDictionary = {
  ...en,
  shell: {
    area: "Client workspace",
    tasks: "Mga workflow",
    newTask: "Kausapin si A2",
    standingCapacity: "Nakareserbang capacity",
    notifications: "Mga abiso",
    signOut: "Mag-sign out",
    signingOut: "Nagsa-sign out…",
  },
  dashboard: {
    ...en.dashboard,
    kicker: "Workspace ng entrepreneur",
    title: "Ang trabaho mo, mula request hanggang resulta.",
    sub: "Tingnan kung ano ang kailangan ng approval mo, ano ang mina-manage ng Endvera, at ano ang handa nang i-download.",
    requestKicker: "Magsimula sa problema",
    requestTitle: "Sabihin kay A2 kung ano ang kailangang tapusin.",
    requestBody: "Itatanong ni A2 ang mahalagang detalye at gagawa ng brief na rerepasuhin mo. Operator pa rin ang magkukumpirma ng fit, scope, timing at fixed na presyo bago magsimula.",
    requestCta: "Ilarawan ang workflow",
    overview: "Sa isang tingin",
    needsAction: "Kailangan ka",
    inMotion: "Gumagalaw",
    inReview: "Sinusuri",
    delivered: "Naihatid",
    submitted: "Isinumite",
    deadline: "Deadline",
    noTasks: "Wala pang workflow",
    noTasksBody: "Magsimula sa business problem o resultang kailangan mo. Gagawing editable na brief ni A2 ang usapan.",
    firstTask: "Kausapin si A2",
    sectionTitles: {
      quote_ready: "Kailangan ng aksyon — handa ang presyo",
      awaiting_payment: "Kailangan ng aksyon — bayad",
      being_priced: "Sinusuri ang scope at presyo",
      awaiting_routing: "Nakapila",
      in_progress: "Ginagawa",
      revision_in_progress: "Inaayos",
      under_review: "Huling pagsusuri",
      completed: "Tapos na trabaho",
      declined: "Tinanggihan",
      expired: "Nag-expire",
      cancelled: "Kinansela",
    },
    statusLabels: {
      quote_ready: "Handa ang presyo",
      awaiting_payment: "Kailangan ng bayad",
      being_priced: "Inaayos ang scope",
      awaiting_routing: "Nakapila",
      in_progress: "Ginagawa",
      revision_in_progress: "Inaayos",
      under_review: "Sinusuri",
      completed: "Naihatid",
      declined: "Tinanggihan",
      expired: "Nag-expire",
      cancelled: "Kinansela",
    },
  },
  auth: {
    backToSite: "Bumalik sa site",
    loginKicker: "Mag-sign in",
    loginTitle: "Maligayang pagbabalik.",
    loginSub: "Mag-sign in sa iyong workspace.",
    noAccount: "Wala ka pang account?",
    clientSignup: "Gumawa ng client account",
    specialistApplication: "Aplikasyon ng specialist",
    applicationReceived: "Natanggap ang aplikasyon — mag-sign in para magpatuloy.",
    registerKicker: "Client account",
    registerTitle: "Gumawa ng account.",
    registerSub: "Ilarawan ang deliverable, aprubahan ang isang presyo, at i-download ang sinuring trabaho.",
    alreadyRegistered: "May account ka na?",
    signInLink: "Mag-sign in",
    registerAside: [
      { title: "Scope at presyo muna", body: "Ilarawan ang deliverable, tumanggap ng fixed na presyo, at aprubahan ito bago magsimula." },
      { title: "Sinusuri bago ihatid", body: "Bawat delivery ay kinukumpara sa brief. Ang matatanggap mo ay ang inayos na bersyon, hindi ang unang attempt." },
      { title: "Hindi kailangan ng subscription", body: "Mag-request ng one-off na trabaho nang walang retainer o minimum. Isang fixed na presyo ang aaprubahan mo kada deliverable." },
    ],
    form: {
      googleSignIn: "Magpatuloy gamit ang Google", googleSignUp: "Mag-sign up gamit ang Google", googleBusy: "Lilipat…", or: "o",
      name: "Kumpanya o contact name", email: "Email", password: "Password", confirmPassword: "Kumpirmahin ang password",
      showPassword: "Ipakita", hidePassword: "Itago", remember: "Panatilihing naka-sign in sa device na ito",
      signIn: "Mag-sign in", signingIn: "Nagsa-sign in…", create: "Gumawa ng account", creating: "Ginagawa…",
      minCharacters: "Hindi bababa sa {min} character.", moreCharacters: "Kailangan pa ng {count}.", passwordsMatch: "Magkapareho ang mga password.",
      passwordTooShort: "Dapat hindi bababa sa {min} character ang password.", passwordMismatch: "Hindi magkapareho ang mga password.",
      signInFailed: "Hindi makapag-sign in.", signUpFailed: "Hindi magawa ang account.",
      emailSignupUnavailable: "Pansamantalang hindi available ang email sign-up. Gamitin ang Google para gumawa ng client account.",
      workerNote: "Email at password ang gamit ng specialist; palaging client account ang binubuksan ng Google sign-in.",
    },
  },
  intake: {
    ...en.intake,
    kicker: "A2 intake",
    title: "Hi. Ano ang maitutulong kong tapusin?",
    sub: "Magtatanong ako ng ilang mahalagang detalye at gagawing brief ang usapan para ma-review mo.",
    switchToForm: "Ako ang susulat ng brief",
    switchToChat: "Kausapin si A2",
    disclosure: "Inaayos ni A2 ang intake conversation; hindi niya tinatapos ang task. I-review ang brief bago isumite at iwasan ang hindi kailangang sensitibong data.",
    privacy: "Patakaran sa privacy",
    a2Status: "Handa kapag handa ka",
    opener: "Ilarawan ang problema, ang workflow na ginagawa mo ngayon, o ang resultang gusto mong matanggap. Magsimula kung saan natural para sa iyo.",
    conversation: "Usapan kay A2",
    writing: "Nag-iisip si A2…",
    inputLabel: "Ilarawan ang problema o workflow",
    placeholder: "Ilarawan ang problema o workflow…",
    start: "Ipadala kay A2",
    send: "Ipadala kay A2",
    sendToA2: "Ipadala kay A2",
    sendingReply: "Nag-iisip",
    keyboard: "Enter para ipadala · Shift+Enter para bagong linya",
    fallback: "Ako ang susulat ng brief",
    briefHeading: "Brief na ginawa ni A2 — i-review ang bawat detalye",
    titleLabel: "Pamagat ng resulta",
    descriptionLabel: "Deliverable, rules at definition of done",
    quantityLabel: "Dami / volume",
    deadlineLabel: "Deadline",
    deadlineSaid: "Sinabi mo: {hint}. Ilagay ang eksaktong oras ({timezone}).",
    deadlineOptional: "Opsyonal. Lokal mong oras ({timezone}).",
    filesLabel: "Source files",
    filesHint: "Ang export, listahan, spreadsheet o dokumentong gagamitin sa trabaho.",
    submit: "Ipadala ang brief",
    submitting: "Ipinapadala…",
    keepTalking: "Magpatuloy sa usapan",
    approvalNote: "Ihahanda ni A2 ang brief. Operator ang magkukumpirma ng scope, timing at fixed na presyo bago magsimula.",
    stages: ["Ilarawan", "I-review ang brief", "Aprubahan ang scope + presyo", "Tanggapin ang sinuring resulta"],
    voice: {
      speak: "Magsalita sa halip na mag-type",
      checking: "Tinitingnan ang voice input…",
      disclosureTitle: "Ikuwento ito nang malakas",
      disclosure: "Kapag tapos ka na, ipapadala ang recording mo para ma-transcribe. Suriin ang text bago mo ito ipadala kay A2.",
      consent: "Handa akong ipadala ang recording na ito para ma-transcribe.",
      start: "Simulan ang recording",
      recording: "Nagre-record · {time} sa 10:00",
      paused: "Naka-pause",
      pause: "I-pause",
      resume: "Ituloy",
      finish: "Tapusin at i-transcribe",
      cancel: "Kanselahin ang recording",
      transcribing: "Tina-transcribe ang {current} sa {total}…",
      readyTitle: "Handa na ang transcript",
      readyHelp: "Suriin at i-edit ang text. Ipadala lamang kapag malinaw nitong nasasabi ang ibig mong sabihin.",
      disabled: "Hindi pa available ang voice input. Maaari mo pa ring i-type ang request mo.",
      permissionDenied: "Naka-off ang microphone access. I-allow ito sa browser, o i-type na lang ang request mo.",
      deviceMissing: "Walang nakitang microphone. Magkabit ng isa, o i-type na lang ang request mo.",
      limit: "Naabot mo na ang 10-minute limit. Ita-transcribe namin ang na-record mo.",
      incomplete: "May bahaging hindi na-transcribe. Walang ipinadala kay A2. Mag-record ulit o kumpletuhin ito sa pag-type.",
      uncertain: "Hindi pa namin makumpirma ang isang bahagi. Walang ipinadala kay A2. Panatilihing bukas ang page o ituloy sa pag-type.",
      unavailable: "Hindi available ang transcription ngayon. Hindi naipadala ang text mo. Subukan ulit o i-type ang request mo.",
      cancelConfirmation: "Kanselahin ang recording na ito? Buburahin ang hindi naipadalang recording at draft.",
      confirmCancel: "Kanselahin ang recording",
      keepRecording: "Ituloy ang recording",
      recordAgain: "Mag-record ulit",
    },
  },
};

export const CLIENT_PORTAL_I18N: Record<ClientPortalLang, ClientPortalDictionary> = {
  en,
  fr,
  es,
  tl,
};
