import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ transaction: vi.fn(), find: vi.fn(), first: vi.fn(), update: vi.fn(), execute: vi.fn(), query: vi.fn(),
  member: vi.fn(), identity: vi.fn(), account: vi.fn(), grant: vi.fn(), budget: vi.fn(), reserve: vi.fn(), source: vi.fn(), waiting: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction, $queryRaw: vi.fn(), $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.execute,
  personalAssistantOperation: { findUnique: mock.find, findFirst: mock.first, updateMany: mock.update },
  constructionWorkspaceMember: { findFirst: mock.member }, constructionCommunicationIdentity: { findFirst: mock.identity },
  constructionConnectorAccount: { findUniqueOrThrow: mock.account }, constructionConnectorGrant: { findFirst: mock.grant },
  personalAssistantBudget: { upsert: mock.budget, update: mock.reserve } } }));
vi.mock("@/server/personal-assistant/calendar-confirmation-authority", () => ({
  requireCalendarConfirmationOutboundSourceInTransaction: mock.source, markCalendarSmsConfirmationWaitingInTransaction: mock.waiting }));
vi.mock("@/server/personal-assistant/twilio-outbound", async original => ({ ...await original<typeof import("@/server/personal-assistant/twilio-outbound")>(),
  twilioDispatchPolicy: () => ({ budgetId: "synthetic-budget", ceiling: 1000000n, reservation: 100000n, expiresAt: new Date("2099-01-01T00:00:00Z") }),
  sendPersonalTwilio: async (_kind: unknown, _request: unknown, _env: unknown, transport: typeof fetch) => {
    await transport("https://synthetic.invalid/never-real", {});
    return { providerSid: `SM${"c".repeat(32)}`, delivered: false };
  } }));
import { prisma } from "@/lib/db";
import { approvePersonalOutbound, dispatchPersonalOutbound, preparePersonalOutbound, sendAutomaticCalendarConfirmationSummary, sendAutomaticPersonalReply } from "@/server/personal-assistant/outbox";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Transaction rollback/claim oracle only. Native locks and real provider acceptance
 * are explicitly NOT proved by these synthetic dependency tests. */
