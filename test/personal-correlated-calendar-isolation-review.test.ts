import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ query: vi.fn(), members: vi.fn(), drafts: vi.fn(), related: vi.fn(), oneRelated: vi.fn(), operation: vi.fn(), account: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => {
  const db = { $queryRawUnsafe: calls.query, constructionWorkspaceMember: { findFirst: calls.members },
    constructionConnectorAccount: { findUniqueOrThrow: calls.account },
    personalSmsCorrelatedCalendarReview: { findMany: calls.related, findUnique: calls.oneRelated },
    personalAssistantOperation: { findMany: calls.drafts, findUnique: calls.operation, create: calls.create } };
  return { prisma: { ...db, $transaction: async (work: (tx: typeof db) => unknown) => work(db) } };
});
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";
import { personalCalendarActions, preparePersonalCalendar } from "@/server/personal-assistant/calendar-actions";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const calendarDraft = { title: "Inspection synthétique", startsAt: "2036-09-12T18:00:00.000Z", endsAt: "2036-09-12T19:00:00.000Z", timezone: "America/Toronto" };
const requestId = "46dc0c5b-2a5f-434a-b63a-a99bb731ab95";
const calendarRequest = { ...calendarDraft, accountVersion: 1, requestId };
const outbound = { to: "+15005550001", from: "+15005550006", text: "Message synthétique" };
function sourceFixture() {
  const request = { accountSid: "ACsynthetic", messageSid: "SMsynthetic", from: "+15005550001", to: "+15005550006", body: "Deux ajouts et mes messages synthétiques." };
  const action = (operationId: string, kind: string, draft: object, request: object) => ({ actionId: operationId, operationId, kind, status: "PREPARED_UNSENT", requestHash: hash(request), draft });
  const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false,
    accounting: "UNSETTLED", automaticRetry: false, semanticIntentVerified: false,
    source: { operationId: "source", text: request.body, receivedAt: "2026-09-10T12:00:00.000Z", timezone: "America/Toronto" }, modelChildOperationId: "child",
    actions: [action("correlated", "PREPARE_CALENDAR_EVENT", calendarDraft, calendarRequest), action("ordinary", "PREPARE_CALENDAR_EVENT", calendarDraft, calendarRequest),
      action("sms", "PREPARE_SELF_SMS", outbound, outbound), action("voice", "PREPARE_SELF_CALL", outbound, outbound)] };
  return { id: "source", request, requestHash: hash(request), result: { personalModelReview: review }, createdAt: new Date(review.source.receivedAt), modelChildOperationId: "child" };
}
beforeEach(() => {
  vi.resetAllMocks(); calls.members.mockResolvedValue({ id: "member" }); calls.related.mockResolvedValue([]); calls.oneRelated.mockResolvedValue(null);
  calls.account.mockResolvedValue({ id: "google", stateVersion: 1, status: "connected", revokedAt: null, grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] });
});

