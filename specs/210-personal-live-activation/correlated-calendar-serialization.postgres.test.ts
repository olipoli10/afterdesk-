import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma-client";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { preparePersonalCalendarInTransaction } from "@/server/personal-assistant/calendar-actions";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { requirePersonalDisposableDatabase } from "./personal-model.fixture";

requirePersonalDisposableDatabase();
afterAll(() => prisma.$disconnect());
let actor: { userId: string; workspaceId: string };
beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `serialization-${randomUUID()}@example.invalid`, name: "Synthetic serialization owner", role: "CLIENT", emailVerified: true } });
  const workspace = await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic serialization" });
  actor = { userId: user.id, workspaceId: workspace.workspaceId };
  const account = await prisma.constructionConnectorAccount.create({ data: { workspaceId: actor.workspaceId, createdByUserId: user.id,
    provider: "google_calendar", status: "prepared", externalAccountKeyHash: createHash("sha256").update(`synthetic:${actor.workspaceId}`).digest("hex"),
    grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] } });
  const credential = await prisma.constructionConnectorCredential.create({ data: { workspaceId: actor.workspaceId,
    connectorAccountId: account.id, ciphertext: "SYNTHETIC_NEVER_DECRYPTED" } });
  await prisma.constructionConnectorAccount.update({ where: { id: account.id }, data: { status: "connected", credentialRef: credential.id } });
});

// ECMAScript TrimString set, not the default PostgreSQL ASCII-space-only btrim.
const trimSet = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const rollback = new Error("SERIALIZATION_ONLY_ROLLBACK");
// Proposal contract under pg_temp only. This is NOT applied migration78.
const requestSerializer = `CREATE FUNCTION pg_temp.correlated_calendar_request_json(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF jsonb_typeof(v) <> 'object' OR NOT v ?& ARRAY['title','startsAt','endsAt','timezone','accountVersion','requestId']
    OR (v - ARRAY['title','startsAt','endsAt','timezone','accountVersion','requestId']) <> '{}'::jsonb
    OR jsonb_typeof(v->'title') <> 'string' OR jsonb_typeof(v->'startsAt') <> 'string'
    OR jsonb_typeof(v->'endsAt') <> 'string' OR jsonb_typeof(v->'timezone') <> 'string'
    OR jsonb_typeof(v->'requestId') <> 'string' OR jsonb_typeof(v->'accountVersion') <> 'number' THEN
    RAISE EXCEPTION 'CORRELATED_CALENDAR_REQUEST_SHAPE_REQUIRED';
  END IF;
  IF (v->>'accountVersion')::numeric < 1 OR (v->>'accountVersion')::numeric > 2147483647
    OR trunc((v->>'accountVersion')::numeric) <> (v->>'accountVersion')::numeric THEN
    RAISE EXCEPTION 'CORRELATED_CALENDAR_ACCOUNT_VERSION_REQUIRED';
  END IF;
  RETURN '{"title":'||to_json(v->>'title')::text||',"startsAt":'||to_json(v->>'startsAt')::text
    ||',"endsAt":'||to_json(v->>'endsAt')::text||',"timezone":'||to_json(v->>'timezone')::text
    ||',"accountVersion":'||((v->>'accountVersion')::numeric)::integer::text||',"requestId":'||to_json(v->>'requestId')::text||'}';
END $$`;
const requestUuid = `CREATE FUNCTION pg_temp.correlated_calendar_request_id(receipt text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE bytes bytea; hex text;
BEGIN
  bytes:=substring(sha256(convert_to('personal-sms-correlated-calendar:v1','UTF8')||decode('00','hex')||convert_to(receipt,'UTF8')) FROM 1 FOR 16);
  bytes:=set_byte(bytes,6,(get_byte(bytes,6) & 15) | 128);
  bytes:=set_byte(bytes,8,(get_byte(bytes,8) & 63) | 128);
  hex:=encode(bytes,'hex');
  RETURN substring(hex,1,8)||'-'||substring(hex,9,4)||'-'||substring(hex,13,4)||'-'||substring(hex,17,4)||'-'||substring(hex,21,12);
END $$`;
async function withFunctions(check: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(requestSerializer);
      await tx.$executeRawUnsafe(requestUuid);
      await check(tx); throw rollback;
    }, { isolationLevel: "Serializable", timeout: 10_000 });
  } catch (error) { if (error !== rollback) throw error; }
}
const rawTitles = ["Inspection", "Québec — café e\u0301", 'La "job" \\ calendrier / test', "Équipe 👷🏽‍♀️ 🛠️ 𐐀",
  "Contrôle\b\f\n\r\t\u0001\u000b\u001finterne", "A\u2028B\u2029C", `${trimSet}Dosseret${trimSet}`,
  "\u200bPas un espace trim\u0085", "x".repeat(240)];

