import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), item: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-calendar-projection", () => ({ loadCorrelatedPersonalCalendarReviewInTransaction: mocks.item }));
import { readCorrelatedPersonalCalendarReviewList as read, correlatedCalendarReviewListSchema, correlatedCalendarReviewListResponseSchema } from "@/server/model-gateway/personal-intent/correlated-calendar-review-list";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

const time = "2026-09-11T04:02:00.000Z", failure = "CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE";
function fixture(count = 0) {
  const f = correlatedReceiptFixture(), reference = buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
  if (f.packet.status !== "RESOLVED_NOT_AUTHORIZED") throw new Error("FIXTURE_MUST_RESOLVE");
  const dto = { version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: time, preparedAt: time,
    preparationExpiresAt: "2026-09-11T04:08:00.000Z", currentStatus: "pending", readOnly: true, approvalAvailable: false,
    executionAuthorized: false, semanticInterpretationVerified: false, evidence: {
      version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
      sources: f.packet.sources.map((s, i) => ({ role: i === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY", operationId: s.operationId,
        requestHash: s.requestHash, text: s.body, receivedAt: s.receivedAt })), citations: f.packet.citations,
      anchorReceivedAt: f.packet.anchorReceivedAt, clarifiedSlot: f.packet.evidence.slot, draft: reference.proof.draft } };
  const owner = { workspaceId: "workspace", ownerUserId: "owner", workspaceUpdatedAt: new Date("2026-09-10T01:00:00Z"),
    memberId: "member", memberUserId: "owner", memberRole: "owner", memberUpdatedAt: new Date("2026-09-10T01:00:00Z") };
  const state = { initialOwner: [owner], finalOwner: [structuredClone(owner)], candidates: Array.from({ length: count }, (_, i) => ({ id: `review-${i}` })),
    clock: new Date(time), mono: 0, hook: async (_stage: string) => { void _stage; } };
  const order: string[] = [];
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    expect(sql).toMatch(/^SELECT /);
    const stage = sql.includes("current_setting") ? "isolation" : sql.includes("set_config") ? "timeouts" : sql.startsWith("SELECT clock_timestamp") ? "clock"
      : sql.includes('FROM "ConstructionWorkspace"') ? sql.includes("FOR SHARE") ? "final-owner" : "initial-owner" : "discovery";
    order.push(stage); await state.hook(stage);
    if (stage === "isolation") return [{ isolation: "serializable" }];
    if (stage === "timeouts") return [];
    if (stage === "clock") return [{ now: state.clock }];
    expect(args).toEqual(["workspace", "owner"]);
    if (stage === "initial-owner") return state.initialOwner;
    if (stage === "final-owner") return state.finalOwner;
    expect(sql).toContain('ORDER BY "createdAt" DESC,id DESC LIMIT 6'); return state.candidates;
  });
  const write = vi.fn(() => { throw new Error("UNEXPECTED_DURABLE_WRITE"); });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: write };
  mocks.transaction.mockImplementation(async work => work(tx));
  mocks.item.mockImplementation(async (_tx, input) => ({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false,
    review: { ...dto, reviewId: input.reviewId } }));
  vi.spyOn(performance, "now").mockImplementation(() => state.mono);
  const env = { NODE_ENV: "test" as const, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  return { state, owner, order, tx, write, run: () => read({ enabled: true, actor: { userId: "owner", workspaceId: "workspace" } }, env, { deadlineAt: Date.now() + 5000 }) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(time)); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("independent collection lifecycle — mocked SQL, real pure DTO", () => {
  it("both exported schema names are the same object, not divergent validators", () => {
    expect(correlatedCalendarReviewListSchema).toBe(correlatedCalendarReviewListResponseSchema);
  });
  it("copies initial owner Date epochs before discovery mutates driver objects", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "discovery") {
      h.owner.memberUpdatedAt.setTime(0); h.owner.workspaceUpdatedAt.setTime(0);
    } };
    await expect(h.run()).resolves.toMatchObject({ reviews: [], hasMore: false }); expect(h.write).not.toHaveBeenCalled();
  });
  it("mutating an earlier Date cannot disguise a changed final owner revision", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "discovery") {
      h.owner.memberUpdatedAt.setTime(0); h.state.finalOwner[0].memberUpdatedAt.setTime(0);
    } };
    await expect(h.run()).rejects.toThrow(failure);
  });
  it("zero candidates do not bypass a missing owner and do not disclose successful emptiness", async () => {
    const h = fixture(); h.state.initialOwner = [];
    await expect(h.run()).rejects.toThrow(failure); expect(h.order).not.toContain("discovery"); expect(mocks.item).not.toHaveBeenCalled();
  });
  it("database clock object is privately reduced to an epoch before commit latency", async () => {
    const h = fixture(); mocks.transaction.mockImplementation(async work => { const result = await work(h.tx); h.state.clock.setTime(Date.parse("2030-01-01Z")); return result; });
    await expect(h.run()).resolves.toMatchObject({ reviews: [] }); expect(h.write).not.toHaveBeenCalled();
  });
  it("a backward monotonic timer fails closed rather than extending a result lifetime", async () => {
    const h = fixture(); mocks.transaction.mockImplementation(async work => { const result = await work(h.tx); h.state.mono = -1; return result; });
    await expect(h.run()).rejects.toThrow(failure); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("five entries without a sixth have hasMore=false and retain discovered order", async () => {
    const h = fixture(5); const result = await h.run();
    expect(result).toMatchObject({ hasMore: false }); expect(mocks.item.mock.calls.map(call => call[1].reviewId)).toEqual(h.state.candidates.map(c => c.id));
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("discovery result mutations during the first item cannot redirect the next item", async () => {
    const h = fixture(2), implementation = mocks.item.getMockImplementation()!;
    mocks.item.mockImplementation(async (...args) => { h.state.candidates[1].id = "foreign-review"; return implementation(...args); });
    await h.run(); expect(mocks.item.mock.calls.map(call => call[1].reviewId)).toEqual(["review-0", "review-1"]);
  });
  it.each(["discovery", "final-owner", "clock"])("failure at %s is opaque and does not return prior items", async failing => {
    const h = fixture(1); h.state.hook = async stage => { if (stage === failing) throw new Error("SELECT secret owner source text"); };
    await expect(h.run()).rejects.toThrow(/^CORRELATED_CALENDAR_REVIEW_LIST_UNAVAILABLE$/);
    expect(h.write).not.toHaveBeenCalled(); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
