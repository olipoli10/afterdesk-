// Local HTTP proof of the production-built route's OFF/default method boundary.
// This does not authenticate a user, access a database, or verify a phone/provider.
import { spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { safeEnvironment } from '../208-astra-r02-local-preflight/preflight.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const receipt = process.argv[2];
const target = process.argv[3] ?? 'voice-review';
const targets = {
  'voice-review': { path: '/api/endvera/v1/mobile/project-brain-intake/voice-review', query: '&sessionId=synthetic', kind: 'VOICE_REVIEW_OFF_HTTP', prefix: 'voice-review' },
  'correlated-calendar-reviews': { path: '/api/endvera/v1/personal/model/correlated-calendar-reviews', query: '', kind: 'CORRELATED_CALENDAR_REVIEW_OFF_HTTP', prefix: 'correlated-calendar-review' },
  'correlated-calendar-approval-result': { path: '/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result', query: '&reviewId=synthetic', kind: 'CORRELATED_CALENDAR_APPROVAL_RESULT_OFF_HTTP', prefix: 'correlated-calendar-approval-result' },
  'correlated-calendar-approval-offer': { path: '/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-offer', query: '&reviewId=synthetic', kind: 'CORRELATED_CALENDAR_APPROVAL_OFFER_OFF_HTTP', prefix: 'correlated-calendar-approval-offer' },
  'correlated-calendar-approve': { path: '/api/endvera/v1/personal/model/correlated-calendar-reviews/approve', query: '', kind: 'CORRELATED_CALENDAR_APPROVE_OFF_HTTP', prefix: 'correlated-calendar-approve', post: true },
};
if (!Object.hasOwn(targets, target)) throw new Error('KNOWN_PRIVATE_TARGET_REQUIRED');
const selected = targets[target];
if (!/^build-[0-9]{13}$/.test(receipt ?? '')) throw new Error('BUILD_RECEIPT_REQUIRED');
const build = JSON.parse(readFileSync(resolve(root, 'specs/210-personal-live-activation/evidence', receipt, 'result.json'), 'utf8'));
if (build.kind !== 'build' || build.exitCode !== 0 || build.localOnly !== true || build.providerCallsAuthorized !== false
  || build.buildDirectory !== `.next-personal-210-${receipt}`) throw new Error('SUCCESSFUL_LOCAL_BUILD_REQUIRED');
const buildId = readFileSync(resolve(root, build.buildDirectory, 'BUILD_ID'), 'utf8').trim();
const probe = createServer();
await new Promise((yes, no) => { probe.once('error', no); probe.listen(0, '127.0.0.1', yes); });
const port = probe.address().port;
await new Promise((yes, no) => probe.close(error => error ? no(error) : yes()));
const origin = `http://127.0.0.1:${port}`;
const auth = randomBytes(32).toString('hex');
const env = { ...safeEnvironment(root), NODE_ENV: 'production', VERCEL_ENV: 'development',
  ENDVERA_LOCAL_BUILD_DIR: build.buildDirectory, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: auth };
// Deliberately leave all product feature flags, credentials and DATABASE_URL absent.
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let closed = false, childExitCode = null, ready = false, startError = false, outputSize = 0;
const chunks = [];
const stopped = new Promise(yes => child.once('close', code => { closed = true; childExitCode = code; yes(); }));
child.once('error', () => { startError = true; });
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  outputSize += chunk.length;
  if (outputSize < 1_000_000) chunks.push(chunk);
  if (/Ready in/.test(Buffer.concat(chunks).toString('utf8'))) ready = true;
});
const observations = [];
let errorCode = null, portClosed = false;
try {
  const deadline = Date.now() + 45_000;
  while (!ready && !closed && !startError && Date.now() < deadline) await delay(100);
  if (!ready || closed || startError) throw new Error('OWNED_SERVER_NOT_READY');
  const path = selected.path;
  const sessionQuery = selected.query;
  const cases = selected.post ? [
    ['POST', '', 404], ['POST', '?workspaceId=synthetic', 404], ['POST', '?workspaceId=one&workspaceId=two', 404],
    ['GET', '', 405], ['HEAD', '', 405], ['OPTIONS', '', 204], ['DELETE', '', 405],
  ] : [
    ['GET', '', 404], ['GET', `?workspaceId=synthetic${sessionQuery}`, 404],
    ['GET', `?workspaceId=one&workspaceId=two${sessionQuery}`, 404],
    ['HEAD', '', 404], ['OPTIONS', '', 204], ['POST', '', 405], ['DELETE', '', 405],
  ];
  for (const [method, query, expectedStatus] of cases) {
    const response = await fetch(`${origin}${path}${query}`, { method, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    const observation = { method, query, status: response.status, cacheControl: response.headers.get('cache-control'),
      vary: response.headers.get('vary'), allow: response.headers.get('allow'), bodyBytes: Buffer.byteLength(body),
      bodySha256: createHash('sha256').update(body).digest('hex') };
    observations.push(observation);
    if (response.status !== expectedStatus) throw new Error('HTTP_STATUS_MISMATCH');
    const ownedResponse = selected.post ? method === 'POST' : method === 'GET' || method === 'HEAD';
    if (ownedResponse) {
      if (!/private/.test(observation.cacheControl ?? '') || !/no-store/.test(observation.cacheControl ?? '')
        || !/Cookie/i.test(observation.vary ?? '') || !/Authorization/i.test(observation.vary ?? '')) throw new Error('PRIVATE_RESPONSE_HEADERS_REQUIRED');
      if (method !== 'HEAD' && body !== '{"error":"Not found."}') throw new Error('OPAQUE_OFF_RESPONSE_REQUIRED');
    }
    if ((!ownedResponse || method === 'HEAD') && body !== '') throw new Error('EMPTY_FRAMEWORK_METHOD_BODY_REQUIRED');
    if (method === 'OPTIONS' && observation.allow?.split(',').map(value => value.trim()).sort().join(',') !== (selected.post ? 'OPTIONS,POST' : 'GET,HEAD,OPTIONS')) throw new Error('EXACT_METHOD_ALLOW_REQUIRED');
  }
} catch (error) {
  errorCode = /^[A-Z_]+$/.test(error.message ?? '') ? error.message : 'LOCAL_HTTP_PROBE_FAILED';
} finally {
  if (!closed) child.kill('SIGTERM'); // Only this exact child, no global port/process cleanup.
  await Promise.race([stopped, delay(10_000, undefined, { ref: false })]);
  if (!closed) errorCode = 'OWNED_SERVER_STOP_UNCONFIRMED';
  if (closed) {
    portClosed = await new Promise(yes => {
      const socket = createConnection({ host: '127.0.0.1', port });
      const finish = value => { socket.destroy(); yes(value); };
      socket.setTimeout(2_000, () => finish(false));
      socket.once('connect', () => finish(false));
      socket.once('error', error => finish(error.code === 'ECONNREFUSED'));
    });
    if (!portClosed) errorCode = 'OWNED_PORT_STILL_RESPONDS';
  }
  const output = Buffer.concat(chunks).toString('utf8');
  const safeOutput = !output.includes(auth) && outputSize < 1_000_000;
  if (!safeOutput) errorCode = 'LOCAL_SERVER_OUTPUT_WITHHELD';
  const result = { kind: selected.kind, buildReceipt: receipt, buildDirectory: build.buildDirectory, buildId,
    finishedAt: new Date().toISOString(), localOnly: true, ownerPid: child.pid ?? null, childExitCode,
    serverStopped: closed, portClosed, portCheck: 'TCP_ECONNREFUSED_REQUIRED', providerCallsAuthorized: false, databaseConfigured: false,
    authenticatedReadObserved: false, observations, exitCode: errorCode ? 1 : 0, errorCode };
  const dir = resolve(root, 'specs/210-personal-live-activation/evidence', `${selected.prefix}-http-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  if (safeOutput) writeFileSync(resolve(dir, 'output.txt'), output, { flag: 'wx' });
  console.log(JSON.stringify({ ...result, outputPath: dir }));
  if (errorCode) process.exitCode = 1;
}
