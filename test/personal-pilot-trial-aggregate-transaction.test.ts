import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { compareSuppliedPilotSchemaSnapshots } from '../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs';
import * as builder from '../specs/210-personal-live-activation/deployment/pilot-data-preservation.mjs';
import { buildPilotAggregateTransaction, preparePilotTrialAggregateTransaction } from '../specs/210-personal-live-activation/deployment/pilot-trial-aggregate-transaction.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const H = 'a'.repeat(64), migrations = buildPilotMigrationCatalog(process.cwd());
type Entry = { family: string; key: string[]; properties: Record<string, unknown> };
function fixture(tableName = 'items', columnName = 'message') {
  const objects: Entry[] = [{ family: 'acl', key: ['public', 'SCHEMA', 'public', ''], properties: { owner: 'synthetic_owner', aclHash: null } }];
  for (const [name, columns] of [[tableName, ['id', columnName]], ['_prisma_migrations',
    ['id', 'checksum', 'finished_at', 'migration_name', 'logs', 'rolled_back_at', 'started_at', 'applied_steps_count']]] as const) {
    objects.push({ family: 'table', key: ['public', name], properties: { persistence: 'p', accessMethod: 'heap', replicaIdentity: 'd',
      rls: false, forceRls: false, optionsHash: null, tablespace: null } });
    objects.push({ family: 'acl', key: ['public', 'TABLE', name, ''], properties: { owner: 'synthetic_owner', aclHash: null } });
    columns.forEach((column, i) => {
      objects.push({ family: 'column', key: ['public', name, column], properties: { position: i + 1,
        type: ['pg_catalog', column === 'applied_steps_count' ? 'int4' : column.endsWith('_at') ? 'timestamptz' : 'text'], modifier: -1,
        dimensions: 0, notNull: false, notNullCount: 0, notNullEnforced: null, notNullValidated: null, generated: '', identity: '',
        defaultHash: null, collation: null, collationHash: null, storage: 'x', compression: '', optionsHash: null } });
      objects.push({ family: 'acl', key: ['public', 'COLUMN', name, column], properties: { owner: 'synthetic_owner', aclHash: null } });
    });
  }
  const families = ['table', 'column', 'constraint', 'index', 'function', 'trigger', 'enum', 'acl', 'policy', 'extension', 'unsupported'];
  const catalog70 = { version: 'personal-pilot-schema-snapshot-v1', server: { versionNum: 180003, versionHash: H, encoding: 'UTF8',
    collation: 'C', ctype: 'C', localeProvider: 'c', collationVersion: null, localeHash: null, searchPathHash: H, searchPathSafe: true },
    objectCount: objects.length, familyCounts: Object.fromEntries(families.map(family => [family, objects.filter(x => x.family === family).length])),
    objects, truncated: false };
  return { catalog70, migrationCatalog: migrations, expectedCatalogSha256: compareSuppliedPilotSchemaSnapshots(catalog70, catalog70).leftSha256 };
}
afterEach(() => vi.restoreAllMocks());

