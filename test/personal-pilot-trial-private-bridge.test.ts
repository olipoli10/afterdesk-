import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), sync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mock.spawn, spawnSync: mock.sync }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: (file: string, options?: never) => String(file) === process.execPath ? Buffer.from('SYNTHETIC_NODE_RUNTIME')
    : String(file).replaceAll('\\', '/').endsWith('/prisma/build/index.js') ? Buffer.from('SYNTHETIC_PRISMA_CLI') : actual.readFileSync(file, options) };
});
import { inspectPilotTrialBridgeSource, parsePilotTrialBridgeArgs, readPilotTrialBridgeFrame, runPilotTrialPrivateBridge,
  validatePilotTrialBridgeFrame, validatePilotTrialBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';

const ROOT = process.cwd(), runner = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const pins = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: 'b'.repeat(64), expectedRunnerSha256: hash(readFileSync(runner)),
  expectedNodeSha256: hash('SYNTHETIC_NODE_RUNTIME'), expectedPrismaCliSha256: hash('SYNTHETIC_PRISMA_CLI') };
const target = { projectId: 'withered-mud-08129552', branchId: 'br-holy-brook-ax7k68oh', endpointId: 'ep-crimson-violet-axmmwtjw',
  hostname: 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' };
const SENTINEL = 'SYNTHETIC_NONSECRET_SENTINEL_1234';
const frame = () => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1',
  url: `postgresql://neondb_owner:${SENTINEL}@${target.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1` }));
const wire = () => Buffer.concat([frame(), Buffer.from([4])]);
const receipt = () => ({ version: 'pilot-trial-prisma-receipt-v1', mode: 'PREFLIGHT_70', status: 'READ_ONLY_PREFLIGHT_70_MATCH',
  sourceHead: pins.expectedHead, catalogSha256: pins.expectedCatalogSha256, sourceFingerprint: 'c'.repeat(64), target: { ...target },
  history: { count: 70, versionNum: 180006, historySha256: 'd'.repeat(64), prior70Sha256: 'd'.repeat(64),
    targetProviderProvenanceVerified: false, dataPreservationVerified: false }, childExit: 0, automaticRetry: false,
  migrationInvoked: false, executionAuthorized: false, backupVerified: false, dataPreservationVerified: false, elapsedMs: 1000 });
