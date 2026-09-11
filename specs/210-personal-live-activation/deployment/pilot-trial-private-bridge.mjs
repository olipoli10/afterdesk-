// One-shot raw-terminal transport. Never fetch a credential or forward child output.
// Tool-service retention is NOT a local vault; raw mode prevents terminal echo only.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

const ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const SELF = 'specs/210-personal-live-activation/deployment/pilot-trial-private-bridge.mjs';
const RUNNER = 'specs/210-personal-live-activation/deployment/pilot-trial-prisma-runner.mjs';
const SOURCES = [SELF, RUNNER, 'scripts/endvera-release-source-binding.mjs',
  'specs/208-astra-r02-local-preflight/preflight.mjs', 'specs/208-astra-r02-local-preflight/protocol.mjs',
  'specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs',
  'specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs',
  'specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs',
  'specs/206-gpt6-astra-endvera-reverification/phase-checks-r0b/network-guard.cjs'];
const TARGET = Object.freeze({ projectId: 'withered-mud-08129552', branchId: 'br-holy-brook-ax7k68oh',
  endpointId: 'ep-crimson-violet-axmmwtjw', hostname: 'ep-crimson-violet-axmmwtjw.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' });
const EXPECTED = ['expectedHead', 'expectedCatalogSha256', 'expectedRunnerSha256', 'expectedNodeSha256', 'expectedPrismaCliSha256'];
const BASELINE70 = '3137a7b4e7fd3bd18487a1a139cf155a757e1e73c590b01f9e4962450339140a';
const HISTORY70 = '47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343';
const REFUSED = 'PILOT_TRIAL_BRIDGE_REFUSED_NO_AUTOMATIC_RETRY';
const MIGRATION_REFUSED = 'PILOT_TRIAL_MIGRATION_BRIDGE_REFUSED_BEFORE_CHILD_NO_AUTOMATIC_RETRY';
const MIGRATION_UNCERTAIN = 'PILOT_TRIAL_MIGRATION_BRIDGE_OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY';
const PERSONAL_TARGET = Object.freeze({ projectId: 'withered-mud-08129552', branchId: 'br-nameless-moon-ax8nmuwj',
  endpointId: 'ep-purple-union-axj3h2t5', hostname: 'ep-purple-union-axj3h2t5.c-4.us-east-2.aws.neon.tech', database: 'neondb', role: 'neondb_owner' });
// Source-owned profiles are private: callers cannot substitute a target, URL,
// baseline, executable, validator or phase through any public API.
const TRIAL = Object.freeze({ target: TARGET, baseline: BASELINE70, prefix: '--migration',
  version: 'pilot-trial-migration-receipt-v1', status: 'MIGRATION_HISTORY_79_VERIFIED',
  label: 'PILOT_TRIAL_MIGRATION_BRIDGE', refused: MIGRATION_REFUSED, uncertain: MIGRATION_UNCERTAIN });
const PERSONAL = Object.freeze({ target: PERSONAL_TARGET, baseline: '82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac', prefix: '--personal-pilot',
  version: 'pilot-current-migration-receipt-v1', status: 'PERSONAL_PILOT_HISTORY_79_VERIFIED',
  label: 'PILOT_CURRENT_MIGRATION_BRIDGE', refused: 'PILOT_CURRENT_MIGRATION_BRIDGE_REFUSED_BEFORE_CHILD_NO_AUTOMATIC_RETRY',
  uncertain: 'PILOT_CURRENT_MIGRATION_BRIDGE_OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY' });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error(REFUSED); };
