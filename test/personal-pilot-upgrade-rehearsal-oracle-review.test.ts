import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPilotMigrationCatalog } from "../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";
import { legacyCounts, proofTables, migration77Body, snapshotSql, verifyBaseline, verifyUpgrade } from "../specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs";

const root = process.cwd(), catalog = buildPilotMigrationCatalog(root);
const sql77 = readFileSync("prisma/migrations/20260910140000_sms_temporal_trigger_record_dispatch/migration.sql", "utf8");
const body77 = migration77Body(sql77);
const newColumns: Record<string, Record<string, unknown>> = {
  AiOperation: { personalAssistantOperationId: null },
  PersonalAssistantOperation: { sourcePersonalOperationId: null, modelGatewayOperationId: null, correlatedTemporalReceiptId: null },
  VoiceIntakeSession: { subjectKind: "voice_intake", requestedByUserId: null, workspaceId: null, projectId: null, intakeId: null,
    projectBrainSourceId: null, requestCommandId: null, sourceBinding: null, sourceBindingHash: null, segmentManifest: null, segmentManifestHash: null },
};
const defaults = ["AiUsage.createdAt", "AccountProviderSpendHold.createdAt", "AiOperation.createdAt", "ModelGatewayPolicyVersion.createdAt",
  "ModelGatewayRouteProfile.createdAt", "ModelGatewayOperation.createdAt", "ModelGatewayDecision.decidedAt", "ModelGatewayAttempt.startedAt",
  "ModelGatewayBreaker.changedAt", "ModelGatewayBreakerEvent.createdAt", "ModelGatewayAuditEvent.createdAt", "PersonalAssistantOperation.createdAt",
  "PersonalCalendarSmsConfirmationNonce.createdAt", "PersonalCalendarSmsConfirmation.createdAt", "PersonalAssistantBudget.createdAt",
  "PersonalAssistantDeliveryReceipt.createdAt", "VoiceIntakeSession.createdAt", "VoiceIntakeSegment.createdAt"];
const constraints = ["ai_operation_personal_subject_ck", "voice_pb_exclusive_subject_ck", "voice_pb_source_tenant_fkey",
  "personal_correlated_calendar_operation_receipt_fk", "sms_correlated_approval_review_fk", "sms_correlated_approval_shape_check"];
const triggers = ["sms_correlated_approval_guard", "sms_correlated_approval_no_truncate", "sms_correlated_approval_operation_guard",
  "sms_correlated_approval_final_binding", "sms_correlated_approval_operation_final"];
const indexes = ["sms_conversation_one_active_pair", "voice_pb_one_session_per_source_key", "sms_correlated_approval_review_key",
  "sms_correlated_approval_operation_key", "sms_correlated_approval_token_key"];

// Explicit synthetic snapshot objects exercise comparison oracles, NOT SQL
// validity, PostgreSQL execution, remote state or a successfully restored backup.
function fixture() {
  const history = catalog.entries.slice(0, 79).map((e: { migrationName: string; sha256: string }, i: number) => ({ id: `synthetic-${i}`,
    migration_name: e.migrationName, checksum: e.sha256, started_at: "2026-09-10T00:00:00Z", finished_at: "2026-09-10T00:00:01Z",
    rolled_back_at: null, applied_steps_count: 1, logs: null }));
  const tables: Record<string, Array<Record<string, unknown>>> = Object.fromEntries(Object.entries(legacyCounts).map(([table, count]) =>
    [table, Array.from({ length: count as number }, (_, i) => ({ id: `${table}-${i}`, createdAt: "2026-03-08T02:30:00",
      originalNested: { unicode: "é 🏗️", amount: "250000", lease: "2026-01-01T00:00:00" } }))]));
  const before = { tables, history: structuredClone(history.slice(0, 70)) };
  const after = { tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.map(row => ({ ...structuredClone(row), ...newColumns[table] }))])),
    history: structuredClone(history), proofCounts: Object.fromEntries(proofTables.map((table: string) => [table, 0])),
    defaults: Object.fromEntries(defaults.map(key => [key, "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text)"])),
    constraints: Object.fromEntries(constraints.map(key => [key, true])), triggers: Object.fromEntries(triggers.map(key => [key, "O"])),
    indexes: Object.fromEntries(indexes.map(key => [key, true])), invalidIndexes: 0, invalidTriggers: 0, dispatchBody: body77 };
  return { before, after };
}

