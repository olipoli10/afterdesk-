export const listNow = Date.parse("2026-09-11T04:02:00.000Z");
export function correlatedListFixture() {
  const original = { role: "ORIGINAL_REQUEST", operationId: "original", requestHash: "a".repeat(64), text: "Ajoute visite demain à 2h, fin 15h.", receivedAt: "2026-09-11T03:58:00.000Z" };
  const answer = { role: "CLARIFICATION_REPLY", operationId: "answer", requestHash: "b".repeat(64), text: "14h", receivedAt: "2026-09-11T04:01:00.000Z" };
  const cite = (source: typeof original, quote: string) => ({ sourceOperationId: source.operationId, requestHash: source.requestHash,
    start: source.text.indexOf(quote), end: source.text.indexOf(quote) + quote.length, quote });
  return { version: "personal-correlated-calendar-review-list-v1", workspaceId: "workspace", readOnly: true, approvalAvailable: false, executionAuthorized: false, hasMore: false,
    reviews: [{ version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: "2026-09-11T04:02:00.000Z", preparedAt: "2026-09-11T04:01:03.000Z", preparationExpiresAt: "2026-09-11T04:08:00.000Z",
      currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
      evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN", sources: [original, answer], anchorReceivedAt: original.receivedAt, clarifiedSlot: "START",
        citations: { title: cite(original, "visite"), originalStart: cite(original, "demain à 2h"), originalEnd: cite(original, "15h"), answer: cite(answer, "14h") },
        draft: { title: "visite", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" } } }] };
}
