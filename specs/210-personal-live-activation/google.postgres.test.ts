import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { beginGoogleConnection, launchGoogleConnection, finishGoogleConnection, googleTokensForOwner, googleConnectionStatus, disconnectGoogleLocally, readGoogleCalendar } from "@/server/personal-assistant/google-connection";
import { GoogleCalendarClient } from "@/server/personal-assistant/google-client";

const dbUrl = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dbName = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(dbName) || dbUrl.pathname !== `/${dbName}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
const env = {
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED",
  GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret", GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(), ENDVERA_CONNECTOR_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};
const scopes = "openid https://www.googleapis.com/auth/calendar.events.readonly";
afterAll(() => prisma.$disconnect());
async function fixture() {
  const user = await prisma.user.create({ data: { name: "Synthetic calendar owner", email: `google-210-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic calendar workspace" });
  const begin = await beginGoogleConnection({ userId: user.id, workspaceId, mode: "READ_ONLY" }, env);
  const url = new URL(begin.launchUrl); const id = url.searchParams.get("attempt")!;
  const launch = await launchGoogleConnection(id, url.searchParams.get("token")!, env);
  const state = new URL(launch.authorizationUrl).searchParams.get("state")!;
  const transport = vi.fn<typeof fetch>().mockImplementation(async raw => {
    const target = String(raw);
    if (target === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "Bearer", scope: scopes });
    if (target === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ sub: "synthetic-subject" });
    if (target.startsWith("https://www.googleapis.com/calendar/")) return Response.json({ items: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  });
  return { userId: user.id, workspaceId, id, begin, launch, state, transport, client: new GoogleCalendarClient(env, transport), input: { state, cookieNonce: launch.cookieNonce, code: "synthetic-code" } };
}
describe("real PostgreSQL OAuth state and credential lifecycle with fake Google transport", () => {
  it("stores encrypted tokens, scrubs one-use material and survives reconnect", async () => {
    const f = await fixture();
    await finishGoogleConnection(f.input, env, f.client);
    const row = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.id } });
    expect(row.request).toEqual({ consumed: true }); expect(row.status).toBe("completed");
    const vault = await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: f.workspaceId } });
    expect(vault.ciphertext).not.toContain("synthetic-refresh");
    await prisma.$disconnect();
    expect((await googleTokensForOwner(f.userId, f.workspaceId, env, f.client)).tokens.refreshToken).toBe("synthetic-refresh");
    expect(await googleConnectionStatus(f.userId, f.workspaceId, env)).toEqual({ configured: true, connected: true, readEnabled: true, writeConsentGranted: false });
    await expect(finishGoogleConnection(f.input, env, f.client)).rejects.toThrow("GOOGLE_CONSENT_REFUSED");
    expect(f.transport).toHaveBeenCalledTimes(2);
  });
  it("rejects a wrong browser correlation before any token exchange", async () => {
    const f = await fixture();
    await expect(finishGoogleConnection({ ...f.input, cookieNonce: "x".repeat(43) }, env, f.client)).rejects.toThrow("GOOGLE_CONSENT_REFUSED");
    expect(f.transport).not.toHaveBeenCalled();
    const url = new URL(f.begin.launchUrl);
    await expect(launchGoogleConnection(f.id, url.searchParams.get("token")!, env)).rejects.toThrow("GOOGLE_CONSENT_REFUSED");
  });
  it("lets only one concurrent callback exchange the code", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([finishGoogleConnection(f.input, env, f.client), finishGoogleConnection(f.input, env, f.client)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(f.transport).toHaveBeenCalledTimes(2);
    expect(await prisma.constructionConnectorCredential.count({ where: { workspaceId: f.workspaceId, revokedAt: null } })).toBe(1);
  });
  it("refuses cross-workspace access and clears credentials on local disconnect", async () => {
    const f = await fixture(); const other = await fixture();
    await finishGoogleConnection(f.input, env, f.client);
    await expect(googleTokensForOwner(other.userId, f.workspaceId, env, f.client)).rejects.toThrow("CONNECTION_ACCESS_REFUSED");
    await disconnectGoogleLocally(f.userId, f.workspaceId);
    expect((await prisma.constructionConnectorCredential.findFirstOrThrow({ where: { workspaceId: f.workspaceId } })).ciphertext).toBe("revoked");
    await expect(googleTokensForOwner(f.userId, f.workspaceId, env, f.client)).rejects.toThrow("GOOGLE_NOT_CONNECTED");
    expect((await googleConnectionStatus(f.userId, f.workspaceId, env)).connected).toBe(false);
  });
  it("does not reconnect a connection revoked during the exchange", async () => {
    const f = await fixture();
    const transport = vi.fn<typeof fetch>().mockImplementation(async (...args) => {
      if (String(args[0]) === "https://openidconnect.googleapis.com/v1/userinfo") await disconnectGoogleLocally(f.userId, f.workspaceId);
      return f.transport(...args);
    });
    await expect(finishGoogleConnection(f.input, env, new GoogleCalendarClient(env, transport))).rejects.toThrow("GOOGLE_CONNECTION_NOT_COMPLETED");
    expect((await googleConnectionStatus(f.userId, f.workspaceId, env)).connected).toBe(false);
    expect(await prisma.constructionConnectorCredential.count({ where: { workspaceId: f.workspaceId, revokedAt: null } })).toBe(0);
  });
  it("reads through granted authority and refuses a revoked read grant", async () => {
    const f = await fixture(); await finishGoogleConnection(f.input, env, f.client);
    expect(await readGoogleCalendar(f.userId, f.workspaceId, "2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z", env, f.client)).toMatchObject({ complete: true, source: "GOOGLE_CALENDAR", events: [] });
    await prisma.constructionConnectorGrant.updateMany({ where: { account: { workspaceId: f.workspaceId }, capability: "calendar_read" }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [] } });
    await expect(googleTokensForOwner(f.userId, f.workspaceId, env, f.client)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
  });
});