describe("independent populated70-to79 comparison oracle review — no database", () => {
  it("positive synthetic comparison preserves arbitrary old columns and claims no remote/runtime deployment authority", () => {
    const f = fixture(); expect(verifyBaseline(f.before, catalog)).toBe(true);
    expect(verifyUpgrade(f.before, f.after, catalog, body77)).toMatchObject({ baselineCount: 70, finalCount: 79,
      legacyRowCount: 14, historicalRowsPreserved: true, newProofTablesEmpty: true, remotePg18Verified: false,
      providerCallsAuthorized: false, deploymentAuthorized: false });
  });
  it.each(Object.keys(legacyCounts))("changed old field of %s is detected, not projected away", table => {
    const f = fixture(); f.after.tables[table][0].originalNested = { replaced: true };
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("LEGACY_DATA_CHANGED");
  });
  it("deleting or adding an old-column row cannot pass a same-count projection", () => {
    const f = fixture(); delete f.after.tables.User[0].createdAt;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("LEGACY_DATA_CHANGED");
    const changed = fixture(); changed.after.tables.PersonalAssistantOperation[0].id = "replacement";
    expect(() => verifyUpgrade(changed.before, changed.after, catalog, body77)).toThrow("LEGACY_DATA_CHANGED");
  });
  it("new links must be exact NULL and the historical voice discriminator exact legacy", () => {
    const f = fixture(); f.after.tables.VoiceIntakeSession[0].subjectKind = "project_brain_voice";
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("LEGACY_DATA_CHANGED");
    const marker = fixture(); marker.after.tables.PersonalAssistantOperation[0].correlatedTemporalReceiptId = "fake-receipt";
    expect(() => verifyUpgrade(marker.before, marker.after, catalog, body77)).toThrow("LEGACY_DATA_CHANGED");
  });
  it("a supposed baseline already containing post70 subject columns is refused", () => {
    const f = fixture(); f.before.tables.AiOperation[0].personalAssistantOperationId = null;
    expect(() => verifyBaseline(f.before, catalog)).toThrow("NOT_BASELINE_70");
  });
  it("preserves actual history row IDs/timestamps too, not only names/checksums", () => {
    const f = fixture(); f.after.history[0].id = "different-migration-run";
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("HISTORICAL_MIGRATION_CHANGED");
  });
  it("rejects missing/reordered or only78 final history rows", () => {
    const f = fixture(); f.after.history.pop(); expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("HISTORY_COUNT");
    const swapped = fixture(); [swapped.after.history[71], swapped.after.history[72]] = [swapped.after.history[72], swapped.after.history[71]];
    expect(() => verifyUpgrade(swapped.before, swapped.after, catalog, body77)).toThrow("HISTORY_MISMATCH");
  });
  it.each(["logs", "rolled_back_at", "finished_at", "checksum", "applied_steps_count"])("refuses unsuccessful/new history state %s", key => {
    const f = fixture(); Object.assign(f.after.history[78], { [key]: key === "applied_steps_count" ? 0 : key === "finished_at" ? null : "wrong" });
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("HISTORY_MISMATCH");
  });
  it.each(proofTables)("any seeded or backfilled proof in %s refuses", (table: string) => {
    const f = fixture(); f.after.proofCounts[table] = 1;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("PROOF_CREATED");
  });
  it("missing proof table count does not become an implicit zero", () => {
    const f = fixture(); delete f.after.proofCounts.PersonalSmsConversationExpectation;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("PROOF_CREATED");
  });
  it.each(["(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text) + '01:00:00'::interval", "CURRENT_TIMESTAMP", "'UTC'::text || CURRENT_TIMESTAMP::text"])("rejects wrong UTC-like default %s", expression => {
    const f = fixture(); f.after.defaults["AiOperation.createdAt"] = expression;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("UTC_DEFAULTS");
  });
  it("requires full exact77 function body, not ELSIF token or a true flag", () => {
    const f = fixture(); f.after.dispatchBody = "BEGIN -- ELSIF TG_TABLE_NAME\nRETURN NEW; END";
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("SCHEMA_GUARDS");
    expect(() => verifyUpgrade(f.before, fixture().after, catalog, undefined)).toThrow("SCHEMA_GUARDS");
  });
  it("requires present validated constraints, enabled triggers and ready valid indexes", () => {
    const f = fixture(); delete f.after.constraints.sms_correlated_approval_review_fk;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("CONSTRAINTS");
    const disabled = fixture(); disabled.after.triggers.sms_correlated_approval_guard = "D";
    expect(() => verifyUpgrade(disabled.before, disabled.after, catalog, body77)).toThrow("SCHEMA_GUARDS");
    const invalid = fixture(); invalid.after.invalidIndexes = 1;
    expect(() => verifyUpgrade(invalid.before, invalid.after, catalog, body77)).toThrow("SCHEMA_GUARDS");
  });
  it("missing active namespace index and separately counted invalid triggers cannot be masked by the maps", () => {
    const f = fixture(); delete f.after.indexes.sms_conversation_one_active_pair;
    expect(() => verifyUpgrade(f.before, f.after, catalog, body77)).toThrow("SCHEMA_GUARDS");
    const invalid = fixture(); invalid.after.invalidTriggers = 1;
    expect(() => verifyUpgrade(invalid.before, invalid.after, catalog, body77)).toThrow("SCHEMA_GUARDS");
  });
  it("snapshot reads all old columns, physical proof names and actual Prisma history without writes", () => {
    const before = snapshotSql(false), after = snapshotSql(true);
    expect(before).toContain('to_jsonb(t) ORDER BY id'); expect(before).toContain('to_jsonb(m) ORDER BY migration_name');
    expect(before).not.toContain("proofCounts"); expect(after).toContain('FROM "PersonalSmsConversationExpectation"');
    expect(after).not.toContain("PersonalSmsReplyExpectation"); expect(after).toContain("SELECT prosrc FROM pg_proc");
    for (const sql of [before, after]) expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
    const actual76 = readFileSync("prisma/migrations/20260910130000_sms_temporal_clarification_registry/migration.sql", "utf8");
    expect(actual76).toContain('CREATE TABLE "PersonalSmsConversationExpectation"');
  });
  it("seed uses real old tables and no invented migration-history rows or trigger disable", () => {
    const seed = readFileSync("specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql", "utf8");
    expect(seed).toContain('INSERT INTO "PersonalAssistantBudget"'); expect(seed).toContain('INSERT INTO "VoiceIntakeSession"');
    expect(seed).toContain("'revoked'"); expect(seed).toContain("250000"); expect(seed).toContain("2026-03-08 02:30:00");
    expect(seed).not.toMatch(/_prisma_migrations|DISABLE\s+TRIGGER|session_replication_role|DROP\s+CONSTRAINT|PersonalSmsCorrelatedCalendarApproval/i);
  });
});
