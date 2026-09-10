import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fingerprintCorrelatedCalendarApprovalView, correlatedCalendarApprovalStateSchema, CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, CORRELATED_CALENDAR_APPROVAL_STATE_VERSION } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { deterministicGoogleEventId } from "@/lib/construction-operating-assistant-r3/google-calendar";

// STATIC structure + JS expected vectors only. No SQL was executed here.
const sql = readFileSync("prisma/migrations/20260910180000_sms_correlated_calendar_approval/migration.sql", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const functionBody = (name: string) => {
  const match = sql.match(new RegExp(`CREATE FUNCTION ${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`));
  expect(match, name).not.toBeNull(); return match![1];
};
const view = { version: CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION, scope: { workspaceId: "workspace", userId: "owner" },
  review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
  request: { calendarRequestId: "a912443d-1e19-8185-ba4d-3cbfbb315066", calendarRequestHash: "e5f02375cecd18258c319498c254217335283b91aa5e1e238a843f65d57359a8", connectorAccountId: "google", accountVersion: 1 },
  presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } };

describe("forward79 approval DRAFT — static invariants, not native proof", () => {
  it("preserves the applied78 bytes", () => {
    const previous = readFileSync("prisma/migrations/20260910160000_sms_correlated_calendar_review/migration.sql");
    expect(createHash("sha256").update(previous).digest("hex")).toBe("2517fa32d1d4bb1ef2d8888ea82cf1df09cf0c6fe0c07549de12f447bf8b98ef");
  });
  it("adds one minimal approval table without data adoption or execution", () => {
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(1);
    expect(sql).not.toMatch(/CREATE OR REPLACE|UPDATE\s+"\w+"\s+SET|INSERT INTO|DELETE FROM|TRUNCATE TABLE|SECURITY DEFINER|ENABLE|DISABLE TRIGGER/);
    const table = sql.slice(sql.indexOf("CREATE TABLE"), sql.indexOf("CREATE UNIQUE INDEX sms_correlated_approval_review_key"));
    for (const forbidden of ["ciphertext", "sourceText", "packet JSON", "draft JSON", "approvedByClient", "executionAuthorized"])
      expect(table).not.toContain(forbidden);
  });
  it("has one immutable restrictive scoped FK with matching Prisma singular uniques", () => {
    expect(sql).toContain('FOREIGN KEY ("reviewId","calendarOperationId","workspaceId","userId")');
    expect(sql).toContain('REFERENCES "PersonalSmsCorrelatedCalendarReview"(id,"calendarOperationId","workspaceId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT');
    for (const name of ["sms_correlated_review_approval_scope_key", "sms_correlated_approval_scope_key", "sms_correlated_approval_review_key", "sms_correlated_approval_operation_key", "sms_correlated_approval_token_key"]) {
      expect(sql).toContain(`CREATE UNIQUE INDEX ${name}`); expect(schema).toContain(`map: "${name}"`);
    }
    expect(schema).toContain("approval PersonalSmsCorrelatedCalendarApproval?");
    expect(schema).toContain("references: [id, calendarOperationId, workspaceId, userId]");
    expect(sql).not.toMatch(/FOREIGN KEY[^;]*(?:stateVersion|Grant|Credential)/);
  });
  it("keeps all declared SQL identifiers below PostgreSQL truncation width", () => {
    for (const match of sql.matchAll(/(?:CREATE (?:UNIQUE )?INDEX|CREATE FUNCTION|CREATE (?:CONSTRAINT )?TRIGGER|CONSTRAINT) ([a-z_][a-z_0-9]*)/g))
      expect(Buffer.byteLength(match[1]), match[1]).toBeLessThanOrEqual(63);
  });
  it("forces DB UTC-millisecond approval time and finite original expiry/25s lease", () => {
    const guard = functionBody("sms_correlated_approval_guard");
    expect(guard).toContain('NEW."approvedAt":=date_trunc(\'milliseconds\',clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(sql.match(/TIMESTAMP\(3\) NOT NULL/g)).toHaveLength(3);
    expect(sql).toContain('a."approvalExpiresAt"=least(v."preparationExpiresAt",v."pilotExpiresAt")');
    expect(sql).toContain('a."leaseUntil"<=a."approvedAt"+INTERVAL \'25 seconds\'');
    expect(sql).toContain("TIMESTAMP '2026-10-10 01:18:26'");
    expect(sql).toContain("TIMESTAMP '2026-09-10 01:18:26'");
    expect(sql).not.toMatch(/now\(\)|CURRENT_TIMESTAMP/);
  });
  it("rejects all approval rewrites/deletes/truncate rather than changing grants", () => {
    expect(functionBody("sms_correlated_approval_guard")).toContain("IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CORRELATED_APPROVAL_IMMUTABLE'");
    expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "PersonalSmsCorrelatedCalendarApproval"');
    expect(sql).toContain('BEFORE TRUNCATE ON "PersonalSmsCorrelatedCalendarApproval"');
  });
  it("reconstructs exactly the A view and normalizes only the known JSON number", () => {
    const producer = functionBody("sms_correlated_approval_view"), fingerprint = functionBody("sms_correlated_approval_view_fingerprint");
    for (const field of ["scope", "review", "request", "presentation", "packetHash", "proofHash", "reviewVersion", "accountVersion"])
      expect(producer).toContain(`'${field}'`);
    for (const value of [view.version, ...Object.values(view.presentation)]) expect(producer).toContain(`'${value}'`);
    expect(fingerprint).toContain("ARRAY['version','scope','review','request','presentation']");
    expect(fingerprint).toContain("jsonb_set(v,'{request,accountVersion}',to_jsonb((v#>>'{request,accountVersion}')::numeric::integer))");
    expect(fingerprint).toContain("RETURN sms_temporal_hash(normalized)");
    expect(producer).not.toMatch(/inspectedAt|leaseUntil|approvedAt|createdAt|status/);
    expect(fingerprintCorrelatedCalendarApprovalView(view).fingerprint).toBe("22d5fee446023c13a6c03f23947a78c1b457007729f6050c9e5acae0d0d07f0d");
  });
  it("uses null-safe closed nested view and authority shapes, no unknown __proto__", () => {
    const fingerprint = functionBody("sms_correlated_approval_view_fingerprint");
    for (const object of ["scope", "review", "request"]) expect(fingerprint).toContain(`sms_correlated_calendar_exact_keys(v->'${object}',ARRAY[`);
    expect(fingerprint).toContain("v->'presentation' IS DISTINCT FROM jsonb_build_object");
    const authority = functionBody("sms_correlated_approval_authority_valid");
    expect(authority).toContain("ARRAY['accountId','accountVersion','credentialId','writeGrantId','writeGrantVersion','memberId','memberRole','memberUpdatedAt','workspaceUpdatedAt','accountScopes','grantScopes']");
    expect(authority).toContain("jsonb_typeof(items) IS DISTINCT FROM 'array'");
    expect(authority).toContain("jsonb_array_length(items) NOT BETWEEN 1 AND 30");
    expect(authority).toContain("count(DISTINCT x)");
    expect(authority).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(authority).not.toContain("calendar.events.readonly");
  });
  it("pins exact A pending, confirmed and uncertain unions", () => {
    const state = functionBody("sms_correlated_approval_state_valid");
    expect(state).toContain(CORRELATED_CALENDAR_APPROVAL_STATE_VERSION);
    for (const phase of ["CLAIMED", "DISPATCH_CLAIMED", "CONFIRMED", "UNCERTAIN"]) expect(state).toContain(phase);
    for (const reason of ["WRITE_OUTCOME_UNKNOWN", "CLAIM_LEASE_EXPIRED", "CLAIM_COMMIT_OUTCOME_UNKNOWN", "DISPATCH_COMMIT_OUTCOME_UNKNOWN", "TERMINAL_COMMIT_OUTCOME_UNKNOWN"]) {
      expect(state).toContain(`'${reason}'`);
      expect(correlatedCalendarApprovalStateSchema.safeParse({ version: CORRELATED_CALENDAR_APPROVAL_STATE_VERSION, origin: { kind: "personal_sms_temporal_receipt", approvalId: "90edec1d-4bf4-4a87-a891-f953b526ef78", reviewId: "review", reviewFingerprint: "a".repeat(64) },
        phase: "UNCERTAIN", writeConfirmed: false, reviewRequired: true, automaticRetry: false, reason }).success).toBe(true);
    }
    expect(state).toContain("s->'origin' IS DISTINCT FROM origin");
    expect(state).toContain("'automaticRetry' IS NOT DISTINCT FROM 'false'::jsonb");
    expect(state).not.toMatch(/priorClaimResult|jsonb_path|recursive/i);
  });
  it("binds the terminal Google ID to the existing same canonical input, not a caller ID", () => {
    const id = deterministicGoogleEventId({ workspaceId: "workspace", calendarItemId: view.request.calendarRequestId, idempotencyKey: view.request.calendarRequestId });
    const independentWire = JSON.stringify({ calendarItemId: view.request.calendarRequestId, idempotencyKey: view.request.calendarRequestId, schemaVersion: 1, workspaceId: "workspace" });
    expect(id).toBe(`e${createHash("sha256").update(independentWire).digest("hex").slice(0, 31)}`);
    const state = functionBody("sms_correlated_approval_state_valid");
    expect(state).toContain("'schemaVersion',1,'workspaceId',v.\"workspaceId\",'calendarItemId',v.\"calendarRequestId\",'idempotencyKey',v.\"calendarRequestId\"");
    expect(state).toContain("jsonb_build_object('providerEventId',event_id,'confirmed',true)");
  });
  it("bounds the whole state envelope and checks standalone composite mapping before phases", () => {
    const state = functionBody("sms_correlated_approval_state_valid");
    expect(state).toContain("octet_length(convert_to(sms_temporal_canonical_json(s),'UTF8'))>32768");
    for (const [approval, review] of [["reviewId", "id"], ["calendarOperationId", '"calendarOperationId"'], ["workspaceId", '"workspaceId"'], ["userId", '"userId"']])
      expect(state).toContain(`a."${approval}" IS DISTINCT FROM v.${review}`);
    expect(state).toContain('a."reviewFingerprint" IS DISTINCT FROM sms_correlated_approval_view_fingerprint(sms_correlated_approval_view(v))');
    expect(state.indexOf("sms_temporal_canonical_json(s)")).toBeLessThan(state.indexOf("IF s->>'phase'"));
  });
  it("checks current owner/write authority real columns without taking reversed locks", () => {
    const current = functionBody("sms_correlated_approval_authority_current");
    expect(current).toContain('w."ownerUserId"=a."userId"'); expect(current).toContain("m.status='active' AND m.role='owner'");
    expect(current).toContain("g.capability='calendar_write'");
    expect(current).toContain('k.id=c."credentialRef"');
    expect(current).toContain('c."revokedAt" IS NULL AND k."revokedAt" IS NULL');
    expect(current).toContain('a."writeAuthority"=jsonb_build_object');
    expect(current).not.toMatch(/FOR (?:UPDATE|SHARE)|advisory|ciphertext/);
    expect(sql).not.toMatch(/pg_(?:try_)?advisory|FOR (?:UPDATE|SHARE)/);
  });
  it("uses real Prisma field names for every alias in the current-authority join", () => {
    const current = functionBody("sms_correlated_approval_authority_current");
    for (const [alias, model] of Object.entries({ w: "ConstructionWorkspace", m: "ConstructionWorkspaceMember", c: "ConstructionConnectorAccount", k: "ConstructionConnectorCredential", g: "ConstructionConnectorGrant", a: "PersonalSmsCorrelatedCalendarApproval", v: "PersonalSmsCorrelatedCalendarReview" })) {
      const body = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))![1];
      for (const match of current.matchAll(new RegExp(`\\b${alias}\\.(?:"([^"]+)"|([a-zA-Z]+))`, "g")))
        expect(body, `${model}.${match[1] ?? match[2]}`).toMatch(new RegExp(`\\n\\s+${match[1] ?? match[2]}\\s`));
    }
  });
  it("routes any global marker/relation/approval through typed restrictions", () => {
    const guard = functionBody("sms_correlated_approval_operation_guard");
    for (const table of ["PersonalSmsCorrelatedCalendarReview", "PersonalSmsCorrelatedCalendarApproval"])
      expect(guard).toContain(`NOT EXISTS(SELECT 1 FROM "${table}" WHERE "calendarOperationId"=target)`);
    expect(guard).toContain('NEW."correlatedTemporalReceiptId" IS NULL');
    expect(guard).toContain("CORRELATED_APPROVAL_REQUIRED");
    expect(guard).toContain("CORRELATED_APPROVAL_TERMINAL_IMMUTABLE");
    expect(guard).toContain("CORRELATED_APPROVAL_DISPATCH_ONCE");
    expect(guard).toContain("NEW.attempts IS DISTINCT FROM 1");
  });
  it("requires same-transaction insertion+exact claim and two deferred final row reads", () => {
    expect(sql.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    const final = functionBody("sms_correlated_approval_final_binding");
    expect(final).toContain('SELECT * INTO a FROM "PersonalSmsCorrelatedCalendarApproval" WHERE id=NEW.id');
    expect(final).toContain('SELECT * INTO o FROM "PersonalAssistantOperation" WHERE id=a."calendarOperationId"');
    expect(final).toContain("IF inserted AND (o.status IS DISTINCT FROM 'processing' OR o.result->>'phase' IS DISTINCT FROM 'CLAIMED'");
    expect(final.indexOf("final_clock:=" )).toBeGreaterThan(final.indexOf("sms_correlated_approval_authority_current"));
    expect(final).toContain('final_clock>=a."leaseUntil" OR final_clock>=a."approvalExpiresAt"');
  });
  it("keeps expiry recovery bookkeeping free of current authority and new leases", () => {
    const guard = functionBody("sms_correlated_approval_operation_guard"), start = guard.indexOf("ELSIF NEW.status='uncertain'"), end = guard.indexOf("RETURN NEW; -- Bookkeeping", start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const recovery = guard.slice(start, end);
    expect(recovery).toContain('NEW."leaseUntil" IS NOT NULL');
    expect(recovery).toContain("NEW.result->>'reason'='CLAIM_LEASE_EXPIRED' AND final_clock<a.\"leaseUntil\"");
    expect(recovery).not.toContain("authority_current");
  });
  it("uses fixed serializable snapshot tuple order, never inferred subtransaction commit status", () => {
    const before = functionBody("sms_correlated_approval_pre_snapshot");
    expect(before).toContain("current_setting('transaction_isolation')<>'serializable'");
    expect(before).toContain("age(row_xmin)>age(pg_snapshot_xmax(pg_current_snapshot())::xid)");
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/pg_xact_status\(|pg_visible_in_snapshot\(|pg_current_xact_id\(/);
    expect(sql).toContain("sms_correlated_approval_pre_snapshot(review_xmin) IS DISTINCT FROM true");
    expect(sql).toContain("sms_correlated_approval_pre_snapshot(approval_xmin) IS DISTINCT FROM false");
    expect(sql).toContain("sms_correlated_approval_pre_snapshot(approval_xmin) IS DISTINCT FROM true");
    expect(sql).toContain("sms_correlated_approval_pre_snapshot(operation_xmin) IS DISTINCT FROM true");
  });
});
