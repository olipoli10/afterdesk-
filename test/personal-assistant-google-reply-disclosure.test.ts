import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const shared = vi.hoisted(() => ({ find: vi.fn(), first: vi.fn(), update: vi.fn(), updateOne: vi.fn(), transaction: vi.fn(), authority: vi.fn(), send: vi.fn(), reserve: vi.fn(), budget: vi.fn() }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ requireGoogleReadAuthority: shared.authority }));
vi.mock("@/server/personal-assistant/twilio-outbound", async importOriginal => ({ ...await importOriginal<typeof import("@/server/personal-assistant/twilio-outbound")>(),
  sendPersonalTwilio: shared.send,
  twilioDispatchPolicy: () => ({ budgetId: "synthetic-budget", ceiling: 1000000n, reservation: 100000n, expiresAt: new Date("2099-01-01T00:00:00Z") }) }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction, $queryRaw: vi.fn(),
  personalAssistantOperation: { findUnique: shared.find, findFirst: shared.first, updateMany: shared.update, update: shared.updateOne },
  constructionWorkspaceMember: { findFirst: vi.fn(async () => ({ id: "member" })) }, constructionCommunicationIdentity: { findFirst: vi.fn(async () => ({ id: "identity" })) },
  constructionConnectorAccount: { findUniqueOrThrow: vi.fn(async () => ({ id: "sms-account", status: "connected", revokedAt: null, externalAccountKeyHash: "" })) },
  constructionConnectorGrant: { findFirst: vi.fn(async () => ({ id: "sms-grant" })) },
  personalAssistantBudget: { upsert: shared.budget, update: shared.reserve } } }));
import { prisma } from "@/lib/db";
import { approvePersonalOutbound, dispatchPersonalOutbound, sendAutomaticPersonalReply } from "@/server/personal-assistant/outbox";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const env = { ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", TWILIO_PHONE_NUMBER: "+15005550006", TWILIO_ACCOUNT_SID: "synthetic-account" };
function fixture(status = "approved") {
  const request = { to: "+15005550001", from: env.TWILIO_PHONE_NUMBER, text: "Demain : visite à 10 h.", sourceOperationId: "source" };
  const authority = { schemaVersion: 1, userId: "owner", workspaceId: "workspace", accountId: "google", accountVersion: 1,
    credentialId: "credential", readGrantId: "read-grant", readGrantVersion: 1 };
  const row = { id: "reply", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "sms-account", kind: "sms_outbound", status,
    request, requestHash: hash(JSON.stringify(request)), idempotencyKey: "reply:source",
    result: { approvedBy: "owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: "2099-01-01T00:00:00Z" } };
  const source = { id: "source", request: { from: request.to, to: request.from }, result: { reply: request.text, source: "GOOGLE_CALENDAR", googleReadAuthority: authority } };
  shared.find.mockResolvedValue(row); shared.first.mockImplementation(async query => query.where.id === "source" ? source : row);
  shared.transaction.mockImplementation(fn => fn(prisma)); shared.authority.mockResolvedValue(authority);
  vi.mocked(prisma.constructionConnectorAccount.findUniqueOrThrow).mockResolvedValue({ id: "sms-account", status: "connected", revokedAt: null, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) } as never);
  shared.budget.mockResolvedValue({ id: "synthetic-budget", ceilingCadMicros: 1000000n, reservedCadMicros: 0n, expiresAt: new Date("2099-01-01T00:00:00Z") });
  shared.update.mockResolvedValue({ count: 1 }); shared.reserve.mockResolvedValue({}); shared.updateOne.mockResolvedValue({});
  shared.send.mockImplementation(async (_kind, _request, _env, transport) => { await transport("https://synthetic.invalid/never-real", {}); return { delivered: false }; });
  return { row, source, authority, transport: vi.fn(async () => Response.json({ synthetic: true })) };
}
beforeEach(() => { vi.clearAllMocks(); });

describe("Google-derived queued reply disclosure", () => {
  it("blocks automatic reply before approval when Google permission was removed", async () => {
    const f = fixture("pending"); shared.authority.mockRejectedValue(new Error("GOOGLE_READ_ACCESS_REFUSED"));
    await expect(sendAutomaticPersonalReply("reply", env, f.transport)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(shared.reserve).not.toHaveBeenCalled(); expect(shared.update).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("also checks disclosure consent through the ordinary owner approval endpoint", async () => {
    const f = fixture("pending"); shared.authority.mockRejectedValue(new Error("GOOGLE_READ_ACCESS_REFUSED"));
    await expect(approvePersonalOutbound({ userId: "owner", workspaceId: "workspace", operationId: "reply", expectedRequestHash: f.row.requestHash }, env)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(shared.update).not.toHaveBeenCalled();
  });
  it("rechecks Google authority before consuming approval or reserving SMS spend", async () => {
    const f = fixture(); shared.authority.mockRejectedValue(new Error("GOOGLE_READ_ACCESS_REFUSED"));
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(shared.reserve).not.toHaveBeenCalled(); expect(shared.update).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("checks again after claim latency and retains uncertainty without issuing HTTP if revoked", async () => {
    const f = fixture(); shared.authority.mockResolvedValueOnce(f.authority).mockRejectedValueOnce(new Error("GOOGLE_READ_ACCESS_REFUSED"));
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("OUTBOUND_OUTCOME_REQUIRES_REVIEW");
    expect(shared.reserve).toHaveBeenCalledTimes(1); expect(f.transport).not.toHaveBeenCalled();
    expect(shared.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "uncertain", externalTransportPerformed: false, result: { reviewRequired: true, automaticRetry: false, deliveryConfirmed: false } }) }));
  });
  it("passes the exact current provenance at both checks and never claims delivered", async () => {
    const f = fixture();
    expect(await dispatchPersonalOutbound("reply", env, f.transport)).toEqual({ delivered: false });
    expect(shared.authority).toHaveBeenCalledTimes(2); expect(shared.authority.mock.calls.every(call => call[1] === "owner" && call[2] === "workspace" && call[3] === f.authority)).toBe(true);
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("rejects a changed original reply/recipient binding before authority or dispatch", async () => {
    const f = fixture(); f.source.result.reply = "Other reply";
    await expect(dispatchPersonalOutbound("reply", env, f.transport)).rejects.toThrow("AUTOMATIC_REPLY_REFUSED");
    expect(shared.authority).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it("does not impose Google consent on independently prepared self messages", async () => {
    const f = fixture(); delete (f.row.request as Partial<typeof f.row.request>).sourceOperationId;
    f.row.idempotencyKey = "personal-outbound:workspace:synthetic"; f.row.requestHash = hash(JSON.stringify(f.row.request)); f.row.result.approvedHash = f.row.requestHash;
    expect(await dispatchPersonalOutbound("reply", env, f.transport)).toEqual({ delivered: false });
    expect(shared.authority).not.toHaveBeenCalled(); expect(f.transport).toHaveBeenCalledTimes(1);
  });
});
