import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const temporal = vi.hoisted(() => ({ inspect: vi.fn(), mark: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-temporal-outbound-authority", () => ({ inspectTemporalOutboundSourceInTransaction: temporal.inspect, requireTemporalOutboundBridgeEnabled: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-temporal-clarification-store", () => ({ markSmsTemporalClarificationAskedInTransaction: temporal.mark }));
const shared = vi.hoisted(() => ({ find: vi.fn(), first: vi.fn(), update: vi.fn(), updateOne: vi.fn(), execute: vi.fn(), query: vi.fn(), transaction: vi.fn(), authority: vi.fn(), send: vi.fn(), reserve: vi.fn(), budget: vi.fn() }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ requireGoogleReadAuthority: shared.authority }));
vi.mock("@/server/personal-assistant/twilio-outbound", async importOriginal => ({ ...await importOriginal<typeof import("@/server/personal-assistant/twilio-outbound")>(),
  sendPersonalTwilio: shared.send,
  twilioDispatchPolicy: () => ({ budgetId: "synthetic-budget", ceiling: 1000000n, reservation: 100000n, expiresAt: new Date("2099-01-01T00:00:00Z") }) }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction, $queryRaw: vi.fn(), $queryRawUnsafe: shared.query, $executeRawUnsafe: shared.execute,
  personalAssistantOperation: { findUnique: shared.find, findFirst: shared.first, updateMany: shared.update, update: shared.updateOne },
  constructionWorkspaceMember: { findFirst: vi.fn(async () => ({ id: "member", role: "owner", updatedAt: new Date("2026-09-10T00:00:00Z") })) }, constructionCommunicationIdentity: { findFirst: vi.fn(async () => ({ id: "identity", permissions: ["COMMAND"], updatedAt: new Date("2026-09-10T00:00:00Z") })) },
  constructionConnectorAccount: { findUniqueOrThrow: vi.fn(async () => ({ id: "sms-account", status: "connected", revokedAt: null, externalAccountKeyHash: "" })) },
  constructionConnectorGrant: { findFirst: vi.fn(async () => ({ id: "sms-grant", stateVersion: 1, grantedScopes: [], updatedAt: new Date("2026-09-10T00:00:00Z") })) },
  personalAssistantBudget: { upsert: shared.budget, findUnique: shared.budget, update: shared.reserve } } }));
