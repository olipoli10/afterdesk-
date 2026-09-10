import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ prepare: vi.fn(), expire: vi.fn(), query: vi.fn() }));
vi.mock("@/server/personal-assistant/calendar-sms-confirmation-store", () => ({ prepareCalendarSmsConfirmationInTransaction: m.prepare, expireCalendarSmsConfirmationsInTransaction: m.expire }));
vi.mock("@/server/personal-assistant/calendar-confirmation-worker", () => ({ calendarConfirmationWorkerEnabled: (env: Record<string, string>) =>
  ["ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED", "ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED", "ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED"].every(key => env[key] === "true") }));
import { prepareCalendarConfirmationForReviewInTransaction as prepare } from "@/server/personal-assistant/calendar-confirmation-preparation";
const env = { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true" };
const now = Date.parse("2026-09-10T07:00:00Z");
const claim = { operationId: "source", userId: "owner", workspaceId: "workspace", attempt: 1 as const, leaseUntil: new Date(now + 30000).toISOString() };
const context = () => ({ claim, signal: new AbortController().signal, deadlineAt: now + 30000 });
const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", source: { operationId: "source", text: "synthetic exact calendar request" }, modelChildOperationId: "model",
  actions: [{ actionId: "action", operationId: "calendar", requestHash: "hash", kind: "PREPARE_CALENDAR_EVENT", status: "PREPARED_UNSENT" }] };
const tx = { $queryRawUnsafe: m.query } as unknown as Parameters<typeof prepare>[0];
const typedReview = (value: unknown) => value as Parameters<typeof prepare>[2];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); m.query.mockResolvedValue([]); m.expire.mockResolvedValue({ count: 0 });
  m.prepare.mockResolvedValue({ status: "PREPARED_DURABLE_OFF", challengeId: "challenge", summary: "CONFIRME ENDVERA AGENDA secret-code", requiredSourceReview: review });
});
afterEach(() => vi.useRealTimers());
describe("source finalization calendar confirmation preparation", () => {
  it.each(Object.keys(env))("remains app review only without %s", async key => {
    expect(await prepare(tx, context(), typedReview(review), { ...env, [key]: "false" })).toMatchObject({ status: "APP_REVIEW_ONLY", reason: "DISABLED" });
    expect(m.prepare).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  });
  it.each([[], [...review.actions, ...review.actions], [{ ...review.actions[0], kind: "READ_CALENDAR" }], [{ ...review.actions[0], status: "CLARIFY" }]].map(actions => ({ actions })))("never promotes ambiguous/mixed/non-exact actions %j", async ({ actions }) => {
    expect(await prepare(tx, context(), typedReview({ ...review, actions }), env)).toMatchObject({ status: "APP_REVIEW_ONLY" });
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it("requires matching exact source and a live deadline", async () => {
    await expect(prepare(tx, context(), typedReview({ ...review, source: { ...review.source, operationId: "other" } }), env)).rejects.toThrow("SOURCE_CHANGED");
    await expect(prepare(tx, { ...context(), deadlineAt: now }, typedReview(review), env)).rejects.toThrow("DEADLINE");
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it("expires old waiting work without replacing any still-active confirmation", async () => {
    m.query.mockResolvedValue([{ id: "previous" }]);
    expect(await prepare(tx, context(), typedReview(review), env)).toMatchObject({ reason: "EXISTING_CONFIRMATION_NOT_REPLACED" });
    expect(m.expire).toHaveBeenCalledExactlyOnceWith(tx, { userId: "owner", workspaceId: "workspace" }, env);
    expect(m.query.mock.calls[0][0]).toContain("'PREPARED','WAITING','CONSUMED'"); expect(m.prepare).not.toHaveBeenCalled();
  });
  it("prepares exact source-bound challenge without leaking summary into ordinary reply", async () => {
    const result = await prepare(tx, context(), typedReview(review), env);
    expect(result).toEqual({ status: "PREPARED_FOR_SOURCE_COMMIT", challengeId: "challenge", executionAuthorized: false });
    expect(m.prepare).toHaveBeenCalledExactlyOnceWith(tx, { actor: { userId: "owner", workspaceId: "workspace" }, sourceClaim: claim,
      modelChildOperationId: "model", reviewActionId: "action", calendarOperationId: "calendar" }, env);
    expect(JSON.stringify(result)).not.toContain("CONFIRME");
  });
  it("refuses source-review drift inside same finalization transaction", async () => {
    m.prepare.mockResolvedValue({ status: "PREPARED_DURABLE_OFF", challengeId: "challenge", requiredSourceReview: { ...review, source: { ...review.source, text: "changed" } } });
    await expect(prepare(tx, context(), typedReview(review), env)).rejects.toThrow("REVIEW_CHANGED");
  });
  it("refuses a switch change during preparation", async () => {
    const changed = { ...env }; m.expire.mockImplementation(async () => { changed.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED = "false"; });
    await expect(prepare(tx, context(), typedReview(review), changed)).rejects.toThrow("DISABLED"); expect(m.prepare).not.toHaveBeenCalled();
  });
});
