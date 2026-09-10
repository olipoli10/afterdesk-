import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// All processes are mocked. These tests do not create a real terminal or use a credential.
const calls = vi.hoisted(() => ({ spawn: vi.fn(), sync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: calls.spawn, spawnSync: calls.sync }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: (file: string, options?: never) => String(file) === process.execPath
    ? Buffer.from('PEER_FAKE_NODE') : String(file).replaceAll('\\', '/').endsWith('/prisma/build/index.js')
      ? Buffer.from('PEER_FAKE_CLI') : actual.readFileSync(file, options) };
});
import { readPilotTrialBridgeFrame, runPilotTrialPrivateBridge } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const runner = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const pins = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: 'b'.repeat(64),
  expectedRunnerSha256: hash(readFileSync(runner)), expectedNodeSha256: hash('PEER_FAKE_NODE'), expectedPrismaCliSha256: hash('PEER_FAKE_CLI') };
const target = { projectId: 'withered-mud-08129552', branchId: 'br-holy-brook-ax7k68oh', endpointId: 'ep-crimson-violet-axmmwtjw',
  hostname: 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' };
const SENTINEL = 'PEER_SYNTHETIC_NOT_A_SECRET_123456';
const frame = () => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1',
  url: `postgresql://neondb_owner:${SENTINEL}@${target.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1` }));
const encoded = () => Buffer.from(JSON.stringify({ version: 'pilot-trial-prisma-receipt-v1', mode: 'PREFLIGHT_70',
  status: 'READ_ONLY_PREFLIGHT_70_MATCH', sourceHead: pins.expectedHead, catalogSha256: pins.expectedCatalogSha256,
  sourceFingerprint: 'c'.repeat(64), target, history: { count: 70, versionNum: 180006,
    historySha256: 'd'.repeat(64), prior70Sha256: 'd'.repeat(64), targetProviderProvenanceVerified: false, dataPreservationVerified: false },
  childExit: 0, automaticRetry: false, migrationInvoked: false, executionAuthorized: false, backupVerified: false,
  dataPreservationVerified: false, elapsedMs: 1000 }) + '\n');
