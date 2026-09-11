import { readFileSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), write: vi.fn(), mkdir: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), dirs: new Set<string>(), prefix: '', seenUrls: [] as string[] }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: mock.spawn }));
// Known synthetic baseline bytes and rows substitute ONLY their recorded hashes.
// Mutated bytes and all actual source/catalog bytes retain real SHA256. These
// orchestration tests establish neither private evidence authenticity nor SQL.
vi.mock('node:crypto', async original => {
  const actual = await original<typeof import('node:crypto')>();
  return { ...actual, createHash: (algorithm: string) => {
    const h = actual.createHash(algorithm); let text = '';
    return { update(bytes: string | Buffer) { text += Buffer.from(bytes).toString(); h.update(bytes); return this; }, digest(encoding: 'hex') {
      if (text === 'SYNTHETIC_CURRENT_BASELINE') return '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac';
      if (text === 'SYNTHETIC_TRIAL_BASELINE') return '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
      if (mock.prefix && text === mock.prefix) return '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
      return h.digest(encoding);
    } };
  } };
});
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, writeFileSync: mock.write, mkdirSync: mock.mkdir,
    readFileSync: (file: string, options?: unknown) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!) : actual.readFileSync(file, options as never),
    lstatSync: (file: string, options?: unknown) => mock.files.has(String(file)) || mock.dirs.has(String(file))
      ? { isSymbolicLink: () => false, isDirectory: () => mock.dirs.has(String(file)), isFile: () => mock.files.has(String(file)), size: mock.files.get(String(file))?.length ?? 0 }
      : String(file).endsWith('.attempt.json') ? undefined : actual.lstatSync(file, options as never),
    realpathSync: (file: string) => mock.files.has(String(file)) || mock.dirs.has(String(file)) ? String(file) : actual.realpathSync(file),
    readdirSync: (file: string, options?: unknown) => mock.dirs.has(String(file))
      ? [...new Set([...mock.files.keys(), ...mock.dirs].filter(name => dirname(name) === String(file)).map(name => basename(name)))]
      : actual.readdirSync(file, options as never),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { runPilotCurrentMigration, runPilotTrialPrisma, decodePilotCurrentCredential, decodePilotTrialCredential,
  parsePilotCurrentPrismaArguments, parsePilotTrialPrismaArguments } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const root = process.cwd(), HEAD = 'a'.repeat(40), catalog = buildPilotMigrationCatalog(root);
const CURRENT_BASELINE = resolve(root, '.scratch/pilot-current-data-before70-20260911T0024Z.json');
const TRIAL_BASELINE = resolve(root, '.scratch/pilot-trial-data-before70-20260910T2308Z.json');
const CURRENT_MARKER = resolve(root, '.scratch/pilot-current-migration-br-nameless-moon-ax8nmuwj.attempt.json');
const TRIAL_MARKER = resolve(root, '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json');
const expected = { expectedHead: HEAD, expectedCatalogSha256: catalog.catalogSha256,
  expectedBaselineSha256: '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac',
  expectedHistory70Sha256: '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343' };
