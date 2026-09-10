import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { correlatedCalendarReviewListResponseSchema } from "@/server/model-gateway/personal-intent/correlated-calendar-review-list";
import { inspectCorrelatedCalendarApprovalOfferInTransaction } from "./correlated-calendar-approval-gate";
import { fingerprintCorrelatedCalendarApprovalView, CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION } from "./correlated-calendar-approval-contract";
import { temporalRegistryClock, temporalRequireLive, type TemporalRegistryContext } from "./sms-temporal-clarification-authority";
import { requireGooglePilot, type ConnectorEnvironment } from "./google-client";

const id = z.string().min(1).max(191).refine(value => value.trim() === value), hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const inputSchema = z.object({ enabled: z.literal(true), actor: z.object({ workspaceId: id, userId: id }).strict(), reviewId: id }).strict();
export type CorrelatedCalendarApprovalOfferInput = Omit<z.infer<typeof inputSchema>, "enabled"> & { enabled?: boolean };
// Reuse the exact unchanged V1 item transport contract. No second text renderer.
const reviewSchema = correlatedCalendarReviewListResponseSchema.shape.reviews.element;
export const correlatedCalendarApprovalOfferSchema = z.object({ version: z.literal("personal-correlated-calendar-approval-offer-v1"), workspaceId: id,
  readOnly: z.literal(true), executionAuthorized: z.literal(false), explicitApprovalRequired: z.literal(true), review: reviewSchema,
  approvalOffer: z.object({ status: z.literal("ELIGIBLE_FOR_EXPLICIT_APPROVAL"), reviewId: id, expectedRequestHash: hash, expectedReviewFingerprint: hash,
    fingerprintVersion: z.literal(CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION), inspectedAt: instant, approvalExpiresAt: instant, executionAuthorized: z.literal(false) }).strict(),
}).strict().refine(value => value.review.reviewId === value.approvalOffer.reviewId && value.review.currentStatus === "pending"
  && value.review.preparationExpiresAt === value.approvalOffer.approvalExpiresAt
  && value.review.inspectedAt <= value.approvalOffer.inspectedAt && value.approvalOffer.inspectedAt < value.approvalOffer.approvalExpiresAt);
export type CorrelatedCalendarApprovalOffer = z.infer<typeof correlatedCalendarApprovalOfferSchema>;
const enabled = (env: ConnectorEnvironment) => env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED === "true"
  && env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED === "true";
const disabled = () => Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
function unavailable(): never { throw new Error("CORRELATED_CALENDAR_APPROVAL_OFFER_UNAVAILABLE"); }
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function elapsed(started: number) { const ms = performance.now() - started; if (!Number.isFinite(ms) || ms < 0) unavailable(); return ms; }

/** One selected existing card, one canonical gate/namespace/transaction. Reading
 * neither approves nor returns a claim handle. All refusals remain opaque. */
export async function readCorrelatedCalendarApprovalOffer(raw: CorrelatedCalendarApprovalOfferInput, env: ConnectorEnvironment = process.env,
  context: TemporalRegistryContext = { deadlineAt: Date.now() + 5000 }) {
  if (!enabled(env) || raw.enabled !== true) return disabled();
  try {
    const input = inputSchema.parse(raw), started = performance.now();
    if (!Number.isFinite(context.deadlineAt)) unavailable();
    const wallNow = Date.now(), duration = Math.min(5000, context.deadlineAt - wallNow);
    const c = Object.freeze({ deadlineAt: wallNow + duration, signal: context.signal });
    const remaining = () => {
      temporalRequireLive(c, env);
      if (!enabled(env) || env.ENDVERA_EXTERNAL_AUTHORITY_REF !== PERSONAL_MODEL_AUTHORITY || env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT !== "2026-10-10T01:18:26Z") unavailable();
      requireGooglePilot(env);
      const ms = Math.floor(Math.min(c.deadlineAt - Date.now(), duration - elapsed(started))); if (ms < 2) unavailable(); return ms;
    };
    const budget = remaining(), maxWait = Math.min(500, Math.max(1, Math.floor(budget / 4)));
    const prepared = await prisma.$transaction(async tx => {
      remaining();
      // C2a installs native timeouts before discovery and owns all current locks.
      const gate = await inspectCorrelatedCalendarApprovalOfferInTransaction(tx, input, env, c); remaining();
      if (gate.status !== "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED" || gate.committed !== false || gate.executionAuthorized !== false
        || gate.persistencePerformed !== false || gate.providerCallPerformed !== false || "claim" in gate || "expectedPhase" in gate
        || gate.actor.workspaceId !== input.actor.workspaceId || gate.actor.userId !== input.actor.userId) unavailable();
      const descriptor = fingerprintCorrelatedCalendarApprovalView(gate.view), review = reviewSchema.parse(gate.review);
      const inspectedAt = instant.parse(gate.inspectedAt), expiry = instant.parse(gate.approvalExpiresAt);
      const request = { title: gate.request.title, startsAt: gate.request.startsAt, endsAt: gate.request.endsAt, timezone: gate.request.timezone,
        accountVersion: gate.request.accountVersion, requestId: gate.request.requestId };
      const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const { accountVersion, requestId, ...draft } = request;
      if (descriptor.fingerprint !== gate.fingerprint || descriptor.view.scope.userId !== input.actor.userId || descriptor.view.scope.workspaceId !== input.actor.workspaceId
        || descriptor.view.review.reviewId !== input.reviewId || review.reviewId !== input.reviewId || review.currentStatus !== "pending"
        || descriptor.view.request.calendarRequestHash !== requestHash || descriptor.view.request.calendarRequestId !== requestId
        || descriptor.view.request.accountVersion !== accountVersion || canonicalJson(review.evidence.draft) !== canonicalJson(draft)
        || review.preparationExpiresAt !== expiry || review.inspectedAt > inspectedAt) unavailable();
      // Copy/freeze all public fields before another await. No authority, calendar
      // operation ID or nonce is carried into the outward projection.
      const projected = freeze({ review, requestHash, fingerprint: descriptor.fingerprint, inspectedAt, expiry });
      // Sample BEFORE the clock round trip: adding this elapsed interval after
      // commit overestimates DB age rather than accidentally renewing the TTL.
      const sampledAt = performance.now(), now = (await temporalRegistryClock(tx)).getTime(); remaining();
      if (now < Date.parse(projected.inspectedAt) || now >= Date.parse(projected.expiry)) unavailable();
      const result = freeze(correlatedCalendarApprovalOfferSchema.parse({ version: "personal-correlated-calendar-approval-offer-v1", workspaceId: input.actor.workspaceId,
        readOnly: true, executionAuthorized: false, explicitApprovalRequired: true, review: projected.review,
        approvalOffer: { status: "ELIGIBLE_FOR_EXPLICIT_APPROVAL", reviewId: input.reviewId, expectedRequestHash: projected.requestHash,
          expectedReviewFingerprint: projected.fingerprint, fingerprintVersion: CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION,
          inspectedAt: new Date(now).toISOString(), approvalExpiresAt: projected.expiry, executionAuthorized: false } }));
      return { result, dbEpoch: now, sampledAt };
    }, { isolationLevel: "Serializable", maxWait, timeout: budget - maxWait });
    remaining();
    if (prepared.dbEpoch + elapsed(prepared.sampledAt) >= Date.parse(prepared.result.approvalOffer.approvalExpiresAt)) unavailable();
    return prepared.result;
  } catch { return unavailable(); }
}
