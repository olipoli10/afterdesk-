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
const REFUSED = 'PILOT_TRIAL_BRIDGE_REFUSED_NO_AUTOMATIC_RETRY';
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
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 4096) fail();
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes) || /[\x00-\x1f\x7f]/.test(text)) fail();
  let value; try { value = fields(JSON.parse(text), ['version', 'url']); } catch { fail(); }
  if (JSON.stringify(value) !== text || value.version !== 'pilot-trial-credential-v1' || typeof value.url !== 'string') fail();
  const prefix = `postgresql://${TARGET.role}:`, suffix = `@${TARGET.hostname}/${TARGET.database}?sslmode=require&sslaccept=strict&connect_timeout=10&connection_limit=1`;
  if (!value.url.startsWith(prefix) || !value.url.endsWith(suffix)
    || !/^[A-Za-z0-9_-]{16,256}$/.test(value.url.slice(prefix.length, -suffix.length))) fail();
}
/** Tests may supply a synthetic TTY; CLI always uses process.stdin. */
export function readPilotTrialBridgeFrame(input, ready) {
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
      try { validatePilotTrialBridgeFrame(merged); finish(true, Buffer.from(merged)); }
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
  let r; try { r = fields(JSON.parse(text), ['version', 'mode', 'status', 'sourceHead', 'catalogSha256', 'sourceFingerprint', 'target', 'history', 'childExit', 'automaticRetry', 'migrationInvoked', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified', 'elapsedMs']); } catch { fail(); }
  if (JSON.stringify(r) + '\n' !== text || r.version !== 'pilot-trial-prisma-receipt-v1' || r.mode !== 'PREFLIGHT_70'
    || r.status !== 'READ_ONLY_PREFLIGHT_70_MATCH' || r.sourceHead !== pins.expectedHead || r.catalogSha256 !== pins.expectedCatalogSha256
    || typeof r.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.sourceFingerprint) || r.childExit !== 0
    || !Number.isInteger(r.elapsedMs) || r.elapsedMs < 0 || r.elapsedMs >= 60000) fail();
  for (const key of ['automaticRetry', 'migrationInvoked', 'executionAuthorized', 'backupVerified', 'dataPreservationVerified']) if (r[key] !== false) fail();
  const target = fields(r.target, Object.keys(TARGET));
  if (Object.keys(TARGET).some(key => target[key] !== TARGET[key])) fail();
  const h = fields(r.history, ['count', 'versionNum', 'historySha256', 'prior70Sha256', 'targetProviderProvenanceVerified', 'dataPreservationVerified']);
  if (h.count !== 70 || !Number.isInteger(h.versionNum) || h.versionNum < 180000 || h.versionNum >= 190000
    || typeof h.historySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(h.historySha256) || h.historySha256 !== h.prior70Sha256
    || h.targetProviderProvenanceVerified !== false || h.dataPreservationVerified !== false) fail();
}
function runChild(frame, pins) {
  return new Promise((resolve, reject) => {
    let child, timer, cleanup, failed = false, settled = false, size = 0, count = 0; const chunks = [], until = performance.now() + 65000;
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
      child = spawn(process.execPath, [path.join(ROOT, RUNNER), '--mode', 'PREFLIGHT_70', '--expected-head', pins.expectedHead,
        '--expected-catalog-sha256', pins.expectedCatalogSha256], { cwd: ROOT, env: environment(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      timer = setTimeout(abort, 65000);
      child.on('error', abort); child.stdin.on('error', abort); child.stdout.on('error', abort); child.stderr.on('error', abort);
      child.stdout.on('data', value => {
        if (failed || settled) return;
        if (!(value instanceof Uint8Array) || value.byteLength === 0 || ++count > 256 || (size += value.byteLength) > 8192) return abort();
        chunks.push(Buffer.from(value));
      });
      child.stderr.on('data', abort);
      child.on('close', (code, signal) => {
        let ok = false, bytes;
        try { if (!failed && code === 0 && signal === null && performance.now() < until) { bytes = Buffer.concat(chunks); validatePilotTrialBridgeReceipt(bytes, pins); ok = true; } } catch { /* Fixed refusal only. */ }
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runPilotTrialPrivateBridge(parsePilotTrialBridgeArgs(process.argv.slice(2))); }
  catch { process.stderr.write(REFUSED + '\n'); process.exitCode = 1; }
}
