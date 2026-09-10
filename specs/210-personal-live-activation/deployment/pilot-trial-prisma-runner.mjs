// Single isolated trial only. No credential lookup, arbitrary SQL, retry or release flag.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { types } from 'node:util';
import { assertReleaseRegularFile } from '../../../scripts/endvera-release-source-binding.mjs';
import { safeEnvironment, generatedClientFingerprint } from '../../208-astra-r02-local-preflight/preflight.mjs';
import { buildPilotMigrationCatalog, inspectSuppliedPilotMigrationCatalog, compareSuppliedPilotMigrationRows } from './pilot-migration-catalog.mjs';
import { privatePrismaConfig, verifyInstalledPrisma } from './migration-rehearsal/rehearsal.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const PILOT_TRIAL_TARGET = Object.freeze({ projectId: 'withered-mud-08129552', branchId: 'br-holy-brook-ax7k68oh',
  endpointId: 'ep-crimson-violet-axmmwtjw', hostname: 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' });
const SELF = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const SOURCES = [SELF, 'scripts/endvera-release-source-binding.mjs', 'specs/208-astra-r02-local-preflight/preflight.mjs',
  'specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs',
  'specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs', 'prisma.config.ts', 'package.json', 'package-lock.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** @returns {never} */
const fail = code => { throw new Error(`PILOT_TRIAL_${code}`); };
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
function fields(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_SHAPE');
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(key => !keys.includes(key))) fail('INPUT_SHAPE');
  const out = {};
  for (const key of keys) { const d = descriptors[key]; if (!d?.enumerable || !('value' in d)) fail('INPUT_SHAPE'); out[key] = d.value; }
  return out;
}
function historyRows(value, count) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype) fail('HISTORY_SHAPE');
  if (Object.getOwnPropertyDescriptor(value, 'length')?.value !== count) fail('HISTORY_SHAPE');
  if (Reflect.ownKeys(value).length !== count + 1) fail('HISTORY_SHAPE');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const d = descriptors[String(i)];
    if (!d?.enumerable || !('value' in d)) fail('HISTORY_SHAPE');
    rows.push(fields(d.value, ['migration_name', 'checksum', 'finished_at', 'rolled_back_at', 'applied_steps_count']));
  }
  return rows;
}
function expectations(raw) {
  const value = fields(raw, ['expectedHead', 'expectedCatalogSha256']);
  if (typeof value.expectedHead !== 'string' || !/^[a-f0-9]{40}$/.test(value.expectedHead)
    || typeof value.expectedCatalogSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.expectedCatalogSha256)) fail('EXPECTED_SOURCE');
  return Object.freeze(value);
}
function budget() {
  const wall = Date.now(), mono = performance.now(); let lastWall = wall, lastMono = mono;
  return () => {
    const w = Date.now(), m = performance.now();
    if (!Number.isFinite(w) || !Number.isFinite(m) || w < lastWall || m < lastMono) fail('DEADLINE');
    lastWall = w; lastMono = m;
    const remaining = Math.floor(Math.min(60000 - (w - wall), 60000 - (m - mono)));
    if (remaining <= 0) fail('DEADLINE'); return remaining;
  };
}
function regular(root, relative, max = 8 * 1024 * 1024) {
  const file = assertReleaseRegularFile(root, relative);
  if (lstatSync(file).size > max) fail('SOURCE_SIZE');
  const bytes = readFileSync(file); if (bytes.length > max) fail('SOURCE_SIZE'); return bytes;
}
function localProcess(executable, args, root, env, remaining, input) {
  const result = spawnSync(executable, args, { cwd: root, env, input, encoding: 'utf8', windowsHide: true,
    shell: false, stdio: ['pipe', 'pipe', 'pipe'], timeout: Math.min(30000, remaining()), maxBuffer: 1048576 });
  remaining();
  if (result.error || result.signal || result.status !== 0) fail('LOCAL_SOURCE_REFUSED'); return result.stdout;
}
function inspectSource(root, expected, remaining) {
  const env = { ...safeEnvironment(root), GIT_OPTIONAL_LOCKS: '0' };
  const git = (...args) => localProcess('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args], root, env, remaining);
  const check = () => {
    if (git('rev-parse', '--verify', 'HEAD').trim() !== expected.expectedHead) fail('HEAD_CHANGED');
    if (git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none') !== '') fail('DIRTY_SOURCE');
  };
  check();
  const catalog = buildPilotMigrationCatalog(root);
  if (catalog.catalogSha256 !== expected.expectedCatalogSha256) fail('CATALOG_CHANGED');
  const source = SOURCES.map(name => { const bytes = regular(root, name); return { path: name, sha256: hash(bytes), byteSize: bytes.length }; });
  const schema = regular(root, 'prisma/schema.prisma', 2000000), lock = regular(root, 'prisma/migrations/migration_lock.toml', 4096);
  const installed = verifyInstalledPrisma(root), runtimeRoot = realpathSync(path.join(root, 'node_modules'));
  const cli = assertReleaseRegularFile(runtimeRoot, 'prisma/build/index.js'), cliHash = hash(regular(runtimeRoot, 'prisma/build/index.js'));
  const client = generatedClientFingerprint(root);
  // This separate bounded local process retains the shared whole-checkout checks,
  // including direct bytes hidden by assume-unchanged/skip-worktree. No secret yet.
  const tree = git('rev-parse', `${expected.expectedHead}^{tree}`).trim();
  const script = `import {readFileSync} from 'node:fs';import {assertReleaseSourceBinding} from ${JSON.stringify(pathToFileURL(path.join(root, 'scripts/endvera-release-source-binding.mjs')).href)};const x=JSON.parse(readFileSync(0,'utf8'));assertReleaseSourceBinding(x);process.stdout.write('BOUND');`;
  if (localProcess(process.execPath, ['--input-type=module', '-e', script], root, env, remaining,
    JSON.stringify({ repositoryRoot: root, manifest: { source: { head: expected.expectedHead, tree }, inputs: source } })) !== 'BOUND') fail('SOURCE_BINDING');
  check(); remaining();
  return { catalog, schema, lock, cli, clientPath: assertReleaseRegularFile(root, '.prisma-client/index.js'),
    fingerprint: hash(JSON.stringify({ source, catalog, schema: hash(schema), lock: hash(lock), installed, cli, cliHash, client, tree })) };
}

/** Pure secret decoder. Canonical single-line JSON prevents duplicate keys and
 * URL normalization ambiguities. The controller constructs this exact envelope
 * privately; returned credentials must never be included in a receipt or error. */
export function decodePilotTrialCredential(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 4096) fail('CREDENTIAL_REFUSED');
  try {
    const copy = Buffer.from(bytes), text = copy.toString('utf8');
    if (!Buffer.from(text).equals(copy) || /[\r\n\0]/.test(text)) fail('CREDENTIAL_REFUSED');
    const parsed = JSON.parse(text), value = fields(parsed, ['version', 'url']);
    if (JSON.stringify(value) !== text || value.version !== 'pilot-trial-credential-v1' || typeof value.url !== 'string') fail('CREDENTIAL_REFUSED');
    const prefix = `postgresql://${PILOT_TRIAL_TARGET.role}:`, suffix = `@${PILOT_TRIAL_TARGET.hostname}/${PILOT_TRIAL_TARGET.database}?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
    if (!value.url.startsWith(prefix) || !value.url.endsWith(suffix)
      || !/^[A-Za-z0-9_-]{16,256}$/.test(value.url.slice(prefix.length, -suffix.length))) fail('CREDENTIAL_REFUSED');
    return value.url;
  } catch { fail('CREDENTIAL_REFUSED'); }
}
async function readCredential(input, remaining) {
  if (!input || input.isTTY === true) fail('PRIVATE_STDIN_REQUIRED');
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, count = 0, settled = false;
    const done = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      input.removeListener('data', data); input.removeListener('end', end); input.removeListener('error', errorEvent);
      // Cancellation is bounded; never await a producer's close or print errors.
      try { input.pause(); } catch { /* No producer error disclosure. */ }
      for (const chunk of chunks) chunk.fill(0);
      if (error) reject(new Error('PILOT_TRIAL_CREDENTIAL_REFUSED')); else resolve(value);
    };
    const data = chunk => {
      if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0 || ++count > 64 || (size += chunk.byteLength) > 4096) return done(true);
      chunks.push(Buffer.from(chunk));
    };
    const end = () => { let merged; try { remaining(); merged = Buffer.concat(chunks); done(false, decodePilotTrialCredential(merged)); } catch { done(true); } finally { merged?.fill(0); } };
    const errorEvent = () => done(true);
    const timer = setTimeout(() => done(true), Math.min(5000, remaining()));
    input.on('data', data); input.once('end', end); input.once('error', errorEvent);
  });
}

/** Exact Prisma child environment, never spread parent credentials, NODE_OPTIONS,
 * engine overrides, dotenv, proxy settings or arbitrary PG options into a child.
 * @param {string} url
 * @param {Record<string, string | undefined>} platform */
export function pilotTrialChildEnvironment(url, platform = process.env) {
  const checked = decodePilotTrialCredential(Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url })));
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    const name = Object.keys(platform).find(name => name.toLowerCase() === key.toLowerCase());
    if (name && typeof platform[name] === 'string') env[key] = platform[name];
  }
  return { ...env, CI: '1', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', PRISMA_GENERATE_SKIP_AUTOINSTALL: '1',
    DO_NOT_TRACK: '1', NO_COLOR: '1', npm_config_offline: 'true', DATABASE_URL: checked, DIRECT_URL: checked };
}

// No application rows, logs or passwords. Both identity and history share one
// READ ONLY transaction. LIMIT bounds a hostile/unexpected migration table.
export const PILOT_TRIAL_HISTORY_SQL = `SELECT pg_catalog.jsonb_build_object(
 'database',pg_catalog.current_database(),'role',current_user,'sessionRole',session_user,
 'versionNum',pg_catalog.current_setting('server_version_num')::int,
 'readOnly',pg_catalog.current_setting('transaction_read_only'),
 'tls',(SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()),
 'historyCount',(SELECT count(*)::int FROM public."_prisma_migrations"),
 'rows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY migration_name),'[]'::jsonb)
 FROM (SELECT migration_name,checksum,
 pg_catalog.to_char(finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS finished_at,
 pg_catalog.to_char(rolled_back_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS rolled_back_at,
 applied_steps_count FROM public."_prisma_migrations" ORDER BY migration_name LIMIT 80) m))::text AS snapshot`;

export function inspectPilotTrialHistory(raw, suppliedCatalog, count) {
  if (count !== 70 && count !== 79) fail('PHASE');
  const catalog = inspectSuppliedPilotMigrationCatalog(suppliedCatalog);
  const snapshot = fields(raw, ['database', 'role', 'sessionRole', 'versionNum', 'readOnly', 'tls', 'historyCount', 'rows']);
  if (snapshot.database !== 'neondb' || snapshot.role !== 'neondb_owner' || snapshot.sessionRole !== 'neondb_owner'
    || !Number.isInteger(snapshot.versionNum) || snapshot.versionNum < 180000 || snapshot.versionNum >= 190000
    || snapshot.readOnly !== 'on' || snapshot.tls !== true || snapshot.historyCount !== count) fail('TARGET_HISTORY_REFUSED');
  // The native transport emits JSON, but this exported pure boundary also refuses
  // proxies, sparse arrays and accessors before reading any row or array method.
  const rows = historyRows(snapshot.rows, count);
  const names = rows.map(row => row.migration_name);
  if (names.some((name, i) => name !== catalog.entries[i].migrationName)) fail('HISTORY_ORDER');
  compareSuppliedPilotMigrationRows(catalog, rows.slice(0, 70));
  for (let i = 70; i < count; i++) {
    const row = rows[i], entry = catalog.entries[i];
    if (row.checksum !== entry.sha256 || row.rolled_back_at !== null || row.applied_steps_count !== 1
      || typeof row.finished_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.finished_at)
      || !Number.isFinite(Date.parse(row.finished_at)) || new Date(row.finished_at).toISOString() !== row.finished_at) fail('POST_HISTORY_REFUSED');
  }
  return frozen({ count, versionNum: snapshot.versionNum, historySha256: hash(JSON.stringify(rows)),
    prior70Sha256: hash(JSON.stringify(rows.slice(0, 70))), targetProviderProvenanceVerified: false, dataPreservationVerified: false });
}

function stageSource(root, source) {
  const scratch = path.join(root, '.scratch');
  for (let current = scratch;; current = path.dirname(current)) {
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) fail('STAGING_PATH');
    if (path.dirname(current) === current) break;
  }
  const stage = path.join(scratch, `pilot-trial-prisma-${randomUUID()}`); mkdirSync(stage, { mode: 0o700 });
  const files = [];
  const write = (name, bytes) => {
    const copy = Buffer.from(bytes);
    writeFileSync(path.join(stage, name), copy, { flag: 'wx', mode: 0o600 });
    files.push(Object.freeze({ name, sha256: hash(copy), byteSize: copy.length }));
  };
  write('schema.prisma', source.schema);
  for (const count of [70, 79]) {
    const dir = `${count}/migrations`; mkdirSync(path.join(stage, dir), { recursive: true, mode: 0o700 });
    write(`${dir}/migration_lock.toml`, source.lock);
    for (const entry of source.catalog.entries.slice(0, count)) {
      const bytes = regular(root, entry.relativePath, 262144); if (hash(bytes) !== entry.sha256) fail('CATALOG_CHANGED');
      mkdirSync(path.join(stage, dir, entry.migrationName)); write(`${dir}/${entry.migrationName}/migration.sql`, bytes);
    }
    write(`prisma-${count}.config.ts`, privatePrismaConfig(path.join(stage, 'schema.prisma'), path.join(stage, dir)));
  }
  return Object.freeze({ directory: stage, files: Object.freeze(files) });
}
function verifyStage(root, stage) {
  const directories = new Map([[stage.directory, new Set()]]);
  for (const file of stage.files) {
    const full = path.join(stage.directory, file.name);
    const bytes = regular(root, path.relative(root, full));
    if (bytes.length !== file.byteSize || hash(bytes) !== file.sha256) fail('STAGED_BYTES_CHANGED');
    for (let child = full; child !== stage.directory; child = path.dirname(child)) {
      const parent = path.dirname(child);
      if (!directories.has(parent)) directories.set(parent, new Set());
      directories.get(parent).add(path.basename(child));
    }
  }
  // Each directory was already reached through a checked regular file above.
  // Enumerate only these known directories; never traverse an unexpected link.
  for (const [dir, expected] of directories) {
    if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()
      || JSON.stringify(readdirSync(dir).sort()) !== JSON.stringify([...expected].sort())) fail('STAGED_INVENTORY_CHANGED');
  }
}

/** Selection only, not executable authority. The migrate branch is deliberately
 * unreachable from the runner until preservation/approval contracts are reviewed. */
export function pilotTrialPrismaPhase(phase, root, stage) {
  const resolved = path.resolve(root), parent = path.join(resolved, '.scratch');
  if (typeof stage !== 'string' || path.dirname(stage) !== parent || !/^pilot-trial-prisma-[a-f0-9-]{36}$/.test(path.basename(stage))) fail('STAGING_PATH');
  if (phase === 'MIGRATE_70_TO_79') return frozen({ executable: process.execPath,
    args: [path.join(resolved, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(stage, 'prisma-79.config.ts')], historyCount: 79 });
  if (phase === 'PREFLIGHT_70' || phase === 'POSTFLIGHT_79') return frozen({ historyCount: phase === 'PREFLIGHT_70' ? 70 : 79, query: PILOT_TRIAL_HISTORY_SQL });
  fail('PHASE');
}
export function classifyPilotTrialProcessOutcome(phase, exitCode, completedVerification) {
  if (!['PREFLIGHT_70', 'MIGRATE_70_TO_79', 'POSTFLIGHT_79'].includes(phase)) fail('PHASE');
  const ok = exitCode === 0 && completedVerification === true;
  return frozen({ status: ok ? 'PHASE_VERIFIED' : phase === 'PREFLIGHT_70' ? 'PREFLIGHT_REFUSED' : 'MIGRATION_OUTCOME_UNCERTAIN',
    automaticRetry: false, resetAllowed: false, migrationResolveAllowed: false, dataPreservationVerified: false, executionAuthorized: false });
}

/** Actual guarded read-only runner. MIGRATE is hard-refused before source work or
 * credential admission; caller flags cannot enable it. Do not invoke preflight
 * until the controller has reviewed this source and separately authorized the run.
 * @param {string} mode
 * @param {unknown} rawExpected
 * @param {{repositoryRoot?: string, input?: import('node:stream').Readable}} options */
export async function runPilotTrialPrisma(mode, rawExpected, options = {}) {
  if (mode === 'MIGRATE_70_TO_79') fail('PRESERVATION_EVIDENCE_NOT_READY');
  if (mode !== 'PREFLIGHT_70') fail('MODE');
  const { repositoryRoot = ROOT, input = process.stdin } = options;
  const expected = expectations(rawExpected), root = path.resolve(repositoryRoot), remaining = budget();
  let stage, url, env, childExit = null;
  try {
    const source = inspectSource(root, expected, remaining);
    stage = stageSource(root, source); remaining();
    url = await readCredential(input, remaining);
    const checked = inspectSource(root, expected, remaining);
    if (checked.fingerprint !== source.fingerprint) fail('SOURCE_CHANGED');
    verifyStage(root, stage); remaining();
    env = pilotTrialChildEnvironment(url);
    const clientUrl = pathToFileURL(checked.clientPath).href;
    const script = `import {PrismaClient} from ${JSON.stringify(clientUrl)};const p=new PrismaClient({log:[]});try{const value=await p.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");const rows=await tx.$queryRawUnsafe(${JSON.stringify(PILOT_TRIAL_HISTORY_SQL)});if(rows.length!==1||typeof rows[0].snapshot!=='string')throw Error();return rows[0].snapshot;},{maxWait:2000,timeout:20000});if(Buffer.byteLength(value)>131072)throw Error();process.stdout.write(value);}catch{process.exitCode=2;}finally{await p.$disconnect().catch(()=>{process.exitCode=2;});}`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: stage.directory, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true, timeout: Math.min(30000, remaining()), maxBuffer: 131072 });
    childExit = Number.isInteger(child.status) ? child.status : null; remaining();
    if (child.error || child.signal || child.status !== 0 || typeof child.stdout !== 'string' || Buffer.byteLength(child.stdout) > 131072) fail('PREFLIGHT_REFUSED');
    const history = inspectPilotTrialHistory(JSON.parse(child.stdout), source.catalog, 70); remaining();
    verifyStage(root, stage); remaining();
    const receipt = frozen({ version: 'pilot-trial-prisma-receipt-v1', mode, status: 'READ_ONLY_PREFLIGHT_70_MATCH',
      sourceHead: expected.expectedHead, catalogSha256: expected.expectedCatalogSha256, sourceFingerprint: source.fingerprint,
      target: PILOT_TRIAL_TARGET, history, childExit, automaticRetry: false, migrationInvoked: false,
      executionAuthorized: false, backupVerified: false, dataPreservationVerified: false, elapsedMs: 60000 - remaining() });
    writeFileSync(path.join(stage.directory, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    return receipt;
  } catch {
    if (stage) {
      try { verifyStage(root, stage); writeFileSync(path.join(stage.directory, 'receipt.json'), JSON.stringify({ version: 'pilot-trial-prisma-receipt-v1', mode,
        status: 'PREFLIGHT_REFUSED', childExit, automaticRetry: false, migrationInvoked: false, executionAuthorized: false,
        dataPreservationVerified: false }), { flag: 'wx', mode: 0o600 }); } catch { /* No raw filesystem or child error disclosure. */ }
    }
    fail('PREFLIGHT_REFUSED');
  } finally { if (env) { delete env.DATABASE_URL; delete env.DIRECT_URL; } url = undefined; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || args[0] !== '--mode' || args[2] !== '--expected-head' || args[4] !== '--expected-catalog-sha256') fail('CLI_REFUSED');
    const receipt = await runPilotTrialPrisma(args[1], { expectedHead: args[3], expectedCatalogSha256: args[5] });
    // No path, URL, raw query rows, Prisma output or caller error is logged.
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } catch { process.stderr.write('PILOT_TRIAL_RUN_REFUSED_NO_AUTOMATIC_RETRY\n'); process.exitCode = 1; }
}
