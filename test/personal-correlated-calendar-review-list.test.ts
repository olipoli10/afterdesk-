import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), item: vi.fn(), subject: vi.fn(), prepare: vi.fn(), approve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-projection", async original => ({
  ...await original<typeof import("@/server/model-gateway/personal-intent/correlated-calendar-projection")>(), loadCorrelatedPersonalCalendarReviewInTransaction: m.item }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: m.subject }));
vi.mock("@/server/personal-assistant/calendar-actions", async original => ({ ...await original<typeof import("@/server/personal-assistant/calendar-actions")>(),
  preparePersonalCalendarInTransaction: m.prepare, preparePersonalCalendar: m.prepare, approveAndInsertPersonalCalendar: m.approve }));
import { readCorrelatedPersonalCalendarReviewList as read, correlatedCalendarReviewListSchema, parseCorrelatedCalendarReviewListResponse } from "@/server/model-gateway/personal-intent/correlated-calendar-review-list";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { parsePersonalCorrelatedCalendarReview } from "../apps/mobile/src/lib/personal-correlated-calendar-review";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";

const now = "2026-09-11T04:02:00.000Z", failure = "CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function harness(count = 1) {
  const f = correlatedReceiptFixture(), packet = { packet: f.packet, packetHash: f.packetHash };
  const reference = buildCorrelatedCalendarReferenceProof(f.durable, packet), proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet);
  const pins = { clarificationId: f.durable.waiting.prepared.clarificationId, originalSourceOperationId: "source-a", replySourceOperationId: "source-b",
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event", connectorAccountId: "calendar", accountVersion: 1,
    questionExpiresAt: "2026-09-11T04:08:00.000Z", authorityRef: PERSONAL_MODEL_AUTHORITY, pilotExpiresAt: "2026-10-10T01:18:26.000Z" };
  const input = { enabled: true as const, actor: { userId: "owner", workspaceId: "workspace" } };
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", actor: { ...input.actor },
    subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" }, reference, proof, preparationContext: pins, inspectedAt: now };
  const { questionExpiresAt, ...storedPins } = pins;
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId }, requestHash = sha(JSON.stringify(request));
  const row = { id: "review-0", workspaceId: "workspace", userId: "owner", receiptId: "receipt", ...storedPins,
    calendarOperationId: "calendar-operation", calendarRequestId: reference.requestId, calendarRequestHash: requestHash, packetHash: reference.packetHash,
    reviewVersion: "personal-sms-correlated-calendar-review-v1", proof: structuredClone(reference.proof), proofHash: reference.proofHash,
    pilotExpiresAt: new Date(pins.pilotExpiresAt), preparationExpiresAt: new Date(questionExpiresAt), createdAt: new Date(now) };
  const operation = { id: row.calendarOperationId, workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "calendar", kind: "calendar_write", status: "pending",
    request, requestHash, idempotencyKey: `personal-calendar:workspace:${reference.requestId}`, correlatedTemporalReceiptId: "receipt",
    sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null,
    linkedReviewId: row.id, linkedReceiptId: "receipt", linkedWorkspaceId: "workspace", linkedUserId: "owner" };
  const dto = { version: "personal-correlated-calendar-review-v1", reviewId: "review-0", inspectedAt: now, preparedAt: now, preparationExpiresAt: pins.questionExpiresAt,
    currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
    evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
      sources: proof.resolution.sources.map((source, i) => ({ role: i === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY", operationId: source.operationId,
        requestHash: source.requestHash, text: source.body, receivedAt: source.receivedAt })), citations: proof.resolution.citations,
      anchorReceivedAt: proof.resolution.anchorReceivedAt, clarifiedSlot: proof.resolution.evidence.slot, draft: reference.proof.draft } };
  const owner = { workspaceId: "workspace", ownerUserId: "owner", workspaceUpdatedAt: new Date("2026-09-10T01:00:00Z"), memberId: "member", memberUserId: "owner",
    memberRole: "owner", memberUpdatedAt: new Date("2026-09-10T01:00:00Z") };
  const state = { firstOwner: [owner] as unknown[], lastOwner: [structuredClone(owner)] as unknown[], candidates: Array.from({ length: count }, (_, i) => ({ id: `review-${i}` })) as unknown[],
    clock: new Date(now), isolation: "serializable", mono: 0, realItem: false, hook: async (_stage: string) => { void _stage; } };
  const context = { deadlineAt: Date.now() + 5000, signal: undefined as AbortSignal | undefined };
  const env = { NODE_ENV: "test" as const, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const order: string[] = [];
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.includes("current_setting") ? "isolation" : sql.includes("set_config") ? "timeouts" : sql.startsWith("SELECT clock_timestamp") ? "clock"
      : sql.includes('FROM "ConstructionWorkspace" w') ? sql.includes("FOR SHARE") ? "final-owner" : "initial-owner"
        : sql.startsWith('SELECT id FROM "PersonalSmsCorrelatedCalendarReview"') ? "discovery"
          : sql.startsWith('SELECT "receiptId"') ? "item-discovery" : sql.includes('FROM "PersonalAssistantOperation"') ? "item-operation" : "item-review";
    order.push(stage); await state.hook(stage);
    expect(sql).toMatch(/^SELECT /); expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    if (stage === "isolation") return [{ isolation: state.isolation }];
    if (stage === "timeouts") return [];
    if (stage === "clock") return [{ now: state.clock }];
    if (stage === "initial-owner" || stage === "final-owner") {
      expect(args).toEqual(["workspace", "owner"]); expect(sql).toContain("m.role='owner'"); expect(sql).toContain('w."ownerUserId"=$2');
      expect(sql.includes("FOR SHARE OF w,m")).toBe(stage === "final-owner"); return stage === "initial-owner" ? state.firstOwner : state.lastOwner;
    }
    if (stage === "discovery") {
      expect(args).toEqual(["workspace", "owner"]); expect(sql).toContain('ORDER BY "createdAt" DESC,id DESC LIMIT 6');
      expect(sql).not.toMatch(/FOR SHARE|request|body|proof/); return state.candidates;
    }
    if (!state.realItem) throw new Error("UNEXPECTED_ITEM_QUERY");
    if (stage === "item-discovery") return [{ receiptId: "receipt" }];
    if (stage === "item-operation") return [operation];
    return [row];
  });
  const writes = vi.fn(() => { throw new Error("UNEXPECTED_WRITE"); });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: writes, personalAssistantOperation: { create: writes, update: writes } } as unknown as TemporalRegistryDB;
  m.transaction.mockImplementation(async work => work(tx));
  m.subject.mockResolvedValue(subject);
  m.item.mockImplementation(async (_tx, call) => { order.push(`item:${call.reviewId}`); return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false,
    review: structuredClone({ ...dto, reviewId: call.reviewId }) }; });
  vi.spyOn(performance, "now").mockImplementation(() => state.mono);
  return { f, dto, input, owner, state, context, env, order, query, tx, writes, run: () => read(input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { expect(m.prepare).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("latest five correlated calendar reviews, one all-or-unavailable transaction", () => {
  it("empty success requires both current owner checks, SQL timeout setup and final clock", async () => {
    const h = harness(0); expect(await h.run()).toEqual({ version: "personal-correlated-calendar-review-list-v1", workspaceId: "workspace",
      readOnly: true, approvalAvailable: false, executionAuthorized: false, reviews: [], hasMore: false });
    expect(h.order).toEqual(["isolation", "timeouts", "initial-owner", "discovery", "final-owner", "clock"]); expect(m.item).not.toHaveBeenCalled();
  });
  it("LIMIT6 means latest5 stable sequential reads and an explicit hasMore, no sixth loader or nested transaction", async () => {
    const h = harness(6), result = await h.run(); if ("status" in result) throw new Error("UNEXPECTED_DISABLED");
    expect(result.reviews.map(item => item.reviewId)).toEqual(["review-0", "review-1", "review-2", "review-3", "review-4"]); expect(result.hasMore).toBe(true);
    expect(h.order).toEqual(["isolation", "timeouts", "initial-owner", "discovery", "item:review-0", "item:review-1", "item:review-2", "item:review-3", "item:review-4", "final-owner", "clock"]);
    expect(m.item).toHaveBeenCalledTimes(5); expect(m.transaction).toHaveBeenCalledTimes(1);
    for (const [tx, call, env, context] of m.item.mock.calls) { expect(tx).toBe(h.tx); expect(call.actor).toEqual(h.input.actor); expect(env).toBe(h.env); expect(context.deadlineAt).toBe(h.context.deadlineAt); }
    expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
    expect(result).not.toHaveProperty("committed"); expect(result).not.toHaveProperty("status"); expect(Object.isFrozen(result.reviews[0].evidence)).toBe(true);
  });
  it("OFF and absent caller opt-in never open a transaction", async () => {
    const h = harness(); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false";
    expect(await h.run()).toEqual({ status: "DISABLED", executionAuthorized: false });
    h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "true";
    expect(await read({ actor: h.input.actor }, h.env, h.context)).toHaveProperty("status", "DISABLED"); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["reviewIds", "cursor", "workspaceId", "proof"])("does not accept caller %s selectors", async key => {
    const h = harness(); await expect(read({ ...h.input, [key]: "untrusted" }, h.env, h.context)).rejects.toThrow(failure); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["missing", "admin", "foreign-owner", "foreign-member", "two"])("refuses %s owner before discovering even an empty list", async mode => {
    const h = harness(0); h.state.firstOwner = mode === "missing" ? [] : mode === "two" ? [h.owner, h.owner] : [{ ...h.owner,
      ...(mode === "admin" ? { memberRole: "admin" } : mode === "foreign-owner" ? { ownerUserId: "other" } : { memberUserId: "other" }) }];
    await expect(h.run()).rejects.toThrow(failure); expect(h.order).not.toContain("discovery");
  });
  it.each(["memberId", "memberUpdatedAt", "workspaceUpdatedAt"])("refuses changed final owner pin %s", async key => {
    const h = harness(0); h.state.lastOwner = [{ ...h.owner, [key]: key === "memberId" ? "another" : new Date("2026-09-10T02:00:00Z") }];
    await expect(h.run()).rejects.toThrow(failure);
  });
  it("missing final owner rejects after successful items, not a partial return", async () => {
    const h = harness(2); h.state.lastOwner = []; await expect(h.run()).rejects.toThrow(failure); expect(m.item).toHaveBeenCalledTimes(2);
  });
  it("duplicate discovered IDs or excessive SQL cardinality are unavailable", async () => {
    const h = harness(2); h.state.candidates = [{ id: "same" }, { id: "same" }]; await expect(h.run()).rejects.toThrow(failure);
    h.state.candidates = Array.from({ length: 7 }, (_, i) => ({ id: `id${i}` })); await expect(h.run()).rejects.toThrow(failure); expect(m.item).not.toHaveBeenCalled();
  });
  it.each(["EXPIRED", "REVOKED", "CORRUPT", "DEADLINE", "SQL_SECRET_DETAIL"])("failure on second item %s discards the first and hides internal errors", async reason => {
    const h = harness(3); m.item.mockImplementationOnce(async () => ({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review: h.dto }))
      .mockRejectedValueOnce(new Error(reason));
    await expect(h.run()).rejects.toThrow(/^CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE$/); expect(m.item).toHaveBeenCalledTimes(2); expect(h.order).not.toContain("final-owner");
  });
  it.each(["DISABLED", "committed", "wrong-id", "extra-field", "approval"])("malformed item result %s cannot be published", async mode => {
    const h = harness(); m.item.mockResolvedValue(mode === "DISABLED" ? { status: "DISABLED" } : { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: mode === "committed",
      review: { ...h.dto, ...(mode === "wrong-id" ? { reviewId: "other" } : mode === "extra-field" ? { operationId: "calendar-secret" } : mode === "approval" ? { approvalAvailable: true } : {}) } });
    await expect(h.run()).rejects.toThrow(failure);
  });
  it("expiration of the first item while reading a later item refuses all before commit", async () => {
    const h = harness(2); m.item.mockImplementation(async (_tx, call) => {
      if (call.reviewId === "review-1") h.state.clock = new Date("2026-09-11T04:02:01.000Z");
      return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review: { ...h.dto, reviewId: call.reviewId,
        preparationExpiresAt: call.reviewId === "review-0" ? "2026-09-11T04:02:01.000Z" : h.dto.preparationExpiresAt } };
    }); await expect(h.run()).rejects.toThrow(failure);
  });
  it("post-commit TTL uses DB instant plus monotonic elapsed, not skewed host wall-clock", async () => {
    const h = harness(); vi.setSystemTime(new Date("2026-09-10T04:02:00.000Z")); h.context.deadlineAt = Date.now() + 5000;
    m.item.mockResolvedValue({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false,
      review: { ...h.dto, preparationExpiresAt: "2026-09-11T04:02:00.100Z" } });
    m.transaction.mockImplementation(async work => { const value = await work(h.tx); h.state.mono += 101; return value; });
    await expect(h.run()).rejects.toThrow(failure); expect(m.transaction).toHaveBeenCalledTimes(1);
  });
  it("post-commit live/abort withdrawal and unknown acknowledgment do not produce success or retry", async () => {
    const h = harness(), abort = new AbortController(); h.context.signal = abort.signal;
    m.transaction.mockImplementation(async work => { await work(h.tx); throw new Error("UNKNOWN_COMMIT_SECRET"); });
    await expect(h.run()).rejects.toThrow(failure); expect(m.transaction).toHaveBeenCalledTimes(1);
    m.transaction.mockImplementation(async work => { const value = await work(h.tx); h.context.signal = undefined; abort.abort(); return value; });
    await expect(h.run()).rejects.toThrow(failure);
  });
  it("one 5s total budget is not reset between items even if wall clock moves backward", async () => {
    const h = harness(5); m.item.mockImplementation(async (_tx, call) => { h.state.mono += 1100; vi.setSystemTime(Date.now() - 1000);
      return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review: { ...h.dto, reviewId: call.reviewId } }; });
    await expect(h.run()).rejects.toThrow(failure); expect(m.item).toHaveBeenCalledTimes(5); expect(h.order).not.toContain("final-owner");
  });
  it("copies actor/deadline and each item before following awaits", async () => {
    const h = harness(2), first = structuredClone(h.dto);
    h.state.hook = async stage => { if (stage === "discovery") { h.input.actor.userId = "foreign"; h.context.deadlineAt = 0; } };
    m.item.mockImplementation(async (_tx, call) => {
      expect(call.actor.userId).toBe("owner"); if (call.reviewId === "review-0") return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review: first };
      first.evidence.sources[0].text = "changed"; return { status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false, review: { ...h.dto, reviewId: "review-1" } };
    }); const result = await h.run(); if ("status" in result) throw new Error("UNEXPECTED_DISABLED");
    expect(result.reviews[0].evidence.sources[0].text).toBe(h.f.durable.original.source.body);
  });
  it("whole list agrees with actual unchanged item reader, strict wire schema and mobile item parser", async () => {
    const h = harness(); h.state.realItem = true;
    const actual = await vi.importActual<typeof import("@/server/model-gateway/personal-intent/correlated-calendar-projection")>("@/server/model-gateway/personal-intent/correlated-calendar-projection");
    m.item.mockImplementation(actual.loadCorrelatedPersonalCalendarReviewInTransaction);
    const result = await h.run(); if ("status" in result) throw new Error("UNEXPECTED_DISABLED");
    expect(correlatedCalendarReviewListSchema.parse(result)).toEqual(result);
    expect(parsePersonalCorrelatedCalendarReview(result.reviews[0])).toEqual(result.reviews[0]);
    expect(result.reviews[0].evidence.sources[0].text).toBe(h.f.durable.original.source.body);
    expect(h.writes).not.toHaveBeenCalled(); expect(m.transaction).toHaveBeenCalledTimes(1);
  });
  it.each(["extra", "provisional", "nested-extra", "duplicate", "flag"])("exported pure response parser refuses %s shape without claiming authentication", async mode => {
    const h = harness(), result = await h.run(); if ("status" in result) throw new Error("UNEXPECTED_DISABLED");
    const changed: Record<string, unknown> = structuredClone(result);
    if (mode === "extra") changed.operationId = "effect";
    if (mode === "provisional") changed.committed = false;
    if (mode === "nested-extra") (changed.reviews as Array<Record<string, unknown>>)[0].proof = {};
    if (mode === "duplicate") changed.reviews = [result.reviews[0], result.reviews[0]];
    if (mode === "flag") changed.executionAuthorized = true;
    expect(() => parseCorrelatedCalendarReviewListResponse(changed)).toThrow(failure);
  });
});
