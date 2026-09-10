import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ subject: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: mocks.subject }));
import { loadCorrelatedPersonalCalendarReviewInTransaction, readCorrelatedPersonalCalendarReview } from "@/server/model-gateway/personal-intent/correlated-calendar-projection";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

// Independent query scaffold; shared pure receipt fixture and real proof builders.
// No claim that mocked rows establish PostgreSQL locking or current-grant proof.
const iso = "2026-09-11T04:02:00.000Z", changed = "CORRELATED_CALENDAR_READ_CHANGED_OR_UNAVAILABLE";
function harness() {
  const f = correlatedReceiptFixture(), packet = { packet: f.packet, packetHash: f.packetHash };
  const reference = buildCorrelatedCalendarReferenceProof(f.durable, packet);
  const proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet);
  const actor = { userId: "owner", workspaceId: "workspace" };
  const input = { enabled: true, actor, reviewId: "independent-review" };
  const pins = { clarificationId: f.durable.waiting.prepared.clarificationId, originalSourceOperationId: "source-a", replySourceOperationId: "source-b",
    modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event", connectorAccountId: "calendar", accountVersion: 1,
    questionExpiresAt: "2026-09-11T04:08:00.000Z", authorityRef: PERSONAL_MODEL_AUTHORITY, pilotExpiresAt: "2026-10-10T01:18:26.000Z" };
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", actor: { ...actor },
    subject: { kind: "personal_sms_temporal_receipt", receiptId: "receipt" }, reference, proof: structuredClone(proof), preparationContext: pins, inspectedAt: iso };
  const request = { ...reference.proof.draft, accountVersion: pins.accountVersion, requestId: reference.requestId };
  const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const { questionExpiresAt, ...storedPins } = pins;
  const row = { id: input.reviewId, workspaceId: actor.workspaceId, userId: actor.userId, receiptId: "receipt", ...storedPins,
    calendarOperationId: "independent-calendar", calendarRequestId: reference.requestId, calendarRequestHash: hash,
    packetHash: reference.packetHash, reviewVersion: "personal-sms-correlated-calendar-review-v1", proof: structuredClone(reference.proof), proofHash: reference.proofHash,
    pilotExpiresAt: new Date(pins.pilotExpiresAt), preparationExpiresAt: new Date(questionExpiresAt), createdAt: new Date(iso) };
  const operation = { id: row.calendarOperationId, workspaceId: actor.workspaceId, createdByUserId: actor.userId, connectorAccountId: pins.connectorAccountId,
    kind: "calendar_write", status: "pending", request, requestHash: hash, idempotencyKey: `personal-calendar:workspace:${reference.requestId}`,
    correlatedTemporalReceiptId: "receipt", sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null,
    linkedReviewId: row.id, linkedReceiptId: row.receiptId, linkedWorkspaceId: row.workspaceId, linkedUserId: row.userId };
  const env = { NODE_ENV: "test" as const, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const state = { hook: async (_stage: string) => { void _stage; }, rowCount: 1, operationCount: 1 };
  const stages: string[] = [];
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    expect(sql).toMatch(/^SELECT /);
    const stage = sql.startsWith("SELECT current_setting") ? "isolation" : sql.startsWith("SELECT set_config") ? "timeouts"
      : sql.startsWith('SELECT "receiptId"') ? "discovery" : sql.startsWith("SELECT clock_timestamp") ? "clock"
      : sql.includes('FROM "PersonalAssistantOperation" o JOIN') ? "operation" : "review";
    stages.push(stage); await state.hook(stage);
    if (stage === "isolation") return [{ isolation: "serializable" }];
    if (stage === "timeouts") return [];
    if (stage === "discovery") { expect(args).toEqual([input.reviewId, "workspace", "owner"]); return [{ receiptId: "receipt" }]; }
    if (stage === "review") { expect(args).toEqual([input.reviewId, "workspace", "owner"]); return Array.from({ length: state.rowCount }, () => row); }
    if (stage === "operation") { expect(args).toEqual([row.calendarOperationId]); expect(sql).toContain("FOR SHARE OF o,r"); return Array.from({ length: state.operationCount }, () => operation); }
    return [{ now: new Date(iso) }];
  });
  const write = vi.fn(() => { throw new Error("REVIEW_MUST_NOT_WRITE"); });
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: write } as unknown as TemporalRegistryDB;
  mocks.subject.mockImplementation(async (_tx, given) => { expect(given.actor).toEqual(actor); stages.push("loader"); return subject; });
  mocks.transaction.mockImplementation(async work => work(tx));
  const abort = new AbortController(), context = { deadlineAt: Date.now() + 5000, signal: abort.signal };
  return { input, subject, row, operation, state, stages, query, write, env, abort, context, tx,
    load: () => loadCorrelatedPersonalCalendarReviewInTransaction(tx, input, env, context),
    read: () => readCorrelatedPersonalCalendarReview(input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); });
