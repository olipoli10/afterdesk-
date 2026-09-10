import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ load: vi.fn(), transaction: vi.fn(), prepare: vi.fn(), approve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: m.load }));
vi.mock("@/server/personal-assistant/calendar-actions", async original => ({ ...await original<typeof import("@/server/personal-assistant/calendar-actions")>(),
  preparePersonalCalendarInTransaction: m.prepare, preparePersonalCalendar: m.prepare, approveAndInsertPersonalCalendar: m.approve }));
import { loadCorrelatedPersonalCalendarReviewInTransaction as load, readCorrelatedPersonalCalendarReview as read } from "@/server/model-gateway/personal-intent/correlated-calendar-projection";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";
import { personalCorrelatedCalendarPreview } from "../apps/mobile/src/lib/personal-correlated-calendar-preview";
import { parsePersonalCorrelatedCalendarReview } from "../apps/mobile/src/lib/personal-correlated-calendar-review";

const now = "2026-09-11T04:02:00.000Z", error = "CORRELATED_CALENDAR_READ_CHANGED_OR_UNAVAILABLE";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture(options: Parameters<typeof correlatedReceiptFixture>[0] = {}) {
  const f = correlatedReceiptFixture(options), packet = { packet: f.packet, packetHash: f.packetHash };
  const reference = buildCorrelatedCalendarReferenceProof(f.durable, packet), proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet);
  const input = { enabled: true as const, actor: { userId: "owner", workspaceId: "workspace" }, reviewId: "review" };
  const pins = { clarificationId: f.durable.waiting.prepared.clarificationId, originalSourceOperationId: "source-a", replySourceOperationId: "source-b",
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event", connectorAccountId: "calendar", accountVersion: 1,
    questionExpiresAt: "2026-09-11T04:08:00.000Z", authorityRef: PERSONAL_MODEL_AUTHORITY, pilotExpiresAt: "2026-10-10T01:18:26.000Z" };
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", actor: { ...input.actor },
    subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" }, reference, proof, preparationContext: pins, inspectedAt: now };
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId }, requestHash = sha(JSON.stringify(request));
  const { questionExpiresAt, ...storedPins } = pins;
  const row = { id: "review", workspaceId: "workspace", userId: "owner", receiptId: "receipt", ...storedPins,
    calendarOperationId: "calendar-operation", calendarRequestId: reference.requestId, calendarRequestHash: requestHash, packetHash: reference.packetHash,
    reviewVersion: "personal-sms-correlated-calendar-review-v1", proof: structuredClone(reference.proof), proofHash: reference.proofHash,
    pilotExpiresAt: new Date(pins.pilotExpiresAt), preparationExpiresAt: new Date(questionExpiresAt), createdAt: new Date(now) };
  const operation = { id: row.calendarOperationId, workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "calendar", kind: "calendar_write",
    status: "pending", request, requestHash, idempotencyKey: `personal-calendar:workspace:${reference.requestId}`, correlatedTemporalReceiptId: "receipt",
    sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null,
    linkedReviewId: row.id, linkedReceiptId: "receipt", linkedWorkspaceId: "workspace", linkedUserId: "owner" };
  const env = { NODE_ENV: "test" as const, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const order: string[] = [], state = { discoveries: [{ receiptId: "receipt" }] as unknown[], rows: [row] as unknown[], operations: [operation] as unknown[],
    finalClock: new Date(now), isolation: "serializable", hook: async (_stage: string) => { void _stage; } };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts"
      : sql.startsWith('SELECT "receiptId"') ? "discover" : sql.startsWith("SELECT clock_timestamp") ? "clock"
      : sql.includes('FROM "PersonalAssistantOperation" o JOIN') ? "operation" : "review";
    order.push(stage); await state.hook(stage);
    expect(sql).toMatch(/^SELECT /); expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/);
    if (stage === "isolation") return [{ isolation: state.isolation }];
    if (stage === "timeouts") return [];
    if (stage === "discover") { expect(sql).not.toContain("FOR SHARE"); expect(args).toEqual(["review", "workspace", "owner"]); return state.discoveries; }
    if (stage === "review") { expect(sql).toContain("FOR SHARE"); expect(sql).toContain('("createdAt" AT TIME ZONE \'UTC\')'); return state.rows; }
    if (stage === "operation") { expect(sql).toContain('r."calendarOperationId"=o.id'); expect(sql).toContain("FOR SHARE OF o,r"); expect(args).toEqual([row.calendarOperationId]); return state.operations; }
    return [{ now: state.finalClock }];
  });
  const write = vi.fn(() => { throw new Error("UNEXPECTED_EFFECT"); });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: write, personalAssistantOperation: { create: write, updateMany: write } } as unknown as TemporalRegistryDB;
  m.load.mockImplementation(async () => { order.push("loader"); return subject; });
  m.transaction.mockImplementation(async work => work(tx));
  const context = { deadlineAt: Date.now() + 5000, signal: undefined as AbortSignal | undefined };
  return { f, input, subject, row, operation, reference, env, state, order, query, write, tx, context,
    run: () => load(tx, input, env, context), read: () => read(input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { expect(m.prepare).not.toHaveBeenCalled(); expect(m.approve).not.toHaveBeenCalled(); vi.useRealTimers(); });

describe("single correlated calendar read-only projection — synthetic DB fixture, real pure proof", () => {
  it("keeps namespace-loader ordering, provisional flags, exact Unicode sources and mobile envelope compatibility", async () => {
    const h = fixture(), result = await h.run();
    expect(h.order).toEqual(["isolation", "timeouts", "discover", "loader", "review", "operation", "clock"]); expect(h.write).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_INSPECTED_NOT_AUTHORIZED", committed: false });
    if (result.status === "DISABLED") throw new Error("UNEXPECTED_DISABLED");
    expect(Object.keys(result.review).sort()).toEqual(["version", "reviewId", "inspectedAt", "preparedAt", "preparationExpiresAt", "currentStatus", "readOnly", "approvalAvailable", "executionAuthorized", "semanticInterpretationVerified", "evidence"].sort());
    expect(result.review).toMatchObject({ currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false });
    expect(result.review.evidence.sources.map(source => source.text)).toEqual([h.f.durable.original.source.body, h.f.durable.answer.source.body]);
    expect(result.review.evidence).toMatchObject({ provenance: "UNKNOWN", clarifiedSlot: "START", citations: h.subject.proof.resolution.citations });
    expect(personalCorrelatedCalendarPreview(result.review.evidence)).toMatchObject({ status: "STRUCTURE_CHECKED_NOT_AUTHENTICATED", approvalAvailable: false });
    expect(parsePersonalCorrelatedCalendarReview(result.review)).toEqual(result.review);
    expect(() => parsePersonalCorrelatedCalendarReview(result)).toThrow(); // Internal commit envelope is not the transport item.
    expect(JSON.stringify(result.review)).not.toContain(h.row.calendarOperationId); expect(result.review).not.toHaveProperty("requestHash");
    expect(Object.isFrozen(result.review.evidence.sources[0])).toBe(true); expect(Object.isFrozen(result.review.evidence.citations.title)).toBe(true);
  });
  it("maps an END clarification without replacing the original start or source anchor", async () => {
    const h = fixture({ start: "demain à 14h", end: "3h", answer: "15h" }), result = await h.run();
    if (result.status === "DISABLED") throw new Error("UNEXPECTED_DISABLED");
    expect(result.review.evidence.clarifiedSlot).toBe("END"); expect(result.review.evidence.anchorReceivedAt).toBe(h.f.durable.original.source.receivedAt);
    expect(personalCorrelatedCalendarPreview(result.review.evidence).status).toBe("STRUCTURE_CHECKED_NOT_AUTHENTICATED");
  });
  it.each(["pending", "processing", "completed", "uncertain", "refused"])("reports current %s without authorizing or claiming an insertion", async status => {
    const h = fixture(); h.operation.status = status; const result = await h.run();
    expect(result).toMatchObject({ review: { currentStatus: status, approvalAvailable: false, executionAuthorized: false } });
    expect(JSON.stringify(result)).not.toMatch(/PREPARED_UNSENT|acceptedByProvider|deliveryConfirmed/);
  });
  it("unknown/unsupported status refuses", async () => { const h = fixture(); h.operation.status = "approved"; await expect(h.run()).rejects.toThrow(); });
  it("OFF never discovers and does not need PREPARE enabled when REVIEW is ON", async () => {
    const h = fixture(); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false";
    expect(await h.run()).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(h.query).not.toHaveBeenCalled();
    h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "true"; await expect(h.run()).resolves.toHaveProperty("review");
  });
  it("requires explicit opt-in, caller transaction and strict actor/review input", async () => {
    const h = fixture(); expect(await load(h.tx, { ...h.input, enabled: false }, h.env, h.context)).toHaveProperty("status", "DISABLED");
    await expect(load({ ...h.tx, $transaction: undefined } as unknown as TemporalRegistryDB, h.input, h.env, h.context)).rejects.toThrow("CALLER_TRANSACTION_REQUIRED");
    await expect(load(h.tx, { ...h.input, draft: {} } as typeof h.input, h.env, h.context)).rejects.toThrow(); expect(h.query).not.toHaveBeenCalled();
  });
  it("missing or duplicate discovery never reaches the source loader", async () => {
    const h = fixture(); h.state.discoveries = []; await expect(h.run()).rejects.toThrow(error);
    h.state.discoveries = [{ receiptId: "receipt" }, { receiptId: "receipt" }]; await expect(h.run()).rejects.toThrow(error); expect(m.load).not.toHaveBeenCalled();
  });
  it("propagates actual loader expiry/revocation without preparation or relation lookup", async () => {
    const h = fixture(); m.load.mockRejectedValue(new Error("CORRELATED_RECEIPT_EXPIRED")); await expect(h.run()).rejects.toThrow("CORRELATED_RECEIPT_EXPIRED");
    expect(h.order).toEqual(["isolation", "timeouts", "discover"]); expect(h.write).not.toHaveBeenCalled();
  });
  it.each(["workspaceId", "userId", "receiptId", "clarificationId", "originalSourceOperationId", "replySourceOperationId", "modelChildOperationId", "modelGatewayOperationId", "reviewActionId", "connectorAccountId", "packetHash", "calendarRequestHash", "accountVersion"])("refuses changed immutable relation %s", async key => {
    const h = fixture(); (h.row as Record<string, unknown>)[key] = key === "accountVersion" ? 2 : key.endsWith("Hash") ? "a".repeat(64) : "different";
    await expect(h.run()).rejects.toThrow(); expect(h.order).not.toContain("operation");
  });
  it.each(["correlatedTemporalReceiptId", "linkedReviewId", "linkedReceiptId", "linkedWorkspaceId", "linkedUserId", "workspaceId", "createdByUserId", "connectorAccountId", "idempotencyKey", "requestHash"])("refuses changed actual operation/global relation %s", async key => {
    const h = fixture(); (h.operation as Record<string, unknown>)[key] = key === "requestHash" ? "a".repeat(64) : "other";
    await expect(h.run()).rejects.toThrow(error);
  });
  it.each(["sourcePersonalOperationId", "modelGatewayOperationId", "budgetId", "reservedCadMicros"])("refuses nonnull forbidden operation origin/budget %s", async key => {
    const h = fixture(); (h.operation as Record<string, unknown>)[key] = key === "reservedCadMicros" ? 1n : "other";
    await expect(h.run()).rejects.toThrow();
  });
  it("rejects a rehashed modified compact proof against the real rebuilt reference", async () => {
    const h = fixture(); h.row.proof = { ...h.row.proof, draft: { ...h.row.proof.draft, title: "changed" } }; h.row.proofHash = sha(canonicalJson(h.row.proof));
    await expect(h.run()).rejects.toThrow(error);
  });
  it("rejects a changed actual request despite its preserved hash; tolerates JSONB field order only", async () => {
    const h = fixture(); h.operation.request = JSON.parse(canonicalJson(h.operation.request)); await expect(h.run()).resolves.toHaveProperty("review");
    h.operation.request.title = "changed"; await expect(h.run()).rejects.toThrow(error);
  });
  it.each(["2026-09-11T04:01:59.999Z", "2026-09-11T04:08:00.000Z"])("refuses final backward/expired DB instant %s", async value => {
    const h = fixture(); h.state.finalClock = new Date(value); await expect(h.run()).rejects.toThrow(error);
  });
  it("invalid DB clock cannot pass comparisons as NaN", async () => { const h = fixture(); h.state.finalClock = new Date(NaN); await expect(h.run()).rejects.toThrow("DB_CLOCK_REQUIRED"); });
  it("rejects prepared-before-answer and prepared-in-the-future without rewriting either timestamp", async () => {
    const h = fixture(); h.row.createdAt = new Date("2026-09-11T04:00:59.999Z"); await expect(h.run()).rejects.toThrow(error);
    h.row.createdAt = new Date("2026-09-11T04:02:00.001Z"); await expect(h.run()).rejects.toThrow(error);
  });
  it("enforces a 5s cap even when caller extends the supplied deadline", async () => {
    const h = fixture(); h.context.deadlineAt = Date.now() + 100_000;
    h.state.hook = async stage => { if (stage === "operation") { h.context.deadlineAt += 100_000; vi.setSystemTime(Date.now() + 5001); } };
    await expect(h.run()).rejects.toThrow("DEADLINE_OR_DISABLED");
  });
  it("retains the original cancellation signal if the caller replaces its context field", async () => {
    const h = fixture(), abort = new AbortController(); h.context.signal = abort.signal;
    h.state.hook = async stage => { if (stage === "operation") { h.context.signal = undefined; abort.abort(); } };
    await expect(h.run()).rejects.toThrow("DEADLINE_OR_DISABLED"); expect(h.order).not.toContain("clock");
  });
  it("copies stored Date epochs before the following operation read", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "operation") h.row.createdAt.setUTCFullYear(2040); };
    await expect(h.run()).resolves.toHaveProperty("review.preparedAt", now);
  });
  it("a source loader result for a different owner is not accepted as an inspected label", async () => {
    const h = fixture(); h.subject.actor.userId = "foreign";
    await expect(h.run()).rejects.toThrow(error); expect(h.order).not.toContain("review");
  });
  it("copies caller actor/review/deadline before discovery await", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "discover") { h.input.actor.userId = "foreign"; h.input.reviewId = "other"; h.context.deadlineAt = 0; } };
    await expect(h.run()).resolves.toHaveProperty("review.reviewId", "review");
    expect(m.load.mock.calls[0][1].actor.userId).toBe("owner");
  });
  it.each(["discover", "review", "operation", "clock"])("late flag withdrawal after %s refuses a response", async stage => {
    const h = fixture(); h.state.hook = async current => { if (current === stage) h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false"; };
    await expect(h.run()).rejects.toThrow("DISABLED_OR_PILOT_CHANGED");
  });
  it("wrapper changes only commit status after successful SERIALIZABLE completion", async () => {
    const h = fixture(); const result = await h.read(); expect(result).toMatchObject({ committed: true });
    expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
    expect(m.transaction).toHaveBeenCalledTimes(1);
  });
  it("lost commit acknowledgment or flag withdrawal after commit never produces a successful read", async () => {
    const h = fixture(); m.transaction.mockImplementation(async work => { await work(h.tx); throw new Error("READ_COMMIT_UNKNOWN"); });
    await expect(h.read()).rejects.toThrow("READ_COMMIT_UNKNOWN"); expect(m.transaction).toHaveBeenCalledTimes(1);
    m.transaction.mockImplementation(async work => { const result = await work(h.tx); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED = "false"; return result; });
    await expect(h.read()).rejects.toThrow("DISABLED_OR_PILOT_CHANGED");
  });
  it("module has no producer/collection/route or effect invocation", () => {
    const source = readFileSync("src/server/model-gateway/personal-intent/correlated-calendar-projection.ts", "utf8");
    expect(source).not.toMatch(/from ["']\.\/correlated-calendar-review|preparePersonalCalendar\(|preparePersonalCalendarInTransaction\(|prepareCorrelatedPersonalCalendarReview|fetch\(|\$executeRaw/);
    expect(source).not.toMatch(/\bLIMIT\b|\bcursor\b/);
  });
  it("refuses a nonserializable caller before the first discovery SELECT", async () => {
    const h = fixture(); h.state.isolation = "read committed";
    await expect(h.run()).rejects.toThrow("SERIALIZABLE_REQUIRED"); expect(h.order).not.toContain("discover"); expect(m.load).not.toHaveBeenCalled();
  });
  it("deadline expiring during timeout configuration prevents discovery", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "timeouts") vi.setSystemTime(Date.now() + 5001); };
    await expect(h.run()).rejects.toThrow("DEADLINE_OR_DISABLED"); expect(h.order).not.toContain("discover"); expect(m.load).not.toHaveBeenCalled();
  });
});
