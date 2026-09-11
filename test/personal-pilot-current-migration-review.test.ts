import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hermetic orchestration only: simulated Git/Prisma processes and in-memory
// writes. Three exact synthetic inputs stand in for the two private baseline
// digests and shared70-history digest. All remaining hashes use actual SHA256.
const mock = vi.hoisted(() => ({ child: vi.fn(), write: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), dirs: new Set<string>(), prefix: '' }));
vi.mock('node:child_process', () => ({ spawnSync: mock.child, spawn: vi.fn(() => { throw Error('NO_REAL_CHILD'); }) }));
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(bytes: string | Buffer) { text += Buffer.from(bytes).toString(); h.update(bytes); return this; }, digest(encoding: 'hex') {
      if (text === 'PEER_CURRENT_BASELINE') return '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac';
      if (text === 'PEER_TRIAL_BASELINE') return '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
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
      ? [...new Set([...mock.files.keys(), ...mock.dirs].filter(n => dirname(n) === String(file)).map(n => basename(n)))] : actual.readdirSync(file, options),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { decodePilotCurrentCredential, decodePilotTrialCredential, parsePilotCurrentPrismaArguments,
  runPilotCurrentMigration, runPilotTrialPrisma, PILOT_TRIAL_TARGET } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
import { parsePilotCurrentMigrationBridgeArgs, runPilotCurrentMigrationBridgeCli,
  validatePilotCurrentMigrationBridgeReceipt, validatePilotTrialMigrationBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';

const root = process.cwd(), catalog = buildPilotMigrationCatalog(root);
const common = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: catalog.catalogSha256,
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const current = { ...common, expectedBaselineSha256: '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac' };
const trial = { ...common, expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a' };
const pins = { ...current, expectedRunnerSha256: 'b'.repeat(64), expectedNodeSha256: 'c'.repeat(64), expectedPrismaCliSha256: 'd'.repeat(64) };
const CURRENT_BASELINE = resolve(root, '.scratch/pilot-current-data-before70-20260911T0024Z.json');
const TRIAL_BASELINE = resolve(root, '.scratch/pilot-trial-data-before70-20260910T2308Z.json');
const CURRENT_MARKER = resolve(root, '.scratch/pilot-current-migration-br-nameless-moon-ax8nmuwj.attempt.json');
const TRIAL_MARKER = resolve(root, '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json');
const OLD_T_MARKER = Buffer.from('RETAINED_SYNTHETIC_TRIAL_ATTEMPT');
const CURRENT_HOST = 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech';
const SENTINEL = 'PEER_SYNTHETIC_NOT_REAL_PASSWORD';
const frame = (host = CURRENT_HOST) => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1',
  url: `postgresql://neondb_owner:${SENTINEL}@${host}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1` }));
