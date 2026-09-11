// Two closed source-owned targets. No credential lookup, arbitrary SQL, retry or release flag.
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
const PERSONAL_PILOT_TARGET = Object.freeze({ projectId: 'withered-mud-08129552', branchId: 'br-nameless-moon-ax8nmuwj',
  endpointId: 'ep-purple-union-axj3h2t5', hostname: 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' });
const SELF = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const SOURCES = [SELF, 'scripts/endvera-release-source-binding.mjs', 'specs/208-astra-r02-local-preflight/preflight.mjs',
  'specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs',
  'specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs', 'prisma.config.ts', 'package.json', 'package-lock.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Classify only errors created by this module. Never inspect an arbitrary
// error's message, stack, code, properties or string conversion for diagnostics.
const failureReasons = new WeakMap(), refusalDiagnostics = new WeakMap();
const diagnosticReasons = new Set(['DEADLINE', 'HEAD_CHANGED', 'DIRTY_SOURCE', 'CATALOG_CHANGED', 'SOURCE_CHANGED', 'SOURCE_BINDING',
  'SOURCE_SIZE', 'LOCAL_SOURCE_REFUSED', 'CREDENTIAL_REFUSED', 'PRIVATE_STDIN_REQUIRED', 'STAGING_PATH', 'STAGED_BYTES_CHANGED',
  'STAGED_INVENTORY_CHANGED', 'INPUT_SHAPE', 'HISTORY_SHAPE', 'HISTORY_ORDER', 'POST_HISTORY_REFUSED', 'HISTORY_PREFIX_REJECTED',
  'DATABASE_MISMATCH', 'ROLE_MISMATCH', 'SESSION_ROLE_MISMATCH', 'VERSION_TYPE', 'VERSION_RANGE', 'READ_ONLY_NOT_CONFIRMED',
  'TLS_TYPE', 'TLS_NOT_CONFIRMED', 'HISTORY_COUNT_TYPE', 'HISTORY_COUNT_MISMATCH', 'SNAPSHOT_JSON_INVALID',
  'CHILD_PROCESS_FAILURE', 'CHILD_OUTPUT_TYPE', 'CHILD_OUTPUT_BOUND']);
function classifiedError(code, reason = code) {
  const error = new Error(`PILOT_TRIAL_${code}`);
  failureReasons.set(error, diagnosticReasons.has(reason) ? reason : 'LOCAL_VALIDATION_REFUSED');
  return error;
}
/** @returns {never} */
const fail = (code, reason = code) => { throw classifiedError(code, reason); };
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
function budget(total = 60000) {
  const wall = Date.now(), mono = performance.now(); let lastWall = wall, lastMono = mono;
  return () => {
    const w = Date.now(), m = performance.now();
    if (!Number.isFinite(w) || !Number.isFinite(m) || w < lastWall || m < lastMono) fail('DEADLINE');
    lastWall = w; lastMono = m;
    const remaining = Math.floor(Math.min(total - (w - wall), total - (m - mono)));
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
  return { catalog, schema, lock, cli, cliHash, clientPath: assertReleaseRegularFile(root, '.prisma-client/index.js'),
    fingerprint: hash(JSON.stringify({ source, catalog, schema: hash(schema), lock: hash(lock), installed, cli, cliHash, client, tree })) };
}

/** Pure secret decoder. Canonical single-line JSON prevents duplicate keys and
 * URL normalization ambiguities. The controller constructs this exact envelope
 * privately; returned credentials must never be included in a receipt or error. */
export function decodePilotTrialCredential(bytes) {
  return decodeCredential(bytes, PILOT_TRIAL_TARGET);
}
export function decodePilotCurrentCredential(bytes) {
  return decodeCredential(bytes, PERSONAL_PILOT_TARGET);
}
function decodeCredential(bytes, target) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 4096) fail('CREDENTIAL_REFUSED');
  try {
    const copy = Buffer.from(bytes), text = copy.toString('utf8');
    if (!Buffer.from(text).equals(copy) || /[\r\n\0]/.test(text)) fail('CREDENTIAL_REFUSED');
    const parsed = JSON.parse(text), value = fields(parsed, ['version', 'url']);
    if (JSON.stringify(value) !== text || value.version !== 'pilot-trial-credential-v1' || typeof value.url !== 'string') fail('CREDENTIAL_REFUSED');
    const prefix = `postgresql://${target.role}:`, suffix = `@${target.hostname}/${target.database}?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
    if (!value.url.startsWith(prefix) || !value.url.endsWith(suffix)
      || !/^[A-Za-z0-9_-]{16,256}$/.test(value.url.slice(prefix.length, -suffix.length))) fail('CREDENTIAL_REFUSED');
    return value.url;
  } catch { fail('CREDENTIAL_REFUSED'); }
}
async function readCredential(input, remaining, target = PILOT_TRIAL_TARGET) {
  if (!input || input.isTTY === true) fail('PRIVATE_STDIN_REQUIRED');
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, count = 0, settled = false;
    const done = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      input.removeListener('data', data); input.removeListener('end', end); input.removeListener('error', errorEvent);
      // Cancellation is bounded; never await a producer's close or print errors.
      try { input.pause(); } catch { /* No producer error disclosure. */ }
      for (const chunk of chunks) chunk.fill(0);
      if (error) reject(classifiedError('CREDENTIAL_REFUSED')); else resolve(value);
    };
    const data = chunk => {
      if (!(chunk instanceof Uint8Array) || chunk.byteLength === 0 || ++count > 64 || (size += chunk.byteLength) > 4096) return done(true);
      chunks.push(Buffer.from(chunk));
    };
    const end = () => { let merged; try { remaining(); merged = Buffer.concat(chunks); done(false, decodeCredential(merged, target)); } catch { done(true); } finally { merged?.fill(0); } };
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
  return childEnvironment(url, platform, PILOT_TRIAL_TARGET);
}
function childEnvironment(url, platform, target) {
  const checked = decodeCredential(Buffer.from(JSON.stringify({ version: 'pilot-trial-credential-v1', url })), target);
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
  // pg_stat_ssl observes the backend connection, not necessarily the client-to-
  // proxy segment. Preserve its boolean without inventing client transport proof.
  if (snapshot.database !== 'neondb') fail('TARGET_HISTORY_REFUSED', 'DATABASE_MISMATCH');
  if (snapshot.role !== 'neondb_owner') fail('TARGET_HISTORY_REFUSED', 'ROLE_MISMATCH');
  if (snapshot.sessionRole !== 'neondb_owner') fail('TARGET_HISTORY_REFUSED', 'SESSION_ROLE_MISMATCH');
  if (!Number.isInteger(snapshot.versionNum)) fail('TARGET_HISTORY_REFUSED', 'VERSION_TYPE');
  if (snapshot.versionNum < 180000 || snapshot.versionNum >= 190000) fail('TARGET_HISTORY_REFUSED', 'VERSION_RANGE');
  if (snapshot.readOnly !== 'on') fail('TARGET_HISTORY_REFUSED', 'READ_ONLY_NOT_CONFIRMED');
  if (typeof snapshot.tls !== 'boolean') fail('TARGET_HISTORY_REFUSED', 'TLS_TYPE');
  if (snapshot.historyCount !== count) fail('TARGET_HISTORY_REFUSED', typeof snapshot.historyCount === 'number' ? 'HISTORY_COUNT_MISMATCH' : 'HISTORY_COUNT_TYPE');
  // The native transport emits JSON, but this exported pure boundary also refuses
  // proxies, sparse arrays and accessors before reading any row or array method.
  const rows = historyRows(snapshot.rows, count);
  const names = rows.map(row => row.migration_name);
  if (names.some((name, i) => name !== catalog.entries[i].migrationName)) fail('HISTORY_ORDER');
  try { compareSuppliedPilotMigrationRows(catalog, rows.slice(0, 70)); }
  catch { fail('HISTORY_PREFIX_REJECTED'); }
  for (let i = 70; i < count; i++) {
    const row = rows[i], entry = catalog.entries[i];
    if (row.checksum !== entry.sha256 || row.rolled_back_at !== null || row.applied_steps_count !== 1
      || typeof row.finished_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.finished_at)
      || !Number.isFinite(Date.parse(row.finished_at)) || new Date(row.finished_at).toISOString() !== row.finished_at) fail('POST_HISTORY_REFUSED');
  }
  return frozen({ count, versionNum: snapshot.versionNum, backendConnectionSslObserved: snapshot.tls, historySha256: hash(JSON.stringify(rows)),
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

/** Fixed phase selection only; this descriptor is not execution authority. */
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

/** Guarded fixed trial runner. No caller flag replaces source, baseline or history pins.
 * @param {string} mode
 * @param {unknown} rawExpected
 * @param {{repositoryRoot?: string, input?: import('node:stream').Readable}} options */
export async function runPilotTrialPrisma(mode, rawExpected, options = {}) {
  if (mode === 'MIGRATE_70_TO_79') return runMigration(rawExpected, options, TRIAL_PROFILE);
  if (mode !== 'PREFLIGHT_70') fail('MODE');
  const { repositoryRoot = ROOT, input = process.stdin } = options;
  const expected = expectations(rawExpected), root = path.resolve(repositoryRoot), remaining = budget();
  let stage, url, env, childExit = null, diagnosticStage = 'SOURCE';
  try {
    const source = inspectSource(root, expected, remaining);
    diagnosticStage = 'STAGING';
    stage = stageSource(root, source); remaining();
    diagnosticStage = 'CREDENTIAL';
    url = await readCredential(input, remaining);
    diagnosticStage = 'RECHECK';
    const checked = inspectSource(root, expected, remaining);
    if (checked.fingerprint !== source.fingerprint) fail('SOURCE_CHANGED');
    verifyStage(root, stage); remaining();
    env = pilotTrialChildEnvironment(url);
    const clientUrl = pathToFileURL(checked.clientPath).href;
    const script = `import {PrismaClient} from ${JSON.stringify(clientUrl)};const p=new PrismaClient({log:[]});try{const value=await p.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");const rows=await tx.$queryRawUnsafe(${JSON.stringify(PILOT_TRIAL_HISTORY_SQL)});if(rows.length!==1||typeof rows[0].snapshot!=='string')throw Error();return rows[0].snapshot;},{maxWait:2000,timeout:20000});if(Buffer.byteLength(value)>131072)throw Error();process.stdout.write(value);}catch{process.exitCode=2;}finally{await p.$disconnect().catch(()=>{process.exitCode=2;});}`;
    diagnosticStage = 'CHILD';
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: stage.directory, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true, timeout: Math.min(30000, remaining()), maxBuffer: 131072 });
    childExit = Number.isInteger(child.status) ? child.status : null; remaining();
    if (child.error || child.signal || child.status !== 0) fail('PREFLIGHT_REFUSED', 'CHILD_PROCESS_FAILURE');
    if (typeof child.stdout !== 'string') fail('PREFLIGHT_REFUSED', 'CHILD_OUTPUT_TYPE');
    if (Buffer.byteLength(child.stdout) > 131072) fail('PREFLIGHT_REFUSED', 'CHILD_OUTPUT_BOUND');
    diagnosticStage = 'HISTORY';
    let snapshot; try { snapshot = JSON.parse(child.stdout); } catch { fail('PREFLIGHT_REFUSED', 'SNAPSHOT_JSON_INVALID'); }
    const history = inspectPilotTrialHistory(snapshot, source.catalog, 70); remaining();
    diagnosticStage = 'VERIFY';
    verifyStage(root, stage); remaining();
    const receipt = frozen({ version: 'pilot-trial-prisma-receipt-v1', mode, status: 'READ_ONLY_PREFLIGHT_70_MATCH',
      sourceHead: expected.expectedHead, catalogSha256: expected.expectedCatalogSha256, sourceFingerprint: source.fingerprint,
      target: PILOT_TRIAL_TARGET, history,
      // Source-bound strict Prisma URL policy, not observed negotiated TLS details.
      clientTransportPolicy: 'PRISMA_REQUIRE_TLS_STRICT_CERT',
      childExit, automaticRetry: false, migrationInvoked: false,
      executionAuthorized: false, backupVerified: false, dataPreservationVerified: false, elapsedMs: 60000 - remaining() });
    diagnosticStage = 'WRITE';
    writeFileSync(path.join(stage.directory, 'receipt.json'), JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    return receipt;
  } catch (error) {
    const diagnostic = Object.freeze({ version: 'pilot-trial-preflight-diagnostic-v1', stage: diagnosticStage,
      reason: failureReasons.get(error) ?? 'LOCAL_VALIDATION_REFUSED' });
    if (stage) {
      try { verifyStage(root, stage); writeFileSync(path.join(stage.directory, 'receipt.json'), JSON.stringify({ version: 'pilot-trial-prisma-receipt-v1', mode,
        status: 'PREFLIGHT_REFUSED', childExit, automaticRetry: false, migrationInvoked: false, executionAuthorized: false,
        dataPreservationVerified: false, diagnostic }), { flag: 'wx', mode: 0o600 }); } catch { /* No raw filesystem or child error disclosure. */ }
    }
    const refusal = classifiedError('PREFLIGHT_REFUSED');
    Object.defineProperty(refusal, 'diagnostic', { value: diagnostic, enumerable: true });
    refusalDiagnostics.set(refusal, diagnostic); throw refusal;
  } finally { if (env) { delete env.DATABASE_URL; delete env.DIRECT_URL; } url = undefined; }
}

// Two fixed profiles, one persistent attempt per profile. These pins describe retained
// controller evidence; matching bytes does not prove current remote preservation.
const MIGRATION_HISTORY70 = '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
const TRIAL_PROFILE = Object.freeze({ target: PILOT_TRIAL_TARGET,
  baseline: '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a',
  baselineFile: '.scratch/pilot-trial-data-before70-20260910T2308Z.json',
  attemptFile: '.scratch/pilot-trial-migration-br-holy-brook-ax7k68oh.attempt.json',
  receiptVersion: 'pilot-trial-migration-receipt-v1', attemptVersion: 'pilot-trial-migration-attempt-v1',
  success: 'MIGRATION_HISTORY_79_VERIFIED', uncertain: 'MIGRATION_OUTCOME_UNCERTAIN', refused: 'MIGRATION_REFUSED_BEFORE_SPAWN' });
const PERSONAL_PROFILE = Object.freeze({ target: PERSONAL_PILOT_TARGET,
  baseline: '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac',
  baselineFile: '.scratch/pilot-current-data-before70-20260911T0024Z.json',
  attemptFile: '.scratch/pilot-current-migration-br-nameless-moon-ax8nmuwj.attempt.json',
  receiptVersion: 'pilot-current-migration-receipt-v1', attemptVersion: 'pilot-current-migration-attempt-v1',
  success: 'PERSONAL_PILOT_HISTORY_79_VERIFIED', uncertain: 'PERSONAL_PILOT_MIGRATION_OUTCOME_UNCERTAIN', refused: 'PERSONAL_PILOT_MIGRATION_REFUSED_BEFORE_SPAWN' });
function migrationExpectations(raw, profile = TRIAL_PROFILE) {
  // Preserve the old closed refusal for incomplete attempts, before options/input.
  let value;
  try { value = fields(raw, ['expectedHead', 'expectedCatalogSha256', 'expectedBaselineSha256', 'expectedHistory70Sha256']); }
  catch { fail('PRESERVATION_EVIDENCE_NOT_READY'); }
  expectations({ expectedHead: value.expectedHead, expectedCatalogSha256: value.expectedCatalogSha256 });
  if (value.expectedBaselineSha256 !== profile.baseline || value.expectedHistory70Sha256 !== MIGRATION_HISTORY70) fail('BASELINE_PIN_REFUSED');
  return Object.freeze(value);
}
function probeTrialHistory(source, stage, env, remaining, count, maxMs) {
  const clientUrl = pathToFileURL(source.clientPath).href;
  const script = `import {PrismaClient} from ${JSON.stringify(clientUrl)};const p=new PrismaClient({log:[]});try{const value=await p.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");const rows=await tx.$queryRawUnsafe(${JSON.stringify(PILOT_TRIAL_HISTORY_SQL)});if(rows.length!==1||typeof rows[0].snapshot!=='string')throw Error();return rows[0].snapshot;},{maxWait:2000,timeout:20000});if(Buffer.byteLength(value)>131072)throw Error();process.stdout.write(value);}catch{process.exitCode=2;}finally{await p.$disconnect().catch(()=>{process.exitCode=2;});}`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: stage.directory, env, shell: false,
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true, timeout: Math.min(maxMs, remaining()), maxBuffer: 131072 });
  remaining();
  if (child.error || child.signal || child.status !== 0) fail('PREFLIGHT_REFUSED', 'CHILD_PROCESS_FAILURE');
  if (typeof child.stdout !== 'string') fail('PREFLIGHT_REFUSED', 'CHILD_OUTPUT_TYPE');
  if (Buffer.byteLength(child.stdout) > 131072) fail('PREFLIGHT_REFUSED', 'CHILD_OUTPUT_BOUND');
  let snapshot; try { snapshot = JSON.parse(child.stdout); } catch { fail('PREFLIGHT_REFUSED', 'SNAPSHOT_JSON_INVALID'); }
  return inspectPilotTrialHistory(snapshot, source.catalog, count);
}
/** Closed personal migration entry. No caller-selected mode or target is accepted.
 * @param {unknown} rawExpected
 * @param {{repositoryRoot?: string, input?: import('node:stream').Readable}} options */