describe("native proposal serializer proof, not a migrated correlated calendar producer", () => {
  it.each(["UTC", "America/New_York", "Asia/Tokyo"])("matches actual existing preparer request bytes/hash in %s", async timezone => {
    await withFunctions(async tx => {
      await tx.$queryRawUnsafe("SELECT set_config('TimeZone',$1,true)", timezone);
      for (const rawTitle of rawTitles) {
        const result = await preparePersonalCalendarInTransaction(tx, { ...actor, requestId: randomUUID(), draft: {
          title: rawTitle, startsAt: "2026-09-12T14:00:00.000-04:00", endsAt: "2026-09-12T15:00:00.000-04:00", timezone: "America/Toronto" } });
        const row = await tx.personalAssistantOperation.findUniqueOrThrow({ where: { id: result.operationId } });
        const expected = { title: rawTitle.trim(), startsAt: "2026-09-12T14:00:00.000-04:00", endsAt: "2026-09-12T15:00:00.000-04:00",
          timezone: "America/Toronto", accountVersion: 1, requestId: (row.request as { requestId: string }).requestId };
        const [sql] = await tx.$queryRawUnsafe<Array<{ bytes: string; hash: string; normalized: string }>>(`SELECT
          pg_temp.correlated_calendar_request_json(request) AS bytes,
          encode(sha256(convert_to(pg_temp.correlated_calendar_request_json(request),'UTF8')),'hex') AS hash,
          btrim($2::text,$3::text) AS normalized FROM "PersonalAssistantOperation" WHERE id=$1`, row.id, rawTitle, trimSet);
        expect(sql).toEqual({ bytes: JSON.stringify(expected), hash: result.requestHash, normalized: rawTitle.trim() });
        expect(sql.hash).toBe(createHash("sha256").update(JSON.stringify(expected)).digest("hex"));
      }
    });
  });
  it("retains a counterexample against default btrim, without Unicode normalization", async () => {
    const input = "\ufeff\u00a0Café\u00a0\ufeff";
    const [row] = await prisma.$queryRawUnsafe<Array<{ old: string; corrected: string }>>("SELECT btrim($1::text) AS old,btrim($1::text,$2::text) AS corrected", input, trimSet);
    expect(row.old).not.toBe(input.trim()); expect(row.corrected).toBe(input.trim());
  });
  it.each(["receipt", "reçu-𐐀-🛠️", "x".repeat(191)])("matches the permanent request UUID producer for %s", async receipt => {
    await withFunctions(async tx => {
      const [row] = await tx.$queryRawUnsafe<Array<{ id: string }>>("SELECT pg_temp.correlated_calendar_request_id($1::text) AS id", receipt);
      expect(row.id).toBe(personalCorrelatedCalendarRequestId(receipt));
      expect(row.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });
  });
  it.each([{ text: "\0", code: "22P05" }, { text: "\ud800", code: "22P02" }, { text: "\udfff", code: "22P02" }])("refuses PostgreSQL-unrepresentable JSON string rather than normalizing $text", async ({ text, code }) => {
    // Only escaped JSON enters the wire: a raw invalid UTF-8 parameter could be
    // normalized by the client before PostgreSQL sees it and is not this proof.
    await expect(prisma.$queryRawUnsafe("SELECT $1::jsonb AS value", JSON.stringify({ title: text }))).rejects.toMatchObject({ code: "P2010", meta: { code } });
  });
  it.each([null, [], {}, { title: "x", startsAt: "x", endsAt: "x", timezone: "x", requestId: "x", accountVersion: "1" }].map(bad => ({ bad })))("refuses malformed six-field envelope $bad", async ({ bad }) => {
    await expect(withFunctions(async tx => { await tx.$queryRawUnsafe("SELECT pg_temp.correlated_calendar_request_json($1::jsonb)", JSON.stringify(bad)); }))
      .rejects.toThrow("CORRELATED_CALENDAR_REQUEST_SHAPE_REQUIRED");
  });
  it.each([0, -1, 1.2, 2147483648])("refuses nonpositive/noninteger/out-of-range account version %s", async accountVersion => {
    await expect(withFunctions(async tx => { await tx.$queryRawUnsafe("SELECT pg_temp.correlated_calendar_request_json($1::jsonb)",
      JSON.stringify({ title: "x", startsAt: "x", endsAt: "x", timezone: "x", requestId: "x", accountVersion })); }))
      .rejects.toThrow("CORRELATED_CALENDAR_ACCOUNT_VERSION_REQUIRED");
  });
});
