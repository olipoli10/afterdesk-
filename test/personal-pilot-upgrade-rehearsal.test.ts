import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { legacyCounts, proofTables, migration77Body, privatePrismaConfig, snapshotSql, stageMigrationRehearsal,
  verifyBaseline, verifyUpgrade, verifyInstalledPrisma } from '../specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs';

const root = process.cwd();
const catalog = buildPilotMigrationCatalog(root);
const body77 = migration77Body(readFileSync(resolve(root, catalog.entries[76].relativePath), 'utf8'));
const harness = readFileSync(resolve(root, 'specs/210-personal-live-activation/validate-postgres-native.ps1'), 'utf8');
const runner = readFileSync(resolve(root, 'specs/210-personal-live-activation/check-local.mjs'), 'utf8');
const helper = readFileSync(resolve(root, 'specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs'), 'utf8');
const seed = readFileSync(resolve(root, 'specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql'), 'utf8');
const added: Record<string, Record<string, unknown>> = { AiOperation: { personalAssistantOperationId: null },
  PersonalAssistantOperation: { sourcePersonalOperationId: null, modelGatewayOperationId: null, correlatedTemporalReceiptId: null },
  VoiceIntakeSession: { subjectKind: 'voice_intake', requestedByUserId: null, workspaceId: null, projectId: null, intakeId: null,
    projectBrainSourceId: null, requestCommandId: null, sourceBinding: null, sourceBindingHash: null, segmentManifest: null, segmentManifestHash: null } };
