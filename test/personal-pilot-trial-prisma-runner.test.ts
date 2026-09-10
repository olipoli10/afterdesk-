import { readFileSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn(), write: vi.fn(), mkdir: vi.fn(), client: vi.fn(),
  files: new Map<string, Buffer>(), directories: new Set<string>() }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawnSync: mock.spawn }));
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, writeFileSync: mock.write, mkdirSync: mock.mkdir,
    readFileSync: (file: string, options?: unknown) => mock.files.has(String(file)) ? Buffer.from(mock.files.get(String(file))!) : actual.readFileSync(file, options as never),
    lstatSync: (file: string) => mock.files.has(String(file)) || mock.directories.has(String(file))
      ? { isSymbolicLink: () => false, isDirectory: () => mock.directories.has(String(file)), isFile: () => mock.files.has(String(file)), size: mock.files.get(String(file))?.length ?? 0 }
      : actual.lstatSync(file),
    realpathSync: (file: string) => mock.files.has(String(file)) || mock.directories.has(String(file)) ? String(file) : actual.realpathSync(file),
    readdirSync: (file: string, options?: unknown) => mock.directories.has(String(file))
      ? [...new Set([...mock.files.keys(), ...mock.directories].filter(name => dirname(name) === String(file)).map(name => basename(name)))]
      : actual.readdirSync(file, options as never),
  };
});
vi.mock('../specs/208-astra-r02-local-preflight/preflight.mjs', async original => ({ ...await original<object>(), generatedClientFingerprint: mock.client }));
import { buildPilotMigrationCatalog } from '../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs';
import { classifyPilotTrialProcessOutcome, decodePilotTrialCredential, inspectPilotTrialHistory, PILOT_TRIAL_HISTORY_SQL,
  PILOT_TRIAL_TARGET, pilotTrialChildEnvironment, pilotTrialPrismaPhase, runPilotTrialPrisma } from '../specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';

