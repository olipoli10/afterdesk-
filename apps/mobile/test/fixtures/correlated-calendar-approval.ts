import { correlatedListFixture } from "./correlated-calendar-list";
export function approvalOfferFixture() {
  const list = correlatedListFixture(), review = list.reviews[0];
  return { version: "personal-correlated-calendar-approval-offer-v1", workspaceId: list.workspaceId, readOnly: true, executionAuthorized: false, explicitApprovalRequired: true, review,
    approvalOffer: { status: "ELIGIBLE_FOR_EXPLICIT_APPROVAL", reviewId: review.reviewId, expectedRequestHash: "c".repeat(64), expectedReviewFingerprint: "d".repeat(64),
      fingerprintVersion: "personal-correlated-calendar-approval-view-v1", inspectedAt: review.inspectedAt, approvalExpiresAt: review.preparationExpiresAt, executionAuthorized: false } };
}
export const approvalCommandFixture = () => ({ version: "personal-correlated-calendar-approval-command-v1" as const, workspaceId: "workspace", reviewId: "review", expectedRequestHash: "c".repeat(64), expectedReviewFingerprint: "d".repeat(64) });
export const approvalResponseFixture = () => ({ ...approvalCommandFixture(), version: "personal-correlated-calendar-approval-response-v1", status: "CONFIRMED", automaticRetry: false, executionAuthorized: false, providerStateVerified: false, receipt: { confirmed: true, providerEventId: "e" + "a".repeat(31) } });
export const approvalHistoryFixture = () => ({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review", observedAt: "2026-09-11T04:03:00.000Z", readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false, providerStateVerified: false, outcome: "NOT_ATTEMPTED" });