function fixture() {
  // Comparator fixtures only. These objects are NOT rows inserted into PostgreSQL.
  const rows = Object.fromEntries(Object.entries(legacyCounts).map(([table, count]) => [table,
    Array.from({ length: count }, (_, i) => ({ id: `${table}-${i}`, result: { prior: 'é 🏗️' }, createdAt: '2026-03-08T02:30:00' } as Record<string, unknown>))]));
  const history = catalog.entries.map((entry: { migrationName: string; sha256: string }, i: number) => ({ id: `actual-history-placeholder-${i}`, migration_name: entry.migrationName,
    checksum: entry.sha256, started_at: '2026-09-10T20:00:00Z', finished_at: '2026-09-10T20:00:01Z', rolled_back_at: null, logs: null, applied_steps_count: 1 }));
  const defaults: Record<string, string> = {};
  const sql74 = readFileSync(resolve(root, catalog.entries[73].relativePath), 'utf8');
  for (const match of sql74.matchAll(/ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" SET DEFAULT/g)) defaults[`${match[1]}.${match[2]}`] = "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text)";
  defaults['VoiceIntakeSession.createdAt'] = defaults['VoiceIntakeSegment.createdAt'] = "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text)";
  const constraints: Record<string, boolean> = Object.fromEntries(['ai_operation_personal_subject_ck', 'voice_pb_exclusive_subject_ck',
    'voice_pb_source_tenant_fkey', 'personal_correlated_calendar_operation_receipt_fk', 'sms_correlated_approval_review_fk', 'sms_correlated_approval_shape_check'].map(name => [name, true]));
  const triggers: Record<string, string> = Object.fromEntries(['sms_correlated_approval_guard', 'sms_correlated_approval_no_truncate',
    'sms_correlated_approval_operation_guard', 'sms_correlated_approval_final_binding', 'sms_correlated_approval_operation_final'].map(name => [name, 'O']));
  const indexes: Record<string, boolean> = Object.fromEntries(['sms_conversation_one_active_pair', 'voice_pb_one_session_per_source_key',
    'sms_correlated_approval_review_key', 'sms_correlated_approval_operation_key', 'sms_correlated_approval_token_key'].map(name => [name, true]));
  return { before: { tables: rows, history: structuredClone(history.slice(0, 70)) }, after: {
    tables: Object.fromEntries(Object.entries(rows).map(([table, values]) => [table, values.map(row => ({ ...structuredClone(row), ...added[table] }))])),
    history: structuredClone(history), proofCounts: Object.fromEntries(proofTables.map(name => [name, 0])), defaults,
    constraints, triggers, indexes, invalidIndexes: 0, invalidTriggers: 0, dispatchBody: body77 } };
}
describe('populated upgrade rehearsal — pure/static, no database or provider', () => {
  it('accepts only the modeled exact additive change, without claiming PG18 or deployment', () => {
    const { before, after } = fixture();
    expect(verifyBaseline(before, catalog)).toBe(true);
    expect(verifyUpgrade(before, after, catalog, body77)).toMatchObject({ baselineCount: 70, finalCount: 79,
      historicalRowsPreserved: true, newProofTablesEmpty: true, remotePg18Verified: false, deploymentAuthorized: false, providerCallsAuthorized: false });
  });
  it.each(Object.keys(legacyCounts))('refuses a changed old nested value in %s', table => {
    const { before, after } = fixture(); after.tables[table][0].result = { prior: 'é 🏗️' };
    expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow('LEGACY_DATA_CHANGED');
  });
  it('refuses a missing populated seed table row before clone', () => {
    const { before } = fixture(); before.tables.PersonalAssistantOperation.pop();
    expect(() => verifyBaseline(before, catalog)).toThrow('SEED_COUNT');
  });
  it('refuses a schema79 field already present at baseline70', () => {
    const { before } = fixture(); before.tables.AiOperation[0].personalAssistantOperationId = null;
    expect(() => verifyBaseline(before, catalog)).toThrow('NOT_BASELINE_70');
  });
  it('preserves entire original migration records, not just their count or checksum', () => {
    const { before, after } = fixture(); after.history[0].id = 'changed-history-id';
    expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow('HISTORICAL_MIGRATION_CHANGED');
  });
  it('rejects unfinished or wrongly hashed real history rather than treating it as applied', () => {
    const { before } = fixture(); before.history[0].checksum = '0'.repeat(64);
    expect(() => verifyBaseline(before, catalog)).toThrow('HISTORY_MISMATCH');
    before.history[0].checksum = catalog.entries[0].sha256; before.history[0].finished_at = '';
    expect(() => verifyBaseline(before, catalog)).toThrow('HISTORY_MISMATCH');
  });
  it.each(proofTables)('refuses any newly manufactured proof in %s', table => {
    const { before, after } = fixture(); after.proofCounts[table] = 1;
    expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow('PROOF_CREATED');
  });
  it('does not accept a UTC-looking but shifted default', () => {
    const { before, after } = fixture(); after.defaults['AiOperation.createdAt'] += " + interval '1 hour'";
    expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow('UTC_DEFAULTS');
  });
  it('compares the complete77 function body, not an ELSIF substring', () => {
    const { before, after } = fixture(); after.dispatchBody = "-- ELSIF TG_TABLE_NAME\nBEGIN RETURN NEW; END";
    expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow('SCHEMA_GUARDS');
  });
  it('rejects missing or disabled invariant guards and invalid indexes', () => {
    for (const mutate of [(v: ReturnType<typeof fixture>['after']) => { delete v.constraints.sms_correlated_approval_review_fk; },
      (v: ReturnType<typeof fixture>['after']) => { v.triggers.sms_correlated_approval_guard = 'D'; },
      (v: ReturnType<typeof fixture>['after']) => { v.invalidIndexes = 1; },
      (v: ReturnType<typeof fixture>['after']) => { delete v.indexes.sms_conversation_one_active_pair; }]) {
      const { before, after } = fixture(); mutate(after);
      expect(() => verifyUpgrade(before, after, catalog, body77)).toThrow(/CONSTRAINTS|SCHEMA_GUARDS/);
    }
  });
  it('private Prisma config pins both absolute paths and contains no seed/dotenv hook', () => {
    const config = privatePrismaConfig(resolve(root, 'private/schema.prisma'), resolve(root, 'private/70/migrations'));
    expect(config).toContain('migrations:{path:'); expect(config).not.toMatch(/dotenv|seed|datasource/);
    expect(() => privatePrismaConfig('relative.prisma', resolve(root))).toThrow('CONFIG_PATH');
  });
  it('refuses staging outside the exact owned cluster shape before writing', () => {
    expect(() => stageMigrationRehearsal(root, root)).toThrow('CLUSTER_PATH');
  });
  it('reads the approved installed Prisma manifest without executing or changing shared dependencies', () => {
    expect(verifyInstalledPrisma(root)).toMatchObject({ version: '6.19.3', readOnly: true });
  });
  it('uses read-only whole-row queries, the real ledger and physical table names', () => {
    expect(snapshotSql()).toContain('to_jsonb(t)'); expect(snapshotSql()).toContain('FROM "_prisma_migrations" m');
    expect(snapshotSql(true)).toContain('"PersonalSmsConversationExpectation"');
    expect(snapshotSql(true)).not.toMatch(/INSERT|UPDATE|DELETE|TRUNCATE/);
    expect(seed).not.toContain('_prisma_migrations'); expect(seed).toContain('BEGIN;'); expect(seed).toContain('COMMIT;');
    expect(seed).toContain("'revoked'"); expect(seed).toContain('250000'); expect(seed).not.toMatch(/INSERT INTO "ConstructionConnectorCredential"/);
  });
  it('has exactly two real migration phases only in explicit rehearsal mode', () => {
    const start = harness.indexOf('if ($MigrationRehearsal) {');
    const end = harness.indexOf('# BEGIN_DEFAULT_MIGRATED_TEMPLATE_SUITE');
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const branch = harness.slice(start, end);
    expect(branch.match(/'migrate', 'deploy'/g)).toHaveLength(2);
    const phases = ['REHEARSAL_STAGE', 'REHEARSAL_MIGRATE_70', 'REHEARSAL_SEED_70', 'REHEARSAL_SNAPSHOT_70',
      'REHEARSAL_SEAL_70', 'REHEARSAL_CLONE_70', 'REHEARSAL_MIGRATE_79', 'REHEARSAL_SNAPSHOT_79', 'REHEARSAL_VERIFY'];
    phases.forEach((phase, i) => expect(branch.indexOf(phase)).toBeGreaterThan(i ? branch.indexOf(phases[i - 1]) : -1));
    expect(branch).toContain('Get-NativeCampaignRemainingMs $taskRehearsalClock 120000');
    expect(branch).toContain("'baseline', $taskCluster"); expect(branch).toContain('PERSONAL_NATIVE_REHEARSAL_SNAPSHOT_CHANGED');
    expect(branch).not.toContain('vitest');
    expect(harness).not.toMatch(/DROP DATABASE|migrate.{0,10}reset|pg_terminate_backend/);
  });
  it('keeps default twenty-suite inventory and refuses a rehearsal test filter', () => {
    expect(readdirSync(resolve(root, 'specs/210-personal-live-activation')).filter(name => name.endsWith('.postgres.test.ts'))).toHaveLength(20);
    expect(harness).toContain('if ($MigrationRehearsal -and $TestFile)');
    expect(runner).toContain("process.argv[5] === '--migration-rehearsal'");
    expect(runner).toContain('migrationRehearsal && process.argv.length !== 6');
    expect(runner).toContain("args.push('-MigrationRehearsal')");
    expect(helper).toContain("installed.version !== '6.19.3'");
    expect(harness).toContain("'-m', 'fast', '-w', '-t', '45', 'stop') 'stop' 55000");
  });
});
