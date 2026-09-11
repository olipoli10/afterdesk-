import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), sync: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), dirs: new Set<string>(), prefix: '' }));
vi.mock('node:child_process', async original => ({ ...await original<object>(), spawn: mock.spawn, spawnSync: mock.sync }));
// Only these two synthetic inputs stand in for private pinned evidence. All
// processes/filesystem writes are simulated; this is NOT a migration or SQL test.
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(bytes: string | Buffer) { text += Buffer.from(bytes).toString(); h.update(bytes); return this; }, digest(encoding: 'hex') {
      if (text === 'SYNTHETIC_BASELINE_BYTES') return '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
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
    writeFileSync: (file: string, bytes: string | Buffer) => { if (mock.files.has(file)) throw Error('EXISTS'); mock.files.set(file, Buffer.from(bytes)); },
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
import { runPilotTrialPrisma, PILOT_TRIAL_TARGET } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
import { parsePilotTrialMigrationBridgeArgs, runPilotTrialMigrationBridgeCli, runPilotTrialMigrationPrivateBridge,
  validatePilotTrialMigrationBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';
const root = process.cwd(), runner = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const catalog = buildPilotMigrationCatalog(root);
const pins = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: catalog.catalogSha256,
  expectedRunnerSha256: hash(readFileSync(runner)), expectedNodeSha256: hash('SYNTHETIC_NODE_RUNTIME'), expectedPrismaCliSha256: hash('SYNTHETIC_PRISMA_CLI'),
  expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a',
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const args = () => ['--migration', '--expected-head', pins.expectedHead, '--expected-catalog-sha256', pins.expectedCatalogSha256,
  '--expected-runner-sha256', pins.expectedRunnerSha256, '--expected-node-sha256', pins.expectedNodeSha256,
  '--expected-prisma-cli-sha256', pins.expectedPrismaCliSha256, '--expected-baseline-sha256', pins.expectedBaselineSha256,
  '--expected-history70-sha256', pins.expectedHistory70Sha256];
const SENTINEL = 'SYNTHETIC_NONSECRET_SENTINEL_1234';
const frame = () => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1',
  url: `postgresql://neondb_owner:${SENTINEL}@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1` }));
const history = (count: number) => ({ count, versionNum: 180006, historySha256: count === 70 ? pins.expectedHistory70Sha256 : 'e'.repeat(64),
  prior70Sha256: pins.expectedHistory70Sha256, targetProviderProvenanceVerified: false, dataPreservationVerified: false, backendConnectionSslObserved: false });
