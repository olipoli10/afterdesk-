import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ find: vi.fn(), first: vi.fn(), list: vi.fn(), update: vi.fn(), updateOne: vi.fn(),
  transaction: vi.fn(), member: vi.fn(), identity: vi.fn(), account: vi.fn(), grant: vi.fn(), budget: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction, $queryRaw: vi.fn(),
  personalAssistantOperation: { findUnique: shared.find, findFirst: shared.first, findMany: shared.list, updateMany: shared.update, update: shared.updateOne },
  constructionWorkspaceMember: { findFirst: shared.member }, constructionCommunicationIdentity: { findFirst: shared.identity },
  constructionConnectorAccount: { findUniqueOrThrow: shared.account }, constructionConnectorGrant: { findFirst: shared.grant },
  personalAssistantBudget: { upsert: shared.budget, update: shared.reserve } } }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ requireGoogleReadAuthority: vi.fn(), readGoogleCalendarWithAuthority: vi.fn() }));
vi.mock("@/server/personal-assistant/model-worker", () => ({ processPersonalModelSms: vi.fn(), personalModelReviewReply: vi.fn() }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: vi.fn() }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: vi.fn() }));
import { prisma } from "@/lib/db";
import { dispatchPersonalOutbound } from "@/server/personal-assistant/outbox";
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
    request, requestHash: hash(JSON.stringify(request)),
    result: { approvedBy: "synthetic-owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: new Date(Date.now() + 600000).toISOString() } };
  const source = { id: "synthetic-source", request: { from: request.to, to: request.from },
    result: { source: "ENDVERA_LOCAL", reply: request.text } };
  const revoked = { member: false, identity: false, grant: false, account: false };
  let afterCommit: () => void = () => undefined;
  shared.find.mockImplementation(async () => structuredClone(row));
  shared.first.mockResolvedValue(source);
  shared.member.mockImplementation(async () => revoked.member ? null : { id: "member" });
  shared.identity.mockImplementation(async () => revoked.identity ? null : { id: "identity" });
  shared.account.mockImplementation(async () => ({ id: row.connectorAccountId, status: revoked.account ? "disconnected" : "connected",
    revokedAt: null, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) }));
  shared.grant.mockImplementation(async () => revoked.grant ? null : { id: "grant" });
  shared.transaction.mockImplementation(async work => { const result = await work(prisma); afterCommit(); return result; });
  shared.update.mockImplementation(async ({ where, data }) => {
    if (where.id !== row.id || where.status && where.status !== row.status) return { count: 0 };
    if (data.status) row.status = data.status;
    return { count: 1 };
  });
  shared.updateOne.mockImplementation(async ({ data }) => { if (data.status) row.status = data.status; return row; });
  shared.budget.mockResolvedValue({ id: "synthetic-budget", ceilingCadMicros: 10000000n, reservedCadMicros: 0n,
    expiresAt: new Date(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT) });
  shared.reserve.mockResolvedValue({});
  const response = () => Response.json({ sid: `SM${"c".repeat(32)}`, status: "queued", account_sid: env.TWILIO_ACCOUNT_SID,
    to: request.to, from: request.from });
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response());
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
