import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), sync: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), dirs: new Set<string>(), prefix: '' }));
vi.mock('node:child_process', async original => ({ ...await original<object>(), spawn: mock.spawn, spawnSync: mock.sync }));
// Two named synthetic inputs stand in for private captures only. No private
// file, real subprocess, SQL, credential or migration is used by this suite.
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(b: string | Buffer) { text += Buffer.from(b).toString(); h.update(b); return this; }, digest(encoding: 'hex') {
      if (text === 'SYNTHETIC_CURRENT_BASELINE_BYTES') return '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac';
      if (mock.prefix && text === mock.prefix) return '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
      return h.digest(encoding);
    } };
  } };
});
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual,
    readFileSync: (file: string, options?: never) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!)
      : String(file) === process.execPath ? Buffer.from('SYNTHETIC_NODE_RUNTIME')
      : String(file).replaceAll('\\', '/').endsWith('/prisma/build/index.js') ? Buffer.from('SYNTHETIC_PRISMA_CLI') : actual.readFileSync(file, options),
    writeFileSync: (file: string, b: string | Buffer) => { if (mock.files.has(file)) throw Error('EXISTS'); mock.files.set(file, Buffer.from(b)); },
    mkdirSync: (file: string) => { for (let d = file; d !== resolve(process.cwd(), '.scratch'); d = dirname(d)) mock.dirs.add(d); },
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
import { runPilotCurrentMigration, parsePilotCurrentPrismaArguments } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
import { parsePilotCurrentMigrationBridgeArgs, runPilotCurrentMigrationBridgeCli, runPilotCurrentMigrationPrivateBridge,
  validatePilotCurrentMigrationBridgeReceipt, parsePilotTrialMigrationBridgeArgs, runPilotTrialMigrationPrivateBridge,
  validatePilotTrialMigrationBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';
const root = process.cwd(), runner = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex'), catalog = buildPilotMigrationCatalog(root);
const pins = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: catalog.catalogSha256,
  expectedRunnerSha256: hash(readFileSync(runner)), expectedNodeSha256: hash('SYNTHETIC_NODE_RUNTIME'), expectedPrismaCliSha256: hash('SYNTHETIC_PRISMA_CLI'),
  expectedBaselineSha256: '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac',
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const trialPins = { ...pins, expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a' };
const target = { projectId: 'withered-mud-08129552', branchId: 'br-nameless-moon-ax8nmuwj', endpointId: 'ep-purple-union-axj3h2t5',
  hostname: 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' };
const trialHost = 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech';
const args = () => ['--personal-pilot', '--expected-head', pins.expectedHead, '--expected-catalog-sha256', pins.expectedCatalogSha256,
  '--expected-runner-sha256', pins.expectedRunnerSha256, '--expected-node-sha256', pins.expectedNodeSha256,
  '--expected-prisma-cli-sha256', pins.expectedPrismaCliSha256, '--expected-baseline-sha256', pins.expectedBaselineSha256,
  '--expected-history70-sha256', pins.expectedHistory70Sha256];
const SENTINEL = 'SYNTHETIC_NONSECRET_SENTINEL_1234';
const frame = (host = target.hostname) => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1',
  url: `postgresql://neondb_owner:${SENTINEL}@${host}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1` }));
const history = (count: number) => ({ count, versionNum: 180006, historySha256: count === 70 ? pins.expectedHistory70Sha256 : 'e'.repeat(64),
  prior70Sha256: pins.expectedHistory70Sha256, targetProviderProvenanceVerified: false, dataPreservationVerified: false, backendConnectionSslObserved: false });
const receipt = () => ({ version: 'pilot-current-migration-receipt-v1', mode: 'MIGRATE_70_TO_79', status: 'PERSONAL_PILOT_HISTORY_79_VERIFIED',
  sourceHead: pins.expectedHead, catalogSha256: pins.expectedCatalogSha256, sourceFingerprint: 'c'.repeat(64),
  baselineSha256: pins.expectedBaselineSha256, history70Sha256: pins.expectedHistory70Sha256, target: { ...target },
  preflightHistory: history(70), history: history(79), clientTransportPolicy: 'PRISMA_REQUIRE_TLS_STRICT_CERT', childExit: 0,
  automaticRetry: false, migrationInvoked: true, executionAuthorized: false, backupVerified: false, dataPreservationVerified: false,
  schemaPreservationVerified: false, totalBudgetMs: 180000, childBudgetMs: 120000, postflightReserveMs: 20000, elapsedMs: 100 });