function fixture(status = "approved") {
  const env = { ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED: "true",
    ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED: "true", TWILIO_PHONE_NUMBER: "+15005550006", TWILIO_ACCOUNT_SID: "synthetic-account" };
  const request = { to: "+15005550001", from: env.TWILIO_PHONE_NUMBER, text: "Résumé exact synthétique. CONFIRME ENDVERA AGENDA bleu lac lune pin", sourceOperationId: "source" };
  const row = { id: "bridge", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "sms-account", kind: "sms_outbound", status,
    attempts: 0, leaseUntil: null as Date | null, budgetId: null as string | null, reservedCadMicros: 0n,
    request, requestHash: hash(JSON.stringify(request)), idempotencyKey: "calendar-confirmation:challenge",
    result: { approvedBy: "owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: "2099-01-01T00:00:00Z" } as Record<string, unknown> };
  const state = { phase: "PREPARED", inside: false, committed: 0, reserved: 0n };
  const proof = Object.freeze({ kind: "CALENDAR_CONFIRMATION" as const, challengeId: "challenge", fingerprint: "exact-current-authority", expiresAt: "2099-01-01T00:00:00Z" });
  mock.find.mockImplementation(async () => structuredClone(row)); mock.first.mockImplementation(async () => structuredClone(row));
  mock.member.mockResolvedValue({ id: "member", role: "owner", updatedAt: new Date("2026-09-10T00:00:00Z") });
  mock.identity.mockResolvedValue({ id: "identity", permissions: ["COMMAND"], updatedAt: new Date("2026-09-10T00:00:00Z") });
  mock.account.mockResolvedValue({ id: "sms-account", workspaceId: "workspace", provider: "endvera_sms", stateVersion: 1, status: "connected", revokedAt: null, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) });
  mock.grant.mockResolvedValue({ id: "send-grant", stateVersion: 1, grantedScopes: [], updatedAt: new Date("2026-09-10T00:00:00Z") });
  mock.budget.mockResolvedValue({ id: "synthetic-budget", ceilingCadMicros: 1000000n, reservedCadMicros: 0n, expiresAt: new Date("2099-01-01T00:00:00Z") });
  mock.reserve.mockImplementation(async () => { state.reserved += 100000n; return {}; });
  mock.source.mockImplementation(async () => {
    if (env.ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED !== "true" || env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED !== "true") throw new Error("CONFIRMATION_BRIDGE_DISABLED");
    return proof;
  });
  mock.waiting.mockImplementation(async () => {
    expect(state.inside).toBe(true); expect(row.status).toBe("completed");
    expect(row.result).toMatchObject({ acceptedByProvider: true, approvalHash: row.requestHash });
    state.phase = "WAITING"; return { status: "WAITING_FOR_EXACT_CONFIRMATION" };
  });
  mock.transaction.mockImplementation(async work => {
    const before = structuredClone(row), previousPhase = state.phase, previousReservation = state.reserved;
    state.inside = true;
    try { const result = await work(prisma); state.committed++; return result; }
    catch (error) { Object.assign(row, before); state.phase = previousPhase; state.reserved = previousReservation; throw error; }
    finally { state.inside = false; }
  });
  mock.update.mockImplementation(async ({ where, data }) => {
    if (row.status !== where.status || row.requestHash !== where.requestHash) return { count: 0 };
    Object.assign(row, data); return { count: 1 };
  });
  mock.query.mockImplementation(async (_sql, ...parameters) => row.status === "processing" && JSON.stringify(row.result) === parameters[8] ? [{ id: row.id }] : []);
  mock.execute.mockImplementation(async (sql: string, ...p: unknown[]) => {
    if (sql.includes("SET status='processing'")) {
      if (row.status !== "approved" || row.attempts !== 0 || JSON.stringify(row.result) !== p[8]) return 0;
      Object.assign(row, { status: "processing", attempts: 1, budgetId: p[4], reservedCadMicros: p[5], leaseUntil: p[6], result: JSON.parse(p[7] as string) }); return 1;
    }
    const complete = sql.includes("SET status='completed'");
    if (row.status !== "processing" || row.leaseUntil?.getTime() !== (p[4] as Date).getTime() || JSON.stringify(row.result) !== p[complete ? 9 : 10]) return 0;
    Object.assign(row, { status: complete ? "completed" : "uncertain", leaseUntil: null, result: JSON.parse(p[complete ? 8 : 9] as string) }); return 1;
  });
  const transport = vi.fn(async () => Response.json({ synthetic: true }));
  return { env, row, state, proof, transport };
}
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => vi.restoreAllMocks());

