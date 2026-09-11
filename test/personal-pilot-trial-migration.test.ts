import { readFileSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), write: vi.fn(), mkdir: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), directories: new Set<string>(), prefix: '' }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: mock.spawn }));
// Exactly two synthetic fixture values stand in for the private recorded hashes.
// Every changed byte/row and every actual source/catalog hash uses real SHA256.
// This is orchestration coverage, NOT verification of private evidence or SQL.
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(bytes: string | Buffer) { text += Buffer.from(bytes).toString(); h.update(bytes); return this; },
      digest(encoding: 'hex') {
        if (text === 'SYNTHETIC_BASELINE_BYTES') return '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
        if (mock.prefix && text === mock.prefix) return '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
        return h.digest(encoding);
      } };
  } };
});
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, writeFileSync: mock.write, mkdirSync: mock.mkdir,
    readFileSync: (file: string, options?: unknown) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!) : actual.readFileSync(file, options as never),
    lstatSync: (file: string, options?: unknown) => mock.files.has(String(file)) || mock.directories.has(String(file))
      ? { isSymbolicLink: () => false, isDirectory: () => mock.directories.has(String(file)), isFile: () => mock.files.has(String(file)), size: mock.files.get(String(file))?.length ?? 0 }
      : String(file).endsWith('.attempt.json') ? undefined : actual.lstatSync(file, options as never),
    realpathSync: (file: string) => mock.files.has(String(file)) || mock.directories.has(String(file)) ? String(file) : actual.realpathSync(file),
    readdirSync: (file: string, options?: unknown) => mock.directories.has(String(file))
      ? [...new Set([...mock.files.keys(), ...mock.directories].filter(name => dirname(name) === String(file)).map(name => basename(name)))]
      : actual.readdirSync(file, options as never),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { runPilotTrialPrisma, PILOT_TRIAL_TARGET, parsePilotTrialPrismaArguments } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const root = process.cwd(), HEAD = 'a'.repeat(40), catalog = buildPilotMigrationCatalog(root);
