import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ find: vi.fn(), first: vi.fn(), list: vi.fn(), update: vi.fn(), updateOne: vi.fn(),
  transaction: vi.fn(), execute: vi.fn(), query: vi.fn(), member: vi.fn(), identity: vi.fn(), account: vi.fn(), grant: vi.fn(), budget: vi.fn(), budgetRead: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction, $queryRaw: vi.fn(), $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.execute,
  personalAssistantOperation: { findUnique: shared.find, findFirst: shared.first, findMany: shared.list, updateMany: shared.update, update: shared.updateOne },
  constructionWorkspaceMember: { findFirst: shared.member }, constructionCommunicationIdentity: { findFirst: shared.identity },
  constructionConnectorAccount: { findUniqueOrThrow: shared.account }, constructionConnectorGrant: { findFirst: shared.grant },
  personalAssistantBudget: { upsert: shared.budget, findUnique: shared.budgetRead, update: shared.reserve } } }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ requireGoogleReadAuthority: vi.fn(), readGoogleCalendarWithAuthority: vi.fn() }));
vi.mock("@/server/personal-assistant/model-worker", () => ({ processPersonalModelSms: vi.fn(), personalModelReviewReply: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: vi.fn() }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: vi.fn() }));
import { prisma } from "@/lib/db";
import { dispatchPersonalOutbound, sendAutomaticPersonalReply } from "@/server/personal-assistant/outbox";
import { drainPersonalSms } from "@/server/personal-assistant/sms-worker";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`,
    TWILIO_API_KEY_SECRET: "synthetic-secret", TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006",
    ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status",
    ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true",
    ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z", ENDVERA_TWILIO_RATE_REVIEWED_AT: new Date(Date.now() - 1000).toISOString(),
    ENDVERA_TWILIO_RATE_REVIEW_REF: "synthetic-review", ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10" };
  const request = { to: "+15005550001", from: env.TWILIO_PHONE_NUMBER, text: "Réponse synthétique", sourceOperationId: "synthetic-source" };
  const row = { id: "synthetic-outbound-operation", status: "approved", workspaceId: "synthetic-workspace", createdByUserId: "synthetic-owner",
    connectorAccountId: "synthetic-sms-account", kind: "sms_outbound", idempotencyKey: "reply:synthetic-source", attempts: 0,
    leaseUntil: null as Date | null, budgetId: null as string | null, reservedCadMicros: 0n,
    request, requestHash: hash(JSON.stringify(request)),
    result: { approvedBy: "synthetic-owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: new Date(Date.now() + 600000).toISOString() } };
  const source = { id: "synthetic-source", requestHash: "synthetic-source-hash", request: { from: request.to, to: request.from },
    result: { source: "ENDVERA_LOCAL", reply: request.text } };
  const revoked = { member: false, identity: false, grant: false, account: false };
  let afterCommit: () => void = () => undefined;
  shared.find.mockImplementation(async () => structuredClone(row));
  shared.first.mockResolvedValue(source);
  shared.member.mockImplementation(async () => revoked.member ? null : { id: "member", role: "owner", updatedAt: new Date("2026-09-10T00:00:00Z") });
  shared.identity.mockImplementation(async () => revoked.identity ? null : { id: "identity", permissions: ["COMMAND"], updatedAt: new Date("2026-09-10T00:00:00Z") });
  shared.account.mockImplementation(async () => ({ id: row.connectorAccountId, workspaceId: row.workspaceId, provider: "endvera_sms", stateVersion: 1, status: revoked.account ? "disconnected" : "connected",
    revokedAt: null, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) }));
  shared.grant.mockImplementation(async () => revoked.grant ? null : { id: "grant", stateVersion: 1, grantedScopes: [], updatedAt: new Date("2026-09-10T00:00:00Z") });
  shared.transaction.mockImplementation(async work => { const result = await work(prisma); afterCommit(); return result; });
  shared.update.mockImplementation(async ({ where, data }) => {
    if (where.id !== row.id || where.status && where.status !== row.status) return { count: 0 };
    if (data.status) row.status = data.status;
    return { count: 1 };
  });
  shared.updateOne.mockImplementation(async ({ data }) => { if (data.status) row.status = data.status; return row; });
  const budget = { id: hash(JSON.stringify([env.TWILIO_ACCOUNT_SID, env.ENDVERA_EXTERNAL_AUTHORITY_REF])), ceilingCadMicros: 10000000n, reservedCadMicros: 0n,
    expiresAt: new Date(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT) };
  shared.budget.mockResolvedValue(budget); shared.budgetRead.mockImplementation(async () => ({ ...budget, reservedCadMicros: row.reservedCadMicros }));
  // Models the joined authority snapshot, not PostgreSQL concurrency. Actual
  // concurrent row-lock behavior is exercised separately in disposable PG.
  shared.query.mockImplementation(async (sql: string, ...parameters: unknown[]) => {
    if (!sql.includes('JOIN "ConstructionWorkspace"')) return [{ id: source.id }];
    await shared.budgetRead();
    if (Object.values(revoked).some(Boolean) || row.status !== "processing" || row.attempts !== 1
      || row.leaseUntil?.getTime() !== (parameters[9] as Date).getTime()
      || JSON.stringify(row.request) !== parameters[7] || JSON.stringify(row.result) !== parameters[8]) return [];
    return [{ id: row.id }];
  });
  shared.execute.mockImplementation(async (sql: string, ...parameters: unknown[]) => {
    if (sql.includes("SET status='processing'")) {
      if (row.status !== "approved" || row.attempts !== 0 || JSON.stringify(row.result) !== parameters[8]) return 0;
      row.status = "processing"; row.attempts = 1; row.budgetId = parameters[4] as string;
      row.reservedCadMicros = parameters[5] as bigint; row.leaseUntil = parameters[6] as Date; row.result = JSON.parse(parameters[7] as string); return 1; }
    if (row.status !== "processing" || row.leaseUntil?.getTime() !== (parameters[4] as Date).getTime()) return 0;
    if (JSON.stringify(row.result) !== parameters[sql.includes("SET status='completed'") ? 9 : 10]) return 0;
    row.status = sql.includes("SET status='completed'") ? "completed" : "uncertain"; return 1;
  });
  shared.reserve.mockResolvedValue({});
  const response = () => Response.json({ sid: `SM${"c".repeat(32)}`, status: "queued", account_sid: env.TWILIO_ACCOUNT_SID,
    to: request.to, from: request.from });
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => { void _url; void _init; return response(); });
  return { env, row, source, revoked, transport, response, setAfterCommit: (fn: () => void) => { afterCommit = fn; } };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("independent outbound point-of-use safety audit", () => {
  it("control: dispatches one synthetic accepted response with no delivery claim", async () => {
    const f = fixture();
    expect(await dispatchPersonalOutbound(f.row.id, f.env, f.transport)).toMatchObject({ delivered: false });
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it.each(["member", "identity", "grant", "account"] as const)("does not issue HTTP after %s authority is revoked after the claim", async kind => {
    const f = fixture(); f.setAfterCommit(() => { f.revoked[kind] = true; });
    await dispatchPersonalOutbound(f.row.id, f.env, f.transport).catch(() => undefined);
    expect(f.transport.mock.calls.length).toBe(0);
  });
  it("rechecks the global switch after the async reply disclosure lookup", async () => {
    const f = fixture(); let lookups = 0;
    shared.first.mockImplementation(async () => { if (++lookups === 2) f.env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED = "DISABLED"; return f.source; });
    await dispatchPersonalOutbound(f.row.id, f.env, f.transport).catch(() => undefined);
    expect(f.transport.mock.calls.length).toBe(0);
  });
  it("rechecks the automatic-reply switch after claim without disabling explicitly approved manual dispatch", async () => {
    const f = fixture(); f.setAfterCommit(() => { f.env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED = "false"; });
    await sendAutomaticPersonalReply(f.row.id, f.env, f.transport).catch(() => undefined);
    expect(f.transport.mock.calls.length).toBe(0);
    const manual = fixture(); manual.env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED = "false";
    await dispatchPersonalOutbound(manual.row.id, manual.env, manual.transport);
    expect(manual.transport.mock.calls.length).toBe(1);
  });
  it("does not issue HTTP if grant revocation occurs while the joined authority/budget snapshot is acquired", async () => {
    // This same budgetRead hook reproduced 1 unwanted callback in the former
    // serial guard. The locked joined query now checks both current rows.
    const f = fixture(); const prior = shared.budgetRead.getMockImplementation()!;
    shared.budgetRead.mockImplementation(async (...args) => { const budget = await prior(...args); f.revoked.grant = true; return budget; });
    await dispatchPersonalOutbound(f.row.id, f.env, f.transport).catch(() => undefined);
    expect(f.transport.mock.calls.length).toBe(0);
  });
  it("starts the callback under the short transaction but does not await network before commit", async () => {
    const f = fixture(); let inside = false; let callbackUnderLocks = false; let commits = 0;
    let finish!: (value: Response) => void;
    shared.transaction.mockImplementation(async work => { inside = true; try { const result = await work(prisma); commits++; return result; } finally { inside = false; } });
    f.transport.mockImplementation(async () => { callbackUnderLocks = inside; return new Promise<Response>(resolve => { finish = resolve; }); });
    const pending = dispatchPersonalOutbound(f.row.id, f.env, f.transport);
    await vi.advanceTimersByTimeAsync(1);
    expect(callbackUnderLocks).toBe(true); expect(commits).toBe(2); expect(inside).toBe(false);
    finish(f.response()); await pending;
    const lock = shared.query.mock.calls.find(call => call[0].includes('JOIN "ConstructionWorkspace"'))!;
    expect(lock[0]).toContain("FOR SHARE OF p,w,m,i,a,g,b");
    expect(lock[0]).toContain("p.result=$9::jsonb"); expect(lock[0]).toContain("p.request=$8::jsonb");
    expect(lock[10]).toBeInstanceOf(Date); expect(lock[28]).toBeInstanceOf(Date);
  });
  it("retains uncertainty and does not retry when commit fails after callback invocation", async () => {
    const f = fixture(); let commits = 0;
    shared.transaction.mockImplementation(async work => { const result = await work(prisma); if (++commits === 2) throw new Error("synthetic serialization failure"); return result; });
    f.transport.mockRejectedValue(new Error("synthetic network rejection"));
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport.mock.calls.length).toBe(1); expect(f.row.status).toBe("uncertain"); expect(f.row.reservedCadMicros).toBe(100000n);
  });
  it("gives simultaneous same-clock claimants different ownership tokens and only one callback", async () => {
    const f = fixture();
    const outcomes = await Promise.allSettled([dispatchPersonalOutbound(f.row.id, f.env, f.transport), dispatchPersonalOutbound(f.row.id, f.env, f.transport)]);
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(f.transport.mock.calls.length).toBe(1); expect(f.row.status).toBe("completed");
    const claims = shared.execute.mock.calls.filter(call => call[0].includes("SET status='processing'"));
    expect(claims).toHaveLength(2); expect(claims[0][7]).toEqual(claims[1][7]);
    expect(JSON.parse(claims[0][8]).outboundClaimToken).not.toBe(JSON.parse(claims[1][8]).outboundClaimToken);
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.transport.mock.calls.length).toBe(1);
  });
  it("does not overwrite an uncertain/recovered row with a late successful response", async () => {
    const f = fixture(); f.transport.mockImplementation(async () => { f.row.status = "uncertain"; return f.response(); });
    await dispatchPersonalOutbound(f.row.id, f.env, f.transport).catch(() => undefined);
    expect(f.row.status).toBe("uncertain");
  });
  it("propagates the caller drain deadline into a queued automatic reply HTTP operation", async () => {
    const f = fixture(); let signal: AbortSignal | undefined;
    shared.list.mockImplementation(async ({ where }) => where.kind === "personal_sms_inbound" ? [] : [{ id: f.row.id }]);
    f.transport.mockImplementation(async (_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(f.response()), 200);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("synthetic canceled")); }, { once: true });
      });
    });
    vi.stubGlobal("fetch", f.transport);
    const pending = drainPersonalSms(f.env, 1, { deadlineAt: Date.now() + 50 });
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ deadlineReached: true });
    expect(f.transport).toHaveBeenCalledTimes(1);
    const abortedAtDeadline = signal?.aborted;
    await vi.advanceTimersByTimeAsync(500);
    expect.soft(abortedAtDeadline).toBe(true);
    expect(f.row.status).not.toBe("completed");
  });
});