afterEach(() => { vi.useRealTimers(); });

describe("independent correlated review boundary checks", () => {
  it("copies all stored Date epochs before later awaits without mutating storage", async () => {
    const h = harness(); h.state.hook = async stage => {
      if (stage === "operation") for (const date of [h.row.createdAt, h.row.preparationExpiresAt, h.row.pilotExpiresAt]) date.setTime(0);
    };
    const result = await h.load();
    expect(result).toMatchObject({ review: { preparedAt: iso, preparationExpiresAt: "2026-09-11T04:08:00.000Z" } });
    expect(h.write).not.toHaveBeenCalled();
  });
  it("copies parsed source/citations and status before final clock await", async () => {
    const h = harness(); const originalText = h.subject.proof.resolution.sources[0].body;
    h.state.hook = async stage => { if (stage === "clock") {
      Reflect.set(h.subject.proof.resolution.sources[0], "body", "modified after construction");
      h.operation.status = "completed"; h.operation.request.title = "modified after construction";
    } };
    const result = await h.load();
    expect(result).toMatchObject({ review: { currentStatus: "pending" } });
    expect(result).toHaveProperty("review.evidence.sources.0.text", originalText);
    expect(JSON.stringify(result)).not.toContain("modified after construction");
  });
  it.each([0, 2])("requires exactly one relation row, not %s", async count => {
    const h = harness(); h.state.rowCount = count; await expect(h.load()).rejects.toThrow(changed);
    expect(h.stages).not.toContain("operation");
  });
  it.each([0, 2])("requires exactly one globally joined calendar/review row, not %s", async count => {
    const h = harness(); h.state.operationCount = count; await expect(h.load()).rejects.toThrow(changed);
    expect(h.stages).not.toContain("clock");
  });
  it("does not accept a successful loader response scoped to a different actor", async () => {
    const h = harness(); h.subject.actor.userId = "another-owner";
    await expect(h.load()).rejects.toThrow(changed); expect(h.stages).not.toContain("review");
  });
  it("refuses mismatched compact-proof producer hash before reading persisted review", async () => {
    const h = harness(); Reflect.set(h.subject.proof, "proofHash", "a".repeat(64));
    await expect(h.load()).rejects.toThrow(changed); expect(h.stages).not.toContain("review");
  });
  it("signal aborted by final database wait cannot produce a review", async () => {
    const h = harness(); h.state.hook = async stage => { if (stage === "clock") h.abort.abort(); };
    await expect(h.load()).rejects.toThrow("DEADLINE_OR_DISABLED"); expect(h.write).not.toHaveBeenCalled();
  });
  it("failure to install timeouts cannot reach discovery or the source loader", async () => {
    const h = harness(); h.state.hook = async stage => { if (stage === "timeouts") throw new Error("SQL_TIMEOUT_SETUP_FAILED"); };
    await expect(h.load()).rejects.toThrow("SQL_TIMEOUT_SETUP_FAILED");
    expect(h.stages).toEqual(["isolation", "timeouts"]); expect(mocks.subject).not.toHaveBeenCalled();
  });
  it("unknown transaction result causes no retry and yields no action-capable fallback", async () => {
    const h = harness(); mocks.transaction.mockImplementation(async work => { await work(h.tx); throw new Error("COMMIT_RESULT_UNKNOWN"); });
    await expect(h.read()).rejects.toThrow("COMMIT_RESULT_UNKNOWN");
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(h.write).not.toHaveBeenCalled();
  });
  it("returns only read-only review fields, never the linked calendar id or approval token", async () => {
    const h = harness(), result = await h.read();
    expect(result).toMatchObject({ committed: true, review: { reviewId: h.input.reviewId, readOnly: true, approvalAvailable: false,
      executionAuthorized: false, semanticInterpretationVerified: false, evidence: { provenance: "UNKNOWN" } } });
    expect(JSON.stringify(result)).not.toMatch(/independent-calendar|calendarOperationId|calendarRequestHash|approvalToken|approvalHash/);
    if (result.status === "DISABLED") throw new Error("UNEXPECTED_DISABLED");
    expect(Object.isFrozen(result.review.evidence.sources[0])).toBe(true); expect(h.write).not.toHaveBeenCalled();
  });
});
