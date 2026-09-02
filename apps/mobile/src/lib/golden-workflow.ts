import { z } from "zod";

const step = z.enum(["GET_STARTED", "CAPTURE_WORK", "PLAN_WORK", "COLLECT_PROOF", "FOLLOW_UP", "READY_TO_INVOICE", "APPROVE_ACTION", "REVIEW_HISTORY"]);
const route = z.enum(["ONBOARDING", "ASSISTANT", "PROJECTS", "JOBS", "CALENDAR", "EVIDENCE", "FOLLOW_UPS", "RECEIVABLES", "ACTIONS", "TIMELINE", "PROVENANCE", "HUMAN_SUPPORT", "COCKPIT"]);
const action = z.object({ code: z.string().min(1), route, copyKey: z.string().min(1) }).strict();
const blocker = z.object({ code: z.string().min(1), severity: z.enum(["INFO", "ACTION_REQUIRED"]), copyKey: z.string().min(1), resolutionRoute: route }).strict();
const common = {
  schemaVersion: z.literal(1), registryVersion: z.literal(1), generatedAt: z.string().datetime(),
  workspace: z.object({ id: z.string().min(1), name: z.string().min(1), timezone: z.string().min(1), locale: z.enum(["fr-CA", "en-CA"]), currency: z.literal("CAD") }).strict(),
  project: z.object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) }).strict().nullable(),
  stateFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  steps: z.array(z.object({ step, order: z.number().int().min(1).max(8), status: z.enum(["NOT_STARTED", "CURRENT", "BLOCKED", "COMPLETE"]), titleKey: z.string().min(1), bodyKey: z.string().min(1), blockers: z.array(blocker), route }).strict()).min(1).max(8),
  completedCount: z.number().int().min(0).max(8), totalCount: z.number().int().min(1).max(8), currentStep: step,
  primaryAction: action, secondaryActions: z.array(action).max(3),
  externalCapabilities: z.array(z.object({ code: z.enum(["CALENDAR_SYNC", "SMS_MMS", "VOICE_CALL", "EMAIL", "ACCOUNTING"]), status: z.literal("UNAVAILABLE"), reasonCode: z.literal("PROVIDER_DISABLED_LOCAL") }).strict()).length(5),
  providerObserved: z.literal(false), externalEffectCount: z.literal(0),
};
const owner = z.object({ ...common, role: z.enum(["OWNER", "OFFICE_MANAGER"]), activeExceptionCount: z.number().int().nonnegative(), pendingApprovalCount: z.number().int().nonnegative() }).strict();
const field = z.object({ ...common, role: z.literal("FIELD_WORKER"), assignedProjectCount: z.number().int().nonnegative() }).strict();