import { prisma } from "@/lib/db";
import { approvePersonalOutbound, dispatchPersonalOutbound } from "@/server/personal-assistant/outbox";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const env = { ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", TWILIO_PHONE_NUMBER: "+15005550006", TWILIO_ACCOUNT_SID: "synthetic-account" };
function fixture(status = "approved") {
  const request = { to: "+15005550001", from: env.TWILIO_PHONE_NUMBER, text: "Demain : visite à 10 h.", sourceOperationId: "source" };
  const authority = { schemaVersion: 1, userId: "owner", workspaceId: "workspace", accountId: "google", accountVersion: 1,
    credentialId: "credential", readGrantId: "read-grant", readGrantVersion: 1 };
  const row = { id: "reply", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "sms-account", kind: "sms_outbound", status,
    attempts: 0, leaseUntil: null as Date | null, budgetId: null as string | null, reservedCadMicros: 0n,
    request, requestHash: hash(JSON.stringify(request)), idempotencyKey: "reply:source",
    result: { approvedBy: "owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: "2099-01-01T00:00:00Z" } };
  const source = { id: "source", requestHash: "synthetic-source-hash", request: { from: request.to, to: request.from }, result: { reply: request.text, source: "GOOGLE_CALENDAR", googleReadAuthority: authority } };
  shared.query.mockImplementation(async (sql: string) => sql.includes('FROM "PersonalSmsTemporalClarification"')
    ? [] // This historical Google reply has no temporal attachment; all disclosure gates still execute.
    : [{ id: sql.includes('JOIN "ConstructionWorkspace"') ? row.id : source.id }]);
  shared.find.mockResolvedValue(row); shared.first.mockImplementation(async query => query.where.id === "source" ? source : row);
  shared.transaction.mockImplementation(fn => fn(prisma)); shared.authority.mockResolvedValue(authority);
  vi.mocked(prisma.constructionConnectorAccount.findUniqueOrThrow).mockResolvedValue({ id: "sms-account", workspaceId: "workspace", provider: "endvera_sms", stateVersion: 1, status: "connected", revokedAt: null, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) } as never);
  shared.budget.mockImplementation(async () => ({ id: "synthetic-budget", ceilingCadMicros: 1000000n, reservedCadMicros: row.reservedCadMicros, expiresAt: new Date("2099-01-01T00:00:00Z") }));
  shared.execute.mockImplementation(async (sql: string, ...parameters: unknown[]) => {
    if (sql.includes("SET status='processing'")) { row.status = "processing"; row.attempts = 1; row.budgetId = parameters[4] as string; row.reservedCadMicros = parameters[5] as bigint; row.leaseUntil = parameters[6] as Date; row.result = JSON.parse(parameters[7] as string); return 1; }
    if (row.status !== "processing" || row.leaseUntil?.getTime() !== (parameters[4] as Date).getTime()) return 0;
    if (JSON.stringify(row.result) !== parameters[sql.includes("SET status='completed'") ? 9 : 10]) return 0;
    row.status = sql.includes("SET status='completed'") ? "completed" : "uncertain"; return 1;
  });
  shared.update.mockResolvedValue({ count: 1 }); shared.reserve.mockResolvedValue({}); shared.updateOne.mockResolvedValue({});
  shared.send.mockImplementation(async (_kind, _request, _env, transport) => { await transport("https://synthetic.invalid/never-real", {}); return { delivered: false }; });
  return { row, source, authority, transport: vi.fn(async () => Response.json({ synthetic: true })) };
}
beforeEach(() => { vi.clearAllMocks(); });


const proof = () => ({ clarificationId: "temporal-a", namespace: "pair-a", workspaceId: "workspace", userId: "owner",
  preparedHash: "prepared-a", bindingHash: "binding-a", questionRequestHash: "question-a", sourceOperationId: "source",
  expiresAt: new Date(Date.now() + 60_000).toISOString(), executionAuthorized: false, fingerprint: "proof-a" });
beforeEach(() => { temporal.inspect.mockReset(); temporal.mark.mockReset(); temporal.inspect.mockResolvedValue(proof());
  temporal.mark.mockResolvedValue({ status: "WAITING_FOR_TEMPORAL_REPLY" }); });
afterEach(() => vi.restoreAllMocks());
/** Real outbox gates with fake DB/authority/receipt boundaries. These are not SQL transaction proofs. */
describe("independent temporal outbox hook confinement", () => {
  it("an attachment becoming visible after initial ordinary classification is rechecked before HTTP", async () => {
    const f = fixture();
    temporal.inspect.mockResolvedValueOnce(null).mockRejectedValue(new Error("TEMPORAL_OUTBOUND_BRIDGE_DISABLED"));
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).not.toHaveBeenCalled();
    expect(temporal.inspect).toHaveBeenCalledTimes(2);
  });
  it("a changed proof before HTTP retains the claim and invokes no transport", async () => {
    const f = fixture(); temporal.inspect.mockResolvedValueOnce(proof()).mockResolvedValue({ ...proof(), fingerprint: "changed" });
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).not.toHaveBeenCalled(); expect(temporal.mark).not.toHaveBeenCalled();
    expect(f.row.status).toBe("uncertain");
  });
  it("a changed proof after fake HTTP never attaches WAITING or retries", async () => {
    const f = fixture(), p = proof(); temporal.inspect.mockResolvedValueOnce(p).mockResolvedValueOnce(p).mockResolvedValue({ ...p, fingerprint: "changed" });
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).toHaveBeenCalledTimes(1); expect(temporal.mark).not.toHaveBeenCalled(); expect(f.row.status).toBe("uncertain");
  });
  it("DISABLED mark result rolls the receipt completion back and retains uncertainty", async () => {
    const f = fixture(); let reachedCompleted = false;
    shared.transaction.mockImplementation(async callback => { const snapshot = structuredClone(f.row);
      try { return await callback(prisma); } catch (error) { Object.assign(f.row, snapshot); throw error; } });
    temporal.mark.mockImplementation(async () => { reachedCompleted = f.row.status === "completed"; return { status: "DISABLED" }; });
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(reachedCompleted).toBe(true); expect(f.transport).toHaveBeenCalledTimes(1);
    expect(f.row.status).toBe("uncertain"); expect(shared.reserve).toHaveBeenCalledTimes(1);
  });
  it("initial attached-OFF refusal cannot fall back to ordinary approval", async () => {
    const f = fixture("pending"); temporal.inspect.mockRejectedValue(new Error("TEMPORAL_OUTBOUND_BRIDGE_DISABLED"));
    await expect(approvePersonalOutbound({ userId: "owner", workspaceId: "workspace", operationId: "reply",
      expectedRequestHash: f.row.requestHash }, env)).rejects.toThrow("TEMPORAL_OUTBOUND_BRIDGE_DISABLED");
    expect(shared.update).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("an already expired temporal lease refuses before reservation", async () => {
    const f = fixture(); temporal.inspect.mockResolvedValue({ ...proof(), expiresAt: new Date(Date.now() - 1).toISOString() });
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("TEMPORAL_OUTBOUND_EXPIRED");
    expect(shared.reserve).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("TTL expiration after fake HTTP cannot attach WAITING or retry", async () => {
    const f = fixture(), p = { ...proof(), expiresAt: new Date(Date.now() + 1_000).toISOString() };
    temporal.inspect.mockResolvedValue(p);
    f.transport.mockImplementation(async () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse(p.expiresAt) + 1);
      return Response.json({ synthetic: true });
    });
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(f.transport).toHaveBeenCalledTimes(1); expect(temporal.mark).not.toHaveBeenCalled(); expect(f.row.status).toBe("uncertain");
  });
  it("calls temporal proof gates before common outbound locks in both post-claim transactions", async () => {
    const f = fixture(), order: string[] = [], query = shared.query.getMockImplementation()!;
    temporal.inspect.mockImplementation(async () => { order.push("temporal"); return proof(); });
    shared.query.mockImplementation(async (...args: unknown[]) => {
      if (String(args[0]).includes('JOIN "ConstructionWorkspace"')) order.push("common");
      return query(...args);
    });
    expect(await dispatchPersonalOutbound("reply", env, f.transport)).toEqual({ delivered: false });
    expect(order).toEqual(["temporal", "temporal", "common", "temporal", "common"]);
    expect(temporal.mark).toHaveBeenCalledTimes(1);
  });
});
