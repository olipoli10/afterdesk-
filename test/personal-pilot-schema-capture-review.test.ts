import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PILOT_SCHEMA_CATALOG_SQL } from '../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs';
import { verifyCatalogCapture } from '../specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs';

const helper = readFileSync('specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs', 'utf8');
const harness = readFileSync('specs/210-personal-live-activation/validate-postgres-native.ps1', 'utf8').replaceAll('\r\n', '\n');
const capture = harness.split('function Save-RehearsalCatalog([string]$Label) {')[1].split("$taskStage = 'REHEARSAL_STAGE'")[0];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const families = ['table','column','constraint','index','function','trigger','enum','acl','policy','extension','unsupported'];
type Entry = { family: string; key: string[]; properties: Record<string, unknown> };
function snapshot() {
  const objects: Entry[] = [{ family: 'acl', key: ['public','SCHEMA','public',''], properties: { owner: 'synthetic', aclHash: null } }];
  return { version: 'personal-pilot-schema-snapshot-v1', server: { versionNum: 170011, versionHash: 'a'.repeat(64), encoding: 'UTF8',
    collation: 'C', ctype: 'C', localeProvider: 'c', collationVersion: null, localeHash: null, searchPathHash: 'b'.repeat(64), searchPathSafe: true },
  objectCount: objects.length, familyCounts: Object.fromEntries(families.map(name => [name, name === 'acl' ? 1 : 0])), objects, truncated: false };
}
function add(value: ReturnType<typeof snapshot>, row: Entry) {
  value.objects.push(row); value.objectCount++; value.familyCounts[row.family]++;
}