const FORBIDDEN_FIELD_KEYS = new Set(["activeExceptionCount", "pendingApprovalCount", "amountMinor", "receivable", "invoiceReference", "contact", "import", "policy", "secret"]);
function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_KEYS.has(key)) throw new Error("MOBILE_GOLDEN_WORKFLOW_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}

export function parseMobileGoldenWorkflow(value: unknown) {
  const header = z.object({ role: z.enum(["OWNER", "OFFICE_MANAGER", "FIELD_WORKER"]) }).passthrough().parse(value);
  if (header.role === "FIELD_WORKER") rejectFieldLeaks(value);
  return z.union([owner, field]).parse(value);
}

export const MOBILE_GOLDEN_WORKFLOW_COPY = {
  "fr-CA": {
    "cockpit.eyebrow": "ASSISTANT D’OPÉRATIONS", "cockpit.title": "Ce qui doit avancer maintenant", "cockpit.body": "ENDVERA garde le contexte et te montre une seule prochaine action sûre.", "cockpit.progress": "Progression du workflow", "cockpit.blockers": "À régler", "cockpit.no_blocker": "Aucun blocage pour cette étape.", "cockpit.external": "Connecteurs externes", "cockpit.external_disabled": "Non activé — le travail local reste disponible.", "cockpit.unavailable": "Le workflow ne peut pas être chargé pour le moment.", "cockpit.empty": "Aucun workflow Construction disponible.", "cockpit.syncing": "Synchronisation…",
    "status.NOT_STARTED": "À venir", "status.CURRENT": "Maintenant", "status.BLOCKED": "Bloqué", "status.COMPLETE": "Terminé",
    "step.get_started.title": "Démarrer l’espace et le chantier", "step.get_started.body": "Créer le contexte de base et les contacts utiles.", "step.capture_work.title": "Dire ce qui doit arriver", "step.capture_work.body": "ENDVERA transforme la demande en état opérationnel.", "step.plan_work.title": "Planifier le travail", "step.plan_work.body": "Placer les jobs, responsables et rendez-vous.", "step.collect_proof.title": "Rassembler les preuves", "step.collect_proof.body": "Conserver photos, documents et approbations.", "step.follow_up.title": "Faire les suivis", "step.follow_up.body": "Savoir qui relancer, quand et pourquoi.", "step.ready_to_invoice.title": "Rendre le dossier facturable", "step.ready_to_invoice.body": "Vérifier les preuves et contradictions avant la facture.", "step.approve_action.title": "Approuver l’action exacte", "step.approve_action.body": "Voir le destinataire, le canal et le contenu avant toute action.", "step.review_history.title": "Revoir l’historique", "step.review_history.body": "Comprendre les faits, décisions et résultats conservés.",
    "action.START_ONBOARDING": "Commencer le démarrage", "action.OPEN_ASSISTANT": "Parler à ENDVERA", "action.OPEN_PROJECTS": "Voir les chantiers", "action.PLAN_JOB": "Planifier le prochain travail", "action.OPEN_CALENDAR": "Ouvrir le calendrier", "action.ADD_EVIDENCE": "Ajouter une preuve", "action.PLAN_FOLLOW_UP": "Préparer un suivi", "action.REVIEW_INVOICE_READINESS": "Vérifier le dossier à facturer", "action.REVIEW_PREPARED_ACTION": "Inspecter l’action préparée", "action.REVIEW_HISTORY": "Voir l’historique du chantier", "action.VIEW_ASSIGNMENTS": "Voir mes travaux assignés", "action.REQUEST_HUMAN_SUPPORT": "Demander un appui humain", "action.RETRY": "Réessayer", "action.SYNC": "Synchroniser",
    "blocker.PROJECT_REQUIRED": "Crée d’abord un chantier.", "blocker.CONTACT_REQUIRED": "Ajoute au moins un contact au chantier.", "blocker.ASSIGNMENT_REQUIRED": "Aucun travail ne t’est assigné.", "blocker.WORK_INTENT_REQUIRED": "Dis à ENDVERA ce qui doit être fait.", "blocker.SCHEDULE_REQUIRED": "Le prochain travail n’est pas encore planifié.", "blocker.EVIDENCE_REQUIRED": "Une photo, un document ou une approbation manque.", "blocker.FOLLOW_UP_REQUIRED": "Aucun suivi responsable n’est encore prévu.", "blocker.INVOICE_EVIDENCE_REQUIRED": "Le dossier n’a pas encore toutes les preuves pour facturer.", "blocker.PREPARED_ACTION_REQUIRED": "Aucune action exacte n’est prête à inspecter.", "blocker.PROVIDER_DISABLED_LOCAL": "Le connecteur réel n’est pas activé dans cet environnement.",
  },
  "en-CA": {
    "cockpit.eyebrow": "OPERATING ASSISTANT", "cockpit.title": "What needs to move now", "cockpit.body": "ENDVERA keeps the context and shows one safe next action.", "cockpit.progress": "Workflow progress", "cockpit.blockers": "Needs attention", "cockpit.no_blocker": "No blocker for this step.", "cockpit.external": "External connectors", "cockpit.external_disabled": "Not enabled — local work remains available.", "cockpit.unavailable": "The workflow cannot be loaded right now.", "cockpit.empty": "No Construction workflow is available.", "cockpit.syncing": "Syncing…",
    "status.NOT_STARTED": "Coming up", "status.CURRENT": "Now", "status.BLOCKED": "Blocked", "status.COMPLETE": "Complete",
    "step.get_started.title": "Start the workspace and project", "step.get_started.body": "Create the core context and useful contacts.", "step.capture_work.title": "Say what needs to happen", "step.capture_work.body": "ENDVERA turns the request into operational state.", "step.plan_work.title": "Plan the work", "step.plan_work.body": "Place jobs, owners and appointments.", "step.collect_proof.title": "Collect evidence", "step.collect_proof.body": "Keep photos, documents and approvals.", "step.follow_up.title": "Run follow-ups", "step.follow_up.body": "Know who to contact, when and why.", "step.ready_to_invoice.title": "Make the file invoice-ready", "step.ready_to_invoice.body": "Check evidence and contradictions before invoicing.", "step.approve_action.title": "Approve the exact action", "step.approve_action.body": "See recipient, channel and content before any action.", "step.review_history.title": "Review history", "step.review_history.body": "Understand retained facts, decisions and results.",
    "action.START_ONBOARDING": "Start setup", "action.OPEN_ASSISTANT": "Talk to ENDVERA", "action.OPEN_PROJECTS": "View projects", "action.PLAN_JOB": "Plan the next job", "action.OPEN_CALENDAR": "Open calendar", "action.ADD_EVIDENCE": "Add evidence", "action.PLAN_FOLLOW_UP": "Prepare a follow-up", "action.REVIEW_INVOICE_READINESS": "Check the invoice-ready file", "action.REVIEW_PREPARED_ACTION": "Inspect the prepared action", "action.REVIEW_HISTORY": "View project history", "action.VIEW_ASSIGNMENTS": "View my assigned work", "action.REQUEST_HUMAN_SUPPORT": "Request human support", "action.RETRY": "Try again", "action.SYNC": "Sync",
    "blocker.PROJECT_REQUIRED": "Create a project first.", "blocker.CONTACT_REQUIRED": "Add at least one project contact.", "blocker.ASSIGNMENT_REQUIRED": "No work is assigned to you.", "blocker.WORK_INTENT_REQUIRED": "Tell ENDVERA what needs to be done.", "blocker.SCHEDULE_REQUIRED": "The next work has not been scheduled.", "blocker.EVIDENCE_REQUIRED": "A photo, document or approval is missing.", "blocker.FOLLOW_UP_REQUIRED": "No accountable follow-up is scheduled.", "blocker.INVOICE_EVIDENCE_REQUIRED": "The file still lacks evidence required to invoice.", "blocker.PREPARED_ACTION_REQUIRED": "No exact action is ready to inspect.", "blocker.PROVIDER_DISABLED_LOCAL": "The real connector is not enabled in this environment.",
  },
} as const;

export type MobileGoldenWorkflowCopyKey = keyof typeof MOBILE_GOLDEN_WORKFLOW_COPY["fr-CA"];
export function mobileGoldenWorkflowCopy(locale: "fr-CA" | "en-CA", key: string) {
  const value = MOBILE_GOLDEN_WORKFLOW_COPY[locale][key as MobileGoldenWorkflowCopyKey];
  if (!value) throw new Error("MOBILE_GOLDEN_WORKFLOW_COPY_MISSING");
  return value;
}

export type MobileGoldenWorkflow = ReturnType<typeof parseMobileGoldenWorkflow>;
export type MobileGoldenWorkflowRoute = z.infer<typeof route>;
export type MobileGoldenWorkflowLocale = "fr-CA" | "en-CA";