const REFUSED = 'PILOT_TRIAL_BRIDGE_REFUSED_NO_AUTOMATIC_RETRY';
class Terminal extends EventEmitter {
  isTTY = true; isRaw = false;
  setRawMode = vi.fn((value: boolean) => { this.isRaw = value; return this; });
  pause = vi.fn(() => this); resume = vi.fn(() => this);
}
class Pipe extends EventEmitter { destroy = vi.fn(); }
class Child extends EventEmitter {
  stdout = new Pipe(); stderr = new Pipe(); received?: Buffer;
  stdin = Object.assign(new Pipe(), { end: vi.fn((value: Buffer, cb: () => void) => { this.received = Buffer.from(value); cb(); }) });
  kill = vi.fn(() => { queueMicrotask(() => this.emit('close', null, 'SIGTERM')); return true; });
  unref = vi.fn();
}
let child: Child;
beforeEach(() => {
  calls.spawn.mockReset(); calls.sync.mockReset(); child = new Child(); calls.spawn.mockReturnValue(child);
  calls.sync.mockImplementation((_exe: string, args: string[]) => ({ status: 0, signal: null,
    stdout: args.includes('status') ? Buffer.alloc(0) : args.includes('show')
      ? readFileSync(path.join(process.cwd(), args.at(-1)!.slice(41))) : Buffer.from(pins.expectedHead) }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function begin() {
  const tty = new Terminal();
  const output = { write: vi.fn((line: string) => {
    if (line.includes('READY')) expect(tty.isRaw).toBe(true);
    if (line.includes('VERIFIED')) expect(tty.isRaw).toBe(false);
    return true;
  }) };
  const pending = runPilotTrialPrivateBridge(pins, tty as unknown as Parameters<typeof runPilotTrialPrivateBridge>[1],
    output as unknown as Parameters<typeof runPilotTrialPrivateBridge>[2]);
  return { tty, output, pending };
}
async function send(tty: Terminal) { tty.emit('data', Buffer.concat([frame(), Buffer.from([4])])); await Promise.resolve(); }

describe('peer bridge transport — synthetic streams and mocked children only', () => {
  it('accepts a separate EOT chunk and copies private bytes without mutating producer buffers', async () => {
    const tty = new Terminal(), ready = vi.fn(() => expect(tty.isRaw).toBe(true));
    const pending = readPilotTrialBridgeFrame(tty, ready), source = frame(), unchanged = Buffer.from(source);
    tty.emit('data', source.subarray(0, 19)); tty.emit('data', source.subarray(19)); tty.emit('data', Buffer.from([4]));
    const result = await pending;
    expect(result).toEqual(unchanged); expect(source).toEqual(unchanged); expect(result).not.toBe(source);
    expect(tty.eventNames()).toEqual([]); expect(ready).toHaveBeenCalledTimes(1);
  });
  it('refuses after the ingress monotone deadline even when the timer has not fired', async () => {
    let now = 100; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const tty = new Terminal(), pending = readPilotTrialBridgeFrame(tty, vi.fn());
    const refusal = expect(pending).rejects.toThrow(REFUSED);
    now += 45000; tty.emit('data', Buffer.concat([frame(), Buffer.from([4])]));
    await refusal; expect(tty.eventNames()).toEqual([]); expect(calls.spawn).not.toHaveBeenCalled();
  });
  it('cleans ingress listeners if READY output throws, without forwarding that error', async () => {
    const tty = new Terminal();
    await expect(readPilotTrialBridgeFrame(tty, () => { throw Error(SENTINEL); })).rejects.toThrow(REFUSED);
    expect(tty.eventNames()).toEqual([]); expect(tty.pause).toHaveBeenCalled(); expect(calls.spawn).not.toHaveBeenCalled();
  });
  it('validates a fragmented receipt before the sole success line and restores raw mode first', async () => {
    const { tty, output, pending } = begin(); await send(tty);
    const bytes = encoded(); child.stdout.emit('data', bytes.subarray(0, 31)); child.stdout.emit('data', bytes.subarray(31));
    expect(output.write).toHaveBeenCalledTimes(1); child.emit('close', 0, null); await pending;
    expect(child.received).toEqual(frame()); expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(output.write.mock.calls).toEqual([['PILOT_TRIAL_BRIDGE_READY\n'], ['PILOT_TRIAL_BRIDGE_PREFLIGHT_70_VERIFIED\n']]);
    expect(calls.spawn).toHaveBeenCalledTimes(1); expect(child.kill).not.toHaveBeenCalled();
    expect(JSON.stringify(output.write.mock.calls)).not.toContain(SENTINEL);
  });
  it('does not accept a valid stdout receipt followed by stderr before close', async () => {
    const { tty, output, pending } = begin(), refusal = expect(pending).rejects.toThrow(REFUSED); await send(tty);
    child.stdout.emit('data', encoded()); child.stderr.emit('data', Buffer.from(SENTINEL)); await refusal;
    expect(output.write).toHaveBeenCalledTimes(1); expect(child.kill).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
  it('rejects a valid late child close even if the child timer has not run', async () => {
    let now = 100; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { tty, output, pending } = begin(), refusal = expect(pending).rejects.toThrow(REFUSED); await send(tty);
    child.stdout.emit('data', encoded()); now += 65000; child.emit('close', 0, null); await refusal;
    expect(output.write).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false); expect(calls.spawn).toHaveBeenCalledTimes(1);
  });
  it('bounds child output chunk count independently of byte size and ignores later success', async () => {
    const { tty, output, pending } = begin(), refusal = expect(pending).rejects.toThrow(REFUSED); await send(tty);
    for (let i = 0; i < 257; i++) child.stdout.emit('data', Buffer.from('a'));
    child.stdout.emit('data', encoded()); child.emit('close', 0, null); await refusal;
    expect(child.kill).toHaveBeenCalledTimes(1); expect(output.write).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
  it('does not merge two child receipts into a successful handoff', async () => {
    const { tty, output, pending } = begin(), refusal = expect(pending).rejects.toThrow(REFUSED); await send(tty);
    child.stdout.emit('data', encoded()); child.stdout.emit('data', encoded()); child.emit('close', 0, null); await refusal;
    expect(output.write).toHaveBeenCalledTimes(1); expect(calls.spawn).toHaveBeenCalledTimes(1); expect(tty.isRaw).toBe(false);
  });
});