const encode = (value = receipt()) => Buffer.from(JSON.stringify(value) + '\n');
const REFUSED = 'PILOT_TRIAL_BRIDGE_REFUSED_NO_AUTOMATIC_RETRY';
class Tty extends EventEmitter {
  isTTY = true; isRaw = false;
  setRawMode = vi.fn((raw: boolean) => { this.isRaw = raw; return this; });
  pause = vi.fn(() => this); resume = vi.fn(() => this);
}
class Pipe extends EventEmitter { destroy = vi.fn(); }
class Child extends EventEmitter {
  stdout = new Pipe(); stderr = new Pipe(); received?: Buffer;
  stdin = Object.assign(new Pipe(), { end: vi.fn((bytes: Buffer, callback: () => void) => {
    this.received = Buffer.from(bytes); callback();
    if (this.auto) queueMicrotask(() => { this.stdout.emit('data', encode()); this.emit('close', 0, null); });
  }) });
  auto = true;
  kill = vi.fn(() => { queueMicrotask(() => this.emit('close', null, 'SIGTERM')); return true; });
  unref = vi.fn();
}
let child: Child;
function sourceProcess(_exe: string, args: string[]) {
  const stdout = args.includes('status') ? Buffer.alloc(0) : args.includes('show')
    ? readFileSync(path.join(ROOT, args.at(-1)!.slice(41))) : Buffer.from(pins.expectedHead + '\n');
  return { status: 0, signal: null, stdout };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.sync.mockReset().mockImplementation(sourceProcess);
  child = new Child(); mock.spawn.mockReset().mockReturnValue(child);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('strict pure frame and CLI — never real credentials', () => {
  it('accepts exact canonical synthetic frame without returning its value', () => {
    expect(validatePilotTrialBridgeFrame(frame())).toBeUndefined(); expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['empty', 'large', 'newline', 'control', 'del', 'invalidutf8', 'duplicate', 'extra', 'spaces', 'wrongtarget', 'shortpassword', 'wrongversion'])(
    'refuses %s with one fixed error', kind => {
      const text = frame().toString();
      const bytes = kind === 'empty' ? Buffer.alloc(0) : kind === 'large' ? Buffer.alloc(4097, 65)
        : kind === 'newline' ? Buffer.from(text + '\n') : kind === 'control' ? Buffer.from(text + '\x1b')
        : kind === 'del' ? Buffer.from(text + '\x7f') : kind === 'invalidutf8' ? Buffer.from([255])
        : kind === 'duplicate' ? Buffer.from(text.replace('{', '{"version":"pilot-trial-credential-v1",'))
        : kind === 'extra' ? Buffer.from(text.replace('}', ',"other":false}')) : kind === 'spaces' ? Buffer.from(' ' + text)
        : kind === 'wrongtarget' ? Buffer.from(text.replace(target.hostname, 'example.invalid'))
        : kind === 'shortpassword' ? Buffer.from(text.replace(SENTINEL, 'short')) : Buffer.from(text.replace('-v1', '-v2'));
      expect(() => validatePilotTrialBridgeFrame(bytes)).toThrow(REFUSED);
    });
  it('closed CLI pins cannot select a mode, target or executable', () => {
    const args = ['--expected-head', pins.expectedHead, '--expected-catalog-sha256', pins.expectedCatalogSha256,
      '--expected-runner-sha256', pins.expectedRunnerSha256, '--expected-node-sha256', pins.expectedNodeSha256,
      '--expected-prisma-cli-sha256', pins.expectedPrismaCliSha256];
    expect(parsePilotTrialBridgeArgs(args)).toEqual(pins);
    for (const changed of [[...args, '--mode', 'MIGRATE_70_TO_79'], args.slice(2), args.map(x => x === pins.expectedHead ? '../bad' : x)])
      expect(() => parsePilotTrialBridgeArgs(changed)).toThrow(REFUSED);
  });
  it('pin accessor is refused without invocation', () => {
    const getter = vi.fn(); const unsafe = { ...pins }; Object.defineProperty(unsafe, 'expectedHead', { enumerable: true, get: getter });
    expect(() => inspectPilotTrialBridgeSource(unsafe)).toThrow(REFUSED); expect(getter).not.toHaveBeenCalled();
  });
});

describe('raw ingress', () => {
  it('enters raw mode before READY, accepts chunks, removes listeners and returns private bytes', async () => {
    const tty = new Tty(), ready = vi.fn(() => expect(tty.isRaw).toBe(true));
    const promise = readPilotTrialBridgeFrame(tty, ready);
    const bytes = wire(); tty.emit('data', bytes.subarray(0, 13)); tty.emit('data', bytes.subarray(13));
    const result = await promise; expect(result).toEqual(frame()); expect(ready).toHaveBeenCalledTimes(1);
    expect(tty.listenerCount('data')).toBe(0); expect(tty.listenerCount('end')).toBe(0); expect(tty.pause).toHaveBeenCalled();
  });
  it('refuses non-TTY or failed raw mode before READY', () => {
    const ready = vi.fn(), tty = new Tty(); tty.isTTY = false;
    expect(() => readPilotTrialBridgeFrame(tty, ready)).toThrow(REFUSED);
    tty.isTTY = true; tty.setRawMode.mockImplementation(() => tty);
    expect(() => readPilotTrialBridgeFrame(tty, ready)).toThrow(REFUSED); expect(ready).not.toHaveBeenCalled();
  });
  it.each(['suffix', 'secondframe', 'emptyframe', 'oversize', 'control', 'manychunks', 'end', 'error'])('refuses %s and detaches', async kind => {
    const tty = new Tty(), promise = readPilotTrialBridgeFrame(tty, vi.fn());
    const rejected = expect(promise).rejects.toThrow(REFUSED);
    if (kind === 'suffix') tty.emit('data', Buffer.concat([wire(), Buffer.from('x')]));
    else if (kind === 'secondframe') tty.emit('data', Buffer.concat([wire(), wire()]));
    else if (kind === 'emptyframe') tty.emit('data', Buffer.from([4]));
    else if (kind === 'oversize') tty.emit('data', Buffer.alloc(4098, 65));
    else if (kind === 'control') tty.emit('data', Buffer.from([27]));
    else if (kind === 'manychunks') for (let i = 0; i < 65; i++) tty.emit('data', Buffer.from('a'));
    else tty.emit(kind, kind === 'error' ? Error(SENTINEL) : undefined);
    await rejected; expect(tty.listenerCount('data')).toBe(0);
  });
  it('times out at45s without receiving any frame', async () => {
    vi.useFakeTimers(); const tty = new Tty(), promise = readPilotTrialBridgeFrame(tty, vi.fn());
    const rejected = expect(promise).rejects.toThrow(REFUSED);
    await vi.advanceTimersByTimeAsync(45000); await rejected; expect(tty.listenerCount('data')).toBe(0);
  });
});

describe('closed receipt', () => {
  it('accepts only exact expected successful PREFLIGHT70 receipt', () => expect(validatePilotTrialBridgeReceipt(encode(), pins)).toBeUndefined());
  it.each(['head', 'catalog', 'target', 'phase', 'count', 'version', 'hash', 'late', 'extra', 'authority', 'backup', 'migration', 'exit', 'raw', 'duplicate'])(
    'refuses %s receipt with no forwarded data', kind => {
      const value = receipt(); let bytes;
      if (kind === 'head') value.sourceHead = 'e'.repeat(40);
      if (kind === 'catalog') value.catalogSha256 = 'f'.repeat(64);
      if (kind === 'target') value.target.branchId = 'foreign';
      if (kind === 'phase') value.mode = 'POSTFLIGHT_79';
      if (kind === 'count') value.history.count = 79;
      if (kind === 'version') value.history.versionNum = 170011;
      if (kind === 'hash') value.history.prior70Sha256 = 'e'.repeat(64);
      if (kind === 'late') value.elapsedMs = 60000;
      if (kind === 'authority') value.executionAuthorized = true;
      if (kind === 'backup') value.backupVerified = true;
      if (kind === 'migration') value.migrationInvoked = true;
      if (kind === 'exit') value.childExit = 1;
      if (kind === 'extra') Object.assign(value.history, { unknown: SENTINEL });
      if (kind === 'raw') bytes = Buffer.from(SENTINEL);
      else if (kind === 'duplicate') bytes = Buffer.from(encode(value).toString().replace('{', '{"mode":"PREFLIGHT_70",'));
      else bytes = encode(value);
      expect(() => validatePilotTrialBridgeReceipt(bytes, pins)).toThrow(REFUSED);
    });
});

describe('whole bridge — child and source processes mocked, no network', () => {
  // Deliberately minimal synthetic terminal, not a real OS ReadStream or transport.
  const asTerminal = (tty: Tty) => tty as unknown as Parameters<typeof runPilotTrialPrivateBridge>[1];
  const asOutput = (output: { write: ReturnType<typeof vi.fn> }) => output as unknown as Parameters<typeof runPilotTrialPrivateBridge>[2];
  function begin(tty = new Tty()) { const output = { write: vi.fn() }; const promise = runPilotTrialPrivateBridge(pins, asTerminal(tty), asOutput(output)); return { tty, output, promise }; }
  it('only sends frame through non-TTY pipe+EOF to fixed runner and emits two fixed lines', async () => {
    vi.stubEnv('DATABASE_URL', SENTINEL); vi.stubEnv('NODE_OPTIONS', '--unsafe-synthetic');
    try {
      const { tty, output, promise } = begin(); tty.emit('data', wire()); await promise;
      expect(child.received).toEqual(frame()); expect(child.stdin.end).toHaveBeenCalledTimes(1);
      expect(mock.spawn).toHaveBeenCalledWith(process.execPath, [path.join(ROOT, runner), '--mode', 'PREFLIGHT_70', '--expected-head', pins.expectedHead,
        '--expected-catalog-sha256', pins.expectedCatalogSha256], expect.objectContaining({ shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }));
      const options = mock.spawn.mock.calls[0][2]; expect(options.env.DATABASE_URL).toBeUndefined(); expect(options.env.NODE_OPTIONS).toBeUndefined();
      expect(JSON.stringify(mock.spawn.mock.calls)).not.toContain(SENTINEL);
      expect(output.write.mock.calls).toEqual([['PILOT_TRIAL_BRIDGE_READY\n'], ['PILOT_TRIAL_BRIDGE_PREFLIGHT_70_VERIFIED\n']]);
      expect(tty.isRaw).toBe(false); expect(child.kill).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
  it('source change after frame refuses before child and restores terminal', async () => {
    const { tty, output, promise } = begin(); mock.sync.mockImplementation((exe, args) => args.includes('status')
      ? { status: 0, signal: null, stdout: Buffer.from(' M private-file') } : sourceProcess(exe, args));
    tty.emit('data', wire()); await expect(promise).rejects.toThrow(REFUSED);
    expect(mock.spawn).not.toHaveBeenCalled(); expect(output.write).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
  it.each(['throws', 'stillraw'])('never publishes success if terminal restoration %s', async kind => {
    const tty = new Tty(); tty.setRawMode.mockImplementation(raw => {
      if (raw) tty.isRaw = true;
      else if (kind === 'throws') throw Error(SENTINEL);
      return tty;
    });
    const { output, promise } = begin(tty); tty.emit('data', wire());
    await expect(promise).rejects.toThrow(REFUSED);
    expect(child.received).toEqual(frame());
    expect(output.write.mock.calls).toEqual([['PILOT_TRIAL_BRIDGE_READY\n']]);
    expect(tty.setRawMode).toHaveBeenCalledWith(false);
  });
  it.each(['runner', 'node', 'cli', 'head', 'dirty', 'giterror', 'blob'])( 'refuses %s source before READY', async kind => {
    const p = { ...pins };
    if (kind === 'runner') p.expectedRunnerSha256 = '0'.repeat(64);
    if (kind === 'node') p.expectedNodeSha256 = '0'.repeat(64);
    if (kind === 'cli') p.expectedPrismaCliSha256 = '0'.repeat(64);
    if (kind === 'head') p.expectedHead = '0'.repeat(40);
    if (['dirty', 'giterror', 'blob'].includes(kind)) mock.sync.mockImplementation((exe, args) => kind === 'giterror' ? { status: 1, stdout: Buffer.from(SENTINEL) }
      : kind === 'dirty' && args.includes('status') || kind === 'blob' && args.includes('show') ? { status: 0, signal: null, stdout: Buffer.from('CHANGED') } : sourceProcess(exe, args));
    const tty = new Tty(), output = { write: vi.fn() }; await expect(runPilotTrialPrivateBridge(p, asTerminal(tty), asOutput(output))).rejects.toThrow(REFUSED);
    expect(output.write).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled(); expect(tty.isRaw).toBe(false);
  });
  it.each(['stderr', 'overflow', 'error', 'stdinerror', 'badreceipt', 'exit'])( 'refuses child %s without forwarding bytes', async kind => {
    child.auto = false; const { tty, output, promise } = begin(); const rejected = expect(promise).rejects.toThrow(REFUSED);
    tty.emit('data', wire()); await Promise.resolve();
    if (kind === 'stderr') child.stderr.emit('data', Buffer.from(SENTINEL));
    if (kind === 'overflow') child.stdout.emit('data', Buffer.alloc(8193, 65));
    if (kind === 'error') child.emit('error', Error(SENTINEL));
    if (kind === 'stdinerror') child.stdin.emit('error', Error(SENTINEL));
    if (kind === 'badreceipt') { child.stdout.emit('data', Buffer.from(SENTINEL)); child.emit('close', 0, null); }
    if (kind === 'exit') child.emit('close', 1, null);
    await rejected; expect(output.write.mock.calls).toEqual([['PILOT_TRIAL_BRIDGE_READY\n']]); expect(tty.isRaw).toBe(false);
  });
  it('child65s timeout kills only returned child and observes close', async () => {
    vi.useFakeTimers(); child.auto = false; const { tty, output, promise } = begin(); const rejected = expect(promise).rejects.toThrow(REFUSED);
    tty.emit('data', wire()); await Promise.resolve(); await vi.advanceTimersByTimeAsync(65000); await rejected;
    expect(child.kill).toHaveBeenCalledTimes(1); expect(mock.spawn).toHaveBeenCalledTimes(1); expect(output.write).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
  it('unconfirmed child cleanup is bounded and remains refusal, never success', async () => {
    vi.useFakeTimers(); child.auto = false; child.kill.mockImplementation(() => false);
    const { tty, output, promise } = begin(); const rejected = expect(promise).rejects.toThrow(REFUSED);
    tty.emit('data', wire()); await Promise.resolve(); await vi.advanceTimersByTimeAsync(67000); await rejected;
    expect(child.unref).toHaveBeenCalledTimes(1); expect(output.write).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
});
