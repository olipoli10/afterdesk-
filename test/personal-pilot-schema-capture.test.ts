import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCatalogCapture } from '../specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs';
import { PILOT_SCHEMA_CATALOG_SQL } from '../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs';

function supplied() {
  return { version: 'personal-pilot-schema-snapshot-v1', server: { versionNum: 170011,
    versionHash: 'a'.repeat(64), encoding: 'UTF8', collation: 'C', ctype: 'C', localeProvider: 'c',
    collationVersion: null, localeHash: null, searchPathHash: 'b'.repeat(64), searchPathSafe: true },
  objectCount: 1, familyCounts: { table: 0, column: 0, constraint: 0, index: 0, function: 0,
    trigger: 0, enum: 0, acl: 1, policy: 0, extension: 0, unsupported: 0 },
  objects: [{ family: 'acl', key: ['public', 'SCHEMA', 'public', ''], properties: { owner: 'synthetic', aclHash: null } }], truncated: false };
}
describe('catalog capture controller — supplied inputs and source order only', () => {
  it('returns query fingerprint and self-comparison without manufacturing observation', () => {
    expect(verifyCatalogCapture(supplied())).toMatchObject({ objectCount: 1,
      querySha256: createHash('sha256').update(PILOT_SCHEMA_CATALOG_SQL).digest('hex'), remoteObserved: false,
      comparison: { snapshotProvenanceVerified: false, executionAuthorized: false, backupVerified: false } });
  });
  it.each([170010, 180006])('rejects an otherwise coherent different runtime %i', version => {
    const value = supplied(); value.server.versionNum = version;
    expect(() => verifyCatalogCapture(value)).toThrow('CATALOG_RUNTIME');
  });
  it('does not turn missing family counts into empty families', () => {
    const value = supplied(); value.familyCounts.table = 1;
    expect(() => verifyCatalogCapture(value)).toThrow('FAMILY_COUNT');
  });
  it('captures70 before sealing and79 after migration, with bounded fixed query dispatch', () => {
    const harness = readFileSync('specs/210-personal-live-activation/validate-postgres-native.ps1', 'utf8');
    expect(harness.indexOf("Save-RehearsalCatalog 'catalog-70'")).toBeLessThan(harness.indexOf("$taskStage = 'REHEARSAL_SEAL_70'"));
    expect(harness.indexOf("Save-RehearsalCatalog 'catalog-79'")).toBeGreaterThan(harness.indexOf("$taskStage = 'REHEARSAL_MIGRATE_79'"));
    expect(harness).toContain("'schema-catalog.sql')) $Label $remaining");
    expect(harness).toContain('PERSONAL_NATIVE_CATALOG_REPLAY_REFUSED');
  });
});
