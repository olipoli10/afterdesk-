import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { preparePersonalCalendar, preparePersonalCalendarInTransaction } from "@/server/personal-assistant/calendar-actions";
import { preparePersonalOutbound, preparePersonalOutboundInTransaction } from "@/server/personal-assistant/outbox";

const root = vi.hoisted(() => ({ transaction: vi.fn(), member: vi.fn(), account: vi.fn(), find: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: root.transaction, constructionWorkspaceMember: { findFirst: root.member },
  constructionConnectorAccount: { findUniqueOrThrow: root.account }, personalAssistantOperation: { findUnique: root.find, create: root.create } } }));
const env = { NODE_ENV: "test" as const, TWILIO_PHONE_NUMBER: "+15145550111" };
const calendar = { userId: "owner", workspaceId: "workspace", requestId: "11111111-1111-4111-8111-111111111111",
  draft: { title: "Visite", startsAt: "2026-09-11T18:00:00Z", endsAt: "2026-09-11T19:00:00Z", timezone: "America/Toronto" } };
const outbound = { userId: "owner", workspaceId: "workspace", requestId: calendar.requestId, to: "+15145550122", kind: "sms_outbound" as const, text: "Bonjour" };
function fixture() {
  const member = vi.fn().mockResolvedValue({ id: "member" }); const identity = vi.fn().mockResolvedValue({ id: "identity" });
  const account = vi.fn().mockResolvedValue({ id: "account", status: "connected", revokedAt: null, stateVersion: 1, grantedScopes: ["https://www.googleapis.com/auth/calendar.events"] });
  const find = vi.fn().mockResolvedValue(null); const create = vi.fn().mockImplementation(async ({ data }) => ({ ...data, id: "draft" }));
  const tx = { constructionWorkspaceMember: { findFirst: member }, constructionCommunicationIdentity: { findFirst: identity },
    constructionConnectorAccount: { findUniqueOrThrow: account }, personalAssistantOperation: { findUnique: find, create } } as unknown as Prisma.TransactionClient;
  return { tx, member, identity, account, find, create };
}
beforeEach(() => vi.clearAllMocks());
describe("transaction-aware prepare-only helpers", () => {
  it("calendar uses only caller transaction and creates pending exact hash draft", async () => {
    const f = fixture(); const result = await preparePersonalCalendarInTransaction(f.tx, calendar);
    expect(result).toMatchObject({ operationId: "draft", status: "pending" });
    expect(f.create.mock.calls[0][0].data).toMatchObject({ kind: "calendar_write", status: "pending", request: { ...calendar.draft, accountVersion: 1, requestId: calendar.requestId } });
    expect(root.member).not.toHaveBeenCalled(); expect(root.transaction).not.toHaveBeenCalled();
  });
  it("calendar original wrapper retains root behavior", async () => {
    const f = fixture(); root.member.mockImplementation(f.member); root.account.mockImplementation(f.account); root.find.mockImplementation(f.find); root.create.mockImplementation(f.create);
    expect(await preparePersonalCalendar(calendar)).toMatchObject({ status: "pending" }); expect(root.create).toHaveBeenCalledTimes(1);
  });
  it("outbound uses caller transaction, verified self identity and no send/approval", async () => {
    const f = fixture(); expect(await preparePersonalOutboundInTransaction(f.tx, outbound, env)).toMatchObject({ status: "pending" });
    expect(f.identity).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "owner", verified: true, normalizedAddress: outbound.to }) }));
    expect(f.create.mock.calls[0][0].data).toMatchObject({ status: "pending", kind: "sms_outbound", request: { from: env.TWILIO_PHONE_NUMBER, to: outbound.to, text: "Bonjour" } });
    expect(root.transaction).not.toHaveBeenCalled();
  });
  it("outbound wrapper keeps its serializable transaction", async () => {
    const f = fixture(); root.transaction.mockImplementation(fn => fn(f.tx));
    expect(await preparePersonalOutbound(outbound, env)).toMatchObject({ status: "pending" });
    expect(root.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });
  it("rejects another recipient and a revoked calendar scope without creating", async () => {
    const f = fixture(); f.identity.mockResolvedValue(null);
    await expect(preparePersonalOutboundInTransaction(f.tx, outbound, env)).rejects.toThrow("VERIFIED_SELF_RECIPIENT_REQUIRED");
    f.account.mockResolvedValue({ id: "account", status: "revoked", revokedAt: new Date(), stateVersion: 1, grantedScopes: [] });
    await expect(preparePersonalCalendarInTransaction(f.tx, calendar)).rejects.toThrow(); expect(f.create).not.toHaveBeenCalled();
  });
  it("preserves idempotent hash conflicts instead of overwriting a draft", async () => {
    const f = fixture(); f.find.mockResolvedValue({ id: "existing", createdByUserId: "owner", requestHash: "changed", kind: "sms_outbound", status: "pending" });
    await expect(preparePersonalOutboundInTransaction(f.tx, outbound, env)).rejects.toThrow("OUTBOUND_REPLAY_CONFLICT");
    await expect(preparePersonalCalendarInTransaction(f.tx, calendar)).rejects.toThrow("CALENDAR_REPLAY_CONFLICT"); expect(f.create).not.toHaveBeenCalled();
  });
});