describe('aggregate transaction adapter — real builder, supplied synthetic catalog, no SQL execution', () => {
  it('changes only exact BEGIN/COMMIT wrappers, preserving all 13 settings and the complete single aggregate', () => {
    const input = fixture(), original = builder.buildPilotDataPreservationQuery(input), result = buildPilotAggregateTransaction(input);
    expect(result.statementCount).toBe(15); expect(result.statements).toHaveLength(15);
    expect(result.statements[0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    const reconstituted = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
      + result.statements.slice(1, -1).join('\n') + '\n' + result.statements.at(-1) + 'COMMIT;\n';
    expect(reconstituted).toBe(original.sql);
    expect(result.originalQuerySha256).toBe(hash(original.sql));
    expect(result.transactionSha256).toBe(hash(JSON.stringify(result.statements)));
    expect(result.planSha256).toBe(original.planSha256); expect(result.suppliedCatalogSha256).toBe(input.expectedCatalogSha256);
    expect(result.migrationCatalogSha256).toBe(migrations.catalogSha256);
    expect(result).toMatchObject({ tableCount: 2, columnCount: 10, maxRowsPerTable: 500000,
      executionAuthorized: false, databaseRead: false, dataPreservationVerified: false, sourceProvenanceVerified: false,
      backupVerified: false, historical70Authenticated: false });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.statements)).toBe(true);
  });
  it.each(['statement_timeout=\'30000\'', 'lock_timeout=\'2000\'', 'transaction_timeout=\'45000\'', 'work_mem=\'4MB\'',
    'row_security=off', 'search_path=pg_catalog', 'standard_conforming_strings=on'])(
    'preserves exact SET LOCAL %s', setting => expect(buildPilotAggregateTransaction(fixture()).statements).toContain(`SET LOCAL ${setting};`));
  it.each([
    ['items;COMMIT;SELECT 1;--', 'message'], ['a";COMMIT;--', 'b"; SELECT 1;--'], ["owner's; table", "value';ROLLBACK;--"],
    ['e\u0301;表', 'quote";and\'literal'],
  ])('never splits semicolons in quoted names %s / %s', (table, column) => {
    const input = fixture(table, column), result = buildPilotAggregateTransaction(input), original = builder.buildPilotDataPreservationQuery(input);
    expect(result.statements).toHaveLength(15);
    const aggregate = result.statements[14];
    expect(aggregate.startsWith('WITH aggregates AS (')).toBe(true);
    expect(aggregate).toContain(`FROM ONLY "public"."${table.replaceAll('"', '""')}" AS t`);
    expect(aggregate).toContain(`t."${column.replaceAll('"', '""')}" AS "${column.replaceAll('"', '""')}"`);
    expect(original.sql).toContain(aggregate);
    expect(result.statements.slice(0, -1).some((statement: string) => statement.includes(table))).toBe(false);
  });
  it('refuses an arbitrary SQL string, caller plan, source mismatch and extra authority fields', () => {
    for (const value of ['SELECT 1;', { sql: 'SELECT 1;' }, { ...fixture(), expectedCatalogSha256: 'b'.repeat(64) }, { ...fixture(), executionAuthorized: true }]) {
      expect(() => buildPilotAggregateTransaction(value)).toThrow(/^PILOT_TRIAL_AGGREGATE_INPUT_REFUSED$/);
    }
  });
  it('inherits strict getter/proxy rejection from the real builder without invoking traps', () => {
    const value = fixture(), getter = vi.fn(); Object.defineProperty(value, 'catalog70', { get: getter, enumerable: true });
    expect(() => buildPilotAggregateTransaction(value)).toThrow(); expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(); expect(() => buildPilotAggregateTransaction(new Proxy({}, { ownKeys: trap }))).toThrow(); expect(trap).not.toHaveBeenCalled();
  });
  it('does not claim a synthetic catalog is the operational trial input', () => {
    const input = fixture();
    expect(() => preparePilotTrialAggregateTransaction(Buffer.from(JSON.stringify(input.catalog70)), migrations)).toThrow(/^PILOT_TRIAL_AGGREGATE_INPUT_REFUSED$/);
    expect(buildPilotAggregateTransaction(input)).not.toHaveProperty('trialInputPinsMatched');
  });
  it.each([Buffer.alloc(0), Buffer.alloc(5242881), Buffer.from([255]), Buffer.from('{}')])('refuses mismatched or oversized raw trial bytes', bytes => {
    const rebuild = vi.spyOn(builder, 'buildPilotDataPreservationQuery');
    expect(() => preparePilotTrialAggregateTransaction(bytes, migrations)).toThrow(); expect(rebuild).not.toHaveBeenCalled();
  });
});

describe('synthetic future producer-drift guards — not a caller-authored SQL API', () => {
  it.each(['begin', 'commit', 'timeout', 'workmem', 'headerExtra', 'trailing', 'body', 'flags', 'schema', 'rows', 'count', 'hash'])(
    'refuses producer %s changes without relaxing the wrapper', change => {
      const input = fixture(), plan = structuredClone(builder.buildPilotDataPreservationQuery(input));
      if (change === 'begin') plan.sql = plan.sql.replace('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;', 'BEGIN;');
      if (change === 'commit') plan.sql = plan.sql.replace(/COMMIT;\n$/, 'ROLLBACK;\n');
      if (change === 'timeout') plan.sql = plan.sql.replace("statement_timeout='30000'", "statement_timeout='0'");
      if (change === 'workmem') plan.sql = plan.sql.replace("work_mem='4MB'", "work_mem='4GB'");
      if (change === 'headerExtra') plan.sql = plan.sql.replace('WITH aggregates', 'SET LOCAL role=other;\nWITH aggregates');
      if (change === 'trailing') plan.sql += 'SELECT 1;\n';
      if (change === 'body') plan.sql = plan.sql.replace('WITH aggregates AS (', 'SELECT broken FROM (');
      if (change === 'flags') Object.assign(plan, { executionAuthorized: true });
      if (change === 'schema') plan.version = 'other';
      if (change === 'rows') plan.manifest.maxRowsPerTable = 999999;
      if (change === 'count') plan.tableCount++;
      plan.querySha256 = change === 'hash' ? 'f'.repeat(64) : hash(plan.sql);
      vi.spyOn(builder, 'buildPilotDataPreservationQuery').mockReturnValue(plan);
      expect(() => buildPilotAggregateTransaction(input)).toThrow(/^PILOT_TRIAL_AGGREGATE_INPUT_REFUSED$/);
    });
});
