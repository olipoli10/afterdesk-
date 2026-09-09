import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  constructionCommunicationIdentity: { findMany: vi.fn() },
  constructionWorkspaceMember: { findFirst: vi.fn() },
  constructionConnectorAccount: { findUnique: vi.fn() },
  constructionConnectorOperation: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }));
import { enqueuePersonalSms } from "../src/server/personal-assistant/sms-inbox";

const envelope = {
  accountSid: `AC${"a".repeat(32)}`, messageSid: `SM${"b".repeat(32)}`,
  from: "+15005550001", to: "+15005550006", body: "Demain?", contentHash: "a".repeat(64),
};
beforeEach(() => {
  db.$queryRaw.mockResolvedValue([]);
  db.constructionCommunicationIdentity.findMany.mockResolvedValue([{ id: "identity", userId: "owner", workspaceId: "workspace" }]);
  db.constructionWorkspaceMember.findFirst.mockResolvedValue({ id: "member" });
  db.constructionConnectorAccount.findUnique.mockResolvedValue({ id: "account", status: "connected", externalAccountKeyHash: createHash("sha256").update(envelope.accountSid).digest("hex"), grants: [{ id: "grant" }] });
  db.constructionConnectorOperation.findFirst.mockResolvedValue(null);
  db.constructionConnectorOperation.create.mockResolvedValue({ id: "inbound" });
});

describe("personal SMS durable inbox repository contract (mock DB, not PostgreSQL proof)", () => {
  it("stores a received operation without executing an assistant or outgoing message", async () => {
    expect(await enqueuePersonalSms(envelope)).toEqual({ operationId: "inbound", replayed: false });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.constructionConnectorOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "received", kind: "personal_sms_inbound", workspaceId: "workspace", createdByUserId: "owner", externalTransportPerformed: true }) }));
  });
  it("returns an identical replay without a second insert", async () => {
    db.constructionConnectorOperation.findFirst.mockResolvedValue({ id: "prior", workspaceId: "workspace", createdByUserId: "owner", requestHash: envelope.contentHash });
    expect(await enqueuePersonalSms(envelope)).toEqual({ operationId: "prior", replayed: true });
    expect(db.constructionConnectorOperation.create).not.toHaveBeenCalled();
  });
  it.each([{ workspaceId: "other" }, { createdByUserId: "other" }, { requestHash: "changed" }])("rejects conflicting replay", async change => {
    db.constructionConnectorOperation.findFirst.mockResolvedValue({ id: "prior", workspaceId: "workspace", createdByUserId: "owner", requestHash: envelope.contentHash, ...change });
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("REPLAY_CONFLICT");
    expect(db.constructionConnectorOperation.create).not.toHaveBeenCalled();
  });
  it.each([{ identities: [] }, { identities: [{ id: "one", userId: "owner", workspaceId: "a" }, { id: "two", userId: "owner", workspaceId: "b" }] }])("rejects absent or ambiguous sender binding", async ({ identities }) => {
    db.constructionCommunicationIdentity.findMany.mockResolvedValue(identities);
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("IDENTITY_NOT_BOUND");
    expect(db.constructionConnectorOperation.create).not.toHaveBeenCalled();
  });
  it("rejects revoked workspace membership even for a previously verified phone", async () => {
    db.constructionWorkspaceMember.findFirst.mockResolvedValue(null);
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("IDENTITY_NOT_BOUND");
  });
  it.each(["prepared", "revoked"])("rejects %s channel state", async status => {
    db.constructionConnectorAccount.findUnique.mockResolvedValue({ status });
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("CHANNEL_NOT_CONNECTED");
  });
  it("rejects a connected channel belonging to another provider account", async () => {
    db.constructionConnectorAccount.findUnique.mockResolvedValue({ status: "connected", externalAccountKeyHash: "different", grants: [{ id: "grant" }] });
    await expect(enqueuePersonalSms(envelope)).rejects.toThrow("CHANNEL_NOT_CONNECTED");
  });
});