const HEAD = 'a'.repeat(40), root = process.cwd();
const catalog = buildPilotMigrationCatalog(root), expected = { expectedHead: HEAD, expectedCatalogSha256: catalog.catalogSha256 };
const PASSWORD = 'SYNTHETIC_SECRET_NEVER_REAL_1234';
const URL = `postgresql://neondb_owner:${PASSWORD}@${PILOT_TRIAL_TARGET.hostname}/neondb?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
const envelope = (url = URL) => Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url }));
const stream = (bytes = envelope()) => Readable.from([bytes]);
const source = readFileSync('specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs', 'utf8');
type Entry = { migrationName: string; sha256: string; lfSha256: string };
function snapshot(count = 70) {
  return { database: 'neondb', role: 'neondb_owner', sessionRole: 'neondb_owner', versionNum: 180003, readOnly: 'on', tls: true,
    historyCount: count, rows: (catalog.entries as Entry[]).slice(0, count).map(entry => ({ migration_name: entry.migrationName,
      checksum: entry.sha256, finished_at: '2026-09-10T12:00:00.000Z', rolled_back_at: null, applied_steps_count: 1 })) };
}
const isProbe = (args: string[]) => args.some(arg => arg.includes('new PrismaClient'));
const probes = () => mock.spawn.mock.calls.filter((call: unknown[]) => isProbe(call[1] as string[]));
const run = (input = stream()) => runPilotTrialPrisma('PREFLIGHT_70', expected, { input });
beforeEach(() => {
  vi.clearAllMocks(); mock.spawn.mockReset(); mock.write.mockReset(); mock.mkdir.mockReset(); mock.client.mockReset();
  mock.files.clear(); mock.directories.clear();
  mock.write.mockImplementation((file: string, bytes: Buffer | string) => {
    if (mock.files.has(file)) throw Error('SYNTHETIC_EXCLUSIVE_FILE_EXISTS'); mock.files.set(file, Buffer.from(bytes));
  });
  mock.mkdir.mockImplementation((file: string) => {
    for (let dir = file; dir !== resolve(root, '.scratch'); dir = dirname(dir)) mock.directories.add(dir);
  });
  mock.client.mockReturnValue({ treeSha256: 'c'.repeat(64), schemaSha256: 'd'.repeat(64) });
  mock.spawn.mockImplementation((exe: string, args: string[]) => {
    const stdout = exe === 'git' ? args.includes('status') ? '' : args.some(arg => arg.endsWith('^{tree}')) ? 'b'.repeat(40) : HEAD
      : isProbe(args) ? JSON.stringify(snapshot()) : 'BOUND';
    return { status: 0, signal: null, stdout, stderr: '' };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('trial credential boundary — synthetic bytes only', () => {
  it('accepts only the exact single target and a strict canonical envelope', () => {
    expect(decodePilotTrialCredential(envelope())).toBe(URL);
    expect(Object.isFrozen(PILOT_TRIAL_TARGET)).toBe(true);
    expect(PILOT_TRIAL_TARGET).toEqual({ projectId: 'withered-mud-08129552', branchId: 'br-holy-brook-ax7k68oh',
      endpointId: 'ep-crimson-violet-axmmwtjw', hostname: 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' });
    expect(mock.spawn).not.toHaveBeenCalled();
  });
  it.each(['postgres://', 'http://', 'pooled', 'uppercase', 'port', 'wrongrole', 'wrongdatabase', 'dotpath', 'encodedhost', 'fragment',
    'duplicatequery', 'extraschema', 'nossl', 'invalidcert', 'newline', 'percentpassword', 'smallpassword'])(
    'rejects %s target or TLS ambiguity with a fixed error', variant => {
      let url = URL;
      if (variant === 'postgres://' || variant === 'http://') url = url.replace('postgresql://', variant);
      if (variant === 'pooled') url = url.replace('.c-4.', '-pooler.c-4.');
      if (variant === 'uppercase') url = url.replace('ep-crimson', 'EP-crimson');
      if (variant === 'port') url = url.replace('/neondb?', ':5432/neondb?');
      if (variant === 'wrongrole') url = url.replace('neondb_owner:', 'other:');
      if (variant === 'wrongdatabase') url = url.replace('/neondb?', '/other?');
      if (variant === 'dotpath') url = url.replace('/neondb?', '/foo/../neondb?');
      if (variant === 'encodedhost') url = url.replace('ep-crimson', '%65p-crimson');
      if (variant === 'fragment') url += '#x';
      if (variant === 'duplicatequery') url += '&sslmode=require';
      if (variant === 'extraschema') url += '&schema=other';
      if (variant === 'nossl') url = url.replace('sslmode=require', 'sslmode=disable');
      if (variant === 'invalidcert') url = url.replace('sslaccept=strict', 'sslaccept=accept_invalid_certs');
      if (variant === 'newline') url += '\n';
      if (variant === 'percentpassword') url = url.replace(PASSWORD, '%41'.repeat(20));
      if (variant === 'smallpassword') url = url.replace(PASSWORD, 'short');
      expect(() => decodePilotTrialCredential(envelope(url))).toThrow(/^PILOT_TRIAL_CREDENTIAL_REFUSED$/);
    });
  it.each(['extra', 'duplicate', 'newline', 'spaces', 'array', 'null', 'large', 'utf8', 'version'])('rejects %s credential envelope', kind => {
    let bytes = envelope();
    if (kind === 'extra') bytes = Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url: URL, secret: PASSWORD }));
    if (kind === 'duplicate') bytes = Buffer.from(`{"version":"pilot-trial-credential-v1","url":${JSON.stringify(URL)},"url":${JSON.stringify(URL)}}`);
    if (kind === 'newline') bytes = Buffer.concat([bytes, Buffer.from('\n')]);
    if (kind === 'spaces') bytes = Buffer.from(' ' + bytes.toString());
    if (kind === 'array') bytes = Buffer.from('[]');
    if (kind === 'null') bytes = Buffer.from('null');
    if (kind === 'large') bytes = Buffer.alloc(4097, 65);
    if (kind === 'utf8') bytes = Buffer.from([0xff, 0xfe]);
    if (kind === 'version') bytes = Buffer.from(JSON.stringify({ version: 'other', url: URL }));
    expect(() => decodePilotTrialCredential(bytes)).toThrow(/^PILOT_TRIAL_CREDENTIAL_REFUSED$/);
  });
  it('does not inherit credentials, overrides, telemetry hooks or proxy configuration', () => {
    const env = pilotTrialChildEnvironment(URL, { PATH: 'synthetic-path', SystemRoot: 'synthetic-root', NODE_OPTIONS: '--require=evil',
      DATABASE_URL: PASSWORD, DIRECT_URL: PASSWORD, PRISMA_QUERY_ENGINE_LIBRARY: PASSWORD, HTTPS_PROXY: PASSWORD, PGOPTIONS: PASSWORD, DOTENV_CONFIG_PATH: PASSWORD });
    expect(env.DATABASE_URL).toBe(URL); expect(env.DIRECT_URL).toBe(URL);
    expect(Object.keys(env).sort()).toEqual(['PATH', 'SystemRoot', 'CI', 'CHECKPOINT_DISABLE', 'PRISMA_HIDE_UPDATE_MESSAGE',
      'PRISMA_GENERATE_SKIP_AUTOINSTALL', 'DO_NOT_TRACK', 'NO_COLOR', 'npm_config_offline', 'DATABASE_URL', 'DIRECT_URL'].sort());
  });
});

describe('fixed actual Prisma/history selection — no DB execution', () => {
  it('validates both 70 and 79 with explicit false data/provenance claims', () => {
    const before = inspectPilotTrialHistory(snapshot(), catalog, 70), after = inspectPilotTrialHistory(snapshot(79), catalog, 79);
    expect(before.count).toBe(70); expect(after.count).toBe(79); expect(after.prior70Sha256).toBe(before.historySha256);
    expect(after).toMatchObject({ dataPreservationVerified: false, targetProviderProvenanceVerified: false });
  });
  it.each(['database', 'role', 'sessionRole', 'versionNum', 'readOnly', 'tls', 'historyCount', 'extra', 'checksum', 'pending', 'rollback', 'steps', 'duplicate', 'order'])(
    'rejects %s identity/history mismatch', kind => {
      const value = snapshot();
      if (kind === 'database') value.database = 'postgres';
      if (kind === 'role') value.role = 'other';
      if (kind === 'sessionRole') value.sessionRole = 'other';
      if (kind === 'versionNum') value.versionNum = 170011;
      if (kind === 'readOnly') value.readOnly = 'off';
      if (kind === 'tls') value.tls = false;
      if (kind === 'historyCount') value.historyCount = 71;
      if (kind === 'extra') Object.assign(value, { secret: PASSWORD });
      if (kind === 'checksum') value.rows[0].checksum = '0'.repeat(64);
      if (kind === 'pending') Object.assign(value.rows[0], { finished_at: null });
      if (kind === 'rollback') Object.assign(value.rows[0], { rolled_back_at: '2026-09-10T00:00:00.000Z' });
      if (kind === 'steps') value.rows[0].applied_steps_count = 0;
      if (kind === 'duplicate') value.rows[1] = value.rows[0];
      if (kind === 'order') value.rows.reverse();
      expect(() => inspectPilotTrialHistory(value, catalog, 70)).toThrow();
    });
  it('postflight requires exact newly applied source bytes and a completed step', () => {
    const value = snapshot(79); value.rows[78].checksum = 'e'.repeat(64);
    expect(() => inspectPilotTrialHistory(value, catalog, 79)).toThrow('POST_HISTORY_REFUSED');
  });
  it('selects installed real CLI migrate deploy/config79 only; no reset, resolve or fabricated history', () => {
    const stage = resolve(root, '.scratch/pilot-trial-prisma-00000000-0000-4000-8000-000000000000');
    const phase = pilotTrialPrismaPhase('MIGRATE_70_TO_79', root, stage);
    expect(phase).toEqual({ executable: process.execPath, args: [resolve(root, 'node_modules/prisma/build/index.js'),
      'migrate', 'deploy', '--config', resolve(stage, 'prisma-79.config.ts')], historyCount: 79 });
    expect(pilotTrialPrismaPhase('PREFLIGHT_70', root, stage).historyCount).toBe(70);
    expect(pilotTrialPrismaPhase('POSTFLIGHT_79', root, stage).historyCount).toBe(79);
    expect(() => pilotTrialPrismaPhase('MIGRATE_70_TO_79', root, resolve(root, '../other'))).toThrow('STAGING_PATH');
    expect(PILOT_TRIAL_HISTORY_SQL).toContain('LIMIT 80'); expect(PILOT_TRIAL_HISTORY_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/);
    expect(source).toContain("verifyInstalledPrisma(root)"); expect(source).toContain("SET TRANSACTION READ ONLY");
    expect(source).not.toContain('import "dotenv/config"');
  });
  it.each(['MIGRATE_70_TO_79', 'POSTFLIGHT_79'])('classifies %s failures as uncertain with no retry/reset/resolve', phase => {
    for (const exit of [1, null, 0]) expect(classifyPilotTrialProcessOutcome(phase, exit, false)).toEqual({ status: 'MIGRATION_OUTCOME_UNCERTAIN',
      automaticRetry: false, resetAllowed: false, migrationResolveAllowed: false, dataPreservationVerified: false, executionAuthorized: false });
  });
});

describe('runner orchestration — mocked local/process transport, no real Git or DB calls', () => {
  it('checks source before reading, copies unchanged staged70/79, rechecks then invokes exactly one read-only probe', async () => {
    let sourceChecksBeforeRead = 0;
    const input = new Readable({ read() { sourceChecksBeforeRead = mock.spawn.mock.calls.length; this.push(envelope()); this.push(null); } });
    const result = await run(input);
    expect(sourceChecksBeforeRead).toBeGreaterThan(5); expect(probes()).toHaveLength(1);
    const [, args, options] = probes()[0];
    expect(args.join(' ')).not.toContain(PASSWORD); expect(options).toMatchObject({ shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 131072 });
    expect(args[2]).toContain('.prisma-client/index.js'); expect(args[2]).toContain('SET TRANSACTION READ ONLY');
    expect(args[2]).toContain("lock_timeout='2s'");
    // The runner removes the child environment credential references after return.
    expect(options.env).not.toHaveProperty('DATABASE_URL');
    expect(result).toMatchObject({ status: 'READ_ONLY_PREFLIGHT_70_MATCH', migrationInvoked: false, executionAuthorized: false, dataPreservationVerified: false });
    const writes = mock.write.mock.calls as [string, string | Buffer, object][];
    expect(writes.filter(([file]) => file.endsWith('migration.sql'))).toHaveLength(149);
    for (const [file, bytes, options] of writes) {
      expect(String(bytes)).not.toContain(PASSWORD); expect(options).toMatchObject({ flag: 'wx', mode: 0o600 });
      if (file.endsWith('prisma-79.config.ts')) { expect(String(bytes)).toContain('79'); expect(String(bytes)).not.toContain('dotenv'); }
      const migration = /[\\/](\d{14}_[^\\/]+)[\\/]migration\.sql$/.exec(file);
      if (migration) expect(Buffer.from(bytes)).toEqual(readFileSync(resolve(root, 'prisma/migrations', migration[1], 'migration.sql')));
    }
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });
  it('migration hard refusal cannot be enabled by an injected flag and never reads stdin', async () => {
    const read = vi.fn(), input = new Readable({ read });
    await expect(runPilotTrialPrisma('MIGRATE_70_TO_79', { ...expected, approved: true }, { input })).rejects.toThrow('PRESERVATION_EVIDENCE_NOT_READY');
    expect(read).not.toHaveBeenCalled(); expect(mock.spawn).not.toHaveBeenCalled(); expect(mock.write).not.toHaveBeenCalled();
  });
  it.each(['head', 'dirty', 'catalog', 'binding', 'engineDrift'])('refuses %s and suppresses all raw errors', async kind => {
    const read = vi.fn(), input = new Readable({ read });
    const actual = mock.spawn.getMockImplementation()!;
    if (kind === 'catalog') {
      await expect(runPilotTrialPrisma('PREFLIGHT_70', { ...expected, expectedCatalogSha256: '0'.repeat(64) }, { input })).rejects.toThrow(/^PILOT_TRIAL_PREFLIGHT_REFUSED$/);
    } else {
      mock.spawn.mockImplementation((exe: string, args: string[], options: object) => {
        if (kind === 'head' && args.includes('HEAD')) return { status: 0, stdout: 'e'.repeat(40) };
        if (kind === 'dirty' && args.includes('status')) return { status: 0, stdout: ' M source' };
        if (kind === 'binding' && exe !== 'git') return { status: 1, stdout: PASSWORD, stderr: PASSWORD, error: Error(PASSWORD) };
        return actual(exe, args, options);
      });
      if (kind === 'engineDrift') {
        mock.client.mockReturnValueOnce({ hash: 'before' }).mockReturnValue({ hash: 'after' });
        await expect(run()).rejects.toThrow(/^PILOT_TRIAL_PREFLIGHT_REFUSED$/);
      } else await expect(run(input)).rejects.toThrow(/^PILOT_TRIAL_PREFLIGHT_REFUSED$/);
    }
    expect(read).not.toHaveBeenCalled(); expect(probes()).toHaveLength(0);
  });
  it.each(['throw', 'exit', 'timeout', 'overflow', 'invalidJSON', 'wrongIdentity'])('suppresses %s child output and never retries', async kind => {
    const actual = mock.spawn.getMockImplementation()!;
    mock.spawn.mockImplementation((exe: string, args: string[], options: object) => {
      if (!isProbe(args)) return actual(exe, args, options);
      if (kind === 'throw') throw Error(PASSWORD);
      if (kind === 'exit') return { status: 1, stdout: PASSWORD, stderr: PASSWORD };
      if (kind === 'timeout') return { status: null, signal: 'SIGTERM', error: Error(PASSWORD), stderr: PASSWORD };
      if (kind === 'overflow') return { status: 0, stdout: PASSWORD.repeat(10000) };
      if (kind === 'wrongIdentity') return { status: 0, stdout: JSON.stringify({ ...snapshot(), database: 'other' }) };
      return { status: 0, stdout: PASSWORD };
    });
    await expect(run()).rejects.toThrow(/^PILOT_TRIAL_PREFLIGHT_REFUSED$/); expect(probes()).toHaveLength(1);
    expect(JSON.stringify(mock.write.mock.calls)).not.toContain(PASSWORD);
  });
  it('refuses interactive, oversize and too many stdin chunks before query', async () => {
    const tty = stream(); Object.assign(tty, { isTTY: true }); await expect(run(tty)).rejects.toThrow('PREFLIGHT_REFUSED');
    await expect(run(stream(Buffer.alloc(4097)))).rejects.toThrow('PREFLIGHT_REFUSED');
    await expect(run(Readable.from(Array.from({ length: 65 }, () => Buffer.from('a'))))).rejects.toThrow('PREFLIGHT_REFUSED');
    expect(probes()).toHaveLength(0);
  });
  it('bounds a hung private input without a child or a second read attempt', async () => {
    vi.useFakeTimers();
    const pending = expect(run(new Readable({ read() {} }))).rejects.toThrow('PREFLIGHT_REFUSED');
    await vi.advanceTimersByTimeAsync(5000); await pending;
    expect(probes()).toHaveLength(0);
  });
  it('refuses a clock rollback before admitting any secret', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(999);
    const read = vi.fn(); await expect(run(new Readable({ read }))).rejects.toThrow('PREFLIGHT_REFUSED');
    expect(read).not.toHaveBeenCalled(); expect(probes()).toHaveLength(0);
  });
  it.each(['schema', 'migration', 'config', 'unexpected'])('rejects staged %s changes after stdin before any remote probe', async kind => {
    const input = new Readable({ read() {
      const key = [...mock.files.keys()].find(name => kind === 'schema' ? name.endsWith('schema.prisma')
        : kind === 'config' ? name.endsWith('prisma-79.config.ts') : name.endsWith('migration.sql'))!;
      if (kind === 'unexpected') mock.files.set(resolve(dirname(key), 'unexpected.env'), Buffer.from('SYNTHETIC'));
      else mock.files.set(key, Buffer.from('SYNTHETIC_CHANGED'));
      this.push(envelope()); this.push(null);
    } });
    await expect(run(input)).rejects.toThrow('PREFLIGHT_REFUSED'); expect(probes()).toHaveLength(0);
    expect(mock.write.mock.calls.some((call: unknown[]) => typeof call[0] === 'string' && call[0].endsWith('receipt.json'))).toBe(false);
  });
});
