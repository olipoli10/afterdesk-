import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { personalModelFixture, requirePersonalDisposableDatabase } from "./personal-model.fixture";
import { beginGoogleConnection, launchGoogleConnection, finishGoogleConnection, readGoogleCalendarWithAuthority, disconnectGoogleLocally, requireGoogleReadAuthority } from "@/server/personal-assistant/google-connection";
import { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";
import { approvePersonalOutbound } from "@/server/personal-assistant/outbox";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
async function fixture() {
  const f = await personalModelFixture();
  const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
    ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example",
    ENDVERA_CONNECTOR_ENCRYPTION_KEY: randomBytes(32).toString("base64"), ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: f.accountSid, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
    TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
    ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED: "true" };
  const transport = vi.fn<typeof fetch>().mockImplementation(async raw => {
    const target = String(raw);
    if (target === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "Bearer", scope: "openid https://www.googleapis.com/auth/calendar.events.readonly" });
    if (target === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ sub: "synthetic-subject" });
    if (target.startsWith("https://www.googleapis.com/calendar/")) return Response.json({ items: [] });
    throw new Error("UNEXPECTED_SYNTHETIC_ENDPOINT");
  });
  const client = new GoogleCalendarClient(env, transport);
  const begin = await beginGoogleConnection({ userId: f.userId, workspaceId: f.workspaceId, mode: "READ_ONLY" }, env);
  const launchUrl = new URL(begin.launchUrl);
  const launch = await launchGoogleConnection(launchUrl.searchParams.get("attempt")!, launchUrl.searchParams.get("token")!, env);
  await finishGoogleConnection({ state: new URL(launch.authorizationUrl).searchParams.get("state")!, cookieNonce: launch.cookieNonce, code: "synthetic-code" }, env, client);
  return { ...f, env, transport, client };
}
describe("SMS deterministic Google read with disposable PG and fake transport", () => {
  it("persists exact authority with one reply, no model admission, and survives reconnect", async () => {
    const f = await fixture(); const model = vi.fn(); const engine = vi.fn();
    const result = await processPersonalSms(f.sourceOperationId, f.env, { model, engine,
      calendar: (user, workspace, start, end) => readGoogleCalendarWithAuthority(user, workspace, start, end, f.env, f.client) });
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED");
    expect(model).not.toHaveBeenCalled(); expect(engine).not.toHaveBeenCalled();
    expect(f.transport).toHaveBeenCalledTimes(3);
    const source = await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } });
    expect(source.result).toMatchObject({ source: "GOOGLE_CALENDAR", replyDelivery: "PREPARED_UNSENT", googleReadAuthority: { userId: f.userId, workspaceId: f.workspaceId } });
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound", status: "pending", attempts: 0 } })).toBe(1);
    expect(await prisma.personalAssistantOperation.count({ where: { sourcePersonalOperationId: f.sourceOperationId } })).toBe(0);
    await prisma.$disconnect();
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: source.id } })).result).toEqual(source.result);
    expect((await processPersonalSms(source.id, f.env, { model, engine })).status).toBe("NOT_PENDING");
    expect(f.transport).toHaveBeenCalledTimes(3);
    const reply = await prisma.personalAssistantOperation.findFirstOrThrow({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } });
    await disconnectGoogleLocally(f.userId, f.workspaceId);
    await expect(approvePersonalOutbound({ userId: f.userId, workspaceId: f.workspaceId, operationId: reply.id, expectedRequestHash: reply.requestHash }, f.env))
      .rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: reply.id } })).status).toBe("pending");
  });
  it("does not commit a reply when Google is disconnected after the read", async () => {
    const f = await fixture(); const model = vi.fn();
    const result = await processPersonalSms(f.sourceOperationId, f.env, { model, calendar: async (user, workspace, start, end) => {
      const read = await readGoogleCalendarWithAuthority(user, workspace, start, end, f.env, f.client);
      await disconnectGoogleLocally(user, workspace);
      return read;
    } });
    expect(result.status).not.toBe("COMPLETED_REPLY_PREPARED"); expect(model).not.toHaveBeenCalled();
    expect(await prisma.personalAssistantOperation.count({ where: { workspaceId: f.workspaceId, kind: "sms_outbound" } })).toBe(0);
    expect((await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.sourceOperationId } })).status).toBe("uncertain");
  });
  it("invalidates a saved disclosure receipt after grant revocation and rejects another workspace", async () => {
    const f = await fixture();
    const read = await readGoogleCalendarWithAuthority(f.userId, f.workspaceId, new Date().toISOString(), new Date(Date.now() + 3600000).toISOString(), f.env, f.client);
    await expect(requireGoogleReadAuthority(prisma, f.userId, "another-workspace", read.authority, f.env)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    await prisma.constructionConnectorGrant.update({ where: { id: read.authority.readGrantId }, data: { status: "revoked", revokedAt: new Date(), grantedScopes: [], stateVersion: { increment: 1 } } });
    await expect(requireGoogleReadAuthority(prisma, f.userId, f.workspaceId, read.authority, f.env)).rejects.toThrow("GOOGLE_READ_ACCESS_REFUSED");
    expect(f.transport).toHaveBeenCalledTimes(3);
  });
});
