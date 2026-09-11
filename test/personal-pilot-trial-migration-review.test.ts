import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No real process or database. Exactly two known synthetic byte sequences stand
// in for private baseline/history digests; all other SHA256 operations are real.
const mock = vi.hoisted(() => ({ child: vi.fn(), write: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), dirs: new Set<string>(), prefix: '' }));
vi.mock('node:child_process', () => ({ spawnSync: mock.child, spawn: vi.fn(() => { throw Error('NO_REAL_PROCESS'); }) }));
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(bytes: string | Buffer) { text += Buffer.from(bytes).toString(); h.update(bytes); return this; },
      digest(encoding: 'hex') {
        if (text === 'PEER_SYNTHETIC_BASELINE') return '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
        if (mock.prefix && text === mock.prefix) return '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
        return h.digest(encoding);
      } };
  } };
});
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, writeFileSync: mock.write,
    mkdirSync: (file: string) => { for (let d = file; d !== resolve(process.cwd(), '.scratch'); d = dirname(d)) mock.dirs.add(d); },
    readFileSync: (file: string, options?: never) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!) : actual.readFileSync(file, options),
    lstatSync: (file: string, options?: never) => mock.files.has(String(file)) || mock.dirs.has(String(file))
      ? { isSymbolicLink: () => false, isDirectory: () => mock.dirs.has(String(file)), isFile: () => mock.files.has(String(file)), size: mock.files.get(String(file))?.length ?? 0 }
      : String(file).endsWith('.attempt.json') ? undefined : actual.lstatSync(file, options),
    realpathSync: (file: string) => mock.files.has(String(file)) || mock.dirs.has(String(file)) ? String(file) : actual.realpathSync(file),
    readdirSync: (file: string, options?: never) => mock.dirs.has(String(file))
      ? [...new Set([...mock.files.keys(), ...mock.dirs].filter(name => dirname(name) === String(file)).map(name => basename(name)))]
      : actual.readdirSync(file, options),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { parsePilotTrialPrismaArguments, runPilotTrialPrisma, PILOT_TRIAL_TARGET } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