const receipt = () => ({ version: 'pilot-trial-migration-receipt-v1', mode: 'MIGRATE_70_TO_79', status: 'MIGRATION_HISTORY_79_VERIFIED',
  sourceHead: pins.expectedHead, catalogSha256: pins.expectedCatalogSha256, sourceFingerprint: 'c'.repeat(64),
  baselineSha256: pins.expectedBaselineSha256, history70Sha256: pins.expectedHistory70Sha256, target: { ...PILOT_TRIAL_TARGET },
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
let child: Child;
// JS defaults infer concrete process streams; these explicit synthetic doubles
// exercise the same runtime methods without claiming to be native TTY handles.
const invokeBridge = runPilotTrialMigrationPrivateBridge as unknown as
  (pins: object, tty: Tty, output: { write: (text: string) => boolean }) => Promise<void>;
function start(tty = new Tty(), value: object = pins) {
  const output = { write: vi.fn(() => true) };
  const promise = invokeBridge(value, tty, output);
  tty.emit('data', Buffer.concat([frame(), Buffer.from([4])]));
  return { promise, tty, output };
}
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180006, readOnly: 'on', tls: false, historyCount: count,
    rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, count).map(e => ({ migration_name: e.migrationName,
      checksum: e.sha256, finished_at: '2026-09-10T00:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.files.clear(); mock.dirs.clear(); mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.files.set(resolve(root, '.scratch/pilot-trial-data-before70-20260910T2308Z.json'), Buffer.from('SYNTHETIC_BASELINE_BYTES'));
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

describe('migration bridge — synthetic ingress, no OS child/DB or private evidence', () => {
  it('CLI rejects extra arguments before source reads or child while preserving exact parser', async () => {
    expect(parsePilotTrialMigrationBridgeArgs(args())).toEqual(pins);
    await expect(runPilotTrialMigrationBridgeCli([...args(), '--activate'])).rejects.toThrow();
    expect(mock.sync).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['extra', 'mode', 'baseline', 'history', 'missing'])('refuses CLI %s', kind => {
    const a = args(); if (kind === 'extra') a.push('--activate'); if (kind === 'mode') a[0] = '--arbitrary';
    if (kind === 'baseline') a[12] = '0'.repeat(64); if (kind === 'history') a[14] = '0'.repeat(64); if (kind === 'missing') a.pop();
    expect(() => parsePilotTrialMigrationBridgeArgs(a)).toThrow();
  });
  it('one child exact arguments, pipe EOF, source recheck, restore then closed success only', async () => {
    const { promise, tty, output } = start(); await promise;
    expect(mock.spawn).toHaveBeenCalledTimes(1); expect(child.received).toEqual(frame()); expect(child.stdin.end).toHaveBeenCalledTimes(1);
    const [exe, argv, options] = mock.spawn.mock.calls[0];
    expect(exe).toBe(process.execPath); expect(argv).toEqual([resolve(root, runner), '--mode', 'MIGRATE_70_TO_79', '--expected-head', pins.expectedHead,
      '--expected-catalog-sha256', pins.expectedCatalogSha256, '--expected-baseline-sha256', pins.expectedBaselineSha256, '--expected-history70-sha256', pins.expectedHistory70Sha256]);
    expect(options).toMatchObject({ shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); expect(options.env).not.toHaveProperty('DATABASE_URL');
    expect(tty.isRaw).toBe(false); expect(tty.listenerCount('data')).toBe(0);
    expect(output.write.mock.calls.flat()).toEqual(['PILOT_TRIAL_MIGRATION_BRIDGE_READY\n', 'PILOT_TRIAL_MIGRATION_BRIDGE_HISTORY_79_VERIFIED\n']);
    expect(JSON.stringify(mock.spawn.mock.calls)).not.toContain(SENTINEL);
    expect(mock.sync.mock.calls.filter(c => c[1].includes('status'))).toHaveLength(4);
  });
  it('real runner return serialization crosses actual bridge validator and pipe unchanged', async () => {
    let actual: unknown;
    child.produce = async () => actual = await runPilotTrialPrisma('MIGRATE_70_TO_79', {
      expectedHead: pins.expectedHead, expectedCatalogSha256: pins.expectedCatalogSha256,
      expectedBaselineSha256: pins.expectedBaselineSha256, expectedHistory70Sha256: pins.expectedHistory70Sha256,
    }, { input: Readable.from([Buffer.from(child.received!)]) });
    await start().promise;
    expect(actual).toMatchObject({ status: 'MIGRATION_HISTORY_79_VERIFIED', history: { count: 79 }, migrationInvoked: true });
    expect(() => validatePilotTrialMigrationBridgeReceipt(encode(actual), pins)).not.toThrow();
    expect(mock.sync.mock.calls.filter(c => c[1][1] === 'migrate')).toHaveLength(1);
    expect(mock.sync.mock.calls.filter(c => c[1].some((a: string) => a.includes('new PrismaClient')))).toHaveLength(2);
    expect(mock.spawn).toHaveBeenCalledTimes(1);
  });
  it.each(['baselineSha256', 'history70Sha256', 'sourceHead', 'catalogSha256', 'status', 'mode', 'clientTransportPolicy', 'sourceFingerprint'])(
    'refuses mismatched receipt %s', key => { const r = { ...receipt(), [key]: 'wrong' }; expect(() => validatePilotTrialMigrationBridgeReceipt(encode(r), pins)).toThrow(); });
  it.each(['automaticRetry', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified', 'schemaPreservationVerified'])(
    'never accepts %s claim', key => expect(() => validatePilotTrialMigrationBridgeReceipt(encode({ ...receipt(), [key]: true }), pins)).toThrow());
  it.each(['precount', 'postcount', 'priorhash', 'prehash', 'version', 'extra', 'elapsed', 'budget', 'target', 'transport', 'duplicate', 'order'])(
    'refuses receipt %s', kind => {
      const r = receipt(); let bytes: Buffer;
      if (kind === 'precount') r.preflightHistory.count = 79; if (kind === 'postcount') r.history.count = 70;
      if (kind === 'priorhash') r.history.prior70Sha256 = 'a'.repeat(64); if (kind === 'prehash') r.preflightHistory.historySha256 = 'a'.repeat(64);
      if (kind === 'version') r.history.versionNum = 180007; if (kind === 'elapsed') r.elapsedMs = 180000;
      if (kind === 'budget') r.childBudgetMs++; if (kind === 'target') Object.assign(r.target, { branchId: 'other' });
      if (kind === 'transport') Object.assign(r.history, { backendConnectionSslObserved: 'true' });
      if (kind === 'extra') Object.assign(r.history, { authority: true });
      bytes = encode(r); if (kind === 'duplicate') bytes = Buffer.from(bytes.toString().replace('{', '{"version":"bad",'));
      if (kind === 'order') bytes = encode(Object.fromEntries(Object.entries(r).reverse()));
      expect(() => validatePilotTrialMigrationBridgeReceipt(bytes, pins)).toThrow();
    });
  it('restoration failure after successful child remains uncertain without verified marker', async () => {
    const tty = new Tty(); tty.setRawMode.mockImplementation(v => { if (!v) throw Error(SENTINEL); tty.isRaw = v; return tty; });
    const s = start(tty); await expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY'); expect(s.output.write).toHaveBeenCalledTimes(1);
  });
  it('nonTTY refuses before child without suggesting DB work occurred', async () => {
    const tty = new Tty(); tty.isTTY = false;
    await expect(start(tty).promise).rejects.toThrow('REFUSED_BEFORE_CHILD'); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it('child receipt corruption is uncertain, never retried and never forwarded', async () => {
    child.produce = async () => ({ raw: SENTINEL }); const s = start();
    await expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN'); expect(mock.spawn).toHaveBeenCalledTimes(1); expect(s.output.write).toHaveBeenCalledTimes(1);
  });
  it('valid receipt bytes cannot override a nonzero child exit', async () => {
    child.auto = false; const s = start(), rejected = expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN');
    await Promise.resolve(); child.stdout.emit('data', encode()); child.emit('close', 1, null); await rejected;
    expect(mock.spawn).toHaveBeenCalledTimes(1); expect(s.output.write).toHaveBeenCalledTimes(1); expect(s.tty.isRaw).toBe(false);
  });
  it('source change during ingress refuses before child and restores terminal', async () => {
    const tty = new Tty(), output = { write: vi.fn(() => true) };
    const p = invokeBridge(pins, tty, output);
    mock.sync.mockReturnValue({ status: 0, signal: null, stdout: Buffer.from('DIRTY') });
    tty.emit('data', Buffer.concat([frame(), Buffer.from([4])]));
    await expect(p).rejects.toThrow('REFUSED_BEFORE_CHILD'); expect(mock.spawn).not.toHaveBeenCalled(); expect(tty.isRaw).toBe(false);
  });
  it('migration input still expires at45s before child', async () => {
    vi.useFakeTimers(); const tty = new Tty(), output = { write: vi.fn(() => true) };
    const p = invokeBridge(pins, tty, output), rejected = expect(p).rejects.toThrow('REFUSED_BEFORE_CHILD');
    await vi.advanceTimersByTimeAsync(45000); await rejected;
    expect(mock.spawn).not.toHaveBeenCalled(); expect(tty.isRaw).toBe(false); expect(output.write).toHaveBeenCalledTimes(1);
  });
  it('185s timeout kills only owned child, with bounded2s cleanup when close missing', async () => {
    vi.useFakeTimers(); child.auto = false; child.kill.mockImplementation(() => true);
    const s = start(), assertion = expect(s.promise).rejects.toThrow('OUTCOME_UNCERTAIN'); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(184999); expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(child.kill).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000); await assertion; expect(child.unref).toHaveBeenCalledTimes(1); expect(s.tty.isRaw).toBe(false);
  });
});
