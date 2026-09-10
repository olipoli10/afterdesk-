import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), configure: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mock.transaction } }));
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";
import { selectPersonalAutomaticOutboundCandidates as select } from "@/server/personal-assistant/outbound-queue";
const env = () => ({ ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY, ENDVERA_EXTERNAL_OWNER_REF: "synthetic",
  ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: "synthetic", TWILIO_API_KEY_SID: "synthetic", TWILIO_API_KEY_SECRET: "synthetic",
  TWILIO_AUTH_TOKEN: "synthetic", TWILIO_PHONE_NUMBER: "+15005550006", ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
  ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z",
  ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "true" });
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T14:00:00Z"));
  mock.query.mockResolvedValue([]); mock.configure.mockResolvedValue(1);
  mock.transaction.mockImplementation(work => work({ $queryRawUnsafe: mock.query, $executeRawUnsafe: mock.configure }));
});
afterEach(() => vi.useRealTimers());
const captured = () => mock.query.mock.calls[0][0] as string;

describe("temporal scheduling hints filter before LIMIT without downgrading attachment authority", () => {
  it("global attachment absence, not actor-filtered absence, gates ordinary fallback", async () => {
    await select({ enabled: true, limit: 1 }, env()); const sql = captured();
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "PersonalSmsTemporalClarification" attached WHERE attached."questionOutboundOperationId"=o.id)');
    const fallback = sql.slice(sql.indexOf("NOT EXISTS (SELECT 1 FROM \"PersonalSmsTemporalClarification\" attached"), sql.indexOf("OR ($6"));
    expect(fallback).not.toContain("workspaceId"); expect(fallback).not.toContain("userId");
    expect(sql.indexOf("OR ($6")).toBeLessThan(sql.indexOf('ORDER BY o."createdAt",o.id LIMIT $1'));
    expect(sql).toContain("o.\"idempotencyKey\"='reply:'||s.id AND o.request->>'text'=s.result->>'reply'");
  });
  it.each(["ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED"])("OFF %s still checks attachments but passes false eligibility", async flag => {
    await select({ enabled: true }, { ...env(), [flag]: "false" });
    expect(mock.query.mock.calls[0][6]).toBe(false); expect(captured()).toContain('attached."questionOutboundOperationId"=o.id');
  });
  it.each([{ ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "TRUE" }, { ENDVERA_EXTERNAL_AUTHORITY_REF: "other" },
    { ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T02:00:00Z" }])("does not select attached questions on mismatched explicit gates %j", async flags => {
    await select({ enabled: true }, { ...env(), ...flags }); expect(mock.query.mock.calls[0][6]).toBe(false);
  });
  it("binds current valid gates and model authority scope as SQL parameters", async () => {
    await select({ enabled: true }, env()); expect(mock.query.mock.calls[0][6]).toBe(true);
    expect(mock.query.mock.calls[0][7]).toBe(`authority:${PERSONAL_MODEL_AUTHORITY}`);
  });
  it("requires exact PREPARED source/hash/wire/review and active shared ledger before LIMIT", async () => {
    await select({ enabled: true }, env()); const sql = captured();
    for (const fragment of ['q."questionOutboundOperationId"=o.id', 'q."workspaceId"=o."workspaceId"', 'q."userId"=o."createdByUserId"', 'q."sourceOperationId"=s.id',
      "q.phase='PREPARED'", 'q."expiresAt">(clock_timestamp() AT TIME ZONE \'UTC\')', 'q."acceptedAt" IS NULL', 'q."failedAttempts"=0',
      'q."questionRequestHash"=o."requestHash"', "o.request->>'text'=q.prepared->>'wireText'", "s.result->'personalModelReview'=q.\"reviewSnapshot\"",
      "s.\"requestHash\"=q.prepared#>>'{source,requestHash}'", "s.request->>'body'=q.prepared#>>'{source,body}'",
      "qe.id='temporal:'||q.id", 'qe."clarificationId"=q.id', "qe.kind='TEMPORAL_CLARIFICATION'", 'qe.namespace=q.namespace AND qe.active']) {
      expect(sql).toContain(fragment); expect(sql.indexOf(fragment)).toBeLessThan(sql.indexOf('ORDER BY o."createdAt",o.id LIMIT $1'));
    }
  });
  it("filters definitive owner/identity/workspace epochs and current number uniqueness", async () => {
    await select({ enabled: true }, env()); const sql = captured();
    for (const fragment of ['w."ownerUserId"=q."userId"', "w.\"defaultTimezone\"=q.prepared#>>'{binding,timezone}'", "'{binding,workspaceRevision}'", "'{binding,memberRevision}'", "'{binding,identityRevision}'",
      "qm.status='active' AND qm.role='owner'", "qi.status='active' AND qi.channel='sms' AND qi.verified=true", "'COMMAND'=ANY(qi.permissions)",
      "qi.id=s.request->>'identityId'", "qi.\"normalizedAddress\"=o.request->>'to'", "other_identity.id<>qi.id", "other_workspace.status='active'"]) expect(sql).toContain(fragment);
    expect(sql).not.toMatch(/prepared#>>[^\n]+::(?:timestamp|integer|int\b)/);
  });
  it("filters definitively revoked credentials and versioned SMS/model/calendar grants", async () => {
    await select({ enabled: true }, env()); const sql = captured();
    for (const fragment of ["qs.capability='sms_inbound'", "qs.\"revokedAt\" IS NULL", "'{binding,smsAccountVersion}'", "'{binding,smsInboundGrantVersion}'",
      "qc.kind='personal_model_candidate_v1' AND qc.status='completed' AND qc.attempts=1", 'qc."modelGatewayOperationId"=q."modelGatewayOperationId"',
      "qa.provider='openrouter' AND qa.status='connected'", 'qa."revokedAt" IS NULL AND qac."revokedAt" IS NULL', "'{binding,modelAccountVersion}'", "'{binding,modelGrantVersion}'",
      "qag.capability='personal_model_inference' AND qag.status='active'", 'qag."revokedAt" IS NULL', "'personal_data:inference'=ANY(qag.\"grantedScopes\")", '$7=ANY(qag."grantedScopes")',
      "qg.provider='google_calendar' AND qg.status='connected'", 'qg."revokedAt" IS NULL AND qgc."revokedAt" IS NULL', "'{binding,calendarAccountVersion}'", "'{binding,calendarWriteGrantVersion}'",
      "qgg.capability='calendar_write' AND qgg.status='active'", 'qgg."revokedAt" IS NULL', '$5=ANY(qg."grantedScopes")', '$5=ANY(qgg."grantedScopes")']) expect(sql).toContain(fragment);
    expect(sql).not.toContain("ciphertext");
  });
  it.each(["ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED", "ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED"])("withholds results if %s changes during query", async flag => {
    const flags = env(); mock.query.mockImplementation(async () => { flags[flag as keyof typeof flags] = "false"; return [{ id: "q", idempotencyKey: "reply:s" }]; });
    await expect(select({ enabled: true }, flags)).rejects.toThrow("DISABLED");
  });
  it("OFF-to-ON during SQL cannot retroactively authorize selected hints", async () => {
    const flags = { ...env(), ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED: "false" };
    mock.query.mockImplementation(async () => { flags.ENDVERA_SMS_TEMPORAL_CLARIFICATION_BRIDGE_ENABLED = "true"; return []; });
    await expect(select({ enabled: true }, flags)).rejects.toThrow("DISABLED");
  });
  it("retains existing bounded non-authorizing immutable result and ordinary branch", async () => {
    mock.query.mockResolvedValue([{ id: "ordinary", idempotencyKey: "reply:source" }]);
    const result = await select({ enabled: true, limit: 1 }, env());
    expect(result).toEqual({ status: "CANDIDATES_NOT_AUTHORIZED", executionAuthorized: false, candidates: [{ id: "ordinary", idempotencyKey: "reply:source" }] });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.candidates[0])).toBe(true);
    expect(mock.query.mock.calls[0][1]).toBe(1);
  });
  it("does not introduce mutations, credential reads or dispatcher substitution", () => {
    const source = readFileSync("src/server/personal-assistant/outbound-queue.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|UPDATE |INSERT |DELETE |TRUNCATE |FOR UPDATE|ciphertext|inspectTemporalOutboundSourceInTransaction\(/);
  });
});
