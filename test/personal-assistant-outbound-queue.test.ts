import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
import { selectPersonalAutomaticOutboundCandidates as select } from "@/server/personal-assistant/outbound-queue";
const env = () => ({ ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic", ENDVERA_EXTERNAL_OWNER_REF: "synthetic",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: "synthetic", TWILIO_API_KEY_SID: "synthetic", TWILIO_API_KEY_SECRET: "synthetic",
  TWILIO_AUTH_TOKEN: "synthetic", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z",
  ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED: "true" });
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T07:00:00Z"));
  m.query.mockResolvedValue([]); m.configure.mockResolvedValue(1); m.transaction.mockImplementation(work => work({ $queryRawUnsafe: m.query, $executeRawUnsafe: m.configure })); });
afterEach(() => vi.useRealTimers());
describe("read-only automatic outbound queue hints", () => {
  it("is OFF by default before database access", async () => { expect(await select({}, env())).toMatchObject({ status: "DISABLED", executionAuthorized: false }); expect(m.transaction).not.toHaveBeenCalled(); });
  it.each(["ENDVERA_EXTERNAL_TRANSPORT_ENABLED", "ENDVERA_PERSONAL_SMS_WORKER_ENABLED", "ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED", "TWILIO_ACCOUNT_SID"])("stays OFF without %s", async key => {
    expect(await select({ enabled: true }, { ...env(), [key]: "" })).toMatchObject({ status: "DISABLED" }); expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each([0, 11, NaN, 1.5])("refuses invalid limit %s", async limit => { await expect(select({ enabled: true, limit }, env())).rejects.toThrow("LIMIT_INVALID"); expect(m.transaction).not.toHaveBeenCalled(); });
  it("returns frozen non-authorizing candidates and passes an exact bounded whitelist query", async () => {
    m.query.mockResolvedValue([{ id: "outbound", idempotencyKey: "reply:source" }]);
    const result = await select({ enabled: true, limit: 1 }, env());
    expect(result).toEqual({ status: "CANDIDATES_NOT_AUTHORIZED", executionAuthorized: false, candidates: [{ id: "outbound", idempotencyKey: "reply:source" }] });
    expect(Object.isFrozen(result.candidates)).toBe(true); expect(Object.isFrozen(result.candidates[0])).toBe(true);
    const [sql, limit, phone, hash, confirmation] = m.query.mock.calls[0];
    expect([limit, phone, confirmation]).toEqual([1, "+15005550006", false]); expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(sql).toContain("o.kind='sms_outbound' AND o.status IN ('pending','approved') AND o.attempts=0");
    expect(sql).toContain("o.\"idempotencyKey\"='reply:'||s.id"); expect(sql).toContain("o.\"idempotencyKey\"='calendar-confirmation:'||c.id");
    expect(sql).toContain('ORDER BY o."createdAt",o.id LIMIT $1');
  });
  it("requires all confirmation flags and explicit inclusion", async () => {
    await select({ enabled: true, includeConfirmations: true }, env()); expect(m.query.mock.calls[0][4]).toBe(true);
    await select({ enabled: true, includeConfirmations: true }, { ...env(), ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "false" });
    expect(m.query.mock.calls[1][4]).toBe(false);
  });
  it("filters expired/revoked/mismatched bridges before LIMIT, never by deleting retained proof", async () => {
    await select({ enabled: true, includeConfirmations: true }, env()); const sql = m.query.mock.calls[0][0];
    for (const fragment of ["c.phase='PREPARED' AND c.\"expiresAt\">(clock_timestamp() AT TIME ZONE 'UTC')", "write.status='active'", "write.\"revokedAt\" IS NULL",
      "credential.\"revokedAt\" IS NULL", "d.status='pending' AND d.attempts=0", "c.\"sourceOperationId\"=s.id", "c.\"userId\"=o.\"createdByUserId\"",
      "s.result->'personalModelReview'=c.\"reviewSnapshot\"", "'{binding,calendar,requestHash}'", "'{binding,calendar,writeGrantVersion}'"]) expect(sql).toContain(fragment);
    expect(sql).not.toMatch(/UPDATE |DELETE |INSERT |FOR UPDATE/);
  });
  it("rejects any accidental non-whitelisted or oversized result without providing an action", async () => {
    m.query.mockResolvedValue([{ id: "manual", idempotencyKey: "personal-sms:manual" }]); await expect(select({ enabled: true }, env())).rejects.toThrow("RESULT_INVALID");
    m.query.mockResolvedValue([{ id: "one", idempotencyKey: "reply:one" }, { id: "two", idempotencyKey: "reply:two" }]);
    await expect(select({ enabled: true, limit: 1 }, env())).rejects.toThrow("RESULT_INVALID");
  });
  it("bounds native waits and refuses expired/aborted controllers", async () => {
    await select({ enabled: true }, env()); expect(m.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 500, timeout: 2000 });
    expect(m.configure).toHaveBeenCalledWith("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)", "2000", "250");
    await expect(select({ enabled: true, deadlineAt: NaN }, env())).rejects.toThrow("DEADLINE_INVALID");
    await expect(select({ enabled: true, deadlineAt: Date.now() }, env())).rejects.toThrow("DEADLINE");
    const controller = new AbortController(); controller.abort(); await expect(select({ enabled: true, signal: controller.signal }, env())).rejects.toThrow("ABORTED");
  });
  it("withholds late or disabled results after asynchronous SQL", async () => {
    const flags = env(); m.query.mockImplementation(async () => { flags.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED = "false"; return []; });
    await expect(select({ enabled: true, includeConfirmations: true }, flags)).rejects.toThrow("DISABLED");
    m.query.mockImplementation(async () => { vi.advanceTimersByTime(3000); return []; });
    await expect(select({ enabled: true }, env())).rejects.toThrow("DEADLINE");
  });
  it("imports no dispatch, credential loading or permission mutation", () => {
    const source = readFileSync("src/server/personal-assistant/outbound-queue.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|sendAutomatic|dispatchOutbound|sealConnector|openConnector|UPDATE |INSERT |DELETE /);
  });
});
