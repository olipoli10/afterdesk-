import { basename, dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic filesystem staging and child responses; no Git/Prisma/network process executes.
const mock = vi.hoisted(() => ({ child: vi.fn(), client: vi.fn(), files: new Map<string, Buffer>(), dirs: new Set<string>() }));
vi.mock('node:child_process', () => ({ spawnSync: mock.child, spawn: vi.fn(() => { throw Error('UNEXPECTED_PROCESS'); }) }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual,
    writeFileSync: (file: string, bytes: string | Buffer) => { if (mock.files.has(file)) throw Error('EXCLUSIVE'); mock.files.set(file, Buffer.from(bytes)); },
    mkdirSync: (file: string) => { for (let d = file; d !== resolve(process.cwd(), '.scratch'); d = dirname(d)) mock.dirs.add(d); },
    readFileSync: (file: string, options?: never) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!) : actual.readFileSync(file, options),
    lstatSync: (file: string) => mock.files.has(String(file)) || mock.dirs.has(String(file))
      ? { isSymbolicLink: () => false, isDirectory: () => mock.dirs.has(String(file)), isFile: () => mock.files.has(String(file)), size: mock.files.get(String(file))?.length ?? 0 }
      : actual.lstatSync(file),
    realpathSync: (file: string) => mock.files.has(String(file)) || mock.dirs.has(String(file)) ? String(file) : actual.realpathSync(file),
    readdirSync: (file: string, options?: never) => mock.dirs.has(String(file))
      ? [...new Set([...mock.files.keys(), ...mock.dirs].filter(name => dirname(name) === String(file)).map(name => basename(name)))]
      : actual.readdirSync(file, options),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { inspectPilotTrialHistory, runPilotTrialPrisma, PILOT_TRIAL_TARGET } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
import { validatePilotTrialBridgeReceipt } from '../specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';

const catalog = buildPilotMigrationCatalog(process.cwd());
const expected = { expectedHead: 'a'.repeat(40), expectedCatalogSha256: catalog.catalogSha256 };
const bridgePins = { ...expected, expectedRunnerSha256: 'b'.repeat(64), expectedNodeSha256: 'c'.repeat(64), expectedPrismaCliSha256: 'd'.repeat(64) };
const SENTINEL = 'SYNTHETIC_PEER_TRANSPORT_ONLY_1234';
const url = `postgresql://neondb_owner:${SENTINEL}@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
function history() {
  return { tls: false, database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', readOnly: 'on', versionNum: 180006,
    historyCount: 70, rows: (catalog.entries as { migrationName: string; sha256: string }[]).slice(0, 70).map(entry => ({
      migration_name: entry.migrationName, checksum: entry.sha256, finished_at: '2026-09-10T12:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(arg => arg.includes('new PrismaClient'));
const probes = () => mock.child.mock.calls.filter(call => isProbe(call[1]));
function sourceChild(exe: string, args: string[]) {
  return { status: 0, signal: null, stdout: exe === 'git' ? args.includes('status') ? '' : args.some(arg => arg.endsWith('^{tree}'))
    ? 'e'.repeat(40) : expected.expectedHead : isProbe(args) ? JSON.stringify(history()) : 'BOUND', stderr: '' };
}
const input = (value = url) => Readable.from([Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url: value }))]);
const run = (value = url) => runPilotTrialPrisma('PREFLIGHT_70', expected, { input: input(value) });
const receipts = () => [...mock.files.entries()].filter(([name]) => name.endsWith('receipt.json')).map(([, bytes]) => JSON.parse(bytes.toString()));
beforeEach(() => { mock.files.clear(); mock.dirs.clear(); mock.child.mockReset().mockImplementation(sourceChild); mock.client.mockReset().mockReturnValue({ treeSha256: 'f'.repeat(64) }); });
afterEach(() => vi.restoreAllMocks());

describe('peer client policy versus supplied backend observation', () => {
  it('pure history returns the backend fact but never invents a client policy or provenance', () => {
    const result = inspectPilotTrialHistory(history(), catalog, 70);
    expect(result).toMatchObject({ backendConnectionSslObserved: false, targetProviderProvenanceVerified: false, dataPreservationVerified: false });
    expect(result).not.toHaveProperty('clientTransportPolicy'); expect(result).not.toHaveProperty('tlsVerified');
    expect(() => inspectPilotTrialHistory({ ...history(), tlsVerified: true }, catalog, 70)).toThrow();
  });
  it('actual runner path derives the fixed policy and its exact serialized receipt passes the real bridge parser', async () => {
    const result = await run();
    expect(result).toMatchObject({ clientTransportPolicy: 'PRISMA_REQUIRE_TLS_STRICT_CERT', history: { backendConnectionSslObserved: false }, executionAuthorized: false });
    expect(probes()).toHaveLength(1);
    expect(() => validatePilotTrialBridgeReceipt(Buffer.from(JSON.stringify(result) + '\n'), bridgePins)).not.toThrow();
    const childOptions = probes()[0][2];
    expect(childOptions).toMatchObject({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    expect(JSON.stringify(mock.child.mock.calls)).not.toContain(SENTINEL); // child env is cleared in finally
  });
  it.each(['prefer', 'disable', 'accept_invalid_certs'])('never derives policy for weakened client parameter %s', async weak => {
    const changed = weak === 'accept_invalid_certs' ? url.replace('sslaccept=strict', `sslaccept=${weak}`) : url.replace('sslmode=require', `sslmode=${weak}`);
    await expect(run(changed)).rejects.toThrow('PILOT_TRIAL_PREFLIGHT_REFUSED');
    expect(probes()).toHaveLength(0);
    expect(receipts().every(value => value.status === 'PREFLIGHT_REFUSED' && !('clientTransportPolicy' in value))).toBe(true);
  });
  it('a failed child with plausible history cannot mint policy or success', async () => {
    mock.child.mockImplementation((exe: string, args: string[]) => isProbe(args)
      ? { status: 1, signal: null, stdout: JSON.stringify(history()), stderr: SENTINEL } : sourceChild(exe, args));
    await expect(run()).rejects.toThrow('PILOT_TRIAL_PREFLIGHT_REFUSED');
    expect(probes()).toHaveLength(1); expect(receipts()).toHaveLength(1);
    expect(receipts()[0]).toMatchObject({ status: 'PREFLIGHT_REFUSED', diagnostic: { stage: 'CHILD', reason: 'CHILD_PROCESS_FAILURE' } });
    expect(receipts()[0]).not.toHaveProperty('clientTransportPolicy'); expect(JSON.stringify(receipts())).not.toContain(SENTINEL);
  });
  it('a forged external diagnostic never executes getters or acquires a trusted reason', async () => {
    const getter = vi.fn(() => SENTINEL), external = {};
    for (const key of ['message', 'stack', 'code', 'diagnostic', 'toString']) Object.defineProperty(external, key, { get: getter });
    mock.child.mockImplementation((exe: string, args: string[]) => { if (isProbe(args)) throw external; return sourceChild(exe, args); });
    let caught: unknown; try { await run(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ message: 'PILOT_TRIAL_PREFLIGHT_REFUSED', diagnostic: { stage: 'CHILD', reason: 'LOCAL_VALIDATION_REFUSED' } });
    expect(getter).not.toHaveBeenCalled(); expect(JSON.stringify(receipts())).not.toContain(SENTINEL);
  });
  it.each(['claim', 'history-policy', 'failed', 'foreign'])('bridge refuses a forged %s receipt despite the correct policy literal', async kind => {
    const result = JSON.parse(JSON.stringify(await run()));
    if (kind === 'claim') result.history.targetProviderProvenanceVerified = true;
    if (kind === 'history-policy') result.history.clientTransportPolicy = 'PRISMA_REQUIRE_TLS_STRICT_CERT';
    if (kind === 'failed') result.childExit = 1;
    if (kind === 'foreign') result.target.hostname = 'example.invalid';
    expect(() => validatePilotTrialBridgeReceipt(Buffer.from(JSON.stringify(result) + '\n'), bridgePins)).toThrow('PILOT_TRIAL_BRIDGE_REFUSED_NO_AUTOMATIC_RETRY');
  });
});
