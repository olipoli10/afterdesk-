import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ first: vi.fn(), update: vi.fn(), updateOne: vi.fn(), query: vi.fn(), transaction: vi.fn(), tokens: vi.fn() }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: shared.tokens }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction, $queryRawUnsafe: shared.query,
  personalAssistantOperation: { findFirst: shared.first, updateMany: shared.update, update: shared.updateOne },
  constructionWorkspaceMember: { findFirst: vi.fn(async () => ({ id: "member" })) },
  constructionConnectorAccount: { findFirst: vi.fn(async () => ({ id: "account", stateVersion: 1 })) } } }));
import { prisma } from "@/lib/db";
import { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
import { approveAndInsertPersonalCalendar, claimPersonalCalendarWriteInTransaction, executeClaimedPersonalCalendarWrite } from "@/server/personal-assistant/calendar-actions";
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic", ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic", GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00Z" };
function fixture() {
  const request = { title: "Synthétique", startsAt: "2036-09-11T14:00:00Z", endsAt: "2036-09-11T15:00:00Z", timezone: "UTC", accountVersion: 1, requestId: randomUUID() };
  const row = { id: "operation", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", kind: "calendar_write", status: "pending", attempts: 0, leaseUntil: null as Date | null, request, requestHash: createHash("sha256").update(JSON.stringify(request)).digest("hex"), result: {} as Record<string, unknown>, externalTransportPerformed: false };
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => v instanceof Date ? row.leaseUntil?.getTime() === v.getTime() : v && typeof v === "object" && "equals" in v ? isDeepStrictEqual(row[k as keyof typeof row], v.equals) : row[k as keyof typeof row] === v);
  shared.first.mockImplementation(async ({ where }) => matches(where) ? row : null);
  shared.update.mockImplementation(async ({ where, data }) => {
    if (!matches(where)) return { count: 0 };
    Object.assign(row, data, data.attempts && typeof data.attempts === "object" ? { attempts: row.attempts + data.attempts.increment } : {}); return { count: 1 };
  });
  shared.updateOne.mockImplementation(async ({ data }) => Object.assign(row, data));
  shared.transaction.mockImplementation(fn => fn(prisma));
  const authority = { accountId: "account", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner", memberUpdatedAt: new Date("2036-01-01T00:00:00Z"), workspaceUpdatedAt: new Date("2036-01-01T00:00:00Z"), accountScopes: ["https://www.googleapis.com/auth/calendar.events"], grantScopes: ["https://www.googleapis.com/auth/calendar.events"] };
  const state = { authorized: true };
  shared.query.mockImplementation(async (_sql, id, workspace, owner, requestHash, scope, lease) => {
    if (!state.authorized || id !== row.id || workspace !== row.workspaceId || owner !== row.createdByUserId || requestHash !== row.requestHash || !authority.accountScopes.includes(scope) || !authority.grantScopes.includes(scope)) return [];
    if (!lease ? row.status !== "pending" || row.attempts !== 0 || row.leaseUntil !== null : row.status !== "processing" || row.attempts !== 1 || row.leaseUntil?.getTime() !== lease.getTime() || lease.getTime() <= Date.now()) return [];
    return [{ request: row.request, result: row.result, ...authority }];
  });
  shared.tokens.mockResolvedValue({ accountId: "account", accountVersion: 1, readAuthority: { credentialId: "credential" }, tokens: { scopes: ["https://www.googleapis.com/auth/calendar.events"] } });
  const client = { transportAttempts: 0, insertEvent: vi.fn(async () => { client.transportAttempts++; return { providerEventId: "synthetic-event", confirmed: true as const }; }) };
  const input = { userId: "owner", workspaceId: "workspace", operationId: row.id, expectedRequestHash: row.requestHash };
  return { row, input, client, authority, state };
}
beforeEach(() => vi.clearAllMocks());
describe("personal Google write claim and late response fencing", () => {
  it("refuses a stale pending operation with a previous attempt", async () => {
    const f = fixture(); f.row.attempts = 1;
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow();
    expect(f.client.insertEvent).not.toHaveBeenCalled();
  });
  it("refuses a pending operation retaining an old lease", async () => {
    const f = fixture(); f.row.leaseUntil = new Date(Date.now() - 1000);
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow();
    expect(f.client.insertEvent).not.toHaveBeenCalled();
  });
  it("never overwrites a recovery winner with a late confirmed response", async () => {
    const f = fixture(); f.client.insertEvent.mockImplementation(async () => { f.client.transportAttempts++; Object.assign(f.row, { status: "uncertain", leaseUntil: null, result: { recoveryWon: true } }); return { providerEventId: "synthetic-event", confirmed: true }; });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.row.result).toEqual({ recoveryWon: true }); expect(f.row.status).toBe("uncertain");
  });
  it("completes exactly one approved write with unchanged authority", async () => {
    const f = fixture();
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).resolves.toMatchObject({ confirmed: true });
    expect(f.row).toMatchObject({ status: "completed", attempts: 1, externalTransportPerformed: true, leaseUntil: null });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow();
    expect(f.client.insertEvent).toHaveBeenCalledOnce();
  });
  it("binds the actual write grant and rejects read-only authority", async () => {
    const f = fixture(); f.authority.grantScopes = ["https://www.googleapis.com/auth/calendar.events.readonly"];
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow();
    expect(shared.tokens).not.toHaveBeenCalled(); expect(f.row.status).toBe("pending");
  });
  it("rechecks authority after token latency before dispatch", async () => {
    const f = fixture(); shared.tokens.mockImplementation(async () => { f.state.authorized = false; return { accountId: "account", accountVersion: 1, readAuthority: { credentialId: "credential" }, tokens: { scopes: f.authority.accountScopes } }; });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.client.insertEvent).not.toHaveBeenCalled(); expect(f.row).toMatchObject({ status: "uncertain", externalTransportPerformed: false });
  });
  it("does not accept revoked-and-regranted write permission as the original approval", async () => {
    const f = fixture(); shared.tokens.mockImplementation(async () => { f.authority.writeGrantVersion++; return { accountId: "account", accountVersion: 1, readAuthority: { credentialId: "credential" }, tokens: { scopes: f.authority.accountScopes } }; });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.client.insertEvent).not.toHaveBeenCalled();
  });
  it("withholds success when write permission is revoked during transport", async () => {
    const f = fixture(); f.client.insertEvent.mockImplementation(async () => { f.client.transportAttempts++; f.state.authorized = false; return { providerEventId: "synthetic-event", confirmed: true }; });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.row).toMatchObject({ status: "uncertain", result: { writeConfirmed: false }, externalTransportPerformed: true });
  });
  it("expired caller deadlines leave an unclaimed draft untouched", async () => {
    const f = fixture();
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient, { deadlineAt: Date.now() - 1 })).rejects.toThrow("CALENDAR_WRITE_DEADLINE_EXCEEDED");
    expect(f.row).toMatchObject({ status: "pending", attempts: 0 }); expect(shared.tokens).not.toHaveBeenCalled();
  });
  it("a non-cooperative late transport cannot finalize after cancellation", async () => {
    const f = fixture(); let resolve!: (value: { providerEventId: string; confirmed: true }) => void;
    const started = Promise.withResolvers<void>();
    f.client.insertEvent.mockImplementation(() => { f.client.transportAttempts++; started.resolve(); return new Promise(r => { resolve = r; }); });
    const controller = new AbortController();
    const pending = approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient, { signal: controller.signal });
    const assertion = expect(pending).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    await started.promise; controller.abort(); await assertion;
    expect(f.row.status).toBe("uncertain"); resolve({ providerEventId: "synthetic-event", confirmed: true });
    await new Promise(r => setTimeout(r, 0)); expect(f.row.status).toBe("uncertain");
  });
  it("claim creation is purely local and duplicate execute cannot dispatch twice", async () => {
    const f = fixture();
    const claim = await claimPersonalCalendarWriteInTransaction(prisma as never, f.input, env);
    expect(shared.tokens).not.toHaveBeenCalled(); expect(f.client.insertEvent).not.toHaveBeenCalled();
    const results = await Promise.allSettled([executeClaimedPersonalCalendarWrite(claim, env, f.client as unknown as GoogleCalendarClient), executeClaimedPersonalCalendarWrite(claim, env, f.client as unknown as GoogleCalendarClient)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.client.insertEvent).toHaveBeenCalledOnce(); expect(f.row.status).toBe("completed");
  });
  it("uses one joined locking query for operation, workspace, member, account, credential and WRITE grant", async () => {
    const f = fixture(); await approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient);
    for (const [sql] of shared.query.mock.calls) { expect(sql).toContain("g.capability='calendar_write'"); expect(sql).toContain("FOR UPDATE OF o FOR SHARE OF w,m,a,c,g"); expect(sql).toContain('o."leaseUntil">clock_timestamp()'); }
  });
  it.each(["memberUpdatedAt", "workspaceUpdatedAt", "memberRole"] as const)("rejects changed %s after claiming even if authority is active again", async field => {
    const f = fixture(); shared.tokens.mockImplementation(async () => {
      Object.assign(f.authority, { [field]: field === "memberRole" ? "admin" : new Date("2036-01-01T00:00:01Z") });
      return { accountId: "account", accountVersion: 1, readAuthority: { credentialId: "credential" }, tokens: { scopes: f.authority.accountScopes } };
    });
    await expect(approveAndInsertPersonalCalendar(f.input, env, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.client.insertEvent).not.toHaveBeenCalled();
  });
  it("rechecks the pilot flag after an awaited JSONB approval lookup", async () => {
    const f = fixture(); const config = { ...env }; const previous = shared.first.getMockImplementation()!;
    const query = shared.query.getMockImplementation()!;
    shared.query.mockImplementation(async (...args) => (await query(...args)).map((row: Record<string, unknown>) => ({ ...row, result: Object.fromEntries(Object.entries(row.result as Record<string, unknown>).reverse()) })));
    shared.first.mockImplementation(async (...args) => { config.ENDVERA_GOOGLE_OAUTH_ENABLED = "DISABLED"; return previous(...args); });
    await expect(approveAndInsertPersonalCalendar(f.input, config, f.client as unknown as GoogleCalendarClient)).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(f.client.insertEvent).not.toHaveBeenCalled();
  });
  it("freezes the returned claim and snapshots mutable caller copies before awaiting", async () => {
    const f = fixture(); const initial = await claimPersonalCalendarWriteInTransaction(prisma as never, f.input, env);
    expect(Object.isFrozen(initial)).toBe(true); expect(Object.isFrozen(initial.request)).toBe(true); expect(Object.isFrozen(initial.authority.accountScopes)).toBe(true);
    const supplied = structuredClone(initial); const previous = shared.tokens.getMockImplementation();
    shared.tokens.mockImplementation(async () => { supplied.request.title = "Unapproved title"; supplied.leaseUntil.setTime(0); return previous?.(); });
    await expect(executeClaimedPersonalCalendarWrite(supplied, env, f.client as unknown as GoogleCalendarClient)).resolves.toMatchObject({ confirmed: true });
    expect(f.client.insertEvent.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Synthétique" })]));
  });
});