const BASELINE = resolve(root, '.scratch/pilot-trial-data-before70-20260910T2308Z.json');
const MARKER = resolve(root, '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json');
const expected = { expectedHead: HEAD, expectedCatalogSha256: catalog.catalogSha256,
  expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a',
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const SECRET = 'SYNTHETIC_SECRET_NEVER_REAL_1234';
const url = `postgresql://neondb_owner:${SECRET}@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
const input = (value = url) => Readable.from([Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url: value }))]);
type Entry = { migrationName: string; sha256: string };
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180006, readOnly: 'on', tls: false, historyCount: count,
    rows: (catalog.entries as Entry[]).slice(0, count).map(entry => ({ migration_name: entry.migrationName, checksum: entry.sha256,
      finished_at: '2026-09-10T00:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(arg => arg.includes('new PrismaClient'));
const isMigration = (args: string[]) => args[1] === 'migrate';
const migrations = () => mock.spawn.mock.calls.filter((call: unknown[]) => isMigration(call[1] as string[]));
const probes = () => mock.spawn.mock.calls.filter((call: unknown[]) => isProbe(call[1] as string[]));
const run = () => runPilotTrialPrisma('MIGRATE_70_TO_79', expected, { input: input() });
const receipts = () => [...mock.files].filter(([name]) => name.endsWith('/receipt.json') || name.endsWith('\\receipt.json')).map(([, bytes]) => JSON.parse(bytes.toString()));
beforeEach(() => {
  vi.clearAllMocks(); mock.spawn.mockReset(); mock.write.mockReset(); mock.mkdir.mockReset(); mock.client.mockReset();
  mock.files.clear(); mock.directories.clear(); mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.files.set(BASELINE, Buffer.from('SYNTHETIC_BASELINE_BYTES'));
  mock.write.mockImplementation((file: string, bytes: Buffer | string) => {
    if (mock.files.has(file)) throw Error('SYNTHETIC_EXCLUSIVE_EXISTS'); mock.files.set(file, Buffer.from(bytes));
  });
  mock.mkdir.mockImplementation((file: string) => { for (let dir = file; dir !== resolve(root, '.scratch'); dir = dirname(dir)) mock.directories.add(dir); });
  mock.client.mockReturnValue({ treeSha256: 'c'.repeat(64), schemaSha256: 'd'.repeat(64) });
  let queries = 0;
  mock.spawn.mockImplementation((exe: string, args: string[]) => ({ status: 0, signal: null, stderr: '',
    stdout: exe === 'git' ? args.includes('status') ? '' : args.some(arg => arg.endsWith('^{tree}')) ? 'b'.repeat(40) : HEAD
      : isProbe(args) ? JSON.stringify(snapshot(++queries === 1 ? 70 : 79)) : isMigration(args) ? 'Synthetic CLI acknowledged' : 'BOUND' }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('single trial migration — synthetic processes and private hash stand-ins only', () => {
  it('persists fixed wx marker before exactly one CLI, then checks actual79-shaped history', async () => {
    const original = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[]) => {
      if (isMigration(args)) {
        expect(mock.files.has(MARKER)).toBe(true);
        expect(probes()).toHaveLength(1);
      }
      return original(exe, args);
    });
    const result = await run();
    expect(result).toMatchObject({ version: 'pilot-trial-migration-receipt-v1', status: 'MIGRATION_HISTORY_79_VERIFIED',
      baselineSha256: expected.expectedBaselineSha256, history70Sha256: expected.expectedHistory70Sha256,
      preflightHistory: { count: 70, backendConnectionSslObserved: false }, history: { count: 79, prior70Sha256: expected.expectedHistory70Sha256 },
      clientTransportPolicy: 'PRISMA_REQUIRE_TLS_STRICT_CERT', migrationInvoked: true, automaticRetry: false,
      dataPreservationVerified: false, schemaPreservationVerified: false, executionAuthorized: false,
      totalBudgetMs: 180000, childBudgetMs: 120000, postflightReserveMs: 20000 });
    expect(migrations()).toHaveLength(1); expect(probes()).toHaveLength(2);
    const [exe, args, options] = migrations()[0];
    expect(exe).toBe(process.execPath); expect(args.slice(1, 4)).toEqual(['migrate', 'deploy', '--config']);
    expect(args[4]).toMatch(/prisma-79\.config\.ts$/);
    expect(options).toMatchObject({ shell: false, windowsHide: true, timeout: 120000, maxBuffer: 131072 });
    expect(probes()[1][2].timeout).toBeLessThanOrEqual(20000);
    expect(mock.write.mock.calls.find((call: unknown[]) => call[0] === MARKER)?.[2]).toEqual({ flag: 'wx', mode: 0o600 });
    expect(JSON.stringify(result)).not.toContain(SECRET); expect(JSON.stringify([...mock.files.values()].map(x => x.toString()))).not.toContain(SECRET);
    expect(options.env).not.toHaveProperty('DATABASE_URL');
  });
  it.each(['expectedHead', 'expectedCatalogSha256', 'expectedBaselineSha256', 'expectedHistory70Sha256', 'extra'])(
    'rejects %s pin before a write-capable child', async key => {
      const changed = { ...expected, [key]: '0'.repeat(key === 'expectedHead' ? 40 : 64) };
      await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', changed, { input: input() })).rejects.toThrow();
      expect(migrations()).toHaveLength(0);
    });
  it.each(['baseline', 'marker', 'target', 'prehistory', 'dirty', 'staging'])(
    'refuses %s before migration and never creates a success receipt', async kind => {
      if (kind === 'baseline') mock.files.set(BASELINE, Buffer.from('CHANGED'));
      if (kind === 'marker') mock.files.set(MARKER, Buffer.from('UNKNOWN_OLD_ATTEMPT'));
      const original = mock.spawn.getMockImplementation()!;
      mock.spawn.mockImplementation((exe: string, args: string[]) => {
        const result = original(exe, args);
        if (kind === 'dirty' && exe === 'git' && args.includes('status')) result.stdout = ' M file';
        if (isProbe(args) && kind === 'prehistory') { const s = snapshot(70); s.rows[0].finished_at = '2026-09-10T01:00:00.000Z'; result.stdout = JSON.stringify(s); }
        if (isProbe(args) && kind === 'staging') {
          const config = [...mock.files.keys()].find(name => name.endsWith('prisma-79.config.ts'))!; mock.files.set(config, Buffer.from('CHANGED'));
        }
        return result;
      });
      await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', expected, { input: input(kind === 'target' ? url.replace('sslmode=require', 'sslmode=disable') : url) })).rejects.toThrow();
      expect(migrations()).toHaveLength(0); expect(receipts().every(x => x.status !== 'MIGRATION_HISTORY_79_VERIFIED')).toBe(true);
    });
  it('replay refuses before reading input even when a fresh staging UUID would be available', async () => {
    await run(); const reads = vi.fn();
    await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', expected, { input: new Readable({ read: reads }) })).rejects.toThrow('MIGRATION_REFUSED_BEFORE_SPAWN');
    expect(reads).not.toHaveBeenCalled(); expect(migrations()).toHaveLength(1); expect(mock.files.has(MARKER)).toBe(true);
  });
  it.each(['race', 'readback', 'baselineAfterQuery'])('refuses %s at the last pre-spawn boundary', async kind => {
    const write = mock.write.getMockImplementation()!;
    mock.write.mockImplementation((file: string, bytes: Buffer | string) => {
      if (file === MARKER && kind === 'race') { mock.files.set(file, Buffer.from('OTHER_ATTEMPT')); throw Error('EXISTS'); }
      write(file, bytes);
      if (file === MARKER && kind === 'readback') mock.files.set(file, Buffer.from('MODIFIED'));
    });
    const original = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[]) => {
      const result = original(exe, args);
      if (isProbe(args) && kind === 'baselineAfterQuery') mock.files.set(BASELINE, Buffer.from('CHANGED'));
      return result;
    });
    await expect(run()).rejects.toThrow('MIGRATION_REFUSED_BEFORE_SPAWN'); expect(migrations()).toHaveLength(0);
  });
  it.each(['throw', 'exit', 'signal', 'overflow', 'post70', 'postPartial', 'changed70', 'wrong79', 'lostAck', 'postSource'])(
    'retains marker and uncertain outcome after %s; never retries', async kind => {
      const original = mock.spawn.getMockImplementation()!; let queried = 0;
      mock.spawn.mockImplementation((exe: string, args: string[]) => {
        if (isMigration(args) && kind === 'throw') throw Error(SECRET);
        const result = original(exe, args);
        if (isMigration(args)) {
          if (kind === 'exit') result.status = 1;
          if (kind === 'signal') Object.assign(result, { status: null, signal: 'SIGTERM' });
          if (kind === 'overflow') result.stdout = 'x'.repeat(131073);
        }
        if (isProbe(args) && ++queried === 2) {
          if (kind === 'lostAck') throw Error(SECRET);
          const s = snapshot(kind === 'post70' ? 70 : kind === 'postPartial' ? 78 : 79);
          if (kind === 'changed70') s.rows[0].finished_at = '2026-09-10T02:00:00.000Z';
          if (kind === 'wrong79') s.rows[78].checksum = '0'.repeat(64);
          result.stdout = JSON.stringify(s);
        }
        if (kind === 'postSource' && queried === 2 && exe === 'git' && args.includes('status')) result.stdout = ' M file';
        return result;
      });
      const error = await run().catch(error => error);
      expect(error.message).toBe('PILOT_TRIAL_MIGRATION_OUTCOME_UNCERTAIN'); expect(String(error)).not.toContain(SECRET);
      expect(migrations()).toHaveLength(1); expect(mock.files.has(MARKER)).toBe(true);
      expect(receipts().at(-1)).toMatchObject({ status: 'MIGRATION_OUTCOME_UNCERTAIN', migrationInvoked: true, automaticRetry: false });
    });
  it('reserves full120s plus20s before spawn rather than resetting total budget', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(performance, 'now').mockImplementation(() => now);
    const original = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[]) => { const r = original(exe, args); if (isProbe(args)) now = 40001; return r; });
    await expect(run()).rejects.toThrow('MIGRATION_REFUSED_BEFORE_SPAWN');
    expect(migrations()).toHaveLength(0); expect(mock.files.has(MARKER)).toBe(false);
  });
  it('elapsed180s after child is uncertain even when exit0 is returned', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(performance, 'now').mockImplementation(() => now);
    const original = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[]) => { const r = original(exe, args); if (isMigration(args)) now = 180000; return r; });
    await expect(run()).rejects.toThrow('MIGRATION_OUTCOME_UNCERTAIN'); expect(migrations()).toHaveLength(1); expect(probes()).toHaveLength(1);
  });
  it('retains history receipt plus separate final failure if writing crosses the original deadline', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(performance, 'now').mockImplementation(() => now);
    const write = mock.write.getMockImplementation()!; let historyBytes: Buffer | undefined;
    mock.write.mockImplementation((file: string, bytes: string | Buffer) => {
      write(file, bytes);
      if (file.endsWith('receipt.json')) { historyBytes = Buffer.from(bytes); now = 180000; }
    });
    await expect(run()).rejects.toThrow('MIGRATION_OUTCOME_UNCERTAIN');
    const receipt = [...mock.files].find(([name]) => name.endsWith('receipt.json'))!;
    const failure = [...mock.files].find(([name]) => name.endsWith('failure-outcome.json'))!;
    expect(receipt[1]).toEqual(historyBytes); expect(JSON.parse(receipt[1].toString()).status).toBe('MIGRATION_HISTORY_79_VERIFIED');
    expect(JSON.parse(failure[1].toString())).toMatchObject({ status: 'MIGRATION_OUTCOME_UNCERTAIN', migrationInvoked: true,
      automaticRetry: false, diagnostic: { stage: 'WRITE', reason: 'DEADLINE' } });
    expect(mock.write.mock.calls.filter((call: unknown[]) => call[0] === receipt[0])).toHaveLength(1);
    expect(mock.write.mock.calls.find((call: unknown[]) => call[0] === failure[0])?.[2]).toEqual({ flag: 'wx', mode: 0o600 });
    expect(migrations()).toHaveLength(1); expect(mock.files.has(MARKER)).toBe(true);
  });
  it('CLI dispatches only the pure closed command, without retry/reset/resolve', () => {
    const source = readFileSync('specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs', 'utf8');
    expect(source).toContain('const command = parsePilotTrialPrismaArguments(process.argv.slice(2));');
    expect(source).toContain('await runPilotTrialPrisma(command.mode, command.expected);');
    expect(source).not.toMatch(/unlinkSync|rmSync|migrate['\"]\s*,\s*['\"]resolve/);
  });
});

describe('reviewed two-phase CLI grammar — pure parsing, no processes', () => {
  const preflight = ['--mode', 'PREFLIGHT_70', '--expected-head', HEAD, '--expected-catalog-sha256', expected.expectedCatalogSha256];
  const migration = ['--mode', 'MIGRATE_70_TO_79', '--expected-head', HEAD, '--expected-catalog-sha256', expected.expectedCatalogSha256,
    '--expected-baseline-sha256', expected.expectedBaselineSha256, '--expected-history70-sha256', expected.expectedHistory70Sha256];
  it('retains exact six-argument preflight and parses the exact ten-argument migration', () => {
    const p = parsePilotTrialPrismaArguments(preflight), m = parsePilotTrialPrismaArguments(migration);
    expect(p).toEqual({ mode: 'PREFLIGHT_70', expected: { expectedHead: HEAD, expectedCatalogSha256: expected.expectedCatalogSha256 } });
    expect(m).toEqual({ mode: 'MIGRATE_70_TO_79', expected }); expect(Object.isFrozen(m)).toBe(true); expect(Object.isFrozen(m.expected)).toBe(true);
    expect(mock.spawn).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
  it.each(['shortMigration', 'longPreflight', 'postflight', 'duplicate', 'reorder', 'extra', 'baseline', 'history', 'head', 'catalog', 'inline', 'case', 'number', 'sparse', 'getter', 'proxy'])(
    'rejects %s grammar without invoking caller accessors or local processes', kind => {
      let args: unknown[] = [...migration]; const accessor = vi.fn(() => '--mode');
      if (kind === 'shortMigration') args = args.slice(0, 6);
      if (kind === 'longPreflight') args[1] = 'PREFLIGHT_70';
      if (kind === 'postflight') args[1] = 'POSTFLIGHT_79';
      if (kind === 'duplicate') args[8] = '--expected-baseline-sha256';
      if (kind === 'reorder') [args[6], args[8]] = [args[8], args[6]];
      if (kind === 'extra') args.push('--approved', 'true');
      if (kind === 'baseline') args[7] = '0'.repeat(64);
      if (kind === 'history') args[9] = '0'.repeat(64);
      if (kind === 'head') args[3] = SECRET;
      if (kind === 'catalog') args[5] = SECRET;
      if (kind === 'inline') args[6] = `--expected-baseline-sha256=${expected.expectedBaselineSha256}`;
      if (kind === 'case') args[1] = 'migrate_70_to_79';
      if (kind === 'number') args[7] = 1;
      if (kind === 'sparse') delete args[7];
      if (kind === 'getter') Object.defineProperty(args, '0', { enumerable: true, get: accessor });
      if (kind === 'proxy') args = new Proxy(args, { get: accessor });
      expect(() => parsePilotTrialPrismaArguments(args)).toThrow(/^PILOT_TRIAL_CLI_REFUSED$/);
      expect(accessor).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
    });
  it('snapshots arguments so later mutation cannot redirect the parsed command', () => {
    const args = [...migration], command = parsePilotTrialPrismaArguments(args); args[1] = 'PREFLIGHT_70'; args[3] = SECRET;
    expect(command).toEqual({ mode: 'MIGRATE_70_TO_79', expected });
  });
});
