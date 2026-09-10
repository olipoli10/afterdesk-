import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static contract assertions only. Native PostgreSQL must separately exercise
// syntax, final-state guards, schema types and concurrent visibility.
const sql = readFileSync("prisma/migrations/20260910160000_sms_correlated_calendar_review/migration.sql", "utf8");
const prisma = readFileSync("prisma/schema.prisma", "utf8");
describe("forward78 correlated calendar provenance migration contract", () => {
  it("adds scoped receipt uniqueness and two independent permanent one-to-one bindings", () => {
    expect(sql).toContain('UNIQUE (id,"workspaceId","userId")');
    expect(sql).toContain('"PersonalAssistantOperation_correlatedTemporalReceiptId_key"');
    expect(sql).toContain('"PersonalSmsCorrelatedCalendarReview_receiptId_key"');
    expect(sql).toContain('"PersonalSmsCorrelatedCalendarReview_calendarOperationId_key"');
    // Prisma's formatter aligns fields. Keep exact field/type/attribute tokens,
    // but do not mistake horizontal spacing for a schema contract change.
    expect(prisma).toMatch(/^[ \t]*correlatedTemporalReceiptId[ \t]+String\?[ \t]+@unique[ \t]*\r?$/m);
    expect(prisma).toMatch(/^[ \t]*correlatedCalendarReview[ \t]+PersonalSmsCorrelatedCalendarReview\?[ \t]+@relation\("CorrelatedCalendarDraft"\)[ \t]*\r?$/m);
    for (const name of ["sms_correlated_calendar_marker_scope_key", "sms_correlated_calendar_receipt_scope_key", "sms_correlated_calendar_draft_scope_key"]) {
      expect(sql).toContain(`CREATE UNIQUE INDEX ${name}`); expect(prisma).toContain(`map: "${name}"`);
    }
  });
  it("uses restrictive composite owner scopes, not immutable FKs to current grant versions", () => {
    for (const kind of ["receipt", "question", "original", "reply", "child", "calendar", "gateway", "account"])
      expect(sql).toContain(`personal_correlated_calendar_review_${kind}_fk`);
    expect(sql).not.toMatch(/FOREIGN KEY[^;]*stateVersion/i);
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });
  it("requires insert-only marker and initial pending/no-effect/no-budget state", () => {
    expect(sql).toContain('NEW."correlatedTemporalReceiptId" IS DISTINCT FROM OLD."correlatedTemporalReceiptId"');
    expect(sql).toContain("CORRELATED_CALENDAR_MARKER_IMMUTABLE");
    expect(sql).toContain('NEW."budgetId" IS NOT NULL OR NEW."reservedCadMicros" IS NOT NULL');
    expect(sql).toContain('NEW."externalTransportPerformed" IS DISTINCT FROM false');
    expect(sql).toContain("CORRELATED_CALENDAR_FINAL_PENDING_CHANGED");
  });
  it("defers both sides and reloads exact current rows, not a polymorphic stale NEW", () => {
    expect(sql.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(sql).toContain("IF TG_TABLE_NAME='PersonalSmsCorrelatedCalendarReview' THEN");
    expect(sql).toContain("ELSIF TG_TABLE_NAME='PersonalAssistantOperation' THEN");
    expect(sql).toContain('v."calendarOperationId" IS DISTINCT FROM NEW.id');
    expect(sql).toContain('SELECT * INTO v FROM "PersonalSmsCorrelatedCalendarReview" WHERE id=NEW.id');
  });
  it("forces DB UTC creation and one final precise clock with exact pilot pins", () => {
    expect(sql).toContain('NEW."createdAt":=date_trunc(\'milliseconds\',clock_timestamp() AT TIME ZONE \'UTC\')');
    expect(sql).toContain("final_clock:=clock_timestamp() AT TIME ZONE 'UTC'");
    expect(sql).toContain('v."createdAt">final_clock OR final_clock>=v."preparationExpiresAt"');
    expect(sql).toContain('least(q."expiresAt",v."pilotExpiresAt")');
    expect(sql).toContain("TIMESTAMP '2026-10-10 01:18:26'");
  });
  it("pins eight proof keys and the exact actual receipt producer rather than invented certification", () => {
    expect(sql).toContain("ARRAY['version','receiptProofVersion','inspectedReceiptProofHash','titleNormalization','draft','executionAuthorized','semanticInterpretationVerified','sourceAuthority']");
    expect(sql).toContain("'originalPacket',r.packet,'resolution',r.packet");
    expect(sql).toContain("'sourceAuthority','NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT'");
    expect(sql).toContain("CORRELATED_CALENDAR_PROOF_PACKET_CHANGED");
  });
  it("binds real two-source packet/citations to the original exact raw candidate and answer", () => {
    expect(sql).toContain("r.packet#>'{evidence,citations}' IS DISTINCT FROM r.packet->'citations'");
    for (const key of ["title", "originalStart", "originalEnd"]) expect(sql).toContain(`r.packet#>'{citations,${key}}' IS DISTINCT FROM`);
    expect(sql).toContain("r.packet#>'{citations,answer}'=jsonb_build_object");
    expect(sql).toContain("sms_correlated_calendar_utf16_length(answer.request->>'body')");
    expect(sql).toContain("r.packet#>'{sources,1}'=jsonb_build_object");
  });
  it("does not rewrite old histories, grant epochs, request hashes or reserve costs", () => {
    expect(sql).not.toMatch(/UPDATE\s+"(?:PersonalAssistantOperation|AiOperation|PersonalSmsTemporalClarification|AccountProviderSpendHold)"\s+SET/);
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE TABLE|INSERT INTO "(?:AiOperation|PersonalAssistantBudget|ModelGatewayOperation)"/);
    expect(sql).toContain("NEW.request,NEW.\"requestHash\",NEW.\"idempotencyKey\"");
  });
});
