import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ transaction: vi.fn(), gate: vi.fn(), tokens: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-gate", () => ({ lockCorrelatedCalendarApprovalWriteInTransaction: m.gate }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: m.tokens }));
import { executeClaimedPersonalCalendarWrite } from "@/server/personal-assistant/calendar-actions";
import { correlatedCalendarApprovalClaimSchema, inspectCorrelatedCalendarApprovalState } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { correlatedCalendarOfferFixture } from "./fixtures/correlated-calendar-offer.fixture";
import { canonicalJson } from "@/server/model-gateway/evidence";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture(dbOffset = 0) {
  const f = correlatedCalendarOfferFixture(), epoch = Date.parse(f.now), dbNow = epoch + dbOffset;
  const authority = { accountId: "calendar", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
    memberUpdatedAt: "2026-09-10T02:00:00.000Z", workspaceUpdatedAt: "2026-09-10T02:00:00.000Z", accountScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] };
  const claim = correlatedCalendarApprovalClaimSchema.parse({ version: "personal-correlated-calendar-write-claim-v1",
    origin: { kind: "personal_sms_temporal_receipt", approvalId: "10000000-0000-4000-8000-000000000001", reviewId: "review", reviewFingerprint: f.gate.fingerprint },
    userId: "owner", workspaceId: "workspace", operationId: "operation", expectedRequestHash: f.dto.approvalOffer.expectedRequestHash, request: f.gate.request, authority,
    approvalToken: "20000000-0000-4000-8000-000000000002", approvedAt: new Date(dbNow).toISOString(), approvalExpiresAt: new Date(dbNow + 360000).toISOString(), leaseUntil: new Date(dbNow + 25000).toISOString() });
  const origin = claim.origin;
  const initial = { version: "personal-correlated-calendar-write-state-v1", origin, phase: "CLAIMED", approvedBy: "owner", approvedHash: claim.expectedRequestHash,
    approvalToken: claim.approvalToken, writeAuthority: authority, dispatchStarted: false };
  const state = { result: initial as unknown, status: "processing", external: false, lease: claim.leaseUntil, inside: false, txCount: 0, gates: 0, mono: 100,
    hook: async (_stage: string) => { void _stage; } };
  vi.spyOn(performance, "now").mockImplementation(() => state.mono);
  type Change = { where: { result: { equals: unknown }; leaseUntil: Date }; data: { result: unknown; status?: string; externalTransportPerformed?: boolean; leaseUntil?: null } };
  const update = vi.fn(async (change: Change) => {
    await state.hook("cas");
    if (state.status !== "processing" || canonicalJson(change.where.result.equals) !== canonicalJson(state.result) || change.where.leaseUntil.toISOString() !== state.lease) return { count: 0 };
    inspectCorrelatedCalendarApprovalState(change.data.result, claim, f.gate.view);
    state.result = structuredClone(change.data.result); state.status = change.data.status ?? state.status;
    if (change.data.externalTransportPerformed !== undefined) state.external = change.data.externalTransportPerformed;
    if (change.data.leaseUntil === null) state.lease = "";
    return { count: 1 };
  });
  // Deliberately no rollback emulation: a commit acknowledgement error can follow
  // an actual stored terminal state. This is an oracle model, not SQL proof.
  const tx = { personalAssistantOperation: { updateMany: update } };
  m.transaction.mockImplementation(async (work: (db: typeof tx) => Promise<unknown>) => {
    state.txCount++; state.inside = true;
    try { const result = await work(tx); await state.hook("commit"); return result; }
    finally { state.inside = false; }
  });
  m.gate.mockImplementation(async (_db, _claim, _env, _context, phase) => {
    state.gates++; await state.hook(`gate:${state.gates}`);
    expect(state.inside).toBe(true);
    if (state.status !== "processing" || (state.result as { phase: string }).phase !== phase) throw new Error("SYNTHETIC_GATE_PHASE_REFUSED");
    return { status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, view: f.gate.view,
      inspectedAt: new Date(dbNow + state.mono - 100).toISOString(), readPrerequisite: { readGrantId: "read", readGrantVersion: 1 } };
  });
  const loaded = { accountId: "calendar", accountVersion: 1, tokens: { accessToken: "synthetic", refreshToken: "synthetic", expiresAt: epoch + 360000, subject: "synthetic", scopes: [GOOGLE_CALENDAR_WRITE_SCOPE] },
    readAuthority: { schemaVersion: 1, userId: "owner", workspaceId: "workspace", accountId: "calendar", accountVersion: 1, credentialId: "credential", readGrantId: "read", readGrantVersion: 1 } };
  m.tokens.mockImplementation(async () => { expect(state.inside).toBe(false); await state.hook("tokens"); return loaded; });
  let responseOverride: ((body: Record<string, unknown>) => Promise<Response>) | undefined;
  const transport = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(state.inside).toBe(true); expect(init?.method).toBe("POST");
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    return responseOverride ? responseOverride(body) : Response.json({ ...body, status: "confirmed" });
  });
  const client = new GoogleCalendarClient(f.env, transport, () => epoch);
  const run = (context: { deadlineAt?: number; monotoneDeadlineAt?: number; signal?: AbortSignal } = {}) => executeClaimedPersonalCalendarWrite(claim, f.env, client, context);
  return { state, run, claim, f, update, transport, client, loaded, response: (callback: NonNullable<typeof responseOverride>) => { responseOverride = callback; } };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T04:02:00.000Z")); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("C2c peer actual Google client with injected HTTP, mocked canonical locks and DB", () => {
  it.each([0, 3600000, -3600000])("preserves exact request/typed receipt with DB offset %s", async offset => {
    const h = fixture(offset), result = await h.run();
    expect(result.confirmed).toBe(true); expect(h.state.status).toBe("completed"); expect(h.state.external).toBe(true);
    expect(h.transport).toHaveBeenCalledOnce(); expect(h.client.transportAttempts).toBe(1); expect(h.state.gates).toBe(3);
    expect(JSON.parse(h.transport.mock.calls[0][1]!.body as string)).toMatchObject({ summary: h.claim.request.title, start: { dateTime: h.claim.request.startsAt }, end: { dateTime: h.claim.request.endsAt } });
    expect(h.state.result).toMatchObject({ phase: "CONFIRMED", origin: h.claim.origin, receipt: result, automaticRetry: false });
  });
  it("rejects confirmed-looking HTTP with wrong content using the real client parser", async () => {
    const h = fixture(); h.response(async body => Response.json({ ...body, summary: "different job", status: "confirmed" }));
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.status).toBe("uncertain"); expect(h.state.external).toBe(true); expect(h.transport).toHaveBeenCalledOnce();
  });
  it("does not overwrite a completed record after its acknowledgement is lost", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "commit" && h.state.status === "completed") throw new Error("SYNTHETIC_ACK_LOST_AFTER_PERSIST"); };
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(h.state.status).toBe("completed");
    expect(h.state.result).toMatchObject({ phase: "CONFIRMED", origin: h.claim.origin }); expect(h.transport).toHaveBeenCalledOnce();
    expect(h.update.mock.calls.at(-1)![0].data.status).toBe("uncertain"); // Exact CAS rejected; stored completed survived.
  });
  it("late HTTP success cannot replace a recovery terminal while the response is pending", async () => {
    const h = fixture(), response = deferred<Response>(); let sentBody: Record<string, unknown> | undefined;
    h.response(async body => { sentBody = body; return response.promise; });
    const running = h.run(); const observed = running.catch(error => error);
    await vi.waitFor(() => expect(h.transport).toHaveBeenCalledOnce()); expect(h.state.inside).toBe(false);
    const recovery = { version: "personal-correlated-calendar-write-state-v1", origin: h.claim.origin, phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason: "CLAIM_LEASE_EXPIRED" };
    h.state.status = "uncertain"; h.state.result = recovery; h.state.lease = "";
    response.resolve(Response.json({ ...sentBody, status: "confirmed" }));
    expect(await observed).toBeInstanceOf(Error); expect(h.state.result).toEqual(recovery); expect(h.transport).toHaveBeenCalledOnce();
  });
  it("captures loaded READ pins before the next gate await", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "gate:2") h.loaded.readAuthority.readGrantId = "mutated-after-copy"; };
    await expect(h.run()).resolves.toHaveProperty("confirmed", true); expect(h.transport).toHaveBeenCalledOnce();
  });
  it("keeps a committed dispatch marker untouched when its acknowledgement is lost", async () => {
    const h = fixture(); h.state.hook = async stage => { if (stage === "commit" && h.state.txCount === 1) throw new Error("SYNTHETIC_MARKER_ACK_LOST_AFTER_PERSIST"); };
    await expect(h.run()).rejects.toThrow("OUTCOME_UNKNOWN"); expect(m.tokens).not.toHaveBeenCalled(); expect(h.transport).not.toHaveBeenCalled();
    expect(h.state.result).toMatchObject({ phase: "DISPATCH_CLAIMED" }); expect(h.update).toHaveBeenCalledOnce();
  });
});
