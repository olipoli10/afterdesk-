import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeEnvironment } from '../208-astra-r02-local-preflight/preflight.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const kind = process.argv[2];
if (!['root', 'mobile', 'build', 'mobile-export', 'postgres', 'postgres-native'].includes(kind)) throw new Error('LOCAL_CHECK_KIND_REQUIRED');
const powershell = process.argv[3];
const isPostgres = kind === 'postgres' || kind === 'postgres-native';
const nativeRoot = kind === 'postgres-native' ? process.argv[4] : undefined;
const postgresTestFile = kind === 'postgres-native' ? process.argv[5] : process.argv[4];
if (isPostgres && (!powershell || !isAbsolute(powershell) || !existsSync(powershell) || !['pwsh.exe', 'powershell.exe'].includes(basename(powershell).toLowerCase()))) throw new Error('LOCAL_POWERSHELL_EXECUTABLE_REQUIRED');
if (kind === 'postgres-native' && (!nativeRoot || !isAbsolute(nativeRoot) || !existsSync(resolve(nativeRoot, 'bin', 'postgres.exe')))) throw new Error('LOCAL_NATIVE_POSTGRES_ROOT_REQUIRED');
if (postgresTestFile && (!isPostgres || !/^[a-z-]+\.postgres\.test\.ts$/.test(postgresTestFile) || !existsSync(resolve(root, 'specs/210-personal-live-activation', postgresTestFile)))) throw new Error('LOCAL_POSTGRES_TEST_FILE_REQUIRED');
const stamp = `${kind}-${Date.now()}`;
const dir = resolve(root, 'specs/210-personal-live-activation/evidence', stamp);
const mobile = kind === 'mobile' || kind === 'mobile-export';
const args = isPostgres ? ['-NoProfile', '-File', kind === 'postgres-native' ? 'specs/210-personal-live-activation/validate-postgres-native.ps1' : 'specs/210-personal-live-activation/validate-postgres.ps1']
  : kind === 'build' ? ['node_modules/next/dist/bin/next', 'build', '--webpack']
  : kind === 'mobile-export' ? ['node_modules/expo/bin/cli', 'export', '--platform', 'android', '--output-dir', `dist-personal-210-${stamp}`]
  : ['node_modules/vitest/vitest.mjs', 'run'];
const env = safeEnvironment(root);
if (nativeRoot) args.push('-RuntimeRoot', nativeRoot, '-NodePath', process.execPath);
if (postgresTestFile) args.push('-TestFile', postgresTestFile);
const auth = randomBytes(32).toString('hex');
if (kind === 'build') Object.assign(env, { BETTER_AUTH_SECRET: auth, BETTER_AUTH_URL: 'http://127.0.0.1:3000', NODE_ENV: 'production', VERCEL_ENV: 'development', ENDVERA_LOCAL_BUILD_DIR: `.next-personal-210-${stamp}` });
mkdirSync(dir, { recursive: true });
const child = spawn(isPostgres ? powershell : process.execPath, args, { cwd: mobile ? resolve(root, 'apps/mobile') : root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const chunks = []; let size = 0;
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { size += chunk.length; if (size < 16000000) chunks.push(chunk); });
child.on('error', () => { console.error('LOCAL_CHECK_START_FAILED'); process.exitCode = 1; });
child.on('close', code => {
  const output = Buffer.concat(chunks).toString('utf8');
  if (output.includes(auth) || size >= 16000000) { console.error('LOCAL_CHECK_OUTPUT_WITHHELD'); process.exitCode = 1; return; }
  writeFileSync(resolve(dir, 'output.txt'), output, { flag: 'wx' });
  const result = { kind, databaseRuntime: kind === 'postgres-native' ? 'NATIVE_POSTGRESQL' : kind === 'postgres' ? 'PRISMA_DEV_PGLITE' : null,
    postgresTestFile: postgresTestFile ?? null, exitCode: code, finishedAt: new Date().toISOString(), providerCallsAuthorized: false, localOnly: true, outputPath: dir, buildDirectory: kind === 'build' ? env.ENDVERA_LOCAL_BUILD_DIR : null };
  writeFileSync(resolve(dir, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(output.split(/\r?\n/).slice(-22).join('\n')); console.log(JSON.stringify(result));
  if (code !== 0) process.exitCode = 1;
});
