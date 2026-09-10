import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GoogleCalendarClient, newGoogleConsent } from "../src/server/personal-assistant/google-client";
import { openConnectorSecret, requireConnectorKey, sealConnectorSecret } from "../src/server/personal-assistant/credential-cipher";

const env = {
  ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
  ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
  GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
  ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-09-10T00:00:00Z",
};
const now = () => Date.parse("2026-09-09T00:00:00Z");
const readScope = "https://www.googleapis.com/auth/calendar.events.readonly";
describe("Google consent and encrypted credentials", () => {
  it("follows pagination and never reports a truncated calendar as complete", async () => {
    const tokens = { accessToken: "synthetic", refreshToken: "synthetic", subject: "synthetic", scopes: [readScope], expiresAt: now() + 3600000 };
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ items: [], nextPageToken: "page-two" })).mockResolvedValueOnce(Response.json({ items: [{ id: "event", summary: "Job", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } }] }));
    const result = await new GoogleCalendarClient(env, transport, now).listEvents(tokens, "2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z");
    expect(result.events).toHaveLength(1); expect(result.complete).toBe(true);
    expect(transport.mock.calls[1][0]).toContain("pageToken=page-two");
    const cycling = vi.fn().mockImplementation(async () => Response.json({ items: [], nextPageToken: "again" }));
    await expect(new GoogleCalendarClient(env, cycling, now).listEvents(tokens, "2026-09-09T00:00:00Z", "2026-09-10T00:00:00Z")).rejects.toThrow("GOOGLE_CALENDAR_INCOMPLETE");
    expect(cycling).toHaveBeenCalledTimes(2);
  });
  it("requests only the selected calendar scope plus stable identity and PKCE", () => {
    const consent = newGoogleConsent(env, "READ_ONLY", now());
    const url = new URL(consent.authorizationUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(consent.scopes).toEqual(["openid", readScope]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(consent.state);
    expect(consent.authorizationUrl).not.toContain(consent.verifier);
    expect(consent.authorizationUrl).not.toContain(env.GOOGLE_CLIENT_SECRET);
  });
  it("rejects a redirect pointing outside the backend or using a wrong callback", () => {
    expect(() => newGoogleConsent({ ...env, GOOGLE_REDIRECT_URI: "https://other.example/callback" }, "READ_ONLY", now())).toThrow("GOOGLE_REDIRECT_CONFIGURATION_REQUIRED");
  });
  it("binds encrypted secrets to workspace and purpose and detects tampering", () => {
    const key = requireConnectorKey(randomBytes(32).toString("base64"));
    const secret = "synthetic-access-and-refresh-material";
    const encrypted = sealConnectorSecret(secret, "workspace-a:tokens", key);
    expect(encrypted).not.toContain(secret);
    expect(openConnectorSecret(encrypted, "workspace-a:tokens", key)).toBe(secret);
    expect(() => openConnectorSecret(encrypted, "workspace-b:tokens", key)).toThrow("CONNECTOR_SECRET_UNAVAILABLE");
    const parts = encrypted.split("."); parts[3] = (parts[3][0] === "a" ? "b" : "a") + parts[3].slice(1);
    expect(() => openConnectorSecret(parts.join("."), "workspace-a:tokens", key)).toThrow("CONNECTOR_SECRET_UNAVAILABLE");
    expect(sealConnectorSecret(secret, "workspace-a:tokens", key)).not.toBe(encrypted);
  });
  it("requires a 256-bit encryption key", () => {
    expect(() => requireConnectorKey("short")).toThrow("CONNECTOR_KEY_REQUIRED");
  });
  it("performs no transport with disabled authority", async () => {
    const transport = vi.fn(); const client = new GoogleCalendarClient({}, transport, now);
    await expect(client.exchange("code", "a".repeat(43), [readScope])).rejects.toThrow("GOOGLE_PILOT_DISABLED");
    expect(transport).not.toHaveBeenCalled();
  });
  it("exchanges a single-use code through fixed endpoints without exposing client secrets", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "Bearer", scope: `openid ${readScope}` })).mockResolvedValueOnce(Response.json({ sub: "synthetic-google-subject" }));
    const tokens = await new GoogleCalendarClient(env, transport, now).exchange("synthetic-code", "a".repeat(43), ["openid", readScope]);
    expect(tokens.subject).toBe("synthetic-google-subject");
    expect(transport.mock.calls.map(call => call[0])).toEqual(["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
    expect(transport.mock.calls.every(call => call[1].redirect === "error")).toBe(true);
  });
  it("refuses reduced consent before querying identity", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "Bearer", scope: "openid" }));
    await expect(new GoogleCalendarClient(env, transport, now).exchange("code", "a".repeat(43), [readScope])).rejects.toThrow("GOOGLE_SCOPE_REQUIRED");
    expect(transport).toHaveBeenCalledOnce();
  });
  it("does not forward provider error details containing credentials", async () => {
    const transport = vi.fn().mockResolvedValue(new Response("private-provider-debug", { status: 400 }));
    await expect(new GoogleCalendarClient(env, transport, now).exchange("code", "a".repeat(43), [readScope])).rejects.toThrow("GOOGLE_REQUEST_REFUSED");
  });
  it("keeps the existing refresh token when Google does not rotate it", async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ access_token: "new-synthetic-access", expires_in: 3600, token_type: "Bearer" }));
    const tokens = await new GoogleCalendarClient(env, transport, now).refresh({ accessToken: "old", refreshToken: "synthetic-refresh", scopes: ["openid", readScope], subject: "subject", expiresAt: now() });
    expect(tokens.refreshToken).toBe("synthetic-refresh");
  });
});
