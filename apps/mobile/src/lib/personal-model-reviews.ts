import { z } from "zod";
const id = z.string().min(1).max(191);
const draft = z.record(z.string().min(1).max(40), z.string().max(4000)).refine(value => Object.keys(value).length <= 5);
const actionSchema = z.object({ actionId: id, kind: z.enum(["READ_CALENDAR", "PREPARE_CALENDAR_EVENT", "PREPARE_SELF_SMS", "PREPARE_SELF_CALL", "CLARIFY"]),
  recordedStatus: z.enum(["CLARIFY", "READ_REVIEW_ONLY", "PREPARED_UNSENT"]),
  currentStatus: z.enum(["CLARIFY", "NOT_READ", "UNAVAILABLE_OR_CHANGED", "pending", "approved", "processing", "completed", "uncertain", "refused"]),
  nextDecision: z.enum(["CLARIFY_REQUEST", "REVIEW_CALENDAR_READ", "MANUAL_REVIEW", "REVIEW_EXACT_DRAFT", "WAIT_FOR_RESULT", "CHECK_RECORDED_RESULT"]),
  executionRoute: z.enum(["ANDROID_DEVICE", "GOOGLE_CALENDAR"]).optional(),
  question: z.string().max(1000).optional(), draft: draft.optional(), operationId: id.optional(), requestHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict().refine(value => {
  if (value.currentStatus === "CLARIFY") return value.recordedStatus === "CLARIFY" && value.nextDecision === "CLARIFY_REQUEST";
  if (value.currentStatus === "NOT_READ") return value.kind === "READ_CALENDAR" && value.recordedStatus === "READ_REVIEW_ONLY" && value.nextDecision === "REVIEW_CALENDAR_READ";
  if (value.currentStatus === "UNAVAILABLE_OR_CHANGED") return value.nextDecision === "MANUAL_REVIEW" && !value.operationId && !value.requestHash;
  const next = value.currentStatus === "pending" ? "REVIEW_EXACT_DRAFT" : ["approved", "processing"].includes(value.currentStatus) ? "WAIT_FOR_RESULT"
    : value.currentStatus === "completed" ? "CHECK_RECORDED_RESULT" : "MANUAL_REVIEW";
  return Boolean(value.operationId && value.requestHash && value.draft && value.nextDecision === next);
}, { message: "Current draft state and next decision must agree" });
const reviewSchema = z.object({ sourceOperationId: id, modelChildOperationId: id,
  source: z.object({ text: z.string().min(1).max(10_000), receivedAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(100) }).strict(),
  responsible: z.object({ userId: id, role: z.literal("OWNER") }).strict(), accounting: z.literal("UNSETTLED"), semanticInterpretationVerified: z.literal(false),
  actions: z.array(actionSchema).min(1).max(10),
}).strict().refine(value => new Set(value.actions.map(action => action.actionId)).size === value.actions.length);
export const personalModelReviewsSchema = z.object({ schemaVersion: z.literal(1), readOnly: z.literal(true), executionAuthorized: z.literal(false),
  semanticInterpretationVerified: z.literal(false), unavailableCount: z.number().int().min(0).max(20), limit: z.literal(20), reviews: z.array(reviewSchema).max(20),
}).strict().refine(value => new Set(value.reviews.map(review => review.sourceOperationId)).size === value.reviews.length);
export type PersonalModelReviews = z.infer<typeof personalModelReviewsSchema>;
export type PersonalModelReviewAction = z.infer<typeof actionSchema>;
export async function loadPersonalModelReviews(read: () => Promise<unknown>) {
  try { return { data: personalModelReviewsSchema.parse(await read()), unavailable: false as const }; }
  catch { return { data: null, unavailable: true as const }; }
}
export function personalModelActionLabel(action: PersonalModelReviewAction) {
  const labels = { READ_CALENDAR: "Lecture du calendrier demandée", PREPARE_CALENDAR_EVENT: "Événement proposé", PREPARE_SELF_SMS: "SMS proposé vers toi",
    PREPARE_SELF_CALL: "Appel proposé vers toi", CLARIFY: "Précision nécessaire" };
  return labels[action.kind];
}
export function personalModelActionStatus(action: PersonalModelReviewAction) {
  switch (action.currentStatus) {
    case "CLARIFY": return "À clarifier — aucune exécution confirmée";
    case "NOT_READ": return "Calendrier non lu — aucune donnée d’horaire récupérée ici";
    case "UNAVAILABLE_OR_CHANGED": return "Brouillon modifié ou indisponible — ne pas se fier à l’ancien état";
    case "pending": return "Brouillon en attente — non exécuté";
    case "approved": return "Approuvé — résultat non confirmé";
    case "processing": return "Traitement en cours — ne pas répéter";
    case "completed": return "Traitement enregistré — vérifier le résultat; aucune livraison n’est prouvée ici";
    case "uncertain": return "Résultat incertain — aucune relance automatique";
    case "refused": return "Refusé ou accès retiré — aucune relance automatique";
  }
}
export function personalModelNextDecision(action: PersonalModelReviewAction) {
  if (action.nextDecision === "REVIEW_EXACT_DRAFT") {
    return action.kind === "PREPARE_CALENDAR_EVENT"
      ? `Compare l’événement complet à ton SMS original, puis approuve explicitement cet ajout ${action.executionRoute === "ANDROID_DEVICE" ? "au calendrier de ce téléphone" : "à Google Agenda"} si tout est exact.`
      : "Compare le texte et le numéro à ton SMS original, puis utilise le suivi des SMS et appels plus bas pour approuver le brouillon exact.";
  }
  const decisions = { CLARIFY_REQUEST: "Clarifie ta demande avant de continuer.", REVIEW_CALENDAR_READ: "Vérifie la période demandée avant de consulter le calendrier.",
    MANUAL_REVIEW: "Vérifie manuellement ce qui a changé avant toute autre action.", REVIEW_EXACT_DRAFT: "Compare le brouillon complet à ton SMS original avant de l’approuver dans le suivi approprié.",
    WAIT_FOR_RESULT: "Attends et actualise le résultat; ne crée pas une deuxième demande.", CHECK_RECORDED_RESULT: "Consulte le suivi réel avant de conclure que l’action a abouti." };
  return decisions[action.nextDecision];
}
export function personalModelDraftFields(action: PersonalModelReviewAction) {
  const names: Record<string, string> = { title: "Titre", startsAt: "Début exact", endsAt: "Fin exacte", timezone: "Fuseau horaire", to: "Vers", from: "Depuis ENDVERA", text: "Texte intégral" };
  return Object.entries(action.draft ?? {}).map(([key, value]) => ({ key, label: names[key] ?? key, value }));
}
const calendarDraftSchema = z.object({ title: z.string().min(1).max(240).refine(value => value.trim() === value), startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict()
  .refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt));
export function personalModelCalendarApproval(action: PersonalModelReviewAction) {
  if (action.kind !== "PREPARE_CALENDAR_EVENT" || action.recordedStatus !== "PREPARED_UNSENT" || action.currentStatus !== "pending"
    || action.nextDecision !== "REVIEW_EXACT_DRAFT" || !action.operationId || action.operationId.length > 128
    || !/^[a-f0-9]{64}$/.test(action.requestHash ?? "") || !calendarDraftSchema.safeParse(action.draft).success) return null;
  return Object.freeze({ operationId: action.operationId, expectedRequestHash: action.requestHash! });
}
export const personalCalendarApprovalReceiptSchema = z.object({ providerEventId: z.string().min(1).max(191), confirmed: z.literal(true) }).strict();
/** An uncertain attempt is never discarded or retried automatically in this screen session. */
export function createPersonalCalendarApprovalFence() {
  const attempted = new Set<string>();
  return {
    attempted: (operationId: string) => attempted.has(operationId),
    begin(action: PersonalModelReviewAction) {
      const approval = personalModelCalendarApproval(action);
      if (!approval || attempted.has(approval.operationId) || attempted.size >= 200) return null;
      attempted.add(approval.operationId); return approval;
    },
  };
}
