import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeEnvironment } from '../208-astra-r02-local-preflight/preflight.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const stamp = process.argv[2];
if (!/^build-\d+$/.test(stamp ?? '')) throw new Error('LOCAL_BUILD_REFERENCE_REQUIRED');
const evidence = resolve(root, 'specs/210-personal-live-activation/evidence', stamp);
const build = JSON.parse(readFileSync(resolve(evidence, 'result.json'), 'utf8'));
if (build.exitCode !== 0 || !/^\.next-personal-210-build-\d+$/.test(build.buildDirectory) || !existsSync(resolve(root, build.buildDirectory, 'BUILD_ID'))) throw new Error('SUCCESSFUL_LOCAL_BUILD_REQUIRED');
const socket = createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const env = { ...safeEnvironment(root), NODE_ENV: 'production', BETTER_AUTH_URL: `http://127.0.0.1:${port}`, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ENDVERA_LOCAL_BUILD_DIR: build.buildDirectory };
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
const closed = new Promise(resolve => child.once('close', resolve));
let startError = false; child.once('error', () => { startError = true; });
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (startError || child.exitCode !== null) throw new Error('LOCAL_SERVER_START_FAILED');
    try { await fetch(`http://127.0.0.1:${port}/api/endvera/v1/personal/google/status`, { signal: AbortSignal.timeout(1000), redirect: 'manual' }); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  if (!ready) throw new Error('LOCAL_SERVER_NOT_READY');
  for (const [path, method, expected] of [
    ['/api/endvera/v1/personal/google/status', 'GET', 401],
    ['/api/endvera/v1/personal/phone', 'GET', 401],
    ['/api/endvera/v1/personal/outbox', 'GET', 401],
    ['/api/endvera/v1/personal/google/actions', 'GET', 401],
    ['/api/endvera/v1/personal/worker/tick', 'GET', 401],
    ['/api/webhooks/twilio/sms', 'POST', 503],
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    await response.arrayBuffer(); results.push({ path, expected, observed: response.status, pass: response.status === expected });
  }
} finally {
  child.kill(); await closed;
  const result = { checkedAt: new Date().toISOString(), localOnly: true, externalCalls: 0, serverStopped: true, checks: results, pass: results.length === 6 && results.every(r => r.pass) };
  writeFileSync(resolve(evidence, 'runtime.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result)); if (!result.pass) process.exitCode = 1;
}
