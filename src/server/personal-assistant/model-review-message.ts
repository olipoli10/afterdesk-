import "server-only";

export const PERSONAL_MODEL_REVIEW_MESSAGE_VERSION = "personal-model-review-fr-v1";
export type PersonalModelReviewMessageInput = Readonly<{
  status: "REVIEW_PREPARED_NOT_AUTHORIZED";
  actions: readonly Readonly<{ status: "PREPARED_UNSENT" | "READ_REVIEW_ONLY" | "CLARIFY"; question?: string }>[];
}> | Readonly<{ status: "DISABLED" }>;

/** Pure presentation of an already inspected review, never candidate validation or authority. */
export function formatPersonalModelReviewMessage(review: PersonalModelReviewMessageInput): string {
  if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED") throw new Error("PERSONAL_MODEL_REVIEW_DISABLED");
  const prepared = review.actions.filter(action => action.status === "PREPARED_UNSENT").length;
  const readOnly = review.actions.some(action => action.status === "READ_REVIEW_ONLY");
  const questions = review.actions.filter(action => action.status === "CLARIFY").map(action => action.question).filter(Boolean);
  return [prepared ? `${prepared} action(s) préparée(s) dans ENDVERA. Lis ta demande originale et les détails avant d’approuver dans l’app.` : "Ta demande est conservée dans ENDVERA.",
    readOnly ? "La période de calendrier est identifiée, mais Google Agenda n’a pas été consulté par cette analyse." : "",
    ...questions, "Aucun rendez-vous modifié ni message/appel exécuté par ces propositions."].filter(Boolean).join("\n");
}