const encode = (r: unknown = receipt()) => Buffer.from(JSON.stringify(r) + '\n');
class Tty extends EventEmitter {
  isTTY = true; isRaw = false;
  setRawMode = vi.fn((v: boolean) => { this.isRaw = v; return this; });
  pause = vi.fn(() => this); resume = vi.fn(() => this);
}
class Pipe extends EventEmitter { destroy = vi.fn(); }
class Child extends EventEmitter {
  stdout = new Pipe(); stderr = new Pipe(); received?: Buffer; auto = true;
  produce: () => Promise<unknown> = async () => receipt();
  stdin = Object.assign(new Pipe(), { end: vi.fn((b: Buffer, done: () => void) => {
    this.received = Buffer.from(b); done();
    if (this.auto) void this.produce().then(r => { this.stdout.emit('data', encode(r)); this.emit('close', 0, null); }, () => this.emit('close', 1, null));
  }) });
  kill = vi.fn(() => { queueMicrotask(() => this.emit('close', null, 'SIGTERM')); return true; }); unref = vi.fn();
}
type Bridge = (pins: object, tty: Tty, output: { write: (text: string) => boolean }) => Promise<void>;
const invoke = runPilotCurrentMigrationPrivateBridge as unknown as Bridge, invokeTrial = runPilotTrialMigrationPrivateBridge as unknown as Bridge;
let child: Child;
function start(tty = new Tty(), value: object = pins, bytes = frame(), call = invoke) {
  const output = { write: vi.fn(() => true) }, promise = call(value, tty, output);
  tty.emit('data', Buffer.concat([bytes, Buffer.from([4])])); return { promise, tty, output };
}
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180006, readOnly: 'on', tls: false, historyCount: count,
    rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, count).map(e => ({ migration_name: e.migrationName,
      checksum: e.sha256, finished_at: '2026-09-10T00:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.files.clear(); mock.dirs.clear(); mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.files.set(resolve(root, '.scratch/pilot-current-data-before70-20260911T0024Z.json'), Buffer.from('SYNTHETIC_CURRENT_BASELINE_BYTES'));
  mock.client.mockReturnValue({ treeSha256: 'c'.repeat(64), schemaSha256: 'd'.repeat(64) });
  let probes = 0;
  mock.sync.mockReset().mockImplementation((exe: string, argv: string[], options: { encoding?: string }) => {
    const s = exe === 'git' ? argv.includes('status') ? '' : argv.includes('show') ? readFileSync(resolve(root, argv.at(-1)!.slice(41))).toString()
      : argv.some(a => a.endsWith('^{tree}')) ? 'b'.repeat(40) : pins.expectedHead
      : argv.some(a => a.includes('new PrismaClient')) ? JSON.stringify(snapshot(++probes === 1 ? 70 : 79)) : 'BOUND';
    return { status: 0, signal: null, stderr: '', stdout: options.encoding ? s : Buffer.from(s) };
  });
  child = new Child(); mock.spawn.mockReset().mockReturnValue(child);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('personal closed bridge — simulated processes only', () => {
  it('personal CLI selects personal refusal on nonTTY and rejects false pins before input', async () => {
    expect(parsePilotCurrentMigrationBridgeArgs(args())).toEqual(pins);
    // Test process is not a raw terminal; no credential input can be admitted.
    expect(process.stdin.isTTY).not.toBe(true);
    await expect(runPilotCurrentMigrationBridgeCli(args())).rejects.toThrow('PILOT_CURRENT_MIGRATION_BRIDGE_REFUSED_BEFORE_CHILD_NO_AUTOMATIC_RETRY');
    const wrong = args(); wrong[12] = trialPins.expectedBaselineSha256;
    await expect(runPilotCurrentMigrationBridgeCli(wrong)).rejects.toThrow();
    expect(mock.sync).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['extra', 'trial-prefix', 'trial-baseline', 'unknown-history', 'preflight', 'missing'])('rejects %s args', kind => {
    const a = args(); if (kind === 'extra') a.push('--activate'); if (kind === 'trial-prefix') a[0] = '--migration';
    if (kind === 'trial-baseline') a[12] = trialPins.expectedBaselineSha256; if (kind === 'unknown-history') a[14] = '0'.repeat(64);
    if (kind === 'preflight') a.push('--mode', 'PREFLIGHT_70'); if (kind === 'missing') a.pop();
    expect(() => parsePilotCurrentMigrationBridgeArgs(a)).toThrow();
  });
  it('trial parser rejects personal prefix and baseline independently', () => {
    expect(() => parsePilotTrialMigrationBridgeArgs(args())).toThrow(); const a = args(); a[0] = '--migration';
    expect(() => parsePilotTrialMigrationBridgeArgs(a)).toThrow();
  });
  it.each(['personal-to-trial', 'trial-to-personal'])('rejects credential %s before any child', async direction => {
    const s = direction === 'personal-to-trial' ? start(new Tty(), trialPins, frame(), invokeTrial) : start(new Tty(), pins, frame(trialHost));
    await expect(s.promise).rejects.toThrow('REFUSED_BEFORE_CHILD'); expect(mock.spawn).not.toHaveBeenCalled(); expect(s.tty.isRaw).toBe(false);
  });
  it.each(['trialpins', 'accessor', 'target', 'profile'])('rejects %s options before credential admission', async kind => {
    const value = kind === 'trialpins' ? trialPins : { ...pins }, getter = vi.fn();
    if (kind === 'accessor') Object.defineProperty(value, 'expectedBaselineSha256', { enumerable: true, get: getter });
    if (kind === 'target' || kind === 'profile') Object.assign(value, { [kind]: kind === 'target' ? target : 'TRIAL' });
    const s = start(new Tty(), value); await expect(s.promise).rejects.toThrow('REFUSED_BEFORE_CHILD');
    expect(getter).not.toHaveBeenCalled(); expect(s.output.write).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it('exact11 childargs are consumed by the real personal runner parser', async () => {
    const s = start(); await s.promise; expect(mock.spawn).toHaveBeenCalledTimes(1);
    const [exe, argv, options] = mock.spawn.mock.calls[0];
    expect(exe).toBe(process.execPath); expect(argv).toEqual([resolve(root, runner), '--personal-pilot', '--mode', 'MIGRATE_70_TO_79', '--expected-head', pins.expectedHead,
      '--expected-catalog-sha256', pins.expectedCatalogSha256, '--expected-baseline-sha256', pins.expectedBaselineSha256, '--expected-history70-sha256', pins.expectedHistory70Sha256]);
    expect(parsePilotCurrentPrismaArguments(argv.slice(1))).toMatchObject({ expected: { expectedBaselineSha256: pins.expectedBaselineSha256 } });
    expect(options).toMatchObject({ shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); expect(options.env).not.toHaveProperty('DATABASE_URL');
    expect(child.received).toEqual(frame()); expect(s.tty.isRaw).toBe(false);
    expect(s.output.write.mock.calls.flat()).toEqual(['PILOT_CURRENT_MIGRATION_BRIDGE_READY\n', 'PILOT_CURRENT_MIGRATION_BRIDGE_HISTORY_79_VERIFIED\n']);
    expect(JSON.stringify(mock.spawn.mock.calls)).not.toContain(SENTINEL);
  });
  it('actual producer under mocks serializes a personal receipt accepted only by personal bridge', async () => {
    let actual: unknown;
    child.produce = async () => actual = await runPilotCurrentMigration({ expectedHead: pins.expectedHead, expectedCatalogSha256: pins.expectedCatalogSha256,
      expectedBaselineSha256: pins.expectedBaselineSha256, expectedHistory70Sha256: pins.expectedHistory70Sha256 }, { input: Readable.from([Buffer.from(child.received!)]) });
    await start().promise;
    expect(actual).toMatchObject({ version: 'pilot-current-migration-receipt-v1', status: 'PERSONAL_PILOT_HISTORY_79_VERIFIED', target, migrationInvoked: true });
    expect(() => validatePilotCurrentMigrationBridgeReceipt(encode(actual), pins)).not.toThrow();
    expect(() => validatePilotTrialMigrationBridgeReceipt(encode(actual), trialPins)).toThrow();
    expect(mock.sync.mock.calls.filter(c => c[1][1] === 'migrate')).toHaveLength(1);
    expect(mock.sync.mock.calls.filter(c => c[1].some((a: string) => a.includes('new PrismaClient')))).toHaveLength(2);
    expect(mock.files.has(resolve(root, '.scratch/pilot-current-migration-br-nameless-moon-ax8nmuwj.attempt.json'))).toBe(true);
    expect(mock.files.has(resolve(root, '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json'))).toBe(false);
  });
  it.each(['version', 'status', 'baseline', 'target', 'history', 'authority', 'schema', 'count', 'deadline', 'extra'])(
    'rejects changed receipt %s', kind => {
      const r = receipt(); if (kind === 'version') r.version = 'pilot-trial-migration-receipt-v1'; if (kind === 'status') r.status = 'MIGRATION_HISTORY_79_VERIFIED';
      if (kind === 'baseline') r.baselineSha256 = trialPins.expectedBaselineSha256; if (kind === 'target') r.target.hostname = trialHost;
      if (kind === 'history') r.history.prior70Sha256 = '0'.repeat(64); if (kind === 'authority') r.executionAuthorized = true;
      if (kind === 'schema') r.schemaPreservationVerified = true; if (kind === 'count') r.history.count = 70;
      if (kind === 'deadline') r.elapsedMs = 180000; if (kind === 'extra') Object.assign(r, { profile: 'PERSONAL_PILOT' });
      expect(() => validatePilotCurrentMigrationBridgeReceipt(encode(r), pins)).toThrow();
    });
  it('valid receipt with exit1 remains uncertain', async () => {
    child.auto = false; const s = start(), rejected = expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN'); await Promise.resolve();
    child.stdout.emit('data', encode()); child.emit('close', 1, null); await rejected;
    expect(s.output.write).toHaveBeenCalledTimes(1); expect(mock.spawn).toHaveBeenCalledTimes(1);
  });
  it('failed terminal restoration after a known receipt does not publish success', async () => {
    const tty = new Tty(); tty.setRawMode.mockImplementation(v => { if (!v) throw Error(SENTINEL); tty.isRaw = v; return tty; });
    const s = start(tty); await expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN'); expect(s.output.write).toHaveBeenCalledTimes(1);
  });
  it('source recheck after ingress refuses changed tree before child', async () => {
    const tty = new Tty(), output = { write: vi.fn(() => true) }, p = invoke(pins, tty, output);
    mock.sync.mockReturnValue({ status: 0, signal: null, stdout: Buffer.from('DIRTY') }); tty.emit('data', Buffer.concat([frame(), Buffer.from([4])]));
    await expect(p).rejects.toThrow('REFUSED_BEFORE_CHILD'); expect(mock.spawn).not.toHaveBeenCalled(); expect(tty.isRaw).toBe(false);
  });
  it('still bounds raw input at45s and restores without child', async () => {
    vi.useFakeTimers(); const tty = new Tty(), output = { write: vi.fn(() => true) }, p = invoke(pins, tty, output);
    const rejected = expect(p).rejects.toThrow('REFUSED_BEFORE_CHILD'); await vi.advanceTimersByTimeAsync(45000); await rejected;
    expect(tty.isRaw).toBe(false); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it('185s child timeout retains2s owned cleanup and never retries', async () => {
    vi.useFakeTimers(); child.auto = false; child.kill.mockImplementation(() => true);
    const s = start(), rejected = expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN'); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(185000); expect(child.kill).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000); await rejected; expect(child.unref).toHaveBeenCalledTimes(1); expect(mock.spawn).toHaveBeenCalledTimes(1);
  });
});