export async function runPilotCurrentMigration(rawExpected, options = {}) {
  return runMigration(rawExpected, options, PERSONAL_PROFILE);
}
async function runMigration(rawExpected, options, profile) {
  const expected = migrationExpectations(rawExpected, profile);
  const { repositoryRoot = ROOT, input = process.stdin } = options;
  const root = path.resolve(repositoryRoot), remaining = budget(180000), marker = path.join(root, profile.attemptFile);
  let stage, env, url, writtenReceipt, childExit = null, mayHaveStarted = false, diagnosticStage = 'SOURCE';
  try {
    const source = inspectSource(root, expected, remaining);
    if (hash(regular(root, profile.baselineFile, 2097152)) !== profile.baseline) fail('BASELINE_BYTES_REFUSED');
    if (lstatSync(marker, { throwIfNoEntry: false })) fail('ATTEMPT_ALREADY_RECORDED');
    diagnosticStage = 'STAGING'; stage = stageSource(root, source); remaining();
    diagnosticStage = 'CREDENTIAL'; url = await readCredential(input, remaining, profile.target);
    diagnosticStage = 'RECHECK';
    const checked = inspectSource(root, expected, remaining);
    if (checked.fingerprint !== source.fingerprint) fail('SOURCE_CHANGED');
    if (hash(regular(root, profile.baselineFile, 2097152)) !== profile.baseline) fail('BASELINE_BYTES_REFUSED');
    verifyStage(root, stage); env = childEnvironment(url, process.env, profile.target);
    diagnosticStage = 'PREFLIGHT_70';
    const preflightHistory = probeTrialHistory(checked, stage, env, remaining, 70, 30000);
    if (preflightHistory.historySha256 !== MIGRATION_HISTORY70) fail('BASELINE_HISTORY_REFUSED');
    diagnosticStage = 'RECHECK';
    const finalSource = inspectSource(root, expected, remaining);
    if (finalSource.fingerprint !== source.fingerprint) fail('SOURCE_CHANGED');
    if (hash(regular(root, profile.baselineFile, 2097152)) !== profile.baseline) fail('BASELINE_BYTES_REFUSED');
    verifyStage(root, stage);
    const phase = pilotTrialPrismaPhase('MIGRATE_70_TO_79', root, stage.directory);
    const runtimeRoot = realpathSync(path.join(root, 'node_modules'));
    const cli = assertReleaseRegularFile(runtimeRoot, 'prisma/build/index.js');
    if (cli !== checked.cli || hash(regular(runtimeRoot, 'prisma/build/index.js')) !== checked.cliHash
      || realpathSync(phase.args[0]) !== cli) fail('SOURCE_CHANGED');
    if (remaining() < 140000) fail('MIGRATION_BUDGET_REFUSED');
    diagnosticStage = 'ATTEMPT';
    const markerBytes = JSON.stringify({ version: profile.attemptVersion, target: profile.target,
      sourceHead: expected.expectedHead, catalogSha256: expected.expectedCatalogSha256, sourceFingerprint: source.fingerprint,
      baselineSha256: profile.baseline, history70Sha256: MIGRATION_HISTORY70,
      stageFingerprint: hash(JSON.stringify(stage.files)), automaticRetry: false });
    writeFileSync(marker, markerBytes, { flag: 'wx', mode: 0o600 });
    if (!regular(root, profile.attemptFile, 4096).equals(Buffer.from(markerBytes))) fail('ATTEMPT_RECORD_REFUSED');
    // A recorded marker is never removed, even if this last budget check refuses.
    if (remaining() < 140000) fail('MIGRATION_BUDGET_REFUSED');
    diagnosticStage = 'MIGRATE'; mayHaveStarted = true;
    const child = spawnSync(phase.executable, [cli, ...phase.args.slice(1)], { cwd: stage.directory, env, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 131072 });
    childExit = Number.isInteger(child.status) ? child.status : null; remaining();
    if (child.error || child.signal || child.status !== 0) fail('PREFLIGHT_REFUSED', 'CHILD_PROCESS_FAILURE');
    // Never interpret or print Prisma CLI output. Successful exit still requires
    // a fresh actual79 read; truncated output/acknowledgement remains uncertain.
    if (typeof child.stdout !== 'string' || typeof child.stderr !== 'string'
      || Buffer.byteLength(child.stdout) + Buffer.byteLength(child.stderr) > 131072) fail('PREFLIGHT_REFUSED', 'CHILD_OUTPUT_BOUND');
    diagnosticStage = 'POSTFLIGHT_79';
    const history = probeTrialHistory(checked, stage, env, remaining, 79, 20000);
    if (history.prior70Sha256 !== preflightHistory.historySha256 || history.versionNum !== preflightHistory.versionNum) fail('BASELINE_HISTORY_REFUSED');
    diagnosticStage = 'VERIFY'; verifyStage(root, stage);
    const finalCheck = inspectSource(root, expected, remaining);
    if (finalCheck.fingerprint !== source.fingerprint) fail('SOURCE_CHANGED');
    const receipt = frozen({ version: profile.receiptVersion, mode: 'MIGRATE_70_TO_79', status: profile.success,
      sourceHead: expected.expectedHead, catalogSha256: expected.expectedCatalogSha256, sourceFingerprint: source.fingerprint,
      baselineSha256: profile.baseline, history70Sha256: MIGRATION_HISTORY70, target: profile.target,
      preflightHistory, history, clientTransportPolicy: 'PRISMA_REQUIRE_TLS_STRICT_CERT', childExit,
      automaticRetry: false, migrationInvoked: true, executionAuthorized: false, backupVerified: false,
      dataPreservationVerified: false, schemaPreservationVerified: false,
      totalBudgetMs: 180000, childBudgetMs: 120000, postflightReserveMs: 20000, elapsedMs: 180000 - remaining() });
    diagnosticStage = 'WRITE';
    const receiptBytes = Buffer.from(JSON.stringify(receipt));
    writeFileSync(path.join(stage.directory, 'receipt.json'), receiptBytes, { flag: 'wx', mode: 0o600 });
    writtenReceipt = receiptBytes;
    remaining();
    return receipt;
  } catch (error) {
    const status = mayHaveStarted ? profile.uncertain : profile.refused;
    const diagnostic = Object.freeze({ version: 'pilot-trial-preflight-diagnostic-v1', stage: diagnosticStage,
      reason: failureReasons.get(error) ?? 'LOCAL_VALIDATION_REFUSED' });
    if (stage) { try {
      // A history receipt written before a late refusal remains immutable. Its
      // exact bytes join the verified inventory; a separate terminal failure
      // records that it was NOT the final successful outcome of this invocation.
      verifyStage(root, writtenReceipt ? { directory: stage.directory, files: [...stage.files,
        { name: 'receipt.json', byteSize: writtenReceipt.length, sha256: hash(writtenReceipt) }] } : stage);
      writeFileSync(path.join(stage.directory, writtenReceipt ? 'failure-outcome.json' : 'receipt.json'), JSON.stringify({
      version: profile.receiptVersion, mode: 'MIGRATE_70_TO_79', status, childExit,
      migrationInvoked: mayHaveStarted, automaticRetry: false, executionAuthorized: false,
      dataPreservationVerified: false, schemaPreservationVerified: false, backupVerified: false, diagnostic }), { flag: 'wx', mode: 0o600 });
    } catch { /* Retain stage and marker; no raw errors or retry. */ } }
    const refusal = classifiedError(status); Object.defineProperty(refusal, 'diagnostic', { value: diagnostic, enumerable: true });
    refusalDiagnostics.set(refusal, diagnostic); throw refusal;
  } finally { if (env) { delete env.DATABASE_URL; delete env.DIRECT_URL; } url = undefined; }
}