describe("separate guarded calendar confirmation outbox branch", () => {
  it("records provider acceptance with the DB clock inside the exact terminal CAS, never an input date", async () => {
    const f = fixture();
    await dispatchPersonalOutbound(f.row.id, f.env, f.transport);
    const completion = mock.execute.mock.calls.find(call => call[0].includes("SET status='completed'"));
    expect(completion).toBeDefined();
    expect(completion![0]).toContain(`jsonb_build_object('acceptedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`);
    const providerReceipt = JSON.parse(completion![9]);
    expect(providerReceipt).toMatchObject({ acceptedByProvider: true, delivered: false, approvalHash: f.row.requestHash });
    expect(providerReceipt).not.toHaveProperty("acceptedAt");
    expect(f.transport).toHaveBeenCalledOnce();
    // The mock does not execute PostgreSQL or manufacture its clock result.
    expect(mock.waiting).toHaveBeenCalledOnce();
  });
  it("checks the current immutable source at claim, pre-HTTP and postresponse, then commits WAITING with completion", async () => {
    const f = fixture();
    expect(await dispatchPersonalOutbound(f.row.id, f.env, f.transport)).toMatchObject({ delivered: false });
    expect(mock.source).toHaveBeenCalledTimes(3); expect(f.transport).toHaveBeenCalledTimes(1);
    expect(mock.source.mock.calls.every(call => call[1].id === f.row.id && call[2].text === f.row.request.text)).toBe(true);
    expect(mock.waiting).toHaveBeenCalledExactlyOnceWith(prisma, { actor: { userId: "owner", workspaceId: "workspace" }, challengeId: "challenge", bridgeOutboundOperationId: "bridge" }, f.env);
    expect(mock.source.mock.invocationCallOrder[1]).toBeLessThan(mock.query.mock.invocationCallOrder[0]);
    expect(mock.source.mock.invocationCallOrder[2]).toBeLessThan(mock.query.mock.invocationCallOrder[1]);
    expect(f.state.phase).toBe("WAITING"); expect(f.row.status).toBe("completed"); expect(f.state.reserved).toBe(100000n);
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("checks the confirmation authority on ordinary manual approval too", async () => {
    const f = fixture("pending"); mock.source.mockRejectedValue(new Error("CONFIRMATION_BINDING_CHANGED"));
    await expect(approvePersonalOutbound({ userId: "owner", workspaceId: "workspace", operationId: f.row.id, expectedRequestHash: f.row.requestHash }, f.env)).rejects.toThrow("CONFIRMATION_BINDING_CHANGED");
    expect(mock.update).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled();
  });
  it.each(["ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED", "ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED"] as const)("refuses a disabled %s before budget or transport", async flag => {
    const f = fixture(); f.env[flag] = "false";
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("CONFIRMATION_BRIDGE_DISABLED");
    expect(mock.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it.each(["voice", "missing-source"])("rejects invalid confirmation request %s without generic fallback", async kind => {
    const f = fixture(); if (kind === "voice") f.row.kind = "voice_outbound"; else delete (f.row.request as Partial<typeof f.row.request>).sourceOperationId;
    f.row.requestHash = hash(JSON.stringify(f.row.request)); f.row.result.approvedHash = f.row.requestHash;
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("CONFIRMATION_OUTBOX_BRIDGE_CHANGED");
    expect(mock.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it.each([2, 3])("refuses changed source fingerprint at boundary %s and retains the full hold", async boundary => {
    const f = fixture(); let calls = 0;
    mock.source.mockImplementation(async () => ++calls === boundary ? { ...f.proof, fingerprint: "changed" } : f.proof);
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).toHaveBeenCalledTimes(boundary === 2 ? 0 : 1); expect(mock.waiting).not.toHaveBeenCalled();
    expect(f.row.status).toBe("uncertain"); expect(f.state.reserved).toBe(100000n);
  });
  it("rolls completion back when WAITING persistence fails, preserving uncertainty and no retry", async () => {
    const f = fixture(); mock.waiting.mockRejectedValue(new Error("synthetic waiting CAS failure"));
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.row.status).toBe("uncertain"); expect(f.state.phase).toBe("PREPARED"); expect(f.state.reserved).toBe(100000n);
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("APPROVAL_REQUIRED");
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("checks the bridge stop switch again after the asynchronous source inspection", async () => {
    const f = fixture(); let calls = 0;
    mock.source.mockImplementation(async () => { if (++calls === 2) f.env.ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED = "false"; return f.proof; });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).not.toHaveBeenCalled(); expect(mock.waiting).not.toHaveBeenCalled();
    expect(f.row.status).toBe("uncertain"); expect(f.state.reserved).toBe(100000n);
  });
  it("refuses a disabled WAITING result rather than committing a completed orphan", async () => {
    const f = fixture(); mock.waiting.mockResolvedValue({ status: "DISABLED" });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.row.status).toBe("uncertain"); expect(f.state.phase).toBe("PREPARED");
  });
  it("keeps ordinary automatic replies strict and sends the summary only through its separate entry point", async () => {
    const f = fixture("pending");
    await expect(sendAutomaticPersonalReply(f.row.id, f.env, f.transport)).rejects.toThrow("AUTOMATIC_REPLY_REFUSED");
    expect(mock.source).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
    await sendAutomaticCalendarConfirmationSummary(f.row.id, f.env, f.transport);
    expect(f.transport).toHaveBeenCalledTimes(1); expect(f.state.phase).toBe("WAITING");
  });
  it("does not turn on automatic summaries or create consent", async () => {
    const f = fixture("pending"); f.env.ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED = "false";
    await expect(sendAutomaticCalendarConfirmationSummary(f.row.id, f.env, f.transport)).rejects.toThrow("AUTOMATIC_REPLIES_DISABLED");
    expect(mock.find).not.toHaveBeenCalled(); expect(mock.source).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("refuses automatic summary approval when the existing self-SMS send grant is absent", async () => {
    const f = fixture("pending"); mock.grant.mockResolvedValue(null);
    await expect(sendAutomaticCalendarConfirmationSummary(f.row.id, f.env, f.transport)).rejects.toThrow("AUTOMATIC_REPLY_CONSENT_REQUIRED");
    expect(mock.update).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("does not persist WAITING when a terminal completion CAS loses ownership", async () => {
    const f = fixture(); f.transport.mockImplementation(async () => { f.row.status = "uncertain"; return Response.json({ synthetic: true }); });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(mock.waiting).not.toHaveBeenCalled(); expect(f.row.status).toBe("uncertain"); expect(f.state.phase).toBe("PREPARED");
    expect(f.transport).toHaveBeenCalledTimes(1); expect(f.state.reserved).toBe(100000n);
  });
  it("bounds the claim lease to summary TTL and refuses expiry during the final common lock await", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-10T12:00:00Z"));
    const f = fixture(), expiresAt = "2026-09-10T12:00:01Z";
    mock.source.mockResolvedValue({ ...f.proof, expiresAt });
    const previous = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (...args) => {
      const result = await previous(...args);
      now.mockReturnValue(Date.parse(expiresAt));
      return result;
    });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    const claim = mock.execute.mock.calls.find(call => call[0].includes("SET status='processing'"));
    expect(claim?.[7]).toEqual(new Date(expiresAt));
    expect(f.transport).not.toHaveBeenCalled(); expect(mock.waiting).not.toHaveBeenCalled();
    expect(f.row.status).toBe("uncertain"); expect(f.state.reserved).toBe(100000n);
  });
  it.each(["not-a-date", "2020-01-01T00:00:00Z"])("rejects invalid or expired source TTL %s before reservation", async expiresAt => {
    const f = fixture(); mock.source.mockResolvedValue({ ...f.proof, expiresAt });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("CONFIRMATION_EXPIRED");
    expect(mock.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("refuses changed expiration even if an upstream fingerprint were incorrectly unchanged", async () => {
    const f = fixture(); mock.source.mockResolvedValueOnce(f.proof).mockResolvedValue({ ...f.proof, expiresAt: "2098-01-01T00:00:00Z" });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).not.toHaveBeenCalled(); expect(mock.waiting).not.toHaveBeenCalled();
  });
  it.each(["CONFIRME ENDVERA AGENDA bleu lac lune pin", "Résumé complet\nconfirme endvera agenda bleu lac lune pin", "Réponds exactement : CONFIRME ENDVERA AGENDA bleu lac lune pin",
    "ＣＯＮＦＩＲＭＥ ENDVERA AGENDA bleu lac lune pin", "CON\u200bFIRME ENDVERA AGENDA bleu lac lune pin"])("reserves confirmation text from ordinary preparation and reply dispatch: %s", async text => {
    const f = fixture();
    await expect(preparePersonalOutbound({ userId: "owner", workspaceId: "workspace", kind: "sms_outbound", to: f.row.request.to,
      text, requestId: "00000000-0000-4000-8000-000000000000" }, f.env)).rejects.toThrow("CONFIRMATION_RESERVED_OUTBOUND_TEXT");
    f.row.idempotencyKey = "reply:source"; f.row.request.text = text;
    f.row.requestHash = hash(JSON.stringify(f.row.request)); f.row.result.approvedHash = f.row.requestHash;
    mock.first.mockResolvedValue({ id: "source", requestHash: "source-hash", request: { from: f.row.request.to, to: f.row.request.from }, result: { reply: text } });
    await expect(dispatchPersonalOutbound(f.row.id, f.env, f.transport)).rejects.toThrow("CONFIRMATION_RESERVED_OUTBOUND_TEXT");
    expect(mock.source).not.toHaveBeenCalled(); expect(mock.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
});