describe('independent local catalog capture delta — pure receipts and static wiring, no database', () => {
  it('uses the exact fixed query hash but never authenticates a supplied synthetic snapshot', () => {
    const result = verifyCatalogCapture(snapshot());
    expect(result).toMatchObject({ version: 'personal-native-catalog-capture-v1', querySha256: hash(PILOT_SCHEMA_CATALOG_SQL), objectCount: 1, remoteObserved: false });
    expect(result.comparison).toMatchObject({ snapshotProvenanceVerified: false, remoteObserved: false, executionAuthorized: false, backupVerified: false,
      coverage: { fullPublicSchemaEquivalent: false, fullDatabaseEquivalent: false } });
    expect(result.comparison.leftSha256).toBe(result.comparison.rightSha256);
    // Neither the function name nor this modeled positive means PostgreSQL ran.
    expect(result).not.toHaveProperty('databaseObserved', true);
  });

  it.each([170010, 180006])('refuses non-pinned capture runtime %s after validating the supplied shape', versionNum => {
    const value = snapshot(); value.server.versionNum = versionNum;
    expect(() => verifyCatalogCapture(value)).toThrow('PERSONAL_REHEARSAL_CATALOG_RUNTIME');
  });

  it.each(['truncated','count','missingFamily','unknownField'])('does not write a success-shaped receipt for %s input', defect => {
    const value = snapshot();
    if (defect === 'truncated') value.truncated = true;
    if (defect === 'count') value.objectCount++;
    if (defect === 'missingFamily') delete value.familyCounts.policy;
    if (defect === 'unknownField') Object.assign(value, { backupVerified: true });
    expect(() => verifyCatalogCapture(value)).toThrow();
  });

  it('retains unsupported coverage rather than treating self-comparison as approval', () => {
    const value = snapshot(); add(value, { family: 'unsupported', key: ['public','RELATION','synthetic_view'], properties: { kind: 'RELKIND_v' } });
    const result = verifyCatalogCapture(value);
    expect(result.comparison.status).toBe('INCOMPLETE_COVERAGE');
    expect(result.familyCounts.unsupported).toBe(1);
    expect(result.comparison.coverage.fullPublicSchemaEquivalent).toBe(false);
  });

  it('retains known invalid guard state even though left and right are the same snapshot', () => {
    const value = snapshot();
    add(value, { family: 'table', key: ['public','T'], properties: { persistence: 'p', accessMethod: 'heap', replicaIdentity: 'd', rls: false, forceRls: false, optionsHash: null, tablespace: null } });
    add(value, { family: 'acl', key: ['public','TABLE','T',''], properties: { owner: 'synthetic', aclHash: null } });
    add(value, { family: 'index', key: ['public','T_idx'], properties: { table: ['public','T'], unique: false, primary: false, exclusion: false, immediate: true,
      nullsNotDistinct: false, valid: false, ready: true, live: true, definitionHash: 'c'.repeat(64) } });
    const result = verifyCatalogCapture(value);
    expect(result.comparison.status).toBe('GUARD_REVIEW_REQUIRED');
    expect(result.comparison.knownGuardReviewCount).toBeGreaterThan(0);
  });

  it('stages exact query bytes and pins their hash in both creation and revalidation', () => {
    expect(helper).toContain("write('schema-catalog.sql', PILOT_SCHEMA_CATALOG_SQL)");
    expect(helper.match(/schemaCatalogQuerySha256: sha\(PILOT_SCHEMA_CATALOG_SQL\)/g)).toHaveLength(2);
    expect(helper).toContain("exact(path.join(staged, 'schema-catalog.sql'), PILOT_SCHEMA_CATALOG_SQL)");
    expect(helper).toContain("if (!readFileSync(file).equals(Buffer.from(expected))) fail('STAGED_BYTES_CHANGED')");
    expect(helper).toContain("{ flag: 'wx' }");
  });

  it('revalidates the staged query immediately before invoking the existing bounded psql path', () => {
    expect(capture.indexOf('Assert-RehearsalInputs $Label')).toBeLessThan(capture.indexOf('$catalogJson = Invoke-NativeChild'));
    expect(capture).toContain("@('-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $taskRehearsal 'schema-catalog.sql')) $Label $remaining");
    expect(capture.match(/Get-NativeCampaignRemainingMs \$taskRehearsalClock/g)).toHaveLength(2);
    expect(harness).toContain('return [int][Math]::Min($MaximumMs, $remaining)');
    expect(harness).toContain('[int]$MaximumMs = 30000');
    expect(capture).not.toMatch(/Start-Process|ProcessStartInfo|PGHOST|DATABASE_URL|RuntimeRoot|Invoke-WebRequest/);
  });

  it('restricts capture filenames to two known labels and refuses existing destinations', () => {
    expect(capture).toContain("$Label -cnotin @('catalog-70', 'catalog-79')");
    expect(capture.indexOf('PERSONAL_NATIVE_CATALOG_LABEL_INVALID')).toBeLessThan(capture.indexOf('Assert-RehearsalInputs'));
    expect(capture).toContain("if (Test-Path -LiteralPath $catalogFile) { throw 'PERSONAL_NATIVE_CATALOG_REPLAY_REFUSED' }");
    expect(capture.indexOf('PERSONAL_NATIVE_CATALOG_REPLAY_REFUSED')).toBeLessThan(capture.indexOf('[IO.File]::WriteAllText'));
    expect(helper).toContain("writeFileSync(path.join(staged, `${mode}-receipt.json`), JSON.stringify(receipt, null, 2), { flag: 'wx' })");
  });

  it('captures70 after baseline verification and before sealing;79 only after migration', () => {
    const ordered = ["'baseline', $taskCluster", "Save-RehearsalCatalog 'catalog-70'", "'REHEARSAL_SEAL_70'", "'REHEARSAL_CLONE_70'",
      "'rehearsal-migrate-79' $remaining", "Save-RehearsalCatalog 'catalog-79'", "'REHEARSAL_VERIFY'"];
    const positions = ordered.map(text => harness.indexOf(text));
    expect(positions.every(position => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b) => a-b));
    expect(harness.indexOf('if ($MigrationRehearsal) {')).toBeLessThan(harness.indexOf('function Save-RehearsalCatalog'));
    expect(harness).not.toContain('ALLOW_CONNECTIONS true');
  });

  it('keeps the default migrated-template test branch byte-equivalent after line-ending normalization', () => {
    const ordinary = harness.split('# BEGIN_DEFAULT_MIGRATED_TEMPLATE_SUITE')[1].split('# END_DEFAULT_MIGRATED_TEMPLATE_SUITE')[0];
    // Independently checked against git HEAD before adding this test.
    expect(hash(ordinary)).toBe('f96e5e4f9949a2a4bbbb3b588159fa45022592009f6d1d5aa7b69ada3a91d181');
    expect(ordinary).not.toContain('Save-RehearsalCatalog');
  });
});