describe("independent correlated isolation projection and failure review", () => {
  it("excludes only the correlated actionable item, preserving original source and mixed legacy statuses", async () => {
    const source = sourceFixture(), before = JSON.stringify(source);
    calls.query.mockImplementation(async (sql: string) => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [source]);
    calls.related.mockResolvedValue([{ calendarOperationId: "correlated" }]);
    calls.drafts.mockResolvedValue([
      { id: "ordinary", kind: "calendar_write", status: "pending", request: calendarRequest, requestHash: hash(calendarRequest) },
      { id: "sms", kind: "sms_outbound", status: "completed", request: outbound, requestHash: hash(outbound) },
      { id: "voice", kind: "voice_outbound", status: "uncertain", request: outbound, requestHash: hash(outbound) },
    ]);
    const result = await personalModelReviewsForOwner("owner", "workspace"), [review] = result.reviews;
    expect(calls.related).toHaveBeenCalledWith({ where: { calendarOperationId: { in: ["correlated", "ordinary", "sms", "voice"] } }, select: { calendarOperationId: true } });
    expect(calls.drafts.mock.calls[0][0].where).toEqual({ id: { in: ["ordinary", "sms", "voice"] }, workspaceId: "workspace", createdByUserId: "owner",
      OR: [{ kind: "calendar_write", correlatedTemporalReceiptId: null }, { kind: { in: ["sms_outbound", "voice_outbound"] } }] });
    expect(review.source.text).toBe(source.request.body);
    expect(review.actions.map(item => item.currentStatus)).toEqual(["UNAVAILABLE_OR_CHANGED", "pending", "completed", "uncertain"]);
    expect(review.actions[0]).not.toHaveProperty("operationId"); expect(review.actions[0]).not.toHaveProperty("requestHash");
    expect(review.actions[0]).toMatchObject({ draft: calendarDraft, nextDecision: "MANUAL_REVIEW" });
    expect(review.actions[1]).toMatchObject({ operationId: "ordinary", nextDecision: "REVIEW_EXACT_DRAFT" });
    expect(review.actions[2]).toMatchObject({ operationId: "sms", nextDecision: "CHECK_RECORDED_RESULT" });
    expect(review.actions[3]).toMatchObject({ operationId: "voice", nextDecision: "MANUAL_REVIEW" });
    expect(JSON.stringify(source)).toBe(before); expect(calls.create).not.toHaveBeenCalled();
  });
  it("does not query unrelated relations or drafts for a CLARIFY-only historical review", async () => {
    const source = sourceFixture(); source.result.personalModelReview.actions = [{ actionId: "clarify", kind: "CLARIFY", status: "CLARIFY", question: "Précise l'heure." }] as unknown as typeof source.result.personalModelReview.actions;
    calls.query.mockImplementation(async (sql: string) => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [source]);
    const result = await personalModelReviewsForOwner("owner", "workspace");
    expect(result.reviews[0].actions[0]).toMatchObject({ currentStatus: "CLARIFY", nextDecision: "CLARIFY_REQUEST" });
    expect(calls.related).not.toHaveBeenCalled(); expect(calls.drafts).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled();
  });
  it("a relation lookup failure aborts projection instead of showing a generic fallback", async () => {
    calls.query.mockImplementation(async (sql: string) => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [sourceFixture()]);
    calls.related.mockRejectedValue(new Error("synthetic lookup unavailable"));
    await expect(personalModelReviewsForOwner("owner", "workspace")).rejects.toThrow("synthetic lookup unavailable");
    expect(calls.drafts).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled();
  });
  it("a relation lookup failure cannot return or recreate a matching ordinary UUID replay", async () => {
    calls.operation.mockResolvedValue({ id: "existing", request: calendarRequest, requestHash: hash(calendarRequest), createdByUserId: "owner", correlatedTemporalReceiptId: null, status: "pending" });
    calls.oneRelated.mockRejectedValue(new Error("synthetic lookup unavailable"));
    await expect(preparePersonalCalendar({ userId: "owner", workspaceId: "workspace", requestId, draft: calendarDraft })).rejects.toThrow("synthetic lookup unavailable");
    expect(calls.create).not.toHaveBeenCalled();
  });
  it("owner refusal precedes the new global calendar list query", async () => {
    calls.members.mockResolvedValue(null);
    await expect(personalCalendarActions("owner", "workspace")).rejects.toThrow("CALENDAR_OWNER_REQUIRED");
    expect(calls.query).not.toHaveBeenCalled(); expect(calls.drafts).not.toHaveBeenCalled();
  });
  it("the list retains true terminal state and filters global provenance before its unchanged limit", async () => {
    calls.query.mockResolvedValue(["completed", "uncertain", "refused"].map(status => ({ id: status, requestHash: hash(calendarRequest), request: calendarRequest, status })));
    const result = await personalCalendarActions("owner", "workspace");
    expect(result.operations.map(row => row.status)).toEqual(["completed", "uncertain", "refused"]);
    const [sql, workspace, owner] = calls.query.mock.calls[0];
    expect([workspace, owner]).toEqual(["workspace", "owner"]);
    expect(sql.indexOf('o."correlatedTemporalReceiptId" IS NULL')).toBeLessThan(sql.indexOf("LIMIT 30"));
    expect(sql.indexOf('correlated."calendarOperationId"=o.id')).toBeLessThan(sql.indexOf("LIMIT 30"));
    expect(sql).not.toMatch(/correlated\."(?:userId|workspaceId)"/);
    // Query shape and mapping proof only, not execution of SQL pagination.
    expect(calls.drafts).not.toHaveBeenCalled(); expect(calls.create).not.toHaveBeenCalled();
  });
});
