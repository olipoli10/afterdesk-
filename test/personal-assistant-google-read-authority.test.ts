import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleReadAuthoritySchema, readGoogleCalendar, readGoogleCalendarWithAuthority, requireGoogleReadAuthority } from "@/server/personal-assistant/google-connection";
import { sealConnectorSecret } from "@/server/personal-assistant/credential-cipher";
import type { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
const shared = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), account: vi.fn(), grant: vi.fn(), credential: vi.fn(), update: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRawUnsafe: shared.query, $transaction: shared.transaction,
  constructionWorkspaceMember: { findFirst: shared.member }, constructionConnectorAccount: { findUnique: shared.account, findFirst: shared.account },
  constructionConnectorGrant: { findFirst: shared.grant }, constructionConnectorCredential: { findFirst: shared.credential, updateMany: shared.update } } }));
import { prisma } from "@/lib/db";
const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-09-10T00:00:00Z", ENDVERA_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const authority = { schemaVersion: 1 as const, userId: "owner", workspaceId: "workspace", accountId: "google", accountVersion: 2,
  credentialId: "credential", readGrantId: "grant", readGrantVersion: 3 };
const start = "2026-09-11T04:00:00Z", end = "2026-09-12T04:00:00Z";
function fixture(expired = false) {
  const tokens = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", subject: "synthetic-subject",
    expiresAt: expired ? 1 : Date.now() + 3600000, scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"] };
  shared.query.mockResolvedValue([{ id: authority.accountId }]); shared.member.mockResolvedValue({ id: "member" });
  shared.account.mockResolvedValue({ id: "google", stateVersion: 2, status: "connected", revokedAt: null, credentialRef: "credential" });
  shared.grant.mockResolvedValue({ id: "grant", stateVersion: 3 });
  shared.credential.mockResolvedValue({ id: "credential", version: 1, ciphertext: sealConnectorSecret(JSON.stringify(tokens), JSON.stringify(["workspace", "google", "tokens:credential"]), Buffer.alloc(32, 7)) });
  shared.update.mockResolvedValue({ count: 1 }); shared.transaction.mockImplementation(fn => fn(prisma));
  const listEvents = vi.fn(async () => ({ events: [], timeZone: "America/Toronto", complete: true as const, source: "GOOGLE_CALENDAR" as const }));
  const refresh = vi.fn(async () => ({ ...tokens, expiresAt: Date.now() + 3600000 }));
  const client = { listEvents, refresh } as unknown as GoogleCalendarClient;
  return { client, listEvents, refresh };
}
beforeEach(() => vi.resetAllMocks());

describe("Google read current authorization and private receipt", () => {
  it("binds active membership, exact account/credential/read-grant revision under locks", async () => {
    fixture();
    expect(await requireGoogleReadAuthority(prisma, "owner", "workspace", authority, env)).toEqual(authority);
    const [sql, ...parameters] = shared.query.mock.calls[0];
    for (const guard of ["FOR SHARE OF w,m,a,g,c", "g.\"stateVersion\"=$7", "c.\"revokedAt\" IS NULL", "a.\"stateVersion\"=$4", "g.capability='calendar_read'", "m.status='active'"]) expect(sql).toContain(guard);
    expect(parameters).toEqual(["workspace", "owner", "google", 2, "credential", "grant", 3]);
  });
  it.each([{ userId: "other" }, { workspaceId: "other" }, { execute: true }, { accountVersion: "2" }])("refuses mismatched or malformed receipt before database access", async changed => {
    fixture(); await expect(requireGoogleReadAuthority(prisma, "owner", "workspace", { ...authority, ...changed }, env)).rejects.toThrow();
    expect(shared.query).not.toHaveBeenCalled();
  });
  it("requires exactly one currently authorized lineage", async () => {
    fixture(); shared.query.mockResolvedValue([]);
    await expect(requireGoogleReadAuthority(prisma, "owner", "workspace", authority, env)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    shared.query.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    await expect(requireGoogleReadAuthority(prisma, "owner", "workspace", authority, env)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
  });
  it("returns immutable internal receipt without tokens and preserves the public result-only response", async () => {
    const f = fixture(); const value = await readGoogleCalendarWithAuthority("owner", "workspace", start, end, env, f.client);
    expect(value.authority).toEqual(authority); expect(Object.isFrozen(value.authority)).toBe(true);
    expect(googleReadAuthoritySchema.safeParse(value.authority).success).toBe(true);
    expect(JSON.stringify(value)).not.toContain("synthetic-access"); expect(f.listEvents).toHaveBeenCalledTimes(1);
    const publicValue = await readGoogleCalendar("owner", "workspace", start, end, env, f.client);
    expect(publicValue).toEqual(value.result); expect(publicValue).not.toHaveProperty("authority");
  });
  it("does not read when the authority changes after tokens were loaded", async () => {
    const f = fixture(); shared.query.mockResolvedValueOnce([{ id: "google" }]).mockResolvedValue([]);
    await expect(readGoogleCalendarWithAuthority("owner", "workspace", start, end, env, f.client)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(f.listEvents).not.toHaveBeenCalled();
  });
  it("withholds a response if consent changes while Google answers", async () => {
    const f = fixture(); f.listEvents.mockImplementation(async () => { shared.query.mockResolvedValue([]); return { events: [], timeZone: "America/Toronto", complete: true, source: "GOOGLE_CALENDAR" }; });
    await expect(readGoogleCalendarWithAuthority("owner", "workspace", start, end, env, f.client)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(f.listEvents).toHaveBeenCalledTimes(1);
  });
  it("does not persist refreshed credentials or read after consent changes during refresh", async () => {
    const f = fixture(true); f.refresh.mockImplementation(async () => { shared.query.mockResolvedValue([]); return { accessToken: "synthetic-new", refreshToken: "synthetic-refresh", subject: "synthetic-subject", expiresAt: Date.now() + 3600000, scopes: [] }; });
    await expect(readGoogleCalendarWithAuthority("owner", "workspace", start, end, env, f.client)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(shared.update).not.toHaveBeenCalled(); expect(f.listEvents).not.toHaveBeenCalled();
  });
});