const input = (host = CURRENT_HOST) => Readable.from([frame(host)]);
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', readOnly: 'on', tls: false, versionNum: 180006,
    historyCount: count, rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, count).map(e => ({
      migration_name: e.migrationName, checksum: e.sha256, finished_at: '2026-09-10T12:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(a => a.includes('new PrismaClient'));
const isMigration = (args: string[]) => args[1] === 'migrate';
const migrations = () => mock.child.mock.calls.filter((c: unknown[]) => isMigration(c[1] as string[]));
const probes = () => mock.child.mock.calls.filter((c: unknown[]) => isProbe(c[1] as string[]));
const run = () => runPilotCurrentMigration(current, { input: input() });
beforeEach(() => {
  mock.child.mockReset(); mock.write.mockReset(); mock.client.mockReset(); mock.files.clear(); mock.dirs.clear();
  mock.files.set(CURRENT_BASELINE, Buffer.from('PEER_CURRENT_BASELINE')); mock.files.set(TRIAL_BASELINE, Buffer.from('PEER_TRIAL_BASELINE'));
  mock.files.set(TRIAL_MARKER, Buffer.from(OLD_T_MARKER)); mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.client.mockReturnValue({ treeSha256: 'e'.repeat(64), schemaSha256: 'f'.repeat(64) });
  mock.write.mockImplementation((file: string, bytes: string | Buffer, options: { flag: string }) => {
    expect(options.flag).toBe('wx'); if (mock.files.has(file)) throw Error('EXCLUSIVE'); mock.files.set(file, Buffer.from(bytes));
  });
  let queried = 0;
  mock.child.mockImplementation((exe: string, args: string[]) => ({ status: 0, signal: null, stderr: '',
    stdout: exe === 'git' ? args.includes('status') ? '' : args.some(a => a.endsWith('^{tree}')) ? '1'.repeat(40) : common.expectedHead
      : isProbe(args) ? JSON.stringify(snapshot(++queried % 2 ? 70 : 79)) : isMigration(args) ? 'SYNTHETIC_ACK' : 'BOUND' }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('peer two-profile isolation — no real process or private evidence', () => {
  it('real current producer passes its real bridge parser while the existing T marker remains byte-identical', async () => {
    const result = await run();
    expect(() => validatePilotCurrentMigrationBridgeReceipt(Buffer.from(JSON.stringify(result) + '\n'), pins)).not.toThrow();
    expect(result).toMatchObject({ version: 'pilot-current-migration-receipt-v1', status: 'PERSONAL_PILOT_HISTORY_79_VERIFIED',
      target: { hostname: CURRENT_HOST, branchId: 'br-nameless-moon-ax8nmuwj' }, executionAuthorized: false, dataPreservationVerified: false });
    expect(migrations()).toHaveLength(1); expect(probes()).toHaveLength(2);
    expect(mock.files.get(TRIAL_MARKER)).toEqual(OLD_T_MARKER); expect(mock.files.has(CURRENT_MARKER)).toBe(true);
    expect(mock.write.mock.calls.some((c: unknown[]) => c[0] === TRIAL_MARKER)).toBe(false);
    const marker = JSON.parse(mock.files.get(CURRENT_MARKER)!.toString());
    expect(marker).toMatchObject({ target: { hostname: CURRENT_HOST }, baselineSha256: current.expectedBaselineSha256, automaticRetry: false });
    expect(() => validatePilotTrialMigrationBridgeReceipt(Buffer.from(JSON.stringify(result) + '\n'), { ...pins, ...trial })).toThrow();
  });
  it('retained T attempt refuses before private input even when current profile has never run', async () => {
    const read = vi.fn();
    await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', trial, { input: new Readable({ read }) })).rejects.toThrow('MIGRATION_REFUSED_BEFORE_SPAWN');
    expect(read).not.toHaveBeenCalled(); expect(probes()).toHaveLength(0); expect(migrations()).toHaveLength(0);
    expect(mock.files.get(TRIAL_MARKER)).toEqual(OLD_T_MARKER); expect(mock.files.has(CURRENT_MARKER)).toBe(false);
  });
  it('same database/role/password cannot cross either closed credential host', async () => {
    expect(() => decodePilotTrialCredential(frame())).toThrow('CREDENTIAL_REFUSED');
    expect(() => decodePilotCurrentCredential(frame(PILOT_TRIAL_TARGET.hostname))).toThrow('CREDENTIAL_REFUSED');
    await expect(runPilotCurrentMigration(current, { input: input(PILOT_TRIAL_TARGET.hostname) })).rejects.toThrow('REFUSED_BEFORE_SPAWN');
    expect(probes()).toHaveLength(0); expect(migrations()).toHaveLength(0); expect(mock.files.has(CURRENT_MARKER)).toBe(false);
  });
  it('current baseline pin and actual current bytes cannot be replaced by the equally valid T evidence', async () => {
    const read = vi.fn();
    await expect(runPilotCurrentMigration(trial, { input: new Readable({ read }) })).rejects.toThrow('BASELINE_PIN_REFUSED');
    expect(read).not.toHaveBeenCalled();
    mock.files.set(CURRENT_BASELINE, Buffer.from('PEER_TRIAL_BASELINE'));
    await expect(run()).rejects.toThrow('REFUSED_BEFORE_SPAWN');
    expect(probes()).toHaveLength(0); expect(migrations()).toHaveLength(0); expect(mock.files.has(CURRENT_MARKER)).toBe(false);
  });
  it('current uncertain attempt cannot retry or overwrite either marker', async () => {
    const original = mock.child.getMockImplementation()!;
    mock.child.mockImplementation((exe: string, args: string[]) => { if (isMigration(args)) throw Error(SENTINEL); return original(exe, args); });
    await expect(run()).rejects.toThrow('PERSONAL_PILOT_MIGRATION_OUTCOME_UNCERTAIN');
    const retained = Buffer.from(mock.files.get(CURRENT_MARKER)!); const read = vi.fn();
    await expect(runPilotCurrentMigration(current, { input: new Readable({ read }) })).rejects.toThrow('REFUSED_BEFORE_SPAWN');
    expect(read).not.toHaveBeenCalled(); expect(migrations()).toHaveLength(1);
    expect(mock.files.get(CURRENT_MARKER)).toEqual(retained); expect(mock.files.get(TRIAL_MARKER)).toEqual(OLD_T_MARKER);
  });
  it('personal parsers close over11/15 arguments and a GO environment value cannot admit extra CLI arguments', async () => {
    const runnerArgs = ['--personal-pilot', '--mode', 'MIGRATE_70_TO_79', '--expected-head', current.expectedHead,
      '--expected-catalog-sha256', current.expectedCatalogSha256, '--expected-baseline-sha256', current.expectedBaselineSha256,
      '--expected-history70-sha256', current.expectedHistory70Sha256];
    const bridgeArgs = ['--personal-pilot', '--expected-head', current.expectedHead, '--expected-catalog-sha256', current.expectedCatalogSha256,
      '--expected-runner-sha256', pins.expectedRunnerSha256, '--expected-node-sha256', pins.expectedNodeSha256,
      '--expected-prisma-cli-sha256', pins.expectedPrismaCliSha256, '--expected-baseline-sha256', current.expectedBaselineSha256,
      '--expected-history70-sha256', current.expectedHistory70Sha256];
    expect(parsePilotCurrentPrismaArguments(runnerArgs)).toEqual({ mode: 'MIGRATE_70_TO_79', expected: current });
    expect(parsePilotCurrentMigrationBridgeArgs(bridgeArgs)).toEqual(pins);
    expect(() => parsePilotCurrentPrismaArguments([...runnerArgs, '--target', 'other'])).toThrow();
    expect(() => parsePilotCurrentMigrationBridgeArgs([...bridgeArgs, '--target', 'other'])).toThrow();
    vi.stubEnv('PILOT_CURRENT_MIGRATION_GO', 'true');
    await expect(runPilotCurrentMigrationBridgeCli([...bridgeArgs, '--activate'])).rejects.toThrow();
    expect(mock.child).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
});
