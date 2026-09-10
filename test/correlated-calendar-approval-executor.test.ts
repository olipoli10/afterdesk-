import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), gate: vi.fn(), tokens: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ lockCorrelatedCalendarApprovalWriteInTransaction: m.gate }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: m.tokens }));
import { executeClaimedPersonalCalendarWrite as execute, type PersonalCalendarWriteClaim } from "@/server/personal-assistant/calendar-actions";
import { correlatedCalendarApprovalClaimSchema, fingerprintCorrelatedCalendarApprovalView, inspectCorrelatedCalendarApprovalState } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { GOOGLE_CALENDAR_WRITE_SCOPE as WRITE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import type { GoogleCalendarClient } from "@/server/personal-assistant/google-client";

const now = "2026-09-11T04:02:00.000Z";
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  const request = { title: "Inspection 🛠️", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T19:00:00.000Z", timezone: "America/Toronto", accountVersion: 1, requestId: personalCorrelatedCalendarRequestId("receipt") };
  const expectedRequestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const descriptor = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: { userId: "owner", workspaceId: "workspace" },
    review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: expectedRequestHash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const claim = correlatedCalendarApprovalClaimSchema.parse({ version: "personal-correlated-calendar-write-claim-v1",
    origin: { kind: "personal_sms_temporal_receipt", approvalId: "10000000-0000-4000-8000-000000000001", reviewId: "review", reviewFingerprint: descriptor.fingerprint },
    userId: "owner", workspaceId: "workspace", operationId: "operation", expectedRequestHash, request,
    authority: { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
      memberUpdatedAt: "2026-09-10T02:00:00.000Z", workspaceUpdatedAt: "2026-09-10T02:00:00.000Z", accountScopes: [WRITE], grantScopes: [WRITE] },
    approvalToken: "20000000-0000-4000-8000-000000000002", approvedAt: now, approvalExpiresAt: "2026-09-11T04:08:00.000Z", leaseUntil: "2026-09-11T04:02:25.000Z" });
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  const receipt = { confirmed: true as const, providerEventId: deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: request.requestId, idempotencyKey: request.requestId }) };
  const order: string[] = [], state = { phase: "CLAIMED", status: "processing", gates: 0, commits: 0, inTx: false, rollback: false,
    updateCount: 1, readVersion: 1, transport: true, terminalError: false, markerError: false,
    hook: async (_stage: string) => { void _stage; }, response: Promise.resolve(receipt), records: [] as unknown[] };
  const update = vi.fn(async (args: { where: { result: { equals: { phase: string } } }; data: { result: { phase: string }; status?: string } }) => {
    const next = args.data.result.phase; order.push(`cas:${next}`); await state.hook(`cas:${next}`);
    if (state.phase !== args.where.result.equals.phase || state.status !== "processing") return { count: 0 };
    if (state.updateCount !== 1) return { count: state.updateCount };
    inspectCorrelatedCalendarApprovalState(args.data.result, claim, descriptor.view);
    state.phase = next; state.status = args.data.status ?? state.status; state.records.push(structuredClone(args)); return { count: 1 };
  });
  const tx = { personalAssistantOperation: { updateMany: update }, $queryRawUnsafe: vi.fn(() => { throw new Error("unexpected legacy lookup"); }) };
  m.transaction.mockImplementation(async (work: (db: typeof tx) => Promise<unknown>, options: { maxWait: number; timeout: number }) => {
    expect(options.maxWait + options.timeout).toBeLessThanOrEqual(25000);
    const before = { phase: state.phase, status: state.status, records: state.records.length };
    state.inTx = true; order.push("tx:start");
    try { const result = await work(tx); await state.hook("beforeCommit");
      if ((state.markerError && state.phase === "DISPATCH_CLAIMED") || (state.terminalError && state.phase === "CONFIRMED")) throw new Error("simulated commit acknowledgement unknown");
      state.commits++; order.push("tx:commit"); return result;
    } catch (error) { state.rollback = true; state.phase = before.phase; state.status = before.status; state.records.length = before.records; throw error; }
    finally { state.inTx = false; }
  });
  m.gate.mockImplementation(async (_tx, raw, _env, context, phase) => {
    expect(raw).toEqual(claim); expect(context.deadlineAt).toBeLessThanOrEqual(Date.parse(now) + 25000);
    order.push(`gate:${phase}`); state.gates++; await state.hook(`gate:${state.gates}`);
    if (state.phase !== phase || state.status !== "processing") throw new Error("CORRELATED_CALENDAR_APPROVAL_GATE_REFUSED");
    return { status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, claim, view: descriptor.view,
      inspectedAt: new Date(Date.now()).toISOString(), authority: claim.authority, readPrerequisite: { readGrantId: "read", readGrantVersion: state.readVersion, readGrantScopes: [WRITE] } };
  });
  const loaded = { accountId: "calendar", accountVersion: 1, tokens: { accessToken: "synthetic", refreshToken: "synthetic", expiresAt: Date.parse(now) + 100000, scopes: [WRITE] },
    readAuthority: { schemaVersion: 1, userId: "owner", workspaceId: "workspace", accountId: "calendar", accountVersion: 1, credentialId: "credential", readGrantId: "read", readGrantVersion: 1 } };
  m.tokens.mockImplementation(async () => { expect(state.inTx).toBe(false); order.push("tokens"); await state.hook("tokens"); return loaded; });
  const client = { transportAttempts: 0, insertEvent: vi.fn(() => { expect(state.inTx).toBe(true); order.push("insertEvent");
    if (state.transport) client.transportAttempts++; return state.response; }) };
  const run = (context: { deadlineAt?: number; monotoneDeadlineAt?: number; signal?: AbortSignal } = {}, supplied: unknown = claim) => execute(supplied as PersonalCalendarWriteClaim, env, client as unknown as GoogleCalendarClient, context);
  return { claim, descriptor, state, env, order, update, tx, client, run, receipt, loaded };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("C2c same executor, typed approval — mocked SQL and transport only", () => {
  it("commits marker, invokes the one existing client, then persists exact typed terminal origin", async () => {
    const h = fixture(); expect(await h.run()).toEqual(h.receipt);
    expect(h.order).toEqual(["tx:start", "gate:CLAIMED", "cas:DISPATCH_CLAIMED", "tx:commit", "tokens", "tx:start", "gate:DISPATCH_CLAIMED", "insertEvent", "tx:commit", "tx:start", "gate:DISPATCH_CLAIMED", "cas:CONFIRMED", "tx:commit"]);
    expect(h.state.phase).toBe("CONFIRMED"); expect(h.client.insertEvent).toHaveBeenCalledTimes(1); expect(h.tx.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(h.state.records[1]).toMatchObject({ data: { status: "completed", externalTransportPerformed: true, leaseUntil: null, result: { origin: h.claim.origin, phase: "CONFIRMED", receipt: h.receipt, automaticRetry: false } } });
  });
  it.each(["ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED", "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED"])("OFF %s performs no lookup/token/transport", async key => {
    const h = fixture(); h.env[key] = "false"; await expect(h.run()).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); expect(m.tokens).not.toHaveBeenCalled(); expect(h.client.insertEvent).not.toHaveBeenCalled();
  });
  it.each(["version", "origin"])("malformed %s cannot fall back to legacy", async key => { const h = fixture(); const raw = { ...h.claim, [key]: undefined };
    await expect(h.run({}, raw)).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); });
  it("pre-abort performs no work", async () => { const h = fixture(), c = new AbortController(); c.abort(); await expect(h.run({ signal: c.signal })).rejects.toThrow(); expect(m.transaction).not.toHaveBeenCalled(); });
  it.each([0, 2, -1, NaN])("marker CAS count %s never owns cleanup or dispatch", async count => { const h = fixture(); h.state.updateCount = count;
    await expect(h.run()).rejects.toThrow(); expect(h.update).toHaveBeenCalledTimes(1); expect(m.tokens).not.toHaveBeenCalled(); expect(h.client.insertEvent).not.toHaveBeenCalled(); });
  it("unknown marker commit never decrypts tokens or closes another owner", async () => { const h = fixture(); h.state.markerError = true;
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(m.tokens).not.toHaveBeenCalled(); expect(h.update).toHaveBeenCalledTimes(1); });
  it.each(["readGrantId", "readGrantVersion", "credentialId", "userId", "workspaceId", "accountId", "accountVersion"])("loaded READ pin %s mismatch prevents event dispatch", async key => {
    const h = fixture(); Object.assign(h.loaded.readAuthority, { [key]: key.includes("Version") ? 2 : "foreign" });
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.client.insertEvent).not.toHaveBeenCalled(); expect(h.state.phase).toBe("UNCERTAIN");
  });
  it.each(["gate:2", "gate:3"])("late revocation at %s blocks effect/confirmation", async stage => { const h = fixture(); h.state.hook = async key => { if (key === stage) h.env.ENDVERA_EXTERNAL_AUTHORITY_REF = "other"; };
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.phase).toBe("UNCERTAIN"); expect(h.client.insertEvent).toHaveBeenCalledTimes(stage === "gate:2" ? 0 : 1); });
  it("rejects provider failure without losing origin", async () => { const h = fixture(); h.state.response = Promise.resolve().then(() => { throw new Error("synthetic provider failure"); });
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.phase).toBe("UNCERTAIN"); expect(h.state.records.at(-1)).toMatchObject({ data: { result: { origin: h.claim.origin, reason: "WRITE_OUTCOME_UNKNOWN" } } }); });
  it("wrong event id cannot be confirmed", async () => { const h = fixture(); h.state.response = Promise.resolve({ confirmed: true, providerEventId: "e" + "f".repeat(31) });
    await expect(h.run()).rejects.toThrow(); expect(h.state.phase).toBe("UNCERTAIN"); });
  it("no observed write transport cannot persist CONFIRMED", async () => { const h = fixture(); h.state.transport = false; await expect(h.run()).rejects.toThrow(); expect(h.state.phase).toBe("UNCERTAIN"); });
  it("does not hold the dispatch transaction while awaiting a network response", async () => { const h = fixture(), pending = deferred<typeof h.receipt>(); h.state.response = pending.promise;
    const running = h.run(); await vi.waitFor(() => expect(h.client.insertEvent).toHaveBeenCalledOnce()); expect(h.state.inTx).toBe(false); pending.resolve(h.receipt); await expect(running).resolves.toEqual(h.receipt); });
  it("duplicate claim cannot close winner while its response is pending", async () => { const h = fixture(), pending = deferred<typeof h.receipt>(); h.state.response = pending.promise;
    const winner = h.run(); await vi.waitFor(() => expect(h.client.insertEvent).toHaveBeenCalledOnce()); await expect(h.run()).rejects.toThrow();
    expect(h.state.phase).toBe("DISPATCH_CLAIMED"); pending.resolve(h.receipt); await expect(winner).resolves.toEqual(h.receipt); expect(h.client.insertEvent).toHaveBeenCalledOnce(); });
  it("unknown terminal commit never retries the write", async () => { const h = fixture(); h.state.terminalError = true; await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.client.insertEvent).toHaveBeenCalledOnce(); });
  it("synchronous injected transport throw still preserves an observed write attempt", async () => { const h = fixture(); h.client.insertEvent.mockImplementation(() => { h.client.transportAttempts++; throw new Error("synthetic after dispatch"); });
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.records.at(-1)).toMatchObject({ data: { externalTransportPerformed: true, result: { phase: "UNCERTAIN" } } }); });
  it("known terminal commit response after wallclock expiry remains factual", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "beforeCommit" && h.state.phase === "CONFIRMED") vi.setSystemTime(Date.parse(now) + 30000); };
    await expect(h.run()).resolves.toEqual(h.receipt); expect(h.state.phase).toBe("CONFIRMED"); expect(h.update).toHaveBeenCalledTimes(2); });
  it("READ grant revision after HTTP cannot confirm using the older token disclosure receipt", async () => { const h = fixture(); h.state.hook = async stage => { if (stage === "gate:3") h.state.readVersion = 2; };
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.phase).toBe("UNCERTAIN"); expect(h.client.insertEvent).toHaveBeenCalledOnce(); });
  it("abort while HTTP is pending closes once and a late success cannot resurrect", async () => { const h = fixture(), c = new AbortController(), pending = deferred<typeof h.receipt>(); h.state.response = pending.promise;
    const running = h.run({ signal: c.signal }); const observed = running.catch(error => error); await vi.waitFor(() => expect(h.client.insertEvent).toHaveBeenCalledOnce()); c.abort();
    expect(await observed).toBeInstanceOf(Error); expect(h.state.phase).toBe("UNCERTAIN"); pending.resolve(h.receipt); await Promise.resolve(); await Promise.resolve(); expect(h.state.phase).toBe("UNCERTAIN"); expect(h.client.insertEvent).toHaveBeenCalledOnce(); });
  it("original monotone budget stops after wallclock rollback", async () => { const h = fixture(); let mono = 100; vi.spyOn(performance, "now").mockImplementation(() => mono);
    h.state.hook = async stage => { if (stage === "tokens") { mono = 151; vi.setSystemTime(Date.parse(now) - 3600000); } };
    await expect(h.run({ monotoneDeadlineAt: 150 })).rejects.toThrow(); expect(h.client.insertEvent).not.toHaveBeenCalled(); });
  it("caller mutation during token await cannot substitute the request", async () => { const h = fixture(); const raw = structuredClone(h.claim);
    h.state.hook = async stage => { if (stage === "tokens") { raw.request.title = "substituted"; raw.approvalToken = "30000000-0000-4000-8000-000000000003"; } };
    await expect(h.run({}, raw)).resolves.toEqual(h.receipt); expect(h.client.insertEvent.mock.calls[0]).toBeDefined(); });
});
