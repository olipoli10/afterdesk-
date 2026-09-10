import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn(), find: vi.fn(), query: vi.fn(), member: vi.fn(), identity: vi.fn(), account: vi.fn(), grant: vi.fn(), budget: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction, $executeRawUnsafe: mocks.execute, $queryRawUnsafe: mocks.query, $queryRaw: vi.fn(),
  personalAssistantOperation: { findUnique: mocks.find }, constructionWorkspaceMember: { findFirst: mocks.member },
  constructionCommunicationIdentity: { findFirst: mocks.identity }, constructionConnectorAccount: { findUniqueOrThrow: mocks.account },
  constructionConnectorGrant: { findFirst: mocks.grant }, personalAssistantBudget: { upsert: mocks.budget, update: mocks.reserve } } }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ requireGoogleReadAuthority: vi.fn() }));
import { prisma } from "@/lib/db";
import { dispatchPersonalOutbound } from "@/server/personal-assistant/outbox";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`,
    TWILIO_API_KEY_SECRET: "synthetic-only", TWILIO_AUTH_TOKEN: "synthetic-only", TWILIO_PHONE_NUMBER: "+15005550006",
    ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example", ENDVERA_TWILIO_STATUS_WEBHOOK_URL: "https://endvera.example/api/webhooks/twilio/status",
    ENDVERA_PERSONAL_OUTBOUND_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T00:00:00Z", ENDVERA_TWILIO_RATE_REVIEWED_AT: "2026-09-10T11:59:59Z",
    ENDVERA_TWILIO_RATE_REVIEW_REF: "synthetic-rate", ENDVERA_PERSONAL_BUDGET_CAD: "10", ENDVERA_SMS_SEGMENT_RESERVE_CAD: "0.10" };
  const request = { to: "+15005550001", from: env.TWILIO_PHONE_NUMBER, text: "Synthetic exact message" };
  const row = { id: "synthetic-outbound-operation", workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account",
    kind: "sms_outbound", idempotencyKey: "personal-outbound:synthetic", request, requestHash: hash(JSON.stringify(request)), status: "approved", attempts: 0,
    leaseUntil: null as Date | null, budgetId: null as string | null, reservedCadMicros: 0n,
    result: { approvedBy: "owner", approvedHash: hash(JSON.stringify(request)), approvedUntil: "2026-09-10T12:10:00Z" } };
  const budget = { id: hash(JSON.stringify([env.TWILIO_ACCOUNT_SID, env.ENDVERA_EXTERNAL_AUTHORITY_REF])), ceilingCadMicros: 10_000_000n, reservedCadMicros: 0n, expiresAt: new Date(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT) };
  mocks.find.mockImplementation(async () => structuredClone(row));
  mocks.member.mockResolvedValue({ id: "member", role: "owner", updatedAt: new Date("2026-09-10T00:00:00Z") });
  mocks.identity.mockResolvedValue({ id: "identity", permissions: ["COMMAND"], updatedAt: new Date("2026-09-10T00:00:00Z") });
  mocks.account.mockResolvedValue({ id: "account", workspaceId: "workspace", provider: "endvera_sms", status: "connected", revokedAt: null, stateVersion: 1, externalAccountKeyHash: hash(env.TWILIO_ACCOUNT_SID) });
  mocks.grant.mockResolvedValue({ id: "grant", stateVersion: 1, grantedScopes: [], updatedAt: new Date("2026-09-10T00:00:00Z") });
  mocks.budget.mockResolvedValue(budget); mocks.reserve.mockResolvedValue({}); mocks.query.mockResolvedValue([{ id: row.id }]);
  mocks.transaction.mockImplementation(async work => work(prisma));
  const transport = vi.fn(async () => Response.json({ sid: `SM${"c".repeat(32)}`, status: "queued", account_sid: env.TWILIO_ACCOUNT_SID, to: request.to, from: request.from }));
  return { env, row, transport };
}
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("a known CAS loser must not terminalize another processing claim with the same millisecond deadline", async () => {
  const f = fixture();
  mocks.execute.mockImplementation(async (sql: string, ...parameters: unknown[]) => {
    if (sql.includes("SET status='processing'")) {
      // Synthetic contention oracle, not a PostgreSQL reproduction: another
      // owner won this exact operation while our update reports no matched row.
      f.row.status = "processing"; f.row.attempts = 1; f.row.budgetId = parameters[4] as string;
      f.row.reservedCadMicros = parameters[5] as bigint; f.row.leaseUntil = parameters[6] as Date;
      Object.assign(f.row.result, { outboundClaimToken: "independent-winning-claim-token" });
      return 0;
    }
    if (sql.includes("SET status='uncertain'") && f.row.status === "processing" && f.row.leaseUntil?.getTime() === (parameters[4] as Date).getTime()
      && (!sql.includes("result=$11::jsonb") || parameters[10] === JSON.stringify(f.row.result))) {
      f.row.status = "uncertain"; return 1;
    }
    return 0;
  });
  await dispatchPersonalOutbound(f.row.id, f.env, f.transport).catch(() => undefined);
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.row.status).toBe("processing");
});
