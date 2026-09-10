import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { selectPersonalAutomaticOutboundCandidates as select } from "@/server/personal-assistant/outbound-queue";

const flags = () => ({ ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_EXTERNAL_OWNER_REF: "synthetic",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: "synthetic", TWILIO_API_KEY_SID: "synthetic", TWILIO_API_KEY_SECRET: "synthetic",
  TWILIO_AUTH_TOKEN: "synthetic", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
  ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true" });
const tx = { $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.configure };
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T14:00:00Z"));
  mock.query.mockResolvedValue([{ id: "q", idempotencyKey: "reply:s" }]); mock.configure.mockResolvedValue(1);
  mock.transaction.mockImplementation(work => work(tx));
});
afterEach(() => vi.useRealTimers());

describe("independent temporal outbound scheduling review (no SQL execution)", () => {
  it("does not return hints after a flag changes at transaction acknowledgement", async () => {
    const env = flags();
    mock.transaction.mockImplementation(async work => {
      const result = await work(tx); env.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "false"; return result;
    });
    await expect(select({ enabled: true }, env)).rejects.toThrow("DISABLED");
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });
  it("a deadline crossed after read-only callback commit cannot publish stale hints", async () => {
    const deadlineAt = Date.now() + 1000;
    mock.transaction.mockImplementation(async work => { const result = await work(tx); vi.setSystemTime(deadlineAt); return result; });
    await expect(select({ enabled: true, deadlineAt }, flags())).rejects.toThrow("DEADLINE");
  });
  it("returned candidate owns its primitives rather than retaining the database row object", async () => {
    const row = { id: "q", idempotencyKey: "reply:s" }; mock.query.mockResolvedValue([row]);
    const result = await select({ enabled: true }, flags());
    row.id = "other"; row.idempotencyKey = "calendar-confirmation:other";
    expect(result.candidates).toEqual([{ id: "q", idempotencyKey: "reply:s" }]);
    expect(result.executionAuthorized).toBe(false); expect(Object.isFrozen(result.candidates)).toBe(true);
  });
  it("temporal eligibility does not accidentally enable the distinct confirmation branch", async () => {
    await select({ enabled: true, includeConfirmations: false, limit: 1 }, flags());
    const [sql, limit, , , confirmations, , temporal, authority] = mock.query.mock.calls[0];
    expect([limit, confirmations, temporal, authority]).toEqual([1, false, true, `authority:${PERSONAL_MODEL_AUTHORITY}`]);
    expect(sql).toContain("o.\"idempotencyKey\"='reply:'||s.id");
    expect(sql).toContain("o.\"idempotencyKey\"='calendar-confirmation:'||c.id");
    expect(sql.indexOf('attached.\"questionOutboundOperationId\"=o.id')).toBeLessThan(sql.indexOf('ORDER BY o.\"createdAt\",o.id LIMIT $1'));
  });
});
