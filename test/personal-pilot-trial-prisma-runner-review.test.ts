import { describe, expect, it, vi } from 'vitest';

// Independent synthetic inputs. No child, Git, Prisma, credentials or DB are executed.
vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => { throw new Error('CHILD_FORBIDDEN_IN_PEER_TEST'); }) }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { inspectPilotTrialHistory, runPilotTrialPrisma, pilotTrialChildEnvironment,
  classifyPilotTrialProcessOutcome, PILOT_TRIAL_TARGET } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';

const catalog = buildPilotMigrationCatalog(process.cwd());
function history() {
  return {
    database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180006,
    readOnly: 'on', tls: true, historyCount: 70,
    rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, 70).map(entry => ({
      migration_name: entry.migrationName, checksum: entry.sha256,
      finished_at: '2026-09-10T12:00:00.000Z', rolled_back_at: null, applied_steps_count: 1,
    })),
  };
}

describe('independent supplied trial history boundary (not a JSON transport exploit)', () => {
  it('refuses migration before even evaluating the input option', async () => {
    const getter = vi.fn(() => undefined);
    const options = Object.defineProperty({}, 'input', { enumerable: true, get: getter });
    await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', undefined, options)).rejects.toThrow('PRESERVATION_EVIDENCE_NOT_READY');
    expect(getter).not.toHaveBeenCalled();
  });
  it('accepts a plain complete synthetic 70-history without authenticating its provenance', () => {
    expect(inspectPilotTrialHistory(history(), catalog, 70)).toMatchObject({ count: 70,
      dataPreservationVerified: false, targetProviderProvenanceVerified: false });
  });
  it('refuses an index accessor without invoking it', () => {
    const value = history(), first = value.rows[0], getter = vi.fn(() => first);
    Object.defineProperty(value.rows, '0', { enumerable: true, configurable: true, get: getter });
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('refuses a proxied array without executing its get trap', () => {
    const value = history(), getter = vi.fn((target: typeof value.rows, key: string | symbol) => Reflect.get(target, key));
    value.rows = new Proxy(value.rows, { get: getter });
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('refuses an own map accessor rather than executing caller code', () => {
    const value = history(), getter = vi.fn(() => Array.prototype.map);
    Object.defineProperty(value.rows, 'map', { enumerable: false, configurable: true, get: getter });
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('checks array length before materializing all descriptors', () => {
    const value = history(); value.rows.push(value.rows[0]);
    const spy = vi.spyOn(Object, 'getOwnPropertyDescriptors');
    try {
      expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
      expect(spy.mock.calls.some(([arg]) => arg === value.rows)).toBe(false);
    } finally { spy.mockRestore(); }
  });
  it.each(['hole', 'extra', 'symbol', 'subclass', 'hidden'])('refuses %s arrays', kind => {
    const value = history();
    if (kind === 'hole') delete value.rows[0];
    if (kind === 'extra') Object.defineProperty(value.rows, 'extra', { value: 'untrusted' });
    if (kind === 'symbol') Object.defineProperty(value.rows, Symbol('extra'), { value: 'untrusted' });
    if (kind === 'subclass') Object.setPrototypeOf(value.rows, Object.create(Array.prototype));
    if (kind === 'hidden') Object.defineProperty(value.rows, '0', { enumerable: false });
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
  });
  it('rejects row accessors without invoking them', () => {
    const value = history(), getter = vi.fn(() => value.rows[1].checksum);
    Object.defineProperty(value.rows[0], 'checksum', { get: getter, enumerable: true });
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('accepts the specifically catalogued historical LF checksum without normalizing names or timestamps', () => {
    const value = history();
    const entries = catalog.entries as { sha256: string; lfSha256: string }[];
    const index = entries.slice(0, 70).findIndex(entry => entry.sha256 !== entry.lfSha256);
    expect(index).toBeGreaterThanOrEqual(0);
    value.rows[index].checksum = entries[index].lfSha256;
    const result = inspectPilotTrialHistory(value, catalog, 70);
    expect(result.count).toBe(70);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(value.rows[0].migration_name);
    value.rows[index].migration_name += ' ';
    expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
  });
  it('keeps platform paths but strips hidden execution and engine flags', () => {
    const url = `postgresql://neondb_owner:SYNTHETIC_ONLY_12345678@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
    const env = pilotTrialChildEnvironment(url, { Path: 'synthetic-path', TEMP: 'synthetic-temp',
      ENDVERA_PERSONAL_MODEL_ENABLED: 'true', GO: 'true', NODE_OPTIONS: '--require=untrusted',
      PRISMA_QUERY_ENGINE_BINARY: 'untrusted', PRISMA_SCHEMA_ENGINE_BINARY: 'untrusted',
      SSL_CERT_FILE: 'untrusted', NODE_EXTRA_CA_CERTS: 'untrusted', HTTP_PROXY: 'untrusted' });
    expect(env).toMatchObject({ PATH: 'synthetic-path', TEMP: 'synthetic-temp' });
    expect(Object.keys(env).filter(key => /ENDVERA|ENGINE|CERT|PROXY|GO|NODE_OPTIONS/.test(key))).toEqual([]);
  });
  it.each([null, 1, -1, undefined])('keeps failed/unknown exit %s non-retryable even with caller verification true', exit => {
    expect(classifyPilotTrialProcessOutcome('MIGRATE_70_TO_79', exit, true)).toMatchObject({
      status: 'MIGRATION_OUTCOME_UNCERTAIN', automaticRetry: false, resetAllowed: false,
      migrationResolveAllowed: false, executionAuthorized: false, dataPreservationVerified: false,
    });
  });
});