/** Pure, closed argument grammar for the two reviewed fixed trial phases. No
 * arbitrary target, executable, SQL, option bag or environment flag is accepted. */
export function parsePilotTrialPrismaArguments(raw) {
  return parseArguments(raw, TRIAL_PROFILE, false);
}
export function parsePilotCurrentPrismaArguments(raw) {
  return parseArguments(raw, PERSONAL_PROFILE, true);
}
function parseArguments(raw, profile, personal) {
  if (!raw || types.isProxy(raw) || !Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('CLI_REFUSED');
  const length = Object.getOwnPropertyDescriptor(raw, 'length')?.value;
  if ((personal ? length !== 11 : length !== 6 && length !== 10) || Reflect.ownKeys(raw).length !== length + 1) fail('CLI_REFUSED');
  const args = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!d?.enumerable || !('value' in d) || typeof d.value !== 'string' || d.value.length > 128) fail('CLI_REFUSED');
    args.push(d.value);
  }
  if (personal && args.shift() !== '--personal-pilot') fail('CLI_REFUSED');
  if (args[0] !== '--mode' || args[2] !== '--expected-head' || args[4] !== '--expected-catalog-sha256') fail('CLI_REFUSED');
  let expected;
  try {
    if (!personal && args.length === 6 && args[1] === 'PREFLIGHT_70') expected = expectations({ expectedHead: args[3], expectedCatalogSha256: args[5] });
    else if (args.length === 10 && args[1] === 'MIGRATE_70_TO_79'
      && args[6] === '--expected-baseline-sha256' && args[8] === '--expected-history70-sha256') {
      expected = migrationExpectations({ expectedHead: args[3], expectedCatalogSha256: args[5],
        expectedBaselineSha256: args[7], expectedHistory70Sha256: args[9] }, profile);
    } else fail('CLI_REFUSED');
  } catch { fail('CLI_REFUSED'); }
  return Object.freeze({ mode: args[1], expected });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let receipt;
    if (process.argv[2] === '--personal-pilot') {
      const command = parsePilotCurrentPrismaArguments(process.argv.slice(2));
      receipt = await runPilotCurrentMigration(command.expected);
    } else {
      const command = parsePilotTrialPrismaArguments(process.argv.slice(2));
      receipt = await runPilotTrialPrisma(command.mode, command.expected);
    }
    // No path, URL, raw query rows, Prisma output or caller error is logged.
    process.stdout.write(JSON.stringify(receipt) + '\n');
  } catch (error) {
    process.stderr.write('PILOT_TRIAL_RUN_REFUSED_NO_AUTOMATIC_RETRY\n');
    const diagnostic = refusalDiagnostics.get(error);
    if (diagnostic) process.stderr.write(JSON.stringify(diagnostic) + '\n');
    process.exitCode = 1;
  }
}
