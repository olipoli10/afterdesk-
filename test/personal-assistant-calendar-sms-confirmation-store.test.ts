import type { Prisma } from "@prisma-client";
import { describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ review: vi.fn(), claim: vi.fn() }));
vi.mock("@/server/model-gateway/personal-intent/review-consumer", () => ({ prepareStoredPersonalIntentReview: shared.review }));
vi.mock("@/server/personal-assistant/calendar-actions", async original => ({ ...await original<typeof import("@/server/personal-assistant/calendar-actions")>(), claimPersonalCalendarWriteInTransaction: shared.claim }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { consumeCalendarSmsConfirmationInTransaction, expireCalendarSmsConfirmationsInTransaction,
  markCalendarSmsConfirmationWaitingInTransaction, prepareCalendarSmsConfirmationInTransaction, reconcileCalendarSmsConfirmationInTransaction } from "@/server/personal-assistant/calendar-sms-confirmation-store";
describe("SMS calendar confirmation storage is OFF before reading state", () => {
  it.each([{}, { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "false" }, { ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "TRUE" }])("requires the exact explicit local switch: %j", async flags => {
    const access = vi.fn(() => { throw new Error("unexpected DB access"); });
    const tx = new Proxy({}, { get: access }) as Prisma.TransactionClient;
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ...flags };
    const bad = {} as never;
    for (const result of [await prepareCalendarSmsConfirmationInTransaction(tx, bad, env), await consumeCalendarSmsConfirmationInTransaction(tx, bad, env),
      await markCalendarSmsConfirmationWaitingInTransaction(tx, bad, env), await reconcileCalendarSmsConfirmationInTransaction(tx, bad, env),
      await expireCalendarSmsConfirmationsInTransaction(tx, bad, env)]) {
      expect(result).toEqual({ status: "DISABLED", executionAuthorized: false }); expect(Object.isFrozen(result)).toBe(true);
    }
    expect(access).not.toHaveBeenCalled(); expect(shared.review).not.toHaveBeenCalled(); expect(shared.claim).not.toHaveBeenCalled();
  });
  it("rejects actor/source mismatches before review or database access", async () => {
    const tx = {} as Prisma.TransactionClient;
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true" };
    const input = { actor: { userId: "owner", workspaceId: "workspace" }, sourceClaim: { operationId: "source", userId: "other-owner", workspaceId: "workspace", attempt: 1 as const, leaseUntil: "2026-10-01T00:00:00.000Z" }, modelChildOperationId: "child", reviewActionId: "event", calendarOperationId: "calendar" };
    await expect(prepareCalendarSmsConfirmationInTransaction(tx, input, env)).rejects.toThrow("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
    await expect(consumeCalendarSmsConfirmationInTransaction(tx, { actor: input.actor, challengeId: "challenge", confirmationSourceClaim: input.sourceClaim }, env)).rejects.toThrow("CONFIRMATION_SOURCE_CLAIM_REQUIRED");
    expect(shared.review).not.toHaveBeenCalled(); expect(shared.claim).not.toHaveBeenCalled();
  });
  it.each([0, -1, 600001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid TTL %s before review or database access", async ttlMs => {
    const access = vi.fn(() => { throw new Error("unexpected DB access"); });
    const tx = new Proxy({}, { get: access }) as Prisma.TransactionClient;
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true" };
    const input = { actor: { userId: "owner", workspaceId: "workspace" }, sourceClaim: { operationId: "source", userId: "owner", workspaceId: "workspace", attempt: 1 as const, leaseUntil: "2026-10-01T00:00:00.000Z" }, modelChildOperationId: "child", reviewActionId: "event", calendarOperationId: "calendar", ttlMs };
    await expect(prepareCalendarSmsConfirmationInTransaction(tx, input, env)).rejects.toThrow();
    expect(access).not.toHaveBeenCalled(); expect(shared.review).not.toHaveBeenCalled(); expect(shared.claim).not.toHaveBeenCalled();
  });
});