import { parsePilotTrialBridgeArgs, parsePilotTrialMigrationBridgeArgs, runPilotTrialMigrationBridgeCli,
  validatePilotTrialMigrationBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';

const root = process.cwd(), catalog = buildPilotMigrationCatalog(root);
const expected = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: catalog.catalogSha256,
  expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a',
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const bridgePins = { ...expected, expectedRunnerSha256: 'b'.repeat(64), expectedNodeSha256: 'c'.repeat(64), expectedPrismaCliSha256: 'd'.repeat(64) };
const BASELINE = resolve(root, '.scratch/pilot-trial-data-before70-20260910T2308Z.json');
const MARKER = resolve(root, '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json');
const SENTINEL = 'PEER_SYNTHETIC_NOT_REAL_CREDENTIAL';
const url = `postgresql://neondb_owner:${SENTINEL}@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
const input = () => Readable.from([Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url }))]);
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', readOnly: 'on', tls: false, versionNum: 180006,
    historyCount: count, rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, count).map(entry => ({
      migration_name: entry.migrationName, checksum: entry.sha256, finished_at: '2026-09-10T12:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(arg => arg.includes('new PrismaClient'));
const isMigration = (args: string[]) => args[1] === 'migrate';
const migrationCalls = () => mock.child.mock.calls.filter((call: unknown[]) => isMigration(call[1] as string[]));
const run = () => runPilotTrialPrisma('MIGRATE_70_TO_79', expected, { input: input() });
const oldBridgeArgs = () => ['--expected-head', expected.expectedHead, '--expected-catalog-sha256', expected.expectedCatalogSha256,
  '--expected-runner-sha256', bridgePins.expectedRunnerSha256, '--expected-node-sha256', bridgePins.expectedNodeSha256,
  '--expected-prisma-cli-sha256', bridgePins.expectedPrismaCliSha256];
const migrationBridgeArgs = () => ['--migration', ...oldBridgeArgs(), '--expected-baseline-sha256', expected.expectedBaselineSha256,
  '--expected-history70-sha256', expected.expectedHistory70Sha256];
const oldRunnerArgs = () => ['--mode', 'PREFLIGHT_70', '--expected-head', expected.expectedHead,
  '--expected-catalog-sha256', expected.expectedCatalogSha256];
const migrationRunnerArgs = () => ['--mode', 'MIGRATE_70_TO_79', ...oldRunnerArgs().slice(2),
  '--expected-baseline-sha256', expected.expectedBaselineSha256, '--expected-history70-sha256', expected.expectedHistory70Sha256];
beforeEach(() => {
  mock.files.clear(); mock.dirs.clear(); mock.child.mockReset(); mock.write.mockReset(); mock.client.mockReset();
  mock.files.set(BASELINE, Buffer.from('PEER_SYNTHETIC_BASELINE')); mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.client.mockReturnValue({ treeSha256: 'e'.repeat(64), schemaSha256: 'f'.repeat(64) });
  mock.write.mockImplementation((file: string, bytes: string | Buffer, options: { flag: string }) => {
    expect(options.flag).toBe('wx'); if (mock.files.has(file)) throw Error('EXCLUSIVE'); mock.files.set(file, Buffer.from(bytes));
  });
  let probes = 0;
  mock.child.mockImplementation((exe: string, args: string[]) => ({ status: 0, signal: null, stderr: '',
    stdout: exe === 'git' ? args.includes('status') ? '' : args.some(arg => arg.endsWith('^{tree}')) ? '1'.repeat(40) : expected.expectedHead
      : isProbe(args) ? JSON.stringify(snapshot(++probes === 1 ? 70 : 79)) : isMigration(args) ? 'SYNTHETIC_ACK' : 'BOUND' }));
});
afterEach(() => vi.restoreAllMocks());

describe('peer migration orchestration — simulated process boundary only', () => {
  it('keeps six-argument preflight and ten-argument migration runner grammars separate and pure', () => {
    expect(oldRunnerArgs()).toHaveLength(6); expect(migrationRunnerArgs()).toHaveLength(10);
    expect(parsePilotTrialPrismaArguments(oldRunnerArgs())).toEqual({ mode: 'PREFLIGHT_70',
      expected: { expectedHead: expected.expectedHead, expectedCatalogSha256: expected.expectedCatalogSha256 } });
    expect(parsePilotTrialPrismaArguments(migrationRunnerArgs())).toEqual({ mode: 'MIGRATE_70_TO_79', expected });
    expect(() => parsePilotTrialPrismaArguments(migrationRunnerArgs().slice(0, 6))).toThrow('CLI_REFUSED');
    expect(() => parsePilotTrialPrismaArguments(migrationRunnerArgs().map((value, i) => i === 1 ? 'PREFLIGHT_70' : value))).toThrow('CLI_REFUSED');
    expect(mock.child).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
  it('refuses target override, reordered complete pairs and postflight mode despite an environment GO flag', () => {
    const args = migrationRunnerArgs(); vi.stubEnv('PILOT_TRIAL_MIGRATION_GO', 'true');
    try {
      for (const value of [[...args, '--target', 'another-target'], [...args.slice(0, 6), ...args.slice(8), ...args.slice(6, 8)],
        args.map((item, i) => i === 1 ? 'POSTFLIGHT_79' : item)]) expect(() => parsePilotTrialPrismaArguments(value)).toThrow('CLI_REFUSED');
      expect(mock.child).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
  it('keeps the old ten-argument bridge grammar separate from the exact fifteen-argument migration grammar', () => {
    expect(oldBridgeArgs()).toHaveLength(10); expect(migrationBridgeArgs()).toHaveLength(15);
    expect(parsePilotTrialBridgeArgs(oldBridgeArgs())).toEqual({ expectedHead: expected.expectedHead,
      expectedCatalogSha256: expected.expectedCatalogSha256, expectedRunnerSha256: bridgePins.expectedRunnerSha256,
      expectedNodeSha256: bridgePins.expectedNodeSha256, expectedPrismaCliSha256: bridgePins.expectedPrismaCliSha256 });
    expect(parsePilotTrialMigrationBridgeArgs(migrationBridgeArgs())).toEqual(bridgePins);
    expect(() => parsePilotTrialBridgeArgs(migrationBridgeArgs())).toThrow();
    expect(() => parsePilotTrialMigrationBridgeArgs(oldBridgeArgs())).toThrow();
    expect(mock.child).not.toHaveBeenCalled();
  });
  it('bridge CLI refuses added target, reordered pins and duplicate flags before source or child work', async () => {
    const args = migrationBridgeArgs();
    const malformed = [
      [...args, '--target', 'another-target'],
      [...args.slice(0, 11), ...args.slice(13, 15), ...args.slice(11, 13)],
      args.map((value, i) => i === 13 ? '--expected-baseline-sha256' : value),
      args.map((value, i) => i === 0 ? '--preflight' : value),
    ];
    for (const value of malformed) await expect(runPilotTrialMigrationBridgeCli(value)).rejects.toThrow();
    expect(mock.child).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
  it('real producer receipt, including canonical order, is accepted by the real migration bridge parser', async () => {
    const receipt = await run();
    expect(migrationCalls()).toHaveLength(1);
    expect(() => validatePilotTrialMigrationBridgeReceipt(Buffer.from(JSON.stringify(receipt) + '\n'), bridgePins)).not.toThrow();
    expect(receipt).toMatchObject({ status: 'MIGRATION_HISTORY_79_VERIFIED', executionAuthorized: false, dataPreservationVerified: false, schemaPreservationVerified: false });
  });
  it('does not publish a successful return when synchronous receipt persistence exhausts the original budget', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(performance, 'now').mockImplementation(() => now);
    const write = mock.write.getMockImplementation()!;
    mock.write.mockImplementation((file: string, bytes: string | Buffer, options: { flag: string }) => {
      write(file, bytes, options); if (file.endsWith('receipt.json')) now = 180000;
    });
    await expect(run()).rejects.toThrow('MIGRATION_OUTCOME_UNCERTAIN');
    expect(migrationCalls()).toHaveLength(1); expect(mock.files.has(MARKER)).toBe(true);
  });
  it('refuses a postflight patch-version change instead of producing a receipt its bridge rejects', async () => {
    const original = mock.child.getMockImplementation()!; let queried = 0;
    mock.child.mockImplementation((exe: string, args: string[]) => {
      const result = original(exe, args);
      if (isProbe(args) && ++queried === 2) { const s = snapshot(79); s.versionNum = 180007; result.stdout = JSON.stringify(s); }
      return result;
    });
    await expect(run()).rejects.toThrow('MIGRATION_OUTCOME_UNCERTAIN'); expect(migrationCalls()).toHaveLength(1);
  });
  it('retains the same marker after a lost acknowledgement and rejects a fresh invocation before private input', async () => {
    const original = mock.child.getMockImplementation()!;
    mock.child.mockImplementation((exe: string, args: string[]) => { if (isMigration(args)) throw Error(SENTINEL); return original(exe, args); });
    await expect(run()).rejects.toThrow('MIGRATION_OUTCOME_UNCERTAIN');
    const retained = Buffer.from(mock.files.get(MARKER)!); const reads = vi.fn();
    await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', expected, { input: new Readable({ read: reads }) })).rejects.toThrow('MIGRATION_REFUSED_BEFORE_SPAWN');
    expect(reads).not.toHaveBeenCalled(); expect(migrationCalls()).toHaveLength(1); expect(mock.files.get(MARKER)).toEqual(retained);
  });
  it('observes the exact private child environment at invocation, not only the scrubbed object afterward', async () => {
    const original = mock.child.getMockImplementation()!; let captured: Record<string, string> | undefined;
    vi.stubEnv('NODE_OPTIONS', '--import=SYNTHETIC_OVERRIDE'); vi.stubEnv('PGOPTIONS', 'SYNTHETIC_PG_OVERRIDE');
    try {
      mock.child.mockImplementation((exe: string, args: string[], options: { env: Record<string, string> }) => {
        if (isMigration(args)) captured = { ...options.env }; return original(exe, args, options);
      });
      await run(); expect(captured).toBeDefined();
      expect(captured).toMatchObject({ DATABASE_URL: url, DIRECT_URL: url, npm_config_offline: 'true' });
      expect(captured).not.toHaveProperty('NODE_OPTIONS'); expect(captured).not.toHaveProperty('PGOPTIONS');
      const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'CI', 'CHECKPOINT_DISABLE', 'PRISMA_HIDE_UPDATE_MESSAGE',
        'PRISMA_GENERATE_SKIP_AUTOINSTALL', 'DO_NOT_TRACK', 'NO_COLOR', 'npm_config_offline', 'DATABASE_URL', 'DIRECT_URL'];
      expect(Object.keys(captured!).every(key => allowed.includes(key))).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  });
});
