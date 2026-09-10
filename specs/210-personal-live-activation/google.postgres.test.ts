import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { beginGoogleConnection, launchGoogleConnection, finishGoogleConnection, googleTokensForOwner, googleConnectionStatus, disconnectGoogleLocally, readGoogleCalendar } from "@/server/personal-assistant/google-connection";
import { GoogleCalendarClient } from "@/server/personal-assistant/google-client";
import { approveAndInsertPersonalCalendar, personalCalendarActions, preparePersonalCalendar } from "@/server/personal-assistant/calendar-actions";

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
async function fixture(mode: "READ_ONLY" | "READ_WRITE" = "READ_ONLY") {
  const user = await prisma.user.create({ data: { name: "Synthetic calendar owner", email: `google-210-${randomUUID()}@example.invalid`, role: "CLIENT" } });
  const { workspaceId } = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic calendar workspace" });
  const begin = await beginGoogleConnection({ userId: user.id, workspaceId, mode }, env);
  const url = new URL(begin.launchUrl); const id = url.searchParams.get("attempt")!;
  const launch = await launchGoogleConnection(id, url.searchParams.get("token")!, env);
  const state = new URL(launch.authorizationUrl).searchParams.get("state")!;
  const transport = vi.fn<typeof fetch>().mockImplementation(async (raw, init) => {
    const target = String(raw);
    if (target === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600, token_type: "Bearer", scope: mode === "READ_WRITE" ? scopes.replace(".readonly", "") : scopes });
    if (target === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ sub: "synthetic-subject" });
    if (target.startsWith("https://www.googleapis.com/calendar/")) return init?.method === "POST" ? Response.json({ ...JSON.parse(String(init.body)), status: "confirmed" }) : Response.json({ items: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  });
  return { userId: user.id, workspaceId, id, begin, launch, state, transport, client: new GoogleCalendarClient(env, transport), input: { state, cookieNonce: launch.cookieNonce, code: "synthetic-code" } };
}
describe("real PostgreSQL OAuth state and credential lifecycle with fake Google transport", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"] as const)("diagnoses UTC-naive lease comparison under transaction-local timezone %s without changing server settings", async timezone => {
    const before = await prisma.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`;
    const observed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
      const column = await tx.$queryRaw<{ data_type: string; datetime_precision: number }[]>`
        SELECT data_type, datetime_precision FROM information_schema.columns
        WHERE table_schema='public' AND table_name='PersonalAssistantOperation' AND column_name='leaseUntil'`;
      expect(column).toEqual([{ data_type: "timestamp without time zone", datetime_precision: 3 }]);
      const instant = new Date("2030-07-01T16:00:00.123Z");
      // Transaction-only synthetic storage, automatically dropped; no application row is changed.
      await tx.$executeRaw`CREATE TEMP TABLE "SyntheticCalendarTimestampDiagnostic"
        ("leaseUntil" TIMESTAMP(3) NOT NULL, "explicitLease" TIMESTAMP(3) NOT NULL, marked BOOLEAN NOT NULL DEFAULT FALSE) ON COMMIT DROP`;
      await tx.$executeRaw`INSERT INTO "SyntheticCalendarTimestampDiagnostic" ("leaseUntil", "explicitLease")
        VALUES (${instant}, (${instant}::timestamptz AT TIME ZONE 'UTC'))`;
      const inferredDateUpdateCount = await tx.$executeRaw`UPDATE "SyntheticCalendarTimestampDiagnostic"
        SET marked=TRUE WHERE "leaseUntil"=${instant}`;
      const stored = await tx.$queryRaw<{ inferredWall: string; explicitWall: string; inferredDate: Date; explicitDate: Date }[]>`
        SELECT to_char("leaseUntil", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "inferredWall",
          to_char("explicitLease", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "explicitWall",
          "leaseUntil" AS "inferredDate", "explicitLease" AS "explicitDate"
        FROM "SyntheticCalendarTimestampDiagnostic"`;
      expect(stored).toHaveLength(1);
      // QueryRaw's Date result is decoded by the actual Prisma PostgreSQL adapter, not JSON or our parser.
      expect(stored[0].inferredDate).toBeInstanceOf(Date); expect(stored[0].explicitDate).toBeInstanceOf(Date);
      const rows = await tx.$queryRaw<{
        mixedEquality: boolean; explicitUtcEquality: boolean; inferredDateEquality: boolean;
        mixedExpiredAppearsLive: boolean; explicitUtcExpiredAppearsLive: boolean;
      }[]>`
        WITH synthetic AS (SELECT TIMESTAMP '2030-07-01 16:00:00.123' AS lease_until,
          TIMESTAMPTZ '2030-07-01T16:01:00.123Z' AS fixed_clock)
        SELECT lease_until=${instant}::timestamptz AS "mixedEquality",
          lease_until=(${instant}::timestamptz AT TIME ZONE 'UTC') AS "explicitUtcEquality",
          lease_until=${instant} AS "inferredDateEquality",
          lease_until>fixed_clock AS "mixedExpiredAppearsLive",
          lease_until>(fixed_clock AT TIME ZONE 'UTC') AS "explicitUtcExpiredAppearsLive"
        FROM synthetic`;
      expect(rows).toHaveLength(1);
      const clocks = await tx.$queryRaw<{ mixedDatabaseClockExpiredAppearsLive: boolean; explicitUtcDatabaseClockExpiredAppearsLive: boolean;
        mixedDatabaseClockFutureAppearsLive: boolean; explicitUtcDatabaseClockFutureAppearsLive: boolean }[]>`
        WITH clock_sample AS MATERIALIZED (SELECT clock_timestamp() AS instant),
          expired AS (SELECT instant, (instant AT TIME ZONE 'UTC')-INTERVAL '1 minute' AS lease_until,
            (instant AT TIME ZONE 'UTC')+INTERVAL '1 minute' AS future_lease FROM clock_sample)
        SELECT lease_until>instant AS "mixedDatabaseClockExpiredAppearsLive",
          lease_until>(instant AT TIME ZONE 'UTC') AS "explicitUtcDatabaseClockExpiredAppearsLive",
          future_lease>instant AS "mixedDatabaseClockFutureAppearsLive",
          future_lease>(instant AT TIME ZONE 'UTC') AS "explicitUtcDatabaseClockFutureAppearsLive" FROM expired`;
      expect(clocks).toHaveLength(1);
      return { ...rows[0], ...clocks[0], inferredDateUpdateCount, inferredWall: stored[0].inferredWall,
        explicitWall: stored[0].explicitWall, inferredRoundTrip: stored[0].inferredDate.toISOString(), explicitRoundTrip: stored[0].explicitDate.toISOString() };
    });
    const inferredWall = timezone === "UTC" ? "2030-07-01T16:00:00.123" : timezone === "America/New_York" ? "2030-07-01T12:00:00.123" : "2030-07-02T01:00:00.123";
    expect(observed).toEqual({ mixedEquality: timezone === "UTC", explicitUtcEquality: true, inferredDateEquality: timezone === "UTC",
      mixedExpiredAppearsLive: timezone === "America/New_York", explicitUtcExpiredAppearsLive: false,
      mixedDatabaseClockExpiredAppearsLive: timezone === "America/New_York", explicitUtcDatabaseClockExpiredAppearsLive: false,
      mixedDatabaseClockFutureAppearsLive: timezone !== "Asia/Tokyo", explicitUtcDatabaseClockFutureAppearsLive: true,
      inferredDateUpdateCount: 1, inferredWall, explicitWall: "2030-07-01T16:00:00.123",
      inferredRoundTrip: `${inferredWall}Z`, explicitRoundTrip: "2030-07-01T16:00:00.123Z" });
    // Fixed synthetic booleans only: no database URL, row content, token, SQL or exception message.
    console.info("CALENDAR_TIMESTAMP_DIAGNOSTIC", JSON.stringify({ timezone, ...observed }));
    expect(await prisma.$queryRaw<{ zone: string }[]>`SELECT current_setting('TimeZone') AS zone`).toEqual(before);
  });
  it("prepares without transport then inserts exactly once after owner approval", async () => {
    const f = await fixture("READ_WRITE"); await finishGoogleConnection(f.input, env, f.client);
    const draft = { title: "Rendez-vous synthétique", startsAt: "2026-09-11T14:00:00-04:00", endsAt: "2026-09-11T15:00:00-04:00", timezone: "America/Toronto" };
    const prepared = await preparePersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, requestId: randomUUID(), draft });
    expect(f.transport).toHaveBeenCalledTimes(2); expect((await personalCalendarActions(f.userId, f.workspaceId)).operations[0].draft).toEqual(draft);
    const approval = { userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash };
    await expect(approveAndInsertPersonalCalendar({ ...approval, expectedRequestHash: "f".repeat(64) }, env, f.client)).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED");
    expect((await approveAndInsertPersonalCalendar(approval, env, f.client)).confirmed).toBe(true);
    await expect(approveAndInsertPersonalCalendar(approval, env, f.client)).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED"); expect(f.transport).toHaveBeenCalledTimes(3);
    const body = JSON.parse(String(f.transport.mock.calls[2][1]?.body)); expect(body.attendees).toBeUndefined(); expect(String(f.transport.mock.calls[2][0])).toContain("sendUpdates=none");
  });
  it("withholds calendar success on uncertain write and never retries automatically", async () => {
    const f = await fixture("READ_WRITE"); await finishGoogleConnection(f.input, env, f.client);
    const prepared = await preparePersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, requestId: randomUUID(), draft: { title: "Synthétique", startsAt: "2026-09-11T14:00:00Z", endsAt: "2026-09-11T15:00:00Z", timezone: "UTC" } });
    const transport = vi.fn().mockRejectedValue(new Error("synthetic timeout"));
    const approval = { userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash };
    await expect(approveAndInsertPersonalCalendar(approval, env, new GoogleCalendarClient(env, transport))).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } })).toMatchObject({ status: "uncertain", externalTransportPerformed: true, result: { writeConfirmed: false } });
    await expect(approveAndInsertPersonalCalendar(approval, env, new GoogleCalendarClient(env, transport))).rejects.toThrow("CALENDAR_APPROVAL_REFUSED_OR_ALREADY_USED"); expect(transport).toHaveBeenCalledOnce();
  });
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
  it("does not claim a Google write after the caller deadline", async () => {
    const f = await fixture("READ_WRITE"); await finishGoogleConnection(f.input, env, f.client);
    const prepared = await preparePersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, requestId: randomUUID(), draft: { title: "Synthétique", startsAt: "2026-09-11T14:00:00Z", endsAt: "2026-09-11T15:00:00Z", timezone: "UTC" } });
    await expect(approveAndInsertPersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, env, f.client, { deadlineAt: Date.now() - 1 })).rejects.toThrow();
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } })).toMatchObject({ status: "pending", attempts: 0 });
    expect(f.transport).toHaveBeenCalledTimes(2);
  });
  it("does not overwrite a recovered Google write after a late confirmed response", async () => {
    const f = await fixture("READ_WRITE"); await finishGoogleConnection(f.input, env, f.client);
    const prepared = await preparePersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, requestId: randomUUID(), draft: { title: "Synthétique", startsAt: "2026-09-11T14:00:00Z", endsAt: "2026-09-11T15:00:00Z", timezone: "UTC" } });
    const transport = vi.fn<typeof fetch>().mockImplementation(async (...args) => {
      if (String(args[0]).startsWith("https://www.googleapis.com/calendar/") && args[1]?.method === "POST") {
        await prisma.personalAssistantOperation.update({ where: { id: prepared.operationId }, data: { status: "uncertain", leaseUntil: null, result: { reason: "SYNTHETIC_GOOGLE_RECOVERY_WON", reviewRequired: true, automaticRetry: false } } });
      }
      return f.transport(...args);
    });
    await expect(approveAndInsertPersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, env, new GoogleCalendarClient(env, transport))).rejects.toThrow("CALENDAR_WRITE_OUTCOME_UNKNOWN");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } })).toMatchObject({ status: "uncertain", result: { reason: "SYNTHETIC_GOOGLE_RECOVERY_WON" } });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(approveAndInsertPersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash }, env, f.client)).rejects.toThrow();
    expect(f.transport).toHaveBeenCalledTimes(3);
  });
  it("parallel owner approvals claim and insert a Google draft only once", async () => {
    const f = await fixture("READ_WRITE"); await finishGoogleConnection(f.input, env, f.client);
    const prepared = await preparePersonalCalendar({ userId: f.userId, workspaceId: f.workspaceId, requestId: randomUUID(), draft: { title: "Synthétique concurrent", startsAt: "2026-09-11T14:00:00Z", endsAt: "2026-09-11T15:00:00Z", timezone: "UTC" } });
    const input = { userId: f.userId, workspaceId: f.workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash };
    const began = Date.now(); const events: string[] = []; let sequence = 0;
    const safeCode = (error: unknown) => {
      const value = error as { code?: unknown; message?: unknown; name?: unknown; meta?: { code?: unknown } };
      const prismaCode = typeof value?.code === "string" && /^P\d{4}$/.test(value.code) ? value.code : "NO_PRISMA_CODE";
      if (typeof value?.message === "string" && /^CALENDAR_[A-Z_]+$/.test(value.message)) return value.message;
      const name = typeof value?.name === "string" && /^[A-Za-z]{1,80}$/.test(value.name) ? value.name : "UNKNOWN_NAME";
      const sqlState = typeof value?.meta?.code === "string" && /^[A-Z0-9]{5}$/.test(value.meta.code) ? value.meta.code : "NO_SQLSTATE";
      const message = typeof value?.message === "string" ? value.message : "";
      const flags = [
        [/unexpected.*message/i, "UNEXPECTED_MESSAGE"], [/invalid.*response/i, "INVALID_RESPONSE"], [/readyforquery/i, "READY_FOR_QUERY"],
        [/connection.*clos|closed.*connection/i, "CONNECTION_CLOSED"], [/transaction/i, "TRANSACTION"], [/timeout|timed out/i, "TIMEOUT"],
        [/panic/i, "PANIC"], [/protocol/i, "PROTOCOL"], [/query engine/i, "QUERY_ENGINE"], [/deserializ/i, "DESERIALIZATION"],
        [/parameter/i, "PARAMETER"], [/type/i, "TYPE"], [/operator/i, "OPERATOR"], [/serialize/i, "SERIALIZATION"],
      ] as const;
      return `${prismaCode}_${name}_${sqlState}_${flags.filter(([pattern]) => pattern.test(message)).map(([, code]) => code).join("_") || "UNCLASSIFIED"}`;
    };
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transaction = vi.spyOn(prisma, "$transaction").mockImplementation(((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: never) => {
      const id = ++sequence; const record = (stage: string) => { events.push(`${id}:${Date.now() - began}:${stage}`); };
      record("BEGIN");
      return originalTransaction(async tx => {
        record("CALLBACK_ENTER");
        try { const value = await callback(tx); record("CALLBACK_RETURN"); return value; }
        catch (error) { record(`CALLBACK_ERROR_${safeCode(error)}`); throw error; }
      }, options).then(value => { record("COMMITTED"); return value; }, error => { record(`TRANSACTION_ERROR_${safeCode(error)}`); throw error; });
    }) as never);
    let results: PromiseSettledResult<{ providerEventId: string; confirmed: true }>[];
    try { results = await Promise.allSettled([approveAndInsertPersonalCalendar(input, env, f.client), approveAndInsertPersonalCalendar(input, env, f.client)]); }
    finally { transaction.mockRestore(); }
    // Synthetic fixture only. Never log exception messages, SQL, URLs, request content or environment values.
    console.info("CALENDAR_CONCURRENCY_DIAGNOSTIC", JSON.stringify({ events, outcomes: results.map(result => result.status === "fulfilled" ? "FULFILLED" : safeCode(result.reason)), elapsedMs: Date.now() - began }));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(f.transport).toHaveBeenCalledTimes(3);
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: prepared.operationId } })).toMatchObject({ status: "completed", attempts: 1 });
  });
});
