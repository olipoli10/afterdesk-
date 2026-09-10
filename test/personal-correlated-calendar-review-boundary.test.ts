import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), prepare: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/model-gateway/personal-intent/correlated-receipt-subject", () => ({ loadCorrelatedPersonalReceiptSubject: mocks.load }));
vi.mock("@/server/personal-assistant/calendar-actions", async original => ({
  ...await original<typeof import("@/server/personal-assistant/calendar-actions")>(), preparePersonalCalendarInTransaction: mocks.prepare,
}));
import { prepareCorrelatedPersonalCalendarReview as wrapper, prepareCorrelatedPersonalCalendarReviewInTransaction as prepare } from "@/server/model-gateway/personal-intent/correlated-calendar-review";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { inspectCorrelatedPersonalReceiptProof } from "@/server/model-gateway/personal-intent/correlated-receipt-proof";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import type { TemporalRegistryDB } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { correlatedReceiptFixture } from "./fixtures/personal-correlated-receipt.fixture";

const now = "2026-09-11T04:02:00.000Z";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function harness() {
  const f = correlatedReceiptFixture(), packet = { packet: f.packet, packetHash: f.packetHash };
  const reference = buildCorrelatedCalendarReferenceProof(f.durable, packet), proof = inspectCorrelatedPersonalReceiptProof(f.durable, packet);
  const subject = { status: "CORRELATED_RECEIPT_SUBJECT_INSPECTED_NOT_AUTHORIZED", reference, proof, inspectedAt: now,
    preparationContext: { clarificationId: f.durable.waiting.prepared.clarificationId, originalSourceOperationId: "source-a", replySourceOperationId: "source-b",
      modelChildOperationId: "child", modelGatewayOperationId: "gateway", reviewActionId: "event", connectorAccountId: "calendar", accountVersion: 1,
      questionExpiresAt: "2026-09-11T04:08:00.000Z", authorityRef: PERSONAL_MODEL_AUTHORITY, pilotExpiresAt: "2026-10-10T01:18:26.000Z" } };
  const input = { enabled: true as const, actor: { workspaceId: "workspace", userId: "owner" }, subject: { kind: "personal_sms_temporal_receipt" as const, receiptId: "receipt" } };
  const env = { NODE_ENV: "test" as const, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true",
    ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const request = { ...reference.proof.draft, accountVersion: 1, requestId: reference.requestId }, requestHash = sha(JSON.stringify(request));
  const operation = { id: "calendar-operation", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "calendar", kind: "calendar_write",
    idempotencyKey: `personal-calendar:workspace:${reference.requestId}`, requestHash, request, correlatedTemporalReceiptId: "receipt",
    sourcePersonalOperationId: null, modelGatewayOperationId: null, budgetId: null, reservedCadMicros: null,
    status: "pending", attempts: 0, leaseUntil: null, result: null, externalTransportPerformed: false };
  const row = { id: "review", workspaceId: "workspace", userId: "owner", receiptId: "receipt", ...subject.preparationContext,
    calendarOperationId: operation.id, calendarRequestId: reference.requestId, calendarRequestHash: requestHash, packetHash: reference.packetHash,
    reviewVersion: "personal-sms-correlated-calendar-review-v1", proof: structuredClone(reference.proof), proofHash: reference.proofHash,
    pilotExpiresAt: new Date(subject.preparationContext.pilotExpiresAt), preparationExpiresAt: new Date(subject.preparationContext.questionExpiresAt), createdAt: new Date(now) };
  // questionExpiresAt belongs to the subject, not the strict persisted relation.
  const { questionExpiresAt: _questionExpiresAt, ...persisted } = row; void _questionExpiresAt;
  const state = { prior: [] as unknown[], occupied: null as unknown, finalClock: new Date(now), beforeOperation: () => {} };
  const query = vi.fn(async (sql: string, ...args: unknown[]) => {
    if (sql.startsWith("SELECT clock_timestamp")) return [{ now: state.finalClock }];
    if (sql.startsWith("SELECT") && sql.includes('FROM "PersonalSmsCorrelatedCalendarReview"')) return state.prior;
    if (sql.startsWith('INSERT INTO "PersonalSmsCorrelatedCalendarReview"')) {
      expect(args[10]).toBe(operation.id); expect(args[12]).toBe(requestHash);
      expect(args[17]).toBeTypeOf("string"); expect(JSON.parse(args[17] as string)).toEqual(reference.proof);
      expect(sql).toContain("($21::timestamptz AT TIME ZONE 'UTC')");
      return [persisted];
    }
    throw new Error("UNEXPECTED_SQL_IN_REVIEW_FIXTURE");
  });
  const findUnique = vi.fn(async (args: { where: { id?: string; idempotencyKey?: string } }) => {
    if (args.where.idempotencyKey) return state.occupied;
    state.beforeOperation(); return operation;
  });
  const tx = { $queryRawUnsafe: query, personalAssistantOperation: { findUnique } } as unknown as TemporalRegistryDB;
  mocks.load.mockResolvedValue(subject); mocks.prepare.mockResolvedValue({ operationId: operation.id, requestHash, status: "pending" });
  mocks.transaction.mockImplementation(async (work: (tx: TemporalRegistryDB) => unknown) => work(tx));
  const context = { deadlineAt: Date.now() + 5000 };
  return { subject, input, env, operation, persisted, state, query, findUnique, tx, context, reference,
    run: () => prepare(tx, input, env, context), committed: () => wrapper(input, env, context) };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => vi.useRealTimers());

describe("correlated calendar producer cross-review (mock transaction, actual pure proof)", () => {
  it("prepares once in the supplied transaction, remains provisional, frozen and unauthorized", async () => {
    const h = harness(), actual = await h.run();
    expect(actual).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT", committed: false, approvalAvailable: false,
      executionAuthorized: false, preparationProviderCalls: 0, newBudgetReservations: 0, operationStatus: "pending" });
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(h.tx, { ...h.input.actor, requestId: h.reference.requestId, draft: h.reference.proof.draft },
      { kind: "personal_sms_temporal_receipt", receiptId: "receipt" });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(Object.isFrozen(actual)).toBe(true);
    expect("draft" in actual && Object.isFrozen(actual.draft)).toBe(true);
  });
  it("OFF is no query even for invalid input; transaction-root clients are refused when ON", async () => {
    const h = harness(); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false";
    expect(await h.run()).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(mocks.load).not.toHaveBeenCalled();
    h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "true";
    await expect(prepare({ ...h.tx, $transaction: vi.fn() } as unknown as TemporalRegistryDB, h.input, h.env, h.context)).rejects.toThrow("CALLER_TRANSACTION_REQUIRED");
  });
  it("does not adopt any preexisting unlinked idempotency operation", async () => {
    const h = harness(); h.state.occupied = { ...h.operation };
    await expect(h.run()).rejects.toThrow("ORPHAN_OR_REQUEST_CONFLICT"); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it.each(["processing", "completed", "uncertain", "refused"])("replays current %s as a replay, not a fresh unsent operation", async status => {
    const h = harness(); h.state.prior = [h.persisted]; h.operation.status = status;
    const actual = await h.run(); expect(actual).toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_REPLAYED", operationStatus: status, replay: true, committed: false, approvalAvailable: false });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(h.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("refuses foreign relation scope even if the receipt lookup returned it", async () => {
    const h = harness(); h.state.prior = [{ ...h.persisted, userId: "another-owner" }];
    await expect(h.run()).rejects.toThrow("STORED_REVIEW_CHANGED"); expect(h.findUnique).not.toHaveBeenCalled();
  });
  it("refuses a changed operation marker on exact historical replay", async () => {
    const h = harness(); h.state.prior = [h.persisted]; h.operation.correlatedTemporalReceiptId = "another-receipt";
    await expect(h.run()).rejects.toThrow("STORED_OPERATION_CHANGED"); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects a newly inserted backdated review; an older exact replay is not rebased", async () => {
    const h = harness(); h.persisted.createdAt = new Date(Date.parse(now) - 1);
    await expect(h.run()).rejects.toThrow("STORED_REVIEW_CHANGED");
    h.state.prior = [h.persisted]; await expect(h.run()).resolves.toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_REPLAYED" });
  });
  it("preflights a malformed stored proof without invoking a hidden getter", async () => {
    const h = harness(); let calls = 0;
    Object.defineProperty(h.persisted.proof.draft, "title", { enumerable: false, get() { calls++; return "x"; } });
    h.state.prior = [h.persisted]; await expect(h.run()).rejects.toThrow(); expect(calls).toBe(0); expect(h.findUnique).not.toHaveBeenCalled();
  });
  it.each(["2026-09-11T04:01:59.999Z", "2026-09-11T04:08:00.000Z"])("refuses final DB clock %s after local writes", async clock => {
    const h = harness(); h.state.finalClock = new Date(clock);
    await expect(h.run()).rejects.toThrow("EXPIRED_OR_CLOCK_CHANGED"); expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
  it("copies caller owner and deadline before the loader await", async () => {
    const h = harness(); mocks.load.mockImplementation(async () => {
      h.input.actor.userId = "changed-owner"; h.context.deadlineAt = 0; return h.subject;
    });
    await expect(h.run()).resolves.toMatchObject({ status: "CORRELATED_CALENDAR_REVIEW_PREPARED_UNSENT" });
    expect(mocks.prepare.mock.calls[0][1].userId).toBe("owner");
  });
  it("does not allow a pilot flag to disappear during the preparer await", async () => {
    const h = harness(); mocks.prepare.mockImplementation(async () => {
      h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false";
      return { operationId: h.operation.id, requestHash: h.operation.requestHash, status: "pending" };
    });
    await expect(h.run()).rejects.toThrow("DISABLED_OR_PILOT_CHANGED");
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("reports committed only after one successful serializable wrapper completion", async () => {
    const h = harness(); await expect(h.committed()).resolves.toMatchObject({ committed: true, approvalAvailable: false });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 5000 });
  });
  it("does not retry or report success when commit acknowledgment is lost", async () => {
    const h = harness(); mocks.transaction.mockImplementation(async work => { await work(h.tx); throw new Error("SYNTHETIC_COMMIT_ACK_UNKNOWN"); });
    await expect(h.committed()).rejects.toThrow("SYNTHETIC_COMMIT_ACK_UNKNOWN");
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });
  it("does not return success if flags change after the transaction promise resolves", async () => {
    const h = harness(); mocks.transaction.mockImplementation(async work => {
      const provisional = await work(h.tx); h.env.ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_PREPARE_ENABLED = "false"; return provisional;
    });
    await expect(h.committed()).rejects.toThrow("DISABLED_OR_PILOT_CHANGED"); expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
