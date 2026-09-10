import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ member: vi.fn(), identities: vi.fn(), account: vi.fn(), identityUpdate: vi.fn(),
  grantUpdate: vi.fn(), accountUpdate: vi.fn(), operationUpdate: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  constructionWorkspaceMember: { findFirst: db.member },
  constructionCommunicationIdentity: { findMany: db.identities },
  constructionConnectorAccount: { findUnique: db.account },
  $transaction: db.transaction,
} }));
import { disconnectPersonalPhone } from "@/server/personal-assistant/phone-pairing";

beforeEach(() => {
  vi.resetAllMocks(); db.member.mockResolvedValue({ id: "synthetic-member" }); db.identities.mockResolvedValue([]);
  db.account.mockResolvedValue({ id: "synthetic-account", status: "connected" });
  db.identityUpdate.mockResolvedValue({ count: 1 }); db.grantUpdate.mockResolvedValue({ count: 2 });
  db.accountUpdate.mockResolvedValue({ id: "synthetic-account" });
  db.operationUpdate.mockImplementation(async ({ where }) => {
    // Models the reviewed immutable-summary CHECK/trigger; actual PG coverage is separate.
    if (where.kind?.not !== "calendar_confirmation_summary") throw new Error("immutable summary cannot change status");
    return { count: 1 };
  });
  db.transaction.mockImplementation(work => work({
    constructionCommunicationIdentity: { updateMany: db.identityUpdate },
    constructionConnectorGrant: { updateMany: db.grantUpdate },
    constructionConnectorAccount: { findUnique: db.account, update: db.accountUpdate },
    personalAssistantOperation: { updateMany: db.operationUpdate },
  }));
});

describe("phone revocation preserves immutable confirmation history", () => {
  it("revokes identity and grants without trying to mutate a dedicated summary", async () => {
    await expect(disconnectPersonalPhone("synthetic-owner", "synthetic-workspace")).resolves.toEqual({ disconnected: true });
    expect(db.identityUpdate.mock.calls[0][0]).toMatchObject({ where: { workspaceId: "synthetic-workspace", userId: "synthetic-owner" }, data: { verified: false, status: "revoked", permissions: [] } });
    expect(db.grantUpdate.mock.calls[0][0]).toMatchObject({ where: { connectorAccountId: "synthetic-account" }, data: { status: "revoked", grantedScopes: [], stateVersion: { increment: 1 } } });
    expect(db.accountUpdate.mock.calls[0][0]).toMatchObject({ data: { status: "revoked", credentialRef: null, externalAccountKeyHash: null } });
    expect(db.operationUpdate.mock.calls[0][0]).toEqual({ where: { connectorAccountId: "synthetic-account", kind: { not: "calendar_confirmation_summary" }, status: { in: ["pending", "approved", "received"] } }, data: { status: "refused", result: { reason: "PHONE_DISCONNECTED" } } });
    expect(db.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });

  it("refuses an unauthorized caller before mutation", async () => {
    db.member.mockResolvedValue(null);
    await expect(disconnectPersonalPhone("other", "synthetic-workspace")).rejects.toThrow("SMS_PAIRING_ACCESS_REFUSED");
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
