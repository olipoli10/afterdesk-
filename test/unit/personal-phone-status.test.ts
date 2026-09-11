import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ owner: vi.fn(), identities: vi.fn(), account: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  constructionWorkspaceMember: { findFirst: db.owner },
  constructionCommunicationIdentity: { findMany: db.identities },
  constructionConnectorAccount: { findUnique: db.account },
} }));

import { PersonalPhoneAccessDenied, PersonalPhoneStatusUnavailable, personalPhoneStatus } from "@/server/personal-assistant/phone-pairing";

beforeEach(() => {
  vi.clearAllMocks();
  db.owner.mockResolvedValue({ id: "member" });
  db.identities.mockResolvedValue([{ normalizedAddress: "+15005550001" }]);
  db.account.mockResolvedValue({ status: "connected", externalAccountKeyHash: "not-current" });
});

describe("personal phone status database failure classification", () => {
  it("returns a typed access refusal and performs no later lookup when the owner is absent", async () => {
    db.owner.mockResolvedValueOnce(null);
    await expect(personalPhoneStatus("owner", "workspace", {})).rejects.toBeInstanceOf(PersonalPhoneAccessDenied);
    expect(db.identities).not.toHaveBeenCalled(); expect(db.account).not.toHaveBeenCalled();
  });

  it.each([
    ["owner_lookup", db.owner],
    ["identity_lookup", db.identities],
    ["account_lookup", db.account],
  ] as const)("maps a rejected %s to its closed stage code", async (stage, query) => {
    query.mockRejectedValueOnce(new Error("sensitive database detail"));
    const error = await personalPhoneStatus("owner", "workspace", {}).catch(cause => cause);
    expect(error).toBeInstanceOf(PersonalPhoneStatusUnavailable);
    expect(error).toMatchObject({ message: "SMS_PAIRING_STATUS_UNAVAILABLE", stage });
    expect(JSON.stringify(error)).not.toContain("sensitive database detail");
  });

  it("preserves the successful projection", async () => {
    await expect(personalPhoneStatus("owner", "workspace", {})).resolves.toEqual({
      configured: false, number: null, boundPhone: null,
    });
  });
});
