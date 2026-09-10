import { z } from "zod";
import { personalCorrelatedCalendarPreview } from "./personal-correlated-calendar-preview";

const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u).refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const metadata = z.object({
  version: z.literal("personal-correlated-calendar-review-v1"),
  reviewId: z.string().min(1).max(191).refine(value => value.trim() === value),
  inspectedAt: utc, preparedAt: utc, preparationExpiresAt: utc,
  currentStatus: z.enum(["pending", "processing", "completed", "uncertain", "refused"]),
  readOnly: z.literal(true), approvalAvailable: z.literal(false), executionAuthorized: z.literal(false),
  semanticInterpretationVerified: z.literal(false), evidence: z.unknown(),
}).strict();

/** Strict, immutable presentation entry. This parser authenticates neither the
 * server nor hashes/permissions, and never produces an action or calendar ID. */
export function parsePersonalCorrelatedCalendarReview(raw: unknown) {
  const parsed = metadata.parse(raw);
  const preview = personalCorrelatedCalendarPreview(parsed.evidence);
  if (preview.status !== "STRUCTURE_CHECKED_NOT_AUTHENTICATED") throw new Error("CORRELATED_CALENDAR_REVIEW_EVIDENCE_INVALID");
  if (Date.parse(preview.evidence.sources[1].receivedAt) > Date.parse(parsed.preparedAt)
    || Date.parse(parsed.preparedAt) > Date.parse(parsed.inspectedAt)
    || Date.parse(parsed.inspectedAt) >= Date.parse(parsed.preparationExpiresAt)) throw new Error("CORRELATED_CALENDAR_REVIEW_TIMELINE_INVALID");
  // Evidence was copied and deeply frozen by the existing preview inspector.
  // No Date.now inference: inspectedAt describes a recorded read, not live freshness.
  return Object.freeze({ ...parsed, evidence: preview.evidence });
}

export type PersonalCorrelatedCalendarReview = ReturnType<typeof parsePersonalCorrelatedCalendarReview>;
