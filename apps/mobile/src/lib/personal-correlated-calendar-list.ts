import { z } from "zod";
import { parsePersonalCorrelatedCalendarReview } from "./personal-correlated-calendar-review";

const listSchema = z.object({
  version: z.literal("personal-correlated-calendar-review-list-v1"),
  workspaceId: z.string().min(1).max(191), readOnly: z.literal(true),
  approvalAvailable: z.literal(false), executionAuthorized: z.literal(false),
  reviews: z.array(z.unknown()).max(5), hasMore: z.boolean(),
}).strict();

export function parsePersonalCorrelatedCalendarList(raw: unknown, workspaceId: string) {
  const list = listSchema.parse(raw);
  if (list.workspaceId !== workspaceId || workspaceId.trim() !== workspaceId) throw new Error("CORRELATED_LIST_SCOPE_INVALID");
  const reviews = list.reviews.map(parsePersonalCorrelatedCalendarReview);
  if (new Set(reviews.map(review => review.reviewId)).size !== reviews.length) throw new Error("CORRELATED_LIST_DUPLICATE");
  return Object.freeze({ ...list, reviews: Object.freeze(reviews) });
}
export type PersonalCorrelatedCalendarList = ReturnType<typeof parsePersonalCorrelatedCalendarList>;

const identitySchema = z.object({ user: z.object({ id: z.string().min(1) }), session: z.object({ id: z.string().min(1) }) });
/** Narrow only the session fields this display needs; unknown/refreshing sessions hide all data. */
export function correlatedCalendarSessionKey(input: {
  identity: unknown; pending: boolean; signedIn: boolean; bootstrapUserId?: string;
  workspaceId: string; activeWorkspaceId?: string; role?: string;
}) {
  const identity = identitySchema.safeParse(input.identity);
  if (input.pending || !input.signedIn || !identity.success || identity.data.user.id !== input.bootstrapUserId
    || input.workspaceId !== input.activeWorkspaceId || input.role !== "OWNER") return null;
  return JSON.stringify([identity.data.user.id, identity.data.session.id, input.workspaceId]);
}

/** Local display freshness only, never server authority. */
export function correlatedCalendarListDeadline(list: PersonalCorrelatedCalendarList, readStartedAt: number) {
  return Math.min(...list.reviews.map(review => {
    const expiry = Date.parse(review.preparationExpiresAt), inspected = Date.parse(review.inspectedAt);
    // Count the server-declared remaining window from the start of this read,
    // conservatively including transport latency even if the phone clock is slow.
    return Math.min(expiry, readStartedAt + (expiry - inspected));
  }));
}
export function correlatedCalendarListFresh(list: PersonalCorrelatedCalendarList, now: number, readStartedAt: number) {
  return Number.isFinite(now) && Number.isFinite(readStartedAt) && now >= readStartedAt
    && now < correlatedCalendarListDeadline(list, readStartedAt);
}