const trialExpected = { ...expected, expectedBaselineSha256: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a' };
const SECRET = 'SYNTHETIC_SECRET_NEVER_REAL_1234';
const url = (current: boolean) => `postgresql://neondb_owner:${SECRET}@${current ? 'ep-purple-union-axj3h2t5' : 'ep-crimson-violet-axmmwtjw'}.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
const envelope = (value: string) => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url: value }));
const input = (current = true) => Readable.from([envelope(url(current))]);
type Entry = { migrationName: string; sha256: string };
function snapshot(count: number) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180006, readOnly: 'on', tls: false, historyCount: count,
    rows: (catalog.entries as Entry[]).slice(0, count).map(entry => ({ migration_name: entry.migrationName, checksum: entry.sha256,
      finished_at: '2026-09-10T00:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(arg => arg.includes('new PrismaClient'));
const isMigration = (args: string[]) => args[1] === 'migrate';
const migrations = () => mock.spawn.mock.calls.filter((call: unknown[]) => isMigration(call[1] as string[]));
const run = () => runPilotCurrentMigration(expected, { input: input() });
const cli = () => ['--personal-pilot', '--mode', 'MIGRATE_70_TO_79', '--expected-head', HEAD, '--expected-catalog-sha256', expected.expectedCatalogSha256,
  '--expected-baseline-sha256', expected.expectedBaselineSha256, '--expected-history70-sha256', expected.expectedHistory70Sha256];
beforeEach(() => {
  vi.clearAllMocks(); mock.spawn.mockReset(); mock.write.mockReset(); mock.mkdir.mockReset(); mock.client.mockReset();
  mock.files.clear(); mock.dirs.clear(); mock.seenUrls.length = 0; mock.prefix = JSON.stringify(snapshot(70).rows);
  mock.files.set(CURRENT_BASELINE, Buffer.from('SYNTHETIC_CURRENT_BASELINE')); mock.files.set(TRIAL_BASELINE, Buffer.from('SYNTHETIC_TRIAL_BASELINE'));
  mock.write.mockImplementation((file: string, bytes: Buffer | string) => {
    if (mock.files.has(file)) throw Error('SYNTHETIC_EXCLUSIVE_EXISTS'); mock.files.set(file, Buffer.from(bytes));
  });
  mock.mkdir.mockImplementation((file: string) => { for (let dir = file; dir !== resolve(root, '.scratch'); dir = dirname(dir)) mock.dirs.add(dir); });
  mock.client.mockReturnValue({ treeSha256: 'c'.repeat(64), schemaSha256: 'd'.repeat(64) });
  let queries = 0;
  mock.spawn.mockImplementation((exe: string, args: string[], options?: { env?: Record<string, string> }) => {
    if (isProbe(args) || isMigration(args)) mock.seenUrls.push(options?.env?.DATABASE_URL ?? 'MISSING');
    return { status: 0, signal: null, stderr: '', stdout: exe === 'git' ? args.includes('status') ? '' : args.some(arg => arg.endsWith('^{tree}')) ? 'b'.repeat(40) : HEAD
      : isProbe(args) ? JSON.stringify(snapshot(++queries % 2 === 1 ? 70 : 79)) : isMigration(args) ? 'Synthetic CLI acknowledged' : 'BOUND' };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('closed current pilot profile — no real process, DB or credential', () => {
  it('uses only its current host/marker/version/baseline, preserving the retained trial marker', async () => {
    const oldMarker = Buffer.from('RETAINED_TRIAL_COMPLETED'); mock.files.set(TRIAL_MARKER, oldMarker);
    const receipt = await run();
    expect(receipt).toMatchObject({ version: 'pilot-current-migration-receipt-v1', status: 'PERSONAL_PILOT_HISTORY_79_VERIFIED', mode: 'MIGRATE_70_TO_79',
      baselineSha256: expected.expectedBaselineSha256, history70Sha256: expected.expectedHistory70Sha256,
      target: { endpointId: 'ep-purple-union-axj3h2t5', branchId: 'br-nameless-moon-ax8nmuwj' }, history: { count: 79, backendConnectionSslObserved: false },
      automaticRetry: false, executionAuthorized: false, dataPreservationVerified: false, totalBudgetMs: 180000, childBudgetMs: 120000, postflightReserveMs: 20000 });
    expect(mock.seenUrls).toEqual([url(true), url(true), url(true)]); expect(migrations()).toHaveLength(1);
    expect(mock.files.get(TRIAL_MARKER)).toEqual(oldMarker);
    expect(JSON.parse(mock.files.get(CURRENT_MARKER)!.toString())).toMatchObject({ version: 'pilot-current-migration-attempt-v1', baselineSha256: expected.expectedBaselineSha256,
      target: { endpointId: 'ep-purple-union-axj3h2t5' } });
    expect(JSON.stringify(receipt)).not.toContain(SECRET);
  });
  it('retains the public trial behavior and distinct target after private helper extraction', async () => {
    mock.files.set(CURRENT_MARKER, Buffer.from('CURRENT_UNKNOWN'));
    const receipt = await runPilotTrialPrisma('MIGRATE_70_TO_79', trialExpected, { input: input(false) });
    expect(receipt).toMatchObject({ version: 'pilot-trial-migration-receipt-v1', status: 'MIGRATION_HISTORY_79_VERIFIED', baselineSha256: trialExpected.expectedBaselineSha256,
      target: { endpointId: 'ep-crimson-violet-axmmwtjw' } });
    expect(mock.seenUrls).toEqual([url(false), url(false), url(false)]);
    expect(mock.files.get(CURRENT_MARKER)?.toString()).toBe('CURRENT_UNKNOWN');
  });
  it.each([true, false])('decoders accept only their own profile: current=%s', current => {
    const decoder = current ? decodePilotCurrentCredential : decodePilotTrialCredential;
    expect(decoder(envelope(url(current)))).toBe(url(current));
    expect(() => decoder(envelope(url(!current)))).toThrow('CREDENTIAL_REFUSED');
    expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['ssl', 'role', 'database', 'port', 'main', 'extraProof'])('refuses %s credential alteration without a query', async kind => {
    let value = url(true);
    if (kind === 'ssl') value = value.replace('sslmode=require', 'sslmode=disable');
    if (kind === 'role') value = value.replace('neondb_owner:', 'other:');
    if (kind === 'database') value = value.replace('/neondb?', '/postgres?');
    if (kind === 'port') value = value.replace('/neondb?', ':5432/neondb?');
    if (kind === 'main') value = value.replace('ep-purple-union-axj3h2t5', 'ep-unapproved-main');
    const bytes = kind === 'extraProof' ? Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url: value, trusted: true })) : envelope(value);
    await expect(runPilotCurrentMigration(expected, { input: Readable.from([bytes]) })).rejects.toThrow('PERSONAL_PILOT_MIGRATION_REFUSED_BEFORE_SPAWN');
    expect(mock.seenUrls).toEqual([]); expect(migrations()).toHaveLength(0);
  });
  it.each([true, false])('runner refuses the other profile credential: current=%s', async current => {
    const call = current ? runPilotCurrentMigration(expected, { input: input(false) }) : runPilotTrialPrisma('MIGRATE_70_TO_79', trialExpected, { input: input(true) });
    await expect(call).rejects.toThrow('REFUSED_BEFORE_SPAWN'); expect(mock.seenUrls).toEqual([]);
  });
  it.each(['pin', 'bytes', 'marker'])('rejects wrong current %s without borrowing the trial baseline', async kind => {
    if (kind === 'bytes') mock.files.set(CURRENT_BASELINE, mock.files.get(TRIAL_BASELINE)!);
    if (kind === 'marker') mock.files.set(CURRENT_MARKER, Buffer.from('UNKNOWN'));
    const read = vi.fn();
    await expect(runPilotCurrentMigration(kind === 'pin' ? trialExpected : expected, { input: new Readable({ read }) })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(migrations()).toHaveLength(0);
  });
  it('unknown current result retains only its own no-reentry marker', async () => {
    const original = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[], options: unknown) => { if (isMigration(args)) throw Error(SECRET); return original(exe, args, options); });
    await expect(run()).rejects.toThrow('PERSONAL_PILOT_MIGRATION_OUTCOME_UNCERTAIN');
    expect(mock.files.has(CURRENT_MARKER)).toBe(true); expect(mock.files.has(TRIAL_MARKER)).toBe(false); expect(migrations()).toHaveLength(1);
    const read = vi.fn(); await expect(runPilotCurrentMigration(expected, { input: new Readable({ read }) })).rejects.toThrow('REFUSED_BEFORE_SPAWN');
    expect(read).not.toHaveBeenCalled(); expect(migrations()).toHaveLength(1);
  });
  it('preserves personal late history and a separately named uncertain outcome without retry', async () => {
    let now = 0; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(performance, 'now').mockImplementation(() => now);
    const write = mock.write.getMockImplementation()!;
    mock.write.mockImplementation((file: string, bytes: Buffer | string) => { write(file, bytes); if (file.endsWith('receipt.json')) now = 180000; });
    await expect(run()).rejects.toThrow('PERSONAL_PILOT_MIGRATION_OUTCOME_UNCERTAIN');
    const failure = [...mock.files].find(([name]) => name.endsWith('failure-outcome.json'))!;
    expect(JSON.parse(failure[1].toString())).toMatchObject({ version: 'pilot-current-migration-receipt-v1', status: 'PERSONAL_PILOT_MIGRATION_OUTCOME_UNCERTAIN' });
    expect(migrations()).toHaveLength(1);
  });
});

describe('personal prefix grammar — pure and closed', () => {
  it('accepts exactly the personal prefix plus ten pinned migration arguments', () => {
    expect(parsePilotCurrentPrismaArguments(cli())).toEqual({ mode: 'MIGRATE_70_TO_79', expected });
    expect(() => parsePilotTrialPrismaArguments(cli())).toThrow('CLI_REFUSED');
    const trialArgs = cli().slice(1); trialArgs[7] = trialExpected.expectedBaselineSha256;
    expect(parsePilotTrialPrismaArguments(trialArgs)).toEqual({ mode: 'MIGRATE_70_TO_79', expected: trialExpected });
    expect(() => parsePilotCurrentPrismaArguments(trialArgs)).toThrow('CLI_REFUSED');
    expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['prefix', 'preflight', 'short', 'extra', 'trialBaseline', 'history', 'order', 'duplicate', 'getter'])(
    'refuses %s without evaluating a getter or invoking a process', kind => {
      const args = cli(), getter = vi.fn(() => '--personal-pilot');
      if (kind === 'prefix') args[0] = '--migration';
      if (kind === 'preflight') args[2] = 'PREFLIGHT_70';
      if (kind === 'short') args.pop();
      if (kind === 'extra') args.push('--target', 'other');
      if (kind === 'trialBaseline') args[8] = trialExpected.expectedBaselineSha256;
      if (kind === 'history') args[10] = '0'.repeat(64);
      if (kind === 'order') [args[7], args[9]] = [args[9], args[7]];
      if (kind === 'duplicate') args[9] = args[7];
      if (kind === 'getter') Object.defineProperty(args, '0', { enumerable: true, get: getter });
      expect(() => parsePilotCurrentPrismaArguments(args)).toThrow('CLI_REFUSED'); expect(getter).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled();
    });
  it('snapshots command and keeps the old parser on every non-personal CLI path', () => {
    const args = cli(), parsed = parsePilotCurrentPrismaArguments(args); args[8] = trialExpected.expectedBaselineSha256;
    expect(parsed.expected).toEqual(expected); expect(Object.isFrozen(parsed.expected)).toBe(true);
    const source = readFileSync('specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs', 'utf8');
    expect(source).toContain('const command = parsePilotTrialPrismaArguments(process.argv.slice(2));');
    expect(source).toContain("if (process.argv[2] === '--personal-pilot') {");
    expect(source).toContain('receipt = await runPilotCurrentMigration(command.expected);');
    expect(source).not.toMatch(/export\s+(?:const|function)\s+(?:TRIAL_PROFILE|PERSONAL_PROFILE|decodeCredential|runMigration|childEnvironment|parseArguments)\b/);
  });
  it.each(['personal', 'trial', 'malformed', 'unknownPrefix'])('executes the actual module CLI selector for %s under synthetic I/O only', async kind => {
    const previousArgv = process.argv, previousExit = process.exitCode;
    const args = cli();
    if (kind === 'trial') { args.shift(); args[7] = trialExpected.expectedBaselineSha256; }
    if (kind === 'malformed') args[10] = '0'.repeat(64);
    if (kind === 'unknownPrefix') args[0] = '--other-pilot';
    const stream = input(kind !== 'trial'), reads = vi.spyOn(stream, 'on');
    const stdout: string[] = [], stderr: string[] = [];
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as typeof process.stdin);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Buffer) => { stdout.push(String(chunk)); return true; }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Buffer) => { stderr.push(String(chunk)); return true; }) as typeof process.stderr.write);
    try {
      process.argv = [process.execPath, resolve(root, 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs'), ...args];
      vi.resetModules();
      await import('../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs');
      if (kind === 'personal' || kind === 'trial') {
        expect(migrations()).toHaveLength(1); expect(stdout).toHaveLength(1);
        expect(JSON.parse(stdout[0]).version).toBe(kind === 'personal' ? 'pilot-current-migration-receipt-v1' : 'pilot-trial-migration-receipt-v1');
        expect(mock.seenUrls).toEqual([url(kind === 'personal'), url(kind === 'personal'), url(kind === 'personal')]);
        expect(stderr).toEqual([]);
      } else {
        expect(migrations()).toHaveLength(0); expect(mock.spawn).not.toHaveBeenCalled(); expect(reads).not.toHaveBeenCalled();
        expect(stdout).toEqual([]); expect(stderr.join('')).toBe('PILOT_TRIAL_RUN_REFUSED_NO_AUTOMATIC_RETRY\n');
      }
    } finally { process.argv = previousArgv; process.exitCode = previousExit; vi.restoreAllMocks(); }
  });
});
