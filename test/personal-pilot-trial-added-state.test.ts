import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildPilotTrialAddedStateQuery, inspectSuppliedPilotTrialAddedState,
  PILOT_TRIAL_ADDED_STATE_INVENTORY } from '../specs/210-personal-live-activation/deployment/pilot-trial-added-state.mjs';

const inventory = PILOT_TRIAL_ADDED_STATE_INVENTORY;
const query = buildPilotTrialAddedStateQuery();
const REFUSED = 'PILOT_TRIAL_ADDED_STATE_REFUSED';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function snapshot(count = '1') {
  return { version: query.version, manifestSha256: query.manifestSha256,
    context: { database: 'neondb', role: 'neondb_owner', serverVersionNum: 180006, readOnly: 'on', isolation: 'repeatable read', timeZone: 'UTC' },
    proofTables: inventory.proofTables.map((table: string) => ({ table, rowCountAtMostOne: '0' })),
    legacyTables: inventory.legacyTables.map((rule: { table: string }) => ({ table: rule.table, rowCount: count, invalidRows: '0', truncated: false })) };
}
describe('supplied added-state counts — no database executed', () => {
  it('validates exact complete supplied positive counts with all authority flags false', () => {
    const result = inspectSuppliedPilotTrialAddedState(snapshot());
    expect(result).toMatchObject({ status: 'SUPPLIED_ADDED_STATE_MATCH', proofTableCount: 7, legacyTableCount: 3, addedColumnCount: 15,
      proofTablesEmpty: true, proofCountsAreCappedAtOne: true, nonEmptyProofTables: 0, legacyRowCount: '3', invalidLegacyRows: '0',
      vacuousLegacyTables: [], allLegacyTablesNonEmpty: true, snapshotProvenanceVerified: false, targetBranchVerified: false,
      migrationHistoryVerified: false, oldDataPreservationVerified: false, schemaGuardsVerified: false, utcDefaultsVerified: false,
      fullSchemaEquivalent: false, backupVerified: false, executionAuthorized: false, databaseRead: false });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.legacyTables[0])).toBe(true);
  });
  it('makes all-empty legacy checks explicitly vacuous without claiming nonempty behavior proof', () => {
    const result = inspectSuppliedPilotTrialAddedState(snapshot('0'));
    expect(result.status).toBe('SUPPLIED_ADDED_STATE_MATCH'); expect(result.legacyRowCount).toBe('0');
    expect(result.allLegacyTablesNonEmpty).toBe(false);
    expect(result.vacuousLegacyTables).toEqual(['AiOperation', 'PersonalAssistantOperation', 'VoiceIntakeSession']);
    expect(result.legacyTables.every((row: { vacuous: boolean }) => row.vacuous)).toBe(true);
  });
  it('tracks partial vacuity per table', () => {
    const value = snapshot(); value.legacyTables[2].rowCount = '0';
    expect(inspectSuppliedPilotTrialAddedState(value).vacuousLegacyTables).toEqual(['VoiceIntakeSession']);
  });
  it.each(inventory.proofTables as string[])('reports a nonempty %s as a negative observation, not malformed input or success', (table: string) => {
    const value = snapshot(); value.proofTables.find((row: { table: string }) => row.table === table)!.rowCountAtMostOne = '1';
    expect(inspectSuppliedPilotTrialAddedState(value)).toMatchObject({ status: 'SUPPLIED_ADDED_STATE_VIOLATIONS', nonEmptyProofTables: 1,
      proofTablesEmpty: false, invalidLegacyRows: '0', proofCountsAreCappedAtOne: true });
  });
  it.each(['AiOperation', 'PersonalAssistantOperation', 'VoiceIntakeSession'])('reports legacy violation in %s', table => {
    const value = snapshot('3'); value.legacyTables.find((row: { table: string }) => row.table === table)!.invalidRows = '2';
    expect(inspectSuppliedPilotTrialAddedState(value)).toMatchObject({ status: 'SUPPLIED_ADDED_STATE_VIOLATIONS', invalidLegacyRows: '2', legacyRowCount: '9' });
  });
  it('preserves exact sum of string counts at the boundary', () => {
    const result = inspectSuppliedPilotTrialAddedState(snapshot('500000'));
    expect(result.legacyRowCount).toBe('1500000'); expect(typeof result.legacyRowCount).toBe('string');
  });
  it.each(['-1', '01', '1.0', '1e3', ' 1', '', '500001', '9007199254740993', 'Infinity'])('refuses invalid legacy count %s', count => {
    const value = snapshot(count); expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it.each([null, undefined, 0, 1, true, {}, []])('refuses nonstring count %j', count => {
    const value = snapshot(); Object.assign(value.legacyTables[0], { rowCount: count });
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it.each(['2', '-1', '00', '1.0', '500000'])('refuses false full proof count %s', count => {
    const value = snapshot(); value.proofTables[0].rowCountAtMostOne = count;
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it('refuses impossible violation count or truncation', () => {
    const value = snapshot(); value.legacyTables[0].invalidRows = '2';
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
    value.legacyTables[0].invalidRows = '0'; value.legacyTables[0].truncated = true;
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it.each(['proofTables', 'legacyTables'] as const)('refuses duplicate/missing/extra/unknown %s entries', family => {
    const duplicate = snapshot(); duplicate[family][1] = { ...duplicate[family][0] } as never;
    expect(() => inspectSuppliedPilotTrialAddedState(duplicate)).toThrow(REFUSED);
    const missing = snapshot(); missing[family].pop(); expect(() => inspectSuppliedPilotTrialAddedState(missing)).toThrow(REFUSED);
    const extra = snapshot(); extra[family].push({ ...extra[family][0] } as never); expect(() => inspectSuppliedPilotTrialAddedState(extra)).toThrow(REFUSED);
    const unknown = snapshot(); unknown[family][0].table = 'Unknown'; expect(() => inspectSuppliedPilotTrialAddedState(unknown)).toThrow(REFUSED);
  });
  it('snapshot ordering does not change the normalized result', () => {
    const value = snapshot(); value.proofTables.reverse(); value.legacyTables.reverse();
    expect(inspectSuppliedPilotTrialAddedState(value)).toEqual(inspectSuppliedPilotTrialAddedState(snapshot()));
  });
  it.each(['version', 'manifest', 'db', 'role', 'pg17', 'pg19', 'writable', 'isolation', 'timezone'])('refuses wrong %s context', kind => {
    const value = snapshot();
    if (kind === 'version') value.version = 'wrong';
    if (kind === 'manifest') value.manifestSha256 = '0'.repeat(64);
    if (kind === 'db') value.context.database = 'postgres';
    if (kind === 'role') value.context.role = 'other';
    if (kind === 'pg17') value.context.serverVersionNum = 170011;
    if (kind === 'pg19') value.context.serverVersionNum = 190000;
    if (kind === 'writable') value.context.readOnly = 'off';
    if (kind === 'isolation') value.context.isolation = 'read committed';
    if (kind === 'timezone') value.context.timeZone = 'Asia/Tokyo';
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it('does not adopt later caller mutation or disclose added raw values', () => {
    const value = snapshot(), result = inspectSuppliedPilotTrialAddedState(value);
    value.legacyTables[0].rowCount = '500000';
    expect(result.legacyRowCount).toBe('3'); expect(JSON.stringify(result)).not.toContain('sourceBinding');
    Object.assign(value.legacyTables[0], { raw: 'PRIVATE_TEST_SENTINEL' });
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED);
  });
  it('rejects getter/proxy/prototype/extra fields without invoking accessors', () => {
    const value = snapshot(), getter = vi.fn(); Object.defineProperty(value.context, 'role', { enumerable: true, get: getter });
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED); expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(); expect(() => inspectSuppliedPilotTrialAddedState(new Proxy(snapshot(), { ownKeys: trap }))).toThrow(REFUSED);
    expect(trap).not.toHaveBeenCalled();
    const proto = snapshot(); Object.defineProperty(proto, '__proto__', { enumerable: true, value: null });
    expect(() => inspectSuppliedPilotTrialAddedState(proto)).toThrow(REFUSED);
    expect(() => inspectSuppliedPilotTrialAddedState(Object.assign(snapshot(), { extra: false }))).toThrow(REFUSED);
  });
  it('refuses holes, accessors and an oversized sparse array before inspecting its indexed value', () => {
    const hole = snapshot(); delete hole.proofTables[0]; expect(() => inspectSuppliedPilotTrialAddedState(hole)).toThrow(REFUSED);
    const value = snapshot(), getter = vi.fn(); value.legacyTables.length = 1000000;
    Object.defineProperty(value.legacyTables, '0', { enumerable: true, get: getter });
    expect(() => inspectSuppliedPilotTrialAddedState(value)).toThrow(REFUSED); expect(getter).not.toHaveBeenCalled();
  });
});

describe('fixed SQL/inventory contract — static evidence only', () => {
  it('is deeply frozen, deterministic and never accepts caller SQL/options', () => {
    expect(buildPilotTrialAddedStateQuery()).toBe(query); expect(Object.isFrozen(query.statements)).toBe(true);
    expect(Object.isFrozen(inventory.legacyTables[2].nullColumns)).toBe(true);
    expect(query.querySha256).toBe(hash(query.sql)); expect(query.transactionSha256).toBe(hash(JSON.stringify(query.statements)));
    expect(() => Reflect.apply(buildPilotTrialAddedStateQuery, undefined, [{ sql: 'bad' }])).toThrow(REFUSED);
    expect(Buffer.byteLength(query.sql)).toBeLessThan(16384);
  });
  it('exactly reuses rehearsal proof inventory and added fields without importing its executable module', () => {
    const source = readFileSync('specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs', 'utf8');
    const proof = source.slice(source.indexOf('export const proofTables'), source.indexOf('const added'));
    expect([...proof.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(inventory.proofTables);
    const added = source.slice(source.indexOf('const added'), source.indexOf('const defaults'));
    expect([...added.matchAll(/(\w+): null/g)].map(match => match[1])).toEqual(inventory.legacyTables.flatMap((rule: { nullColumns: string[] }) => rule.nullColumns));
    expect(added).toContain("subjectKind: 'voice_intake'"); expect(query.addedColumnCount).toBe(15);
  });
  it('pins added-column scope to immutable SQL71/72/75/78 rather than synthetic data values', () => {
    const names = ['20260910030000_personal_gateway_subject', '20260910040000_personal_model_gateway_admission',
      '20260910120000_project_brain_voice_sessions_off', '20260910160000_sms_correlated_calendar_review'];
    const actual: string[] = []; let table = '';
    for (const name of names) for (const line of readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8').split('\n')) {
      const changed = line.match(/^ALTER TABLE "([^"]+)"/); if (changed) table = changed[1];
      const column = line.match(/ADD COLUMN "([^"]+)"/); if (column) actual.push(`${table}.${column[1]}`);
    }
    const expected = inventory.legacyTables.flatMap((rule: { table: string; nullColumns: string[]; subjectKind: string | null }) =>
      [...rule.nullColumns, ...(rule.subjectKind ? ['subjectKind'] : [])].map(column => `${rule.table}.${column}`));
    expect(actual.sort()).toEqual(expected.sort());
  });
  it('has one readonly repeatable snapshot, fixed caps and exact connector wrapper', () => {
    expect(query.sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n')).toBe(true);
    expect(query.sql.endsWith('COMMIT;\n')).toBe(true);
    expect(query.statements[0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
    expect('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n' + query.statements.slice(1).join('\n') + '\nCOMMIT;\n').toBe(query.sql);
    for (const setting of ["statement_timeout='30000'", "lock_timeout='2000'", "transaction_timeout='45000'", "idle_in_transaction_session_timeout='5000'",
      'search_path=pg_catalog', 'row_security=off', "TimeZone='UTC'", "work_mem='4MB'"]) expect(query.sql).toContain('SET LOCAL ' + setting);
    expect(query.sql.match(/LIMIT 1\)/g)).toHaveLength(7); expect(query.sql.match(/LIMIT 500001\)/g)).toHaveLength(3);
    expect(query.sql.match(/FROM ONLY public\./g)).toHaveLength(10);
    expect(query.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|COPY|CALL)\b/i);
    expect(query.sql).not.toMatch(/to_jsonb\(t\)|jsonb_agg\(t\)|SELECT \*|RETURNING|pg_get_functiondef/i);
  });
  it('keeps SQL NULL distinct from nonnull JSON null and the voice subject comparison null-safe', () => {
    for (const column of inventory.legacyTables.flatMap((rule: { nullColumns: string[] }) => rule.nullColumns)) expect(query.sql).toContain(`t."${column}" IS NOT NULL`);
    expect(query.sql).toContain('t."subjectKind" IS DISTINCT FROM \'voice_intake\'');
    expect(query.sql).not.toContain('COALESCE'); expect(query.sql).toContain('count(*) FILTER (WHERE invalid)::text');
  });
  it('imports only builtins and does not contain a process/database entrypoint', () => {
    const source = readFileSync('specs/210-personal-live-activation/deployment/pilot-trial-added-state.mjs', 'utf8');
    expect([...source.matchAll(/^import .* from '([^']+)'/gm)].map(match => match[1])).toEqual(['node:crypto', 'node:util']);
    expect(source).not.toMatch(/process\.|spawn\(|readFileSync|writeFileSync|PrismaClient|fetch\(/);
  });
});
