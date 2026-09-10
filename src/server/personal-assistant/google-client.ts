import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { externalCapabilityDecision } from "@/lib/release/external-capabilities";
import { googleCalendarScopesForMode } from "@/lib/construction-operating-assistant-r3/google-calendar";
import type { CalendarConnectionMode } from "@/lib/construction-operating-assistant-r3/connector-contracts";

export type ConnectorEnvironment = Readonly<Record<string, string | undefined>>;
export const googleTokensSchema = z.object({
  accessToken: z.string().min(1).max(8192), refreshToken: z.string().min(1).max(8192),
  expiresAt: z.number().finite(), scopes: z.array(z.string().max(300)).max(30),
  subject: z.string().min(1).max(255),
}).strict();
export type GoogleTokens = z.infer<typeof googleTokensSchema>;
const eventTime = z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() });
const calendarEvent = z.object({ id: z.string().min(1), summary: z.string().default("Sans titre"), status: z.string().optional(), start: eventTime, end: eventTime });
const calendarPage = z.object({ items: z.array(calendarEvent).default([]), nextPageToken: z.string().max(8192).optional(), timeZone: z.string().optional() });
const wireToken = z.object({ access_token: z.string().min(1).max(8192), refresh_token: z.string().min(1).max(8192).optional(), expires_in: z.number().int().positive().max(86400), token_type: z.literal("Bearer"), scope: z.string().max(8192).optional() });

export function requireGooglePilot(env: ConnectorEnvironment, now = Date.now()) {
  const expiresAt = Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "");
  if (!externalCapabilityDecision("GOOGLE_OAUTH", env).enabled || !Number.isFinite(expiresAt) || now >= expiresAt) throw new Error("GOOGLE_PILOT_DISABLED");
  const redirect = new URL(env.GOOGLE_REDIRECT_URI ?? "https://invalid.example");
  const origin = new URL(env.BETTER_AUTH_URL ?? "https://missing.example");
  if (redirect.protocol !== "https:" || redirect.origin !== origin.origin || redirect.pathname !== "/api/endvera/v1/personal/google/callback" || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error("GOOGLE_REDIRECT_CONFIGURATION_REQUIRED");
  return { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri: redirect.href };
}

export function newGoogleConsent(env: ConnectorEnvironment, mode: CalendarConnectionMode, now = Date.now()) {
  const config = requireGooglePilot(env, now);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const scopes = ["openid", ...googleCalendarScopesForMode(mode)];
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: "code", scope: scopes.join(" "), state, access_type: "offline", prompt: "consent",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  return { state, verifier, scopes, authorizationUrl: url.href, expiresAt: now + 10 * 60_000 };
}

export class GoogleCalendarClient {
  constructor(private readonly env: ConnectorEnvironment, private readonly transport: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  private async request(url: string, init: RequestInit): Promise<unknown> {
    requireGooglePilot(this.env, this.now());
    let response: Response;
    try { response = await this.transport(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000) }); }
    catch { throw new Error("GOOGLE_TRANSPORT_UNAVAILABLE"); }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "GOOGLE_REAUTHORIZATION_REQUIRED" : "GOOGLE_REQUEST_REFUSED");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("GOOGLE_RESPONSE_INVALID");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new Error("GOOGLE_RESPONSE_TOO_LARGE"); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new Error("GOOGLE_RESPONSE_INVALID"); }
  }

  async exchange(code: string, verifier: string, requiredScopes: string[]): Promise<GoogleTokens> {
    const config = requireGooglePilot(this.env, this.now());
    if (!code || code.length > 8192 || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) throw new Error("GOOGLE_CODE_REFUSED");
    const result = wireToken.safeParse(await this.request("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri }).toString(),
    }));
    if (!result.success || !result.data.refresh_token) throw new Error("GOOGLE_TOKEN_RESPONSE_REFUSED");
    const scopes = result.data.scope?.split(/\s+/).filter(Boolean) ?? [];
    if (!requiredScopes.every(scope => scopes.includes(scope))) throw new Error("GOOGLE_SCOPE_REQUIRED");
    const profile = z.object({ sub: z.string().min(1).max(255) }).safeParse(await this.request("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${result.data.access_token}` } }));
    if (!profile.success) throw new Error("GOOGLE_IDENTITY_REFUSED");
    return { accessToken: result.data.access_token, refreshToken: result.data.refresh_token, expiresAt: this.now() + result.data.expires_in * 1000, scopes, subject: profile.data.sub };
  }

  async refresh(tokens: GoogleTokens): Promise<GoogleTokens> {
    const config = requireGooglePilot(this.env, this.now());
    const result = wireToken.safeParse(await this.request("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: config.clientId, client_secret: config.clientSecret }).toString(),
    }));
    if (!result.success) throw new Error("GOOGLE_TOKEN_RESPONSE_REFUSED");
    const scopes = result.data.scope?.split(/\s+/).filter(Boolean) ?? tokens.scopes;
    if (!tokens.scopes.every(scope => scopes.includes(scope))) throw new Error("GOOGLE_SCOPE_REQUIRED");
    return { ...tokens, accessToken: result.data.access_token, refreshToken: result.data.refresh_token ?? tokens.refreshToken, expiresAt: this.now() + result.data.expires_in * 1000, scopes };
  }

  async listEvents(tokens: GoogleTokens, start: string, end: string) {
    if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(start) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 31 * 86400_000) throw new Error("CALENDAR_RANGE_INVALID");
    if (!tokens.scopes.some(s => s === "https://www.googleapis.com/auth/calendar.events" || s === "https://www.googleapis.com/auth/calendar.events.readonly")) throw new Error("GOOGLE_SCOPE_REQUIRED");
    const query = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const events: z.infer<typeof calendarEvent>[] = [];
    const seenPages = new Set<string>();
    let timeZone: string | undefined;
    for (let page = 0; page < 10; page++) {
      const parsed = calendarPage.safeParse(await this.request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, { headers: { authorization: `Bearer ${tokens.accessToken}` } }));
      if (!parsed.success) throw new Error("GOOGLE_CALENDAR_RESPONSE_INVALID");
      timeZone ??= parsed.data.timeZone;
      events.push(...parsed.data.items.filter(event => event.status !== "cancelled"));
      if (!parsed.data.nextPageToken) return { events, timeZone: timeZone ?? null, complete: true as const, source: "GOOGLE_CALENDAR" as const };
      if (seenPages.has(parsed.data.nextPageToken)) break;
      seenPages.add(parsed.data.nextPageToken);
      query.set("pageToken", parsed.data.nextPageToken);
    }
    throw new Error("GOOGLE_CALENDAR_INCOMPLETE");
  }
}
