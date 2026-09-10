import "server-only";
import type { Prisma } from "@prisma-client";
import { canonicalFingerprint } from "@/server/model-gateway/evidence";
import type { prepareStoredPersonalIntentReview } from "@/server/model-gateway/personal-intent/review-consumer";
import { expireCalendarSmsConfirmationsInTransaction, prepareCalendarSmsConfirmationInTransaction } from "./calendar-sms-confirmation-store";
import { calendarConfirmationWorkerEnabled } from "./calendar-confirmation-worker";
import type { PersonalSmsExecutionContext } from "./sms-worker";
import type { ConnectorEnvironment } from "./google-client";

type Review = Awaited<ReturnType<typeof prepareStoredPersonalIntentReview>>;
/** Called in the original source finalization transaction, never after it.
 * Multi-action/clarification/read-only proposals remain ordinary app reviews.
 * A previous active confirmation is not replaced by a later interpretation. */
export async function prepareCalendarConfirmationForReviewInTransaction(tx: Prisma.TransactionClient,
  context: PersonalSmsExecutionContext, review: Review, env: ConnectorEnvironment = process.env) {
  const skip = (reason: string) => ({ status: "APP_REVIEW_ONLY" as const, reason, executionAuthorized: false as const });
  if (!calendarConfirmationWorkerEnabled(env) || env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") return skip("DISABLED");
  if (review.status !== "REVIEW_PREPARED_NOT_AUTHORIZED" || review.actions.length !== 1) return skip("SINGLE_ACTION_REQUIRED");
  const action = review.actions[0];
  if (action.kind !== "PREPARE_CALENDAR_EVENT" || action.status !== "PREPARED_UNSENT" || !action.operationId || !action.requestHash) return skip("EXACT_CALENDAR_DRAFT_REQUIRED");
  const live = () => {
    if (!calendarConfirmationWorkerEnabled(env) || env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED !== "true") throw new Error("CONFIRMATION_PREPARATION_DISABLED");
    if (!Number.isFinite(context.deadlineAt) || context.signal.aborted || Date.now() >= context.deadlineAt) throw new Error("CONFIRMATION_PREPARATION_DEADLINE");
  };
  live();
  if (review.source.operationId !== context.claim.operationId) throw new Error("CONFIRMATION_REVIEW_SOURCE_CHANGED");
  const actor = { userId: context.claim.userId, workspaceId: context.claim.workspaceId };
  await expireCalendarSmsConfirmationsInTransaction(tx, actor, env);
  live();
  const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "PersonalCalendarSmsConfirmation"
    WHERE "workspaceId"=$1 AND "userId"=$2 AND phase IN ('PREPARED','WAITING','CONSUMED') LIMIT 1`, actor.workspaceId, actor.userId);
  live();
  if (active.length) return skip("EXISTING_CONFIRMATION_NOT_REPLACED");
  const prepared = await prepareCalendarSmsConfirmationInTransaction(tx, { actor, sourceClaim: context.claim,
    modelChildOperationId: review.modelChildOperationId, reviewActionId: action.actionId, calendarOperationId: action.operationId }, env as NodeJS.ProcessEnv);
  live();
  if (prepared.status !== "PREPARED_DURABLE_OFF") throw new Error("CONFIRMATION_PREPARATION_DISABLED");
  if (canonicalFingerprint(prepared.requiredSourceReview) !== canonicalFingerprint(review)) throw new Error("CONFIRMATION_REVIEW_CHANGED");
  // Intentionally omit summary text. Only the challenge-bound outbox bridge may
  // disclose it, never the ordinary reply assembled by the source worker.
  return { status: "PREPARED_FOR_SOURCE_COMMIT" as const, challengeId: prepared.challengeId, executionAuthorized: false as const };
}
