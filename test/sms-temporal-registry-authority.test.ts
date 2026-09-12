import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { temporalConversationNamespace, temporalCheckedSource, temporalRegistryClock, temporalRegistryTransaction,
  temporalCurrentBinding, temporalLockSourceNamespace } from "@/server/personal-assistant/sms-temporal-clarification-authority";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const actor = { workspaceId: "workspace", userId: "owner" }, now = new Date("2026-09-11T12:00:00.000Z");
const env = { ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_AUTHORITY_REF: "ENDVERA-PERSONAL-20260910-100CAD",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_PHONE_NUMBER: "+15145550101" };
function source() {
  const wire = { accountSid: env.TWILIO_ACCOUNT_SID, messageSid: `SM${"b".repeat(32)}`, from: "+15145550100", to: env.TWILIO_PHONE_NUMBER, body: "Ajoute inspection demain à 2h, fin 15h." };
  const requestHash = sha(JSON.stringify(wire));
  return { id: "source", request: { schemaVersion: 1, ...wire, contentHash: requestHash, identityId: "identity" }, requestHash,
    idempotencyKey: `personal-sms:${sha(`${wire.accountSid}:${wire.messageSid}`)}`, createdAt: now, result: null, connectorAccountId: "sms" };
}
function db(rows: unknown = []) {
  const query = vi.fn(async (...args: unknown[]) => { void args; return rows; });
  return { query, tx: { $queryRawUnsafe: query } as unknown as Prisma.TransactionClient };
}
afterEach(() => vi.useRealTimers());
describe("OFF registry transaction and authoritative source boundary", () => {
  it("keeps exactly the legacy visible pair namespace", () => {
    expect(temporalConversationNamespace("+15145550100", "+15145550101")).toBe(sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", "+15145550100", "+15145550101"])));
    expect(temporalConversationNamespace("+15145550101", "+15145550100")).not.toBe(temporalConversationNamespace("+15145550100", "+15145550101"));
  });
  it.each(["owner", "15145550100", "+1", "+0123456789", "+15145550100\n"])("rejects noncanonical pair %s", phone => {
    expect(() => temporalConversationNamespace(phone, "+15145550101")).toThrow();
  });
  it.each([false, undefined, "TRUE", "1"])("does not enter a transaction for disabled flag %s", async enabled => {
    const f = db();
    await expect(temporalRegistryTransaction(f.tx, { deadlineAt: Date.now() + 1000 }, { ...env, ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: enabled as string })).rejects.toThrow("DISABLED");
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -Infinity, 0])("refuses deadline %s before first DB read", async deadlineAt => {
    const f = db(); await expect(temporalRegistryTransaction(f.tx, { deadlineAt }, env)).rejects.toThrow("DEADLINE"); expect(f.query).not.toHaveBeenCalled();
  });
  it("refuses an already aborted caller", async () => {
    const f = db(), c = new AbortController(); c.abort();
    await expect(temporalRegistryTransaction(f.tx, { deadlineAt: Date.now() + 1000, signal: c.signal }, env)).rejects.toThrow(); expect(f.query).not.toHaveBeenCalled();
  });
  it.each(["read committed", "repeatable read", undefined])("requires actual caller isolation %s", async isolation => {
    const f = db([{ isolation }]); await expect(temporalRegistryTransaction(f.tx, { deadlineAt: Date.now() + 5000 }, env)).rejects.toThrow("SERIALIZABLE"); expect(f.query).toHaveBeenCalledTimes(1);
  });
  it("bounds native SQL lock and statement timeouts to remaining original time", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); const f = db([{ isolation: "serializable" }]);
    await temporalRegistryTransaction(f.tx, { deadlineAt: now.getTime() + 999 }, env);
    expect(f.query.mock.calls[1]).toEqual(["SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", "999"]);
    await temporalRegistryTransaction(f.tx, { deadlineAt: now.getTime() + 10000 }, env);
    expect(f.query.mock.calls[3][1]).toBe("2000");
  });
  it("stops after first latency rather than starting another statement", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now); const f = db(); f.query.mockImplementation(async () => { vi.setSystemTime(now.getTime() + 1000); return [{ isolation: "serializable" }]; });
    await expect(temporalRegistryTransaction(f.tx, { deadlineAt: now.getTime() + 1000 }, env)).rejects.toThrow("DEADLINE"); expect(f.query).toHaveBeenCalledTimes(1);
  });
  it.each([null, "2026-09-11", new Date(NaN)])("requires genuine database Date %s", async timestamp => {
    await expect(temporalRegistryClock(db([{ now: timestamp }]).tx)).rejects.toThrow("DB_CLOCK_REQUIRED");
  });
  it("preserves actual source bytes and receipt; refuses content or idempotency tampering", () => {
    const row = source(), checked = temporalCheckedSource(row, actor);
    expect(checked).toMatchObject({ ...actor, body: row.request.body, requestHash: row.requestHash, receivedAt: now.toISOString() });
    expect(() => temporalCheckedSource({ ...row, request: { ...row.request, body: row.request.body + " " } }, actor)).toThrow();
    expect(() => temporalCheckedSource({ ...row, idempotencyKey: "personal-sms:other" }, actor)).toThrow();
  });
  it("takes namespace before authoritative locks and does not lock a guessed missing source", async () => {
    const f = db([source()]); await temporalLockSourceNamespace(f.tx, actor, "source");
    expect(f.query.mock.calls[0][0]).not.toContain("FOR UPDATE"); expect(f.query.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
    const absent = db([]); await expect(temporalLockSourceNamespace(absent.tx, actor, "missing")).rejects.toThrow("SOURCE_REQUIRED"); expect(absent.query).toHaveBeenCalledTimes(1);
  });
  const bindingRow = () => ({ ...source(), now, memberId: "member", memberRevision: now, workspaceRevision: now, identityId: "identity", identityRevision: now,
    smsAccountId: "sms", smsAccountVersion: 1, smsInboundGrantId: "inbound", smsInboundGrantVersion: 1, timezone: "America/Toronto",
    modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
    calendarAccountId: "google", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1 });
  it("returns current epochs and SQL keeps all grant/credential rows locked", async () => {
    const f = db([bindingRow()]); const result = await temporalCurrentBinding(f.tx, actor, "source", "child", env);
    expect(result.binding).toMatchObject({ memberRole: "owner", memberRevision: now.toISOString(), calendarAccountVersion: 1 });
    const sql = f.query.mock.calls[0][0] as string;
    expect(sql).toContain('mc."revokedAt" IS NULL'); expect(sql).toContain("FOR SHARE OF s,w,m,i,a,sg,child,ma,mc,mg,ga,gc,gg");
    expect(sql).toContain("clock_timestamp()"); expect(sql).not.toContain("secretCiphertext");
    expect(sql).toContain("ga.provider IN ('google_calendar','endvera_android_device')");
    expect(sql).toContain("ga.provider='endvera_android_device' AND 'device:calendar:write'=ANY(ga.\"grantedScopes\") AND 'device:calendar:write'=ANY(gg.\"grantedScopes\")");
    expect(sql).toContain("ga.provider='google_calendar' AND $7=ANY(ga.\"grantedScopes\") AND $7=ANY(gg.\"grantedScopes\")");
  });
  it.each(["2026-09-10T01:18:25Z", "2026-10-10T01:18:26Z"])("rejects inactive pilot at DB instant %s", async timestamp => {
    await expect(temporalCurrentBinding(db([{ ...bindingRow(), now: new Date(timestamp) }]).tx, actor, "source", "child", env)).rejects.toThrow("PILOT_INACTIVE");
  });
  it.each(["ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_PERSONAL_PILOT_EXPIRES_AT"])("rejects changed current configuration %s", async key => {
    await expect(temporalCurrentBinding(db([bindingRow()]).tx, actor, "source", "child", { ...env, [key]: "changed" })).rejects.toThrow("PILOT_INACTIVE");
  });
  it("refuses missing current authority without reading provider data", async () => {
    await expect(temporalCurrentBinding(db([]).tx, actor, "source", "child", env)).rejects.toThrow("CURRENT_BINDING_REQUIRED");
  });
});