function fields(value, keys) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(k => !keys.includes(k))) fail();
  const out = {};
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !('value' in d)) fail(); out[key] = d.value; }
  return out;
}
function expected(raw) {
  const value = fields(raw, EXPECTED);
  for (const [key, val] of Object.entries(value)) if (typeof val !== 'string' || !(key === 'expectedHead' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(val)) fail();
  return Object.freeze(value);
}
export function parsePilotTrialBridgeArgs(args) {
  const flags = ['--expected-head', '--expected-catalog-sha256', '--expected-runner-sha256', '--expected-node-sha256', '--expected-prisma-cli-sha256'];
  if (!Array.isArray(args) || args.length !== 10 || flags.some((f, i) => args[i * 2] !== f)) fail();
  return expected(Object.fromEntries(EXPECTED.map((key, i) => [key, args[i * 2 + 1]])));
}
function migrationExpected(raw, profile = TRIAL) {
  const value = fields(raw, [...EXPECTED, 'expectedBaselineSha256', 'expectedHistory70Sha256']);
  expected(Object.fromEntries(EXPECTED.map(key => [key, value[key]])));
  if (value.expectedBaselineSha256 !== profile.baseline || value.expectedHistory70Sha256 !== HISTORY70) fail();
  return Object.freeze(value);
}
function sourceExpected(pins) { return Object.fromEntries(EXPECTED.map(key => [key, pins[key]])); }
/** Separate closed grammar. The old five-pin preflight grammar is unchanged. */
export function parsePilotTrialMigrationBridgeArgs(args) {
  return parseMigrationArgs(args, TRIAL);
}
export function parsePilotCurrentMigrationBridgeArgs(args) {
  return parseMigrationArgs(args, PERSONAL);
}
function parseMigrationArgs(args, profile) {
  if (!Array.isArray(args) || args.length !== 15 || args[0] !== profile.prefix
    || args[11] !== '--expected-baseline-sha256' || args[13] !== '--expected-history70-sha256') fail();
  const pins = parsePilotTrialBridgeArgs(args.slice(1, 11));
  return migrationExpected({ ...pins, expectedBaselineSha256: args[12], expectedHistory70Sha256: args[14] }, profile);
}
function regular(file, max = 8388608) {
  for (let current = path.resolve(file);; current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) fail();
    if (path.dirname(current) === current) break;
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.size > max || path.resolve(realpathSync(file)) !== path.resolve(file)) fail();
  const bytes = readFileSync(file); if (bytes.length > max) fail(); return bytes;
}
function environment() {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
    const name = Object.keys(process.env).find(name => name.toLowerCase() === key.toLowerCase());
    if (name) env[key] = process.env[name];
  }
  return { ...env, CI: '1', GIT_OPTIONAL_LOCKS: '0', NO_COLOR: '1', DO_NOT_TRACK: '1', npm_config_offline: 'true' };
}
/** Local source inspection only. No imported repository code is executed here. */
export function inspectPilotTrialBridgeSource(raw) {
  const pins = expected(raw), env = environment(), until = performance.now() + 20000;
  const git = (...args) => {
    const remaining = Math.floor(until - performance.now()); if (remaining <= 0) fail();
    const p = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', ROOT, ...args],
      { cwd: ROOT, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: remaining, maxBuffer: 8388608 });
    if (p.error || p.signal || p.status !== 0 || !Buffer.isBuffer(p.stdout)) fail(); return p.stdout;
  };
  const check = () => {
    if (git('rev-parse', '--verify', 'HEAD').toString().trim() !== pins.expectedHead
      || git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none').length !== 0) fail();
  };
  check();
  for (const relative of SOURCES) {
    const bytes = regular(path.join(ROOT, relative)), blob = git('show', `${pins.expectedHead}:${relative}`);
    // Exact Git LF checkout conversion only, not a general whitespace normalization.
    if (!blob.equals(bytes) && (blob.includes(0) || blob.includes(13) || !Buffer.from(blob.toString('utf8')).equals(blob)
      || !Buffer.from(blob.toString('utf8').replaceAll('\n', '\r\n')).equals(bytes))) fail();
    if (relative === RUNNER && sha(bytes) !== pins.expectedRunnerSha256) fail();
  }
  if (sha(regular(process.execPath, 150000000)) !== pins.expectedNodeSha256) fail();
  // The installed shared junction is validated again by the reviewed runner.
  // Here only its resolved regular CLI bytes are admitted by the controller's pin.
  const cli = path.join(realpathSync(path.join(ROOT, 'node_modules')), 'prisma/build/index.js');
  if (sha(regular(cli, 15000000)) !== pins.expectedPrismaCliSha256) fail();
  check(); if (performance.now() >= until) fail();
  return pins;
}
/** Canonical envelope check without returning or logging its URL. */
export function validatePilotTrialBridgeFrame(bytes) {
  return validateFrame(bytes, TRIAL);
}
function validateFrame(bytes, profile) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 4096) fail();
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || /[\x00-\x1f\x7f]/.test(text)) fail();
  let value; try { value = fields(JSON.parse(text), ['version', 'url']); } catch { fail(); }
  if (JSON.stringify(value) !== text || value.version !== 'pilot-trial-credential-v1' || typeof value.url !== 'string') fail();
  const target = profile.target;
  const prefix = `postgresql://${target.role}:`, suffix = `@${target.hostname}/${target.database}?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
  if (!value.url.startsWith(prefix) || !value.url.endsWith(suffix)
    || !/^[A-Za-z0-9_-]{16,256}$/.test(value.url.slice(prefix.length, -suffix.length))) fail();
}
/** Tests may supply a synthetic TTY; CLI always uses process.stdin. */
export function readPilotTrialBridgeFrame(input, ready) {
  return readFrame(input, ready, TRIAL);
}
function readFrame(input, ready, profile) {
  if (input?.isTTY !== true || typeof input.setRawMode !== 'function') fail();
  input.setRawMode(true); if (input.isRaw !== true) fail();
  return new Promise((resolve, reject) => {
    let size = 0, count = 0, settled = false; const chunks = [], until = performance.now() + 45000;
    const finish = (ok, value) => {
      if (settled) return; settled = true; clearTimeout(timer);
      input.removeListener('data', data); input.removeListener('end', ended); input.removeListener('error', ended);
      input.pause(); chunks.forEach(chunk => chunk.fill(0));
      if (ok) resolve(value); else reject(new Error(REFUSED));
    };
    const ended = () => finish(false);
    const data = value => {
      if (!(value instanceof Uint8Array) || value.byteLength === 0 || ++count > 64 || value.byteLength > 4097 - size || performance.now() >= until) return finish(false);
      const chunk = Buffer.from(value), end = chunk.indexOf(4);
      if (end >= 0 && end !== chunk.length - 1) { chunk.fill(0); return finish(false); }
      const payload = end < 0 ? chunk : chunk.subarray(0, end);
      if (payload.some(x => x < 32 || x === 127)) { chunk.fill(0); return finish(false); }
      size += payload.length; chunks.push(chunk);
      if (end < 0) { if (size > 4096) finish(false); return; }
      const merged = Buffer.concat(chunks).subarray(0, size);
      try { validateFrame(merged, profile); finish(true, Buffer.from(merged)); }
      catch { finish(false); } finally { merged.fill(0); }
    };
    const timer = setTimeout(ended, 45000);
    input.on('data', data); input.once('end', ended); input.once('error', ended);
    try { ready(); input.resume(); } catch { finish(false); }
  });
}
export function validatePilotTrialBridgeReceipt(bytes, rawExpected) {
  const pins = expected(rawExpected);
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 8192) fail();
  const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) fail();
  let r; try { r = fields(JSON.parse(text), ['version', 'mode', 'status', 'sourceHead', 'catalogSha256', 'sourceFingerprint', 'target', 'history', 'clientTransportPolicy', 'childExit', 'automaticRetry', 'migrationInvoked', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified', 'elapsedMs']); } catch { fail(); }
  if (JSON.stringify(r) + '\n' !== text || r.version !== 'pilot-trial-prisma-receipt-v1' || r.mode !== 'PREFLIGHT_70'
    || r.status !== 'READ_ONLY_PREFLIGHT_70_MATCH' || r.sourceHead !== pins.expectedHead || r.catalogSha256 !== pins.expectedCatalogSha256
    || typeof r.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceFingerprint) || r.childExit !== 0
    || r.clientTransportPolicy !== 'PRISMA_REQUIRE_TLS_STRICT_CERT'
    || !Number.isInteger(r.elapsedMs) || r.elapsedMs < 0 || r.elapsedMs >= 60000) fail();
  for (const key of ['automaticRetry', 'migrationInvoked', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified']) if (r[key] !== false) fail();
  const target = fields(r.target, Object.keys(TARGET));
  if (Object.keys(TARGET).some(key => target[key] !== TARGET[key])) fail();
  const h = fields(r.history, ['count', 'versionNum', 'historySha256', 'prior70Sha256', 'targetProviderProvenanceVerified', 'dataPreservationVerified', 'backendConnectionSslObserved']);
  if (h.count !== 70 || !Number.isInteger(h.versionNum) || h.versionNum < 180000 || h.versionNum >= 190000
    || typeof h.historySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(h.historySha256) || h.historySha256 !== h.prior70Sha256
    || h.targetProviderProvenanceVerified !== false || h.dataPreservationVerified !== false
    || typeof h.backendConnectionSslObserved !== 'boolean') fail();
}
/** Receipt parsing only, not evidence of an invoked migration or permission. */
export function validatePilotTrialMigrationBridgeReceipt(bytes, rawExpected) {
  return validateMigrationReceipt(bytes, rawExpected, TRIAL);
}
export function validatePilotCurrentMigrationBridgeReceipt(bytes, rawExpected) {
  return validateMigrationReceipt(bytes, rawExpected, PERSONAL);
}
function validateMigrationReceipt(bytes, rawExpected, profile) {
  const pins = migrationExpected(rawExpected, profile);
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 8192) fail();
  const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) fail();
  let r;
  try { r = fields(JSON.parse(text), ['version', 'mode', 'status', 'sourceHead', 'catalogSha256', 'sourceFingerprint',
    'baselineSha256', 'history70Sha256', 'target', 'preflightHistory', 'history', 'clientTransportPolicy', 'childExit',
    'automaticRetry', 'migrationInvoked', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified',
    'schemaPreservationVerified', 'totalBudgetMs', 'childBudgetMs', 'postflightReserveMs', 'elapsedMs']); } catch { fail(); }
  if (JSON.stringify(r) + '\n' !== text || r.version !== profile.version || r.mode !== 'MIGRATE_70_TO_79'
    || r.status !== profile.status || r.sourceHead !== pins.expectedHead || r.catalogSha256 !== pins.expectedCatalogSha256
    || r.baselineSha256 !== profile.baseline || r.history70Sha256 !== HISTORY70
    || typeof r.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceFingerprint)
    || r.childExit !== 0 || r.migrationInvoked !== true || r.clientTransportPolicy !== 'PRISMA_REQUIRE_TLS_STRICT_CERT'
    || r.totalBudgetMs !== 180000 || r.childBudgetMs !== 120000 || r.postflightReserveMs !== 20000
    || !Number.isInteger(r.elapsedMs) || r.elapsedMs < 0 || r.elapsedMs >= 180000) fail();
  for (const key of ['automaticRetry', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified', 'schemaPreservationVerified']) if (r[key] !== false) fail();
  const target = fields(r.target, Object.keys(profile.target));
  if (Object.keys(profile.target).some(key => target[key] !== profile.target[key])) fail();
  const inspectHistory = (raw, count) => {
    const h = fields(raw, ['count', 'versionNum', 'historySha256', 'prior70Sha256', 'targetProviderProvenanceVerified', 'dataPreservationVerified', 'backendConnectionSslObserved']);
    if (h.count !== count || !Number.isInteger(h.versionNum) || h.versionNum < 180000 || h.versionNum >= 190000
      || typeof h.historySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(h.historySha256) || h.prior70Sha256 !== HISTORY70
      || (count === 70 && h.historySha256 !== HISTORY70) || h.targetProviderProvenanceVerified !== false
      || h.dataPreservationVerified !== false || typeof h.backendConnectionSslObserved !== 'boolean') fail();
    return h;
  };
  const before = inspectHistory(r.preflightHistory, 70), after = inspectHistory(r.history, 79);
  if (before.versionNum !== after.versionNum) fail();
}
// Only the two private callers choose a closed phase. No caller-selected command,
// executable or receipt validator is accepted through the public APIs.
function runChild(frame, pins, migration = false, profile = TRIAL) {
  return new Promise((resolve, reject) => {
    const childBudget = migration ? 185000 : 65000;
    let child, timer, cleanup, failed = false, settled = false, size = 0, count = 0; const chunks = [], until = performance.now() + childBudget;
    const finish = ok => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(cleanup);
      frame.fill(0); chunks.forEach(x => x.fill(0));
      if (ok) resolve(); else reject(new Error(REFUSED));
    };
    const abort = () => {
      if (failed || settled) return; failed = true;
      cleanup = setTimeout(() => {
        child?.stdout.destroy(); child?.stderr.destroy(); child?.unref(); finish(false);
      }, 2000);
      try { child?.stdin.destroy(); child?.kill(); } catch { /* Never expose child errors. */ }
    };
    try {
      const args = [path.join(ROOT, RUNNER), '--mode', migration ? 'MIGRATE_70_TO_79' : 'PREFLIGHT_70', '--expected-head', pins.expectedHead,
        '--expected-catalog-sha256', pins.expectedCatalogSha256];
      if (migration) args.push('--expected-baseline-sha256', pins.expectedBaselineSha256, '--expected-history70-sha256', pins.expectedHistory70Sha256);
      if (profile === PERSONAL) args.splice(1, 0, '--personal-pilot');
      child = spawn(process.execPath, args, { cwd: ROOT, env: environment(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      timer = setTimeout(abort, childBudget);
      child.on('error', abort); child.stdin.on('error', abort); child.stdout.on('error', abort); child.stderr.on('error', abort);
      child.stdout.on('data', value => {
        if (failed || settled) return;
        if (!(value instanceof Uint8Array) || value.byteLength === 0 || ++count > 256 || (size += value.byteLength) > 8192) return abort();
        chunks.push(Buffer.from(value));
      });
      child.stderr.on('data', abort);
      child.on('close', (code, signal) => {
        let ok = false, bytes;
        try { if (!failed && code === 0 && signal === null && performance.now() < until) {
          bytes = Buffer.concat(chunks);
          if (migration) validateMigrationReceipt(bytes, pins, profile); else validatePilotTrialBridgeReceipt(bytes, pins);
          ok = true;
        } } catch { /* Fixed refusal only. */ }
        finally { bytes?.fill(0); finish(ok); }
      });
      child.stdin.end(frame, () => frame.fill(0));
    } catch { if (child) abort(); else finish(false); }
  });
}
/** No executable/target/mode injection. CLI supplies only inspected source pins. */
export async function runPilotTrialPrivateBridge(rawExpected, input = process.stdin, output = process.stdout) {
  let frame;
  try {
    if (input?.isTTY !== true || typeof input.setRawMode !== 'function') fail();
    const pins = inspectPilotTrialBridgeSource(rawExpected);
    frame = await readPilotTrialBridgeFrame(input, () => output.write('PILOT_TRIAL_BRIDGE_READY\n'));
    inspectPilotTrialBridgeSource(pins);
    await runChild(frame, pins);
  } catch { throw new Error(REFUSED); }
  finally {
    frame?.fill(0);
    try {
      if (input?.isTTY === true) { input.setRawMode(false); if (input.isRaw !== false) fail(); }
      input?.pause();
    } catch { throw new Error(REFUSED); }
  }
  // A known child receipt is not a successful bridge handoff unless terminal
  // restoration also completed. Never publish success before this boundary.
  try { output.write('PILOT_TRIAL_BRIDGE_PREFLIGHT_70_VERIFIED\n'); } catch { throw new Error(REFUSED); }
}
/** Closed one-shot migration transport, separate from preflight.
 * After spawning the runner, a bridge error cannot establish DB rollback. */
export async function runPilotTrialMigrationPrivateBridge(rawExpected, input = process.stdin, output = process.stdout) {
  return runMigrationBridge(rawExpected, input, output, TRIAL);
}
export async function runPilotCurrentMigrationPrivateBridge(rawExpected, input = process.stdin, output = process.stdout) {
  return runMigrationBridge(rawExpected, input, output, PERSONAL);
}
async function runMigrationBridge(rawExpected, input, output, profile) {
  let frame, childMayHaveStarted = false, failure = false;
  try {
    if (input?.isTTY !== true || typeof input.setRawMode !== 'function') fail();
    const pins = migrationExpected(rawExpected, profile);
    inspectPilotTrialBridgeSource(sourceExpected(pins));
    frame = await readFrame(input, () => output.write(profile.label + '_READY\n'), profile);
    inspectPilotTrialBridgeSource(sourceExpected(pins));
    childMayHaveStarted = true;
    await runChild(frame, pins, true, profile);
  } catch { failure = true; }
  finally {
    frame?.fill(0);
    try {
      if (input?.isTTY === true) { input.setRawMode(false); if (input.isRaw !== false) fail(); }
      input?.pause();
    } catch { failure = true; }
  }
  if (failure) throw new Error(childMayHaveStarted ? profile.uncertain : profile.refused);
  try { output.write(profile.label + '_HISTORY_79_VERIFIED\n'); }
  catch { throw new Error(profile.uncertain); }
}
/** Controller-reviewed exact CLI seam. No environment or arbitrary-mode gate. */
export async function runPilotTrialMigrationBridgeCli(args) {
  return runPilotTrialMigrationPrivateBridge(parsePilotTrialMigrationBridgeArgs(args));
}
/** Controller-reviewed personal selector. No environment or target override. */
export async function runPilotCurrentMigrationBridgeCli(args) {
  return runPilotCurrentMigrationPrivateBridge(parsePilotCurrentMigrationBridgeArgs(args));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--personal-pilot') await runPilotCurrentMigrationBridgeCli(args);
    else if (args[0] === '--migration') await runPilotTrialMigrationBridgeCli(args);
    else await runPilotTrialPrivateBridge(parsePilotTrialBridgeArgs(args));
  }
  catch { process.stderr.write(REFUSED + '\n'); process.exitCode = 1; }
}
