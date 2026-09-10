import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";
const shared = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture() {
  const envelope = { accountSid: "ACsynthetic", messageSid: "SMsynthetic", from: "+15145550122", to: "+15145550111", body: "Texte-moi : Bonjour" };
  const request = { to: envelope.from, from: envelope.to, text: "Bonjour" };
  const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false, accounting: "UNSETTLED",
    automaticRetry: false, semanticIntentVerified: false, modelChildOperationId: "child",
    source: { operationId: "source", text: envelope.body, receivedAt: "2026-09-10T14:00:00Z", timezone: "America/Toronto" },
    actions: [{ actionId: "a", kind: "PREPARE_SELF_SMS", status: "PREPARED_UNSENT", operationId: "draft", requestHash: hash(request), draft: request }] };
  const row = { id: "source", request: envelope, requestHash: hash(envelope), result: { personalModelReview: review }, createdAt: new Date(review.source.receivedAt), modelChildOperationId: "child" };
  const draft = { id: "draft", kind: "sms_outbound", status: "pending", requestHash: hash(request), request };
  const query = vi.fn().mockImplementation(async sql => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [row]);
  const drafts = vi.fn().mockResolvedValue([draft]);
  shared.transaction.mockImplementation(fn => fn({ $queryRawUnsafe: query, personalAssistantOperation: { findMany: drafts },
    personalSmsCorrelatedCalendarReview: { findMany: vi.fn(async () => []) } }));
  return { review, row, draft, query, drafts };
}
beforeEach(() => vi.clearAllMocks());
describe("read-only owner model review projection", () => {
  it("returns full original source plus exact current draft without authorization", async () => {
    const f = fixture(); const result = await personalModelReviewsForOwner("owner", "workspace");
    expect(result).toMatchObject({ readOnly: true, executionAuthorized: false, semanticInterpretationVerified: false,
      reviews: [{ source: { text: "Texte-moi : Bonjour" }, responsible: { userId: "owner", role: "OWNER" },
        actions: [{ recordedStatus: "PREPARED_UNSENT", currentStatus: "pending", nextDecision: "REVIEW_EXACT_DRAFT", draft: f.draft.request }] }] });
    expect(Object.isFrozen(result.reviews[0].source)).toBe(true);
    expect(f.drafts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: "workspace", createdByUserId: "owner" }) }));
    expect(f.query.mock.calls[0][0]).toContain('w."ownerUserId"=$2'); expect(f.query.mock.calls[0][0]).toContain("FOR SHARE OF w,m");
    expect(f.query.mock.calls[1][0]).toContain("LIMIT 20");
  });
  it("refuses inactive/non-owner/other workspace before reading private source data", async () => {
    const f = fixture(); f.query.mockResolvedValue([]);
    await expect(personalModelReviewsForOwner("other", "workspace")).rejects.toThrow("OWNER_REQUIRED"); expect(f.query).toHaveBeenCalledTimes(1); expect(f.drafts).not.toHaveBeenCalled();
  });
  it.each(["approved", "processing", "completed", "uncertain", "refused"])("shows actual %s state, never a stale pending label", async status => {
    const f = fixture(); f.draft.status = status;
    const result = await personalModelReviewsForOwner("owner", "workspace"); expect(result.reviews[0].actions[0].currentStatus).toBe(status);
    expect(result.reviews[0].actions[0].nextDecision).not.toBe("REVIEW_EXACT_DRAFT");
  });
  it.each(["missing", "hash", "content", "kind", "unknown-state"])("marks %s draft unavailable instead of exposing an approval target", async change => {
    const f = fixture();
    if (change === "missing") f.drafts.mockResolvedValue([]);
    if (change === "hash") f.draft.requestHash = "f".repeat(64);
    if (change === "content") f.draft.request.text = "Changed";
    if (change === "kind") f.draft.kind = "calendar_write";
    if (change === "unknown-state") f.draft.status = "invented-success";
    const result = await personalModelReviewsForOwner("owner", "workspace");
    expect(result.reviews[0].actions[0]).toMatchObject({ currentStatus: "UNAVAILABLE_OR_CHANGED", nextDecision: "MANUAL_REVIEW" });
    expect(result.reviews[0].actions[0]).not.toHaveProperty("operationId");
  });
  it.each(["source-text", "source-id", "receipt-time", "child", "request-hash", "schema"])("withholds invalid %s provenance", async change => {
    const f = fixture();
    if (change === "source-text") f.review.source.text = "Other source";
    if (change === "source-id") f.review.source.operationId = "other";
    if (change === "receipt-time") f.review.source.receivedAt = "2026-09-10T15:00:00Z";
    if (change === "child") f.review.modelChildOperationId = "other";
    if (change === "request-hash") f.row.requestHash = "f".repeat(64);
    if (change === "schema") Object.assign(f.review, { execute: true });
    expect(await personalModelReviewsForOwner("owner", "workspace")).toMatchObject({ reviews: [], unavailableCount: 1 });
    expect(f.drafts).not.toHaveBeenCalled();
  });
  it("projects clarification and unexecuted calendar read without a draft lookup", async () => {
    const f = fixture();
    Object.assign(f.review, { actions: [{ actionId: "a", kind: "CLARIFY", status: "CLARIFY", question: "Précise l’heure." },
      { actionId: "b", kind: "READ_CALENDAR", status: "READ_REVIEW_ONLY", draft: { startsAt: "2026-09-11T04:00:00Z", endsAt: "2026-09-12T04:00:00Z", timezone: "America/Toronto" } }] });
    expect(await personalModelReviewsForOwner("owner", "workspace")).toMatchObject({ reviews: [{ actions: [{ currentStatus: "CLARIFY" }, { currentStatus: "NOT_READ" }] }] });
    expect(f.drafts).not.toHaveBeenCalled();
  });
});
