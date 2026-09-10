import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ first: vi.fn(), update: vi.fn(), query: vi.fn(), tx: vi.fn(), tokens: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.tx, $queryRawUnsafe: mocks.query,
  personalAssistantOperation: { findFirst: mocks.first, updateMany: mocks.update } } }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ googleTokensForOwner: mocks.tokens }));
import { prisma } from "@/lib/db";
import { claimPersonalCalendarWriteInTransaction, executeClaimedPersonalCalendarWrite } from "@/server/personal-assistant/calendar-actions";
import type { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic", ENDVERA_EXTERNAL_OWNER_REF: "synthetic",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00Z" };
beforeEach(() => vi.resetAllMocks());

it("caller mutation during the JSONB-order approval lookup cannot change the inserted title", async () => {
  const request = { title: "Approved synthetic title", startsAt: "2036-09-11T14:00:00Z", endsAt: "2036-09-11T15:00:00Z", timezone: "UTC", accountVersion: 1, requestId: "00000000-0000-4000-8000-000000000001" };
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const authority = { accountId: "account", accountVersion: 1, credentialId: "credential", writeGrantId: "grant", writeGrantVersion: 1,
    memberId: "member", memberRole: "owner", memberUpdatedAt: new Date("2026-09-10T12:00:00Z"), workspaceUpdatedAt: new Date("2026-09-10T12:00:00Z"),
    accountScopes: ["https://www.googleapis.com/auth/calendar.events"], grantScopes: ["https://www.googleapis.com/auth/calendar.events"] };
  const row = { status: "pending", attempts: 0, leaseUntil: null as Date | null, result: {} as Record<string, unknown> };
  mocks.tx.mockImplementation(async work => work(prisma));
  mocks.query.mockImplementation(async () => [{ request: structuredClone(request), result: Object.fromEntries(Object.entries(structuredClone(row.result)).reverse()), ...structuredClone(authority) }]);
  mocks.update.mockImplementation(async ({ data }) => { Object.assign(row, structuredClone(data)); return { count: 1 }; });
  mocks.tokens.mockResolvedValue({ accountId: "account", accountVersion: 1, readAuthority: { credentialId: "credential" }, tokens: { scopes: authority.accountScopes } });
  const original = await claimPersonalCalendarWriteInTransaction(prisma as never, { userId: "owner", workspaceId: "workspace", operationId: "operation", expectedRequestHash: requestHash }, env);
  // An external caller can keep a mutable clone even if claim creation freezes its result.
  const claim = structuredClone(original);
  mocks.first.mockImplementation(async () => { claim.request.title = "UNAPPROVED different title"; return { id: "operation" }; });
  const sentTitles: string[] = [];
  const client = { transportAttempts: 0, insertEvent: vi.fn(async (_tokens: unknown, input: { title: string }) => {
    client.transportAttempts++; sentTitles.push(input.title); return { providerEventId: "synthetic-event", confirmed: true as const };
  }) };
  await executeClaimedPersonalCalendarWrite(claim, env, client as unknown as GoogleCalendarClient).catch(() => undefined);
  expect(sentTitles).not.toContain("UNAPPROVED different title");
  expect(sentTitles).toEqual([request.title]);
});
