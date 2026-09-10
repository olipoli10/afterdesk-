import { describe, expect, it } from "vitest";
import { createPersonalCalendarApprovalFence, loadPersonalModelReviews, personalCalendarApprovalReceiptSchema, personalModelActionStatus, personalModelCalendarApproval, personalModelDraftFields, personalModelNextDecision, personalModelReviewsSchema } from "../src/lib/personal-model-reviews";
const action = { actionId: "synthetic-action", kind: "PREPARE_SELF_SMS" as const, recordedStatus: "PREPARED_UNSENT" as const,
  currentStatus: "pending" as const, nextDecision: "REVIEW_EXACT_DRAFT" as const,
  operationId: "synthetic-draft", requestHash: "a".repeat(64), draft: { to: "+15005550001", from: "+15005550006", text: "Texte synthétique intégral" } };
const review = { sourceOperationId: "synthetic-source", modelChildOperationId: "synthetic-child",
  source: { text: "Écris-moi : Texte synthétique intégral", receivedAt: "2026-09-10T12:00:00.000Z", timezone: "America/Toronto" },
  responsible: { userId: "synthetic-owner", role: "OWNER" as const }, accounting: "UNSETTLED" as const, semanticInterpretationVerified: false as const, actions: [action] };
const result = { schemaVersion: 1, readOnly: true, executionAuthorized: false, semanticInterpretationVerified: false, unavailableCount: 0, limit: 20, reviews: [review] };
describe("mobile personal model read-only review", () => {
  it("preserves full original SMS and each exact draft field without marking meaning verified", () => {
    const sourceText = "Écris-moi le texte suivant : " + "un long message québécois. ".repeat(250);
    const parsed = personalModelReviewsSchema.parse({ ...result, reviews: [{ ...review, source: { ...review.source, text: sourceText } }] });
    expect(parsed.reviews[0].source.text).toBe(sourceText); expect(parsed.semanticInterpretationVerified).toBe(false);
    expect(personalModelDraftFields(action).map(field => field.value)).toEqual(Object.values(action.draft));
    expect(personalModelNextDecision(action)).toContain("SMS original");
  });
  it.each(["approved", "processing", "completed", "uncertain", "refused", "UNAVAILABLE_OR_CHANGED"] as const)("uses current %s state, never stale PREPARED_UNSENT", currentStatus => {
    const label = personalModelActionStatus({ ...action, currentStatus });
    expect(label).not.toContain("non exécuté"); expect(label).not.toContain("en attente");
    if (currentStatus === "completed") expect(label).toContain("aucune livraison n’est prouvée");
    if (currentStatus === "UNAVAILABLE_OR_CHANGED") expect(label).toContain("ancien état");
  });
  it("never treats a calendar read proposal as fetched calendar information", () => {
    const read = { actionId: "read", kind: "READ_CALENDAR" as const, recordedStatus: "READ_REVIEW_ONLY" as const,
      currentStatus: "NOT_READ" as const, nextDecision: "REVIEW_CALENDAR_READ" as const, draft: { startsAt: "2026-09-11T04:00:00.000Z", endsAt: "2026-09-12T04:00:00.000Z", timezone: "America/Toronto" } };
    expect(personalModelReviewsSchema.safeParse({ ...result, reviews: [{ ...review, actions: [read] }] }).success).toBe(true);
    expect(personalModelActionStatus(read)).toContain("Calendrier non lu");
    expect(personalModelActionStatus(read)).toContain("aucune donnée d’horaire récupérée");
  });
  it.each([{ ...result, executionAuthorized: true }, { ...result, readOnly: false }, { ...result, semanticInterpretationVerified: true },
    { ...result, reviews: [{ ...review, accounting: "SETTLED" }] }, { ...result, reviews: [{ ...review, source: undefined }] },
    { ...result, reviews: [{ ...review, responsible: { userId: "other", role: "ADMIN" } }] },
    { ...result, reviews: [{ ...review, actions: [action, action] }] }, { ...result, reviews: [review, review] },
  ])("rejects unsupported authority, missing source and ambiguous duplicate records", value => {
    expect(personalModelReviewsSchema.safeParse(value).success).toBe(false);
  });
  it("rejects a mismatched current decision or unbound draft", () => {
    for (const changed of [{ currentStatus: "completed", nextDecision: "REVIEW_EXACT_DRAFT" }, { operationId: undefined }, { requestHash: undefined }]) {
      expect(personalModelReviewsSchema.safeParse({ ...result, reviews: [{ ...review, actions: [{ ...action, ...changed }] }] }).success).toBe(false);
    }
  });
  it("clears stale review data after failure rather than preserving old pending labels", async () => {
    expect((await loadPersonalModelReviews(() => Promise.resolve(result))).data?.reviews).toHaveLength(1);
    expect(await loadPersonalModelReviews(() => Promise.reject(new Error("Unavailable")))).toEqual({ data: null, unavailable: true });
    expect(await loadPersonalModelReviews(() => Promise.resolve({ reviews: [] }))).toEqual({ data: null, unavailable: true });
  });
});
describe("explicit calendar approval fence", () => {
  const calendar = { ...action, kind: "PREPARE_CALENDAR_EVENT" as const, draft: { title: "Visite synthétique", startsAt: "2026-09-11T14:00:00.000Z", endsAt: "2026-09-11T15:00:00.000Z", timezone: "America/Toronto" } };
  it("binds approval only to current pending operation and exact request hash", () => {
    expect(personalModelCalendarApproval(calendar)).toEqual({ operationId: calendar.operationId, expectedRequestHash: calendar.requestHash });
    for (const currentStatus of ["approved", "processing", "completed", "uncertain", "refused", "UNAVAILABLE_OR_CHANGED"] as const) expect(personalModelCalendarApproval({ ...calendar, currentStatus })).toBeNull();
    expect(personalModelCalendarApproval({ ...calendar, requestHash: undefined })).toBeNull();
    expect(personalModelCalendarApproval({ ...calendar, operationId: undefined })).toBeNull();
  });
  it("never enables a read proposal or self message as Google addition", () => {
    expect(personalModelCalendarApproval({ ...calendar, kind: "READ_CALENDAR", currentStatus: "NOT_READ", recordedStatus: "READ_REVIEW_ONLY", nextDecision: "REVIEW_CALENDAR_READ" })).toBeNull();
    expect(personalModelCalendarApproval(action)).toBeNull();
  });
  it("requires all exact event fields and a valid increasing time interval", () => {
    for (const draft of [{ ...calendar.draft, timezone: undefined }, { ...calendar.draft, startsAt: "demain" }, { ...calendar.draft, endsAt: calendar.draft.startsAt }, { ...calendar.draft, title: " " }, { ...calendar.draft, extra: "x" }]) {
      expect(personalModelCalendarApproval({ ...calendar, draft: draft as Record<string, string> })).toBeNull();
    }
  });
  it("fences synchronous double taps and never forgets an unconfirmed attempt on refresh or hash change", () => {
    const fence = createPersonalCalendarApprovalFence(); expect(fence.begin(calendar)).not.toBeNull();
    expect(fence.begin(calendar)).toBeNull(); expect(fence.attempted(calendar.operationId)).toBe(true);
    expect(fence.begin({ ...calendar, requestHash: "b".repeat(64) })).toBeNull();
    expect(fence.begin({ ...calendar, operationId: "different-operation" })).not.toBeNull();
  });
  it("never converts a malformed or uncertain acknowledgement into Google confirmation", () => {
    expect(personalCalendarApprovalReceiptSchema.safeParse({ providerEventId: "synthetic-event", confirmed: true }).success).toBe(true);
    for (const value of [{ ok: true }, { providerEventId: "synthetic-event", confirmed: false }, { providerEventId: "", confirmed: true }]) expect(personalCalendarApprovalReceiptSchema.safeParse(value).success).toBe(false);
  });
});
