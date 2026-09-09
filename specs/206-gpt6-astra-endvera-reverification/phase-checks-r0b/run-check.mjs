import './network-guard.cjs';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { checks } from './check-map.mjs';
import { withDatabase } from './database.mjs';
import { safeOutput } from './output-safe.mjs';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const base = 'specs/206-gpt6-astra-endvera-reverification/phase-checks-r0b';
const spec = 'specs/206-gpt6-astra-endvera-reverification';
const [phase, checkId] = process.argv.slice(2);
const entry = checks[phase]?.[checkId];
if (!entry) throw new Error('UNFROZEN_PHASE_CHECK');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safeEnv = {};
// Only an ephemeral local build/start credential, never a provider/user secret.
// Production fail-closed auth remains unchanged. No env file or value is logged.
const localAuthSecret=['root-build','routes'].includes(entry.kind)?randomBytes(32).toString('hex'):null;
for (const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT','NUMBER_OF_PROCESSORS']) if (process.env[key]) safeEnv[key] = process.env[key];
Object.assign(safeEnv, { CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', NEXT_TELEMETRY_DISABLED: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1', EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: '1', npm_config_offline: 'true', npm_config_update_notifier: 'false', CHECKPOINT_DISABLE: '1', VERCEL_ENV: 'development',
 NODE_OPTIONS: `--require="${resolve(root, base, 'network-guard.cjs').replaceAll('\\', '/')}"` });
if (['.env','.env.local','.env.development','.env.development.local','apps/mobile/.env','apps/mobile/.env.local'].some(path => existsSync(resolve(root,path)))) throw new Error('CAMPAIGN_ENV_FILE_REFUSED');
if(localAuthSecret){safeEnv.BETTER_AUTH_SECRET=localAuthSecret;safeEnv.BETTER_AUTH_URL='http://127.0.0.1:3000';}

async function run(executable, args, {cwd='.', env={}, timeoutMs=900000,quiet=false,input}={}) {
 return new Promise((done, reject) => {
  const child = spawn(executable, args, {cwd: resolve(root,cwd),env:{...safeEnv,...env},windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdin.on('error',()=>{});child.stdin.end(input);
  let stdout='',stderr=''; let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true; child.kill();},timeoutMs);
  child.stdout.on('data', bytes => {stdout+=bytes;});
  child.stderr.on('data', bytes => {stderr+=bytes;});
  child.on('error', error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);const clean=value=>localAuthSecret?safeOutput(value).replaceAll(localAuthSecret,'[REDACTED_SYNTHETIC_AUTH]'):safeOutput(value);if(!quiet)process.stdout.write(clean(stdout));process.stderr.write(clean(stderr));done({code,stdout,stderr,timedOut});});
 });
}
async function node(args,opts) { return run(process.execPath,args,opts); }
function requireSuccess(result,label) { if(result.code!==0||result.timedOut) throw new Error(`CHECK_SUBCOMMAND_FAILED:${label}:exit=${result.code}:timeout=${result.timedOut}`); }
async function vitest(def,env={}) {
 const args=[resolve(root,def.cwd,'node_modules/vitest/vitest.mjs'),'run',...(def.files??[]),'--reporter=json'];
 if(def.integration) args.push('--config','vitest.integration.config.ts');
 if(def.config) args.push('--config',def.config);
 if(def.pattern) args.push('--testNamePattern',def.pattern);
 const result=await node(args,{cwd:def.cwd,env});
 let report;
 // Vitest emits one JSON document; logs may precede it. Accept only a complete trailing document.
 for(let at=result.stdout.indexOf('{');at>=0;at=result.stdout.indexOf('{',at+1)) {
  try {const candidate=JSON.parse(result.stdout.slice(at));if(typeof candidate.numTotalTests==='number'){report=candidate;break;}} catch {}
 }
 requireSuccess(result,'vitest');
 if(!report||report.success!==true||report.numFailedTests!==0||report.numFailedTestSuites!==0||report.numPassedTests<(def.minimumPassed??1)) throw new Error('VITEST_MEANINGFUL_GREEN_REPORT_REQUIRED');
 const active=report.testResults.flatMap(s=>s.assertionResults??[]).filter(a=>a.status==='passed');
 if(def.pattern&&!active.some(a=>new RegExp(def.pattern,'u').test(a.fullName??a.title))) throw new Error('FROZEN_TEST_SELECTOR_NOT_OBSERVED');
 console.log(`TEST_REPORT_VERIFIED passed=${report.numPassedTests} failed=${report.numFailedTests} selectedAssertions=${active.length}`);
}
async function databaseWorker(operation,env) {
 if(operation==='create') {
  const target=new URL(env.AFTERDESK_TEST_DATABASE_URL);const admin=new URL(env.CAMPAIGN_DATABASE_ADMIN_URL);
  const name=target.pathname.slice(1);
  if(!/^endvera206_[a-f0-9]+_integration$/.test(name)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||admin.hostname!==target.hostname||admin.port!==target.port||!['/template1','/postgres'].includes(admin.pathname))throw new Error('DATABASE_CREATION_IDENTITY_REFUSED');
  const result=await node(['node_modules/prisma/build/index.js','db','execute','--stdin','--url',admin.href],{env,input:`CREATE DATABASE "${name}" TEMPLATE template0;`});
  requireSuccess(result,'database-create');
  if(!result.stdout.includes('Script executed successfully'))throw new Error('DATABASE_CREATE_CONFIRMATION_MISSING');
  console.log('DISPOSABLE_DATABASE_CREATE_VERIFIED');return;
 }
 const result=await node(['node_modules/tsx/dist/cli.mjs',`${base}/db-worker.ts`,operation],{env});
 requireSuccess(result,`database-${operation}`);
 if(operation!=='create'&&!result.stdout.includes(operation==='restart-read'?'DATABASE_RESTART_READBACK_VERIFIED':'DATABASE_OPERATION_VERIFIED')) throw new Error('DATABASE_VERIFICATION_OUTPUT_MISSING');
}
async function grouped(commands) {
 let failed=0;
 for(const [label,args,opts] of commands) {
  const result=await node(args,opts); console.log(`GROUP_COMPONENT ${label} exit=${result.code} timeout=${result.timedOut}`);
  if(result.code!==0||result.timedOut) failed++;
 }
 if(failed) throw new Error(`GROUPED_CHECK_FAILED:${failed}`);
 console.log(`GROUP_REPORT_VERIFIED components=${commands.length} failures=0`);
}
function filesUnder(dir) {
 if(!existsSync(dir)) return [];
 return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?filesUnder(join(dir,item.name)):[join(dir,item.name)]);
}
function backlog() {
 const path='specs/090-prepared-action-inspection/PROJECT_BACKLOG.json';
 const data=JSON.parse(readFileSync(resolve(root,path),'utf8'));
 if(data.schemaVersion!==1||!Array.isArray(data.releases)||!data.releases.length||!Array.isArray(data.stages)) throw new Error('BACKLOG_SHAPE_INVALID');
 const ids=new Set(data.releases.map(r=>r.id));
 if(ids.size!==data.releases.length||!ids.has(data.terminalRelease)) throw new Error('BACKLOG_IDENTITIES_INVALID');
 const statuses=new Set(['DONE','READY','BLOCKED','PLANNED','IN_PROGRESS','CUT','CUT_BY_FOUNDER_DECISION','WAITING_EXTERNAL','PENDING','REWORK']);
 for(const release of data.releases) {
  if(!statuses.has(release.status)||!release.authority||!release.outcome||!Array.isArray(release.dependsOn)) throw new Error(`BACKLOG_RELEASE_INVALID:${release.id}`);
  for(const dependency of release.dependsOn) if(!ids.has(dependency)&&dependency!=='R12-NATIVE-CONTROL') throw new Error(`BACKLOG_DEPENDENCY_UNKNOWN:${dependency}`);
 }
 const visit=(id,chain=[])=>{if(chain.includes(id))throw new Error('BACKLOG_DEPENDENCY_CYCLE');for(const dep of data.releases.find(r=>r.id===id)?.dependsOn??[])visit(dep,[...chain,id]);};
 for(const id of ids)visit(id);
 console.log(`BACKLOG_STRUCTURE_VERIFIED releases=${ids.size} sha256=${sha(readFileSync(resolve(root,path)))}`);
}
async function main() {
 console.log(`CHECK_IDENTITY phase=${phase} checkId=${checkId} runtimeProviderAuthorized=false claimedDeviceObservation=false`);
 if(entry.kind==='vitest') {
  if(entry.integration) await withDatabase(async env=>{await databaseWorker('create',env);await vitest(entry,env);});
  else await vitest(entry);
 } else if(entry.kind==='root-build') {
  await grouped([
   ['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],
   ['lint',['node_modules/eslint/bin/eslint.js','.']],
   ['provider-boundary',['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts']],
   ['release-package',['scripts/validate-endvera-release-package.mjs']],
   ['store-compliance',['scripts/validate-endvera-store-compliance.mjs']],
   ['build',['node_modules/next/dist/bin/next','build','--webpack']],
  ]);
 } else if(entry.kind==='mobile-build') {
  const opts={cwd:'apps/mobile'};
  await grouped([
   ['typecheck',['node_modules/typescript/bin/tsc','--noEmit'],opts],
   ['lint',['node_modules/eslint/bin/eslint.js','.'],opts],
   ['expo-doctor',['node_modules/expo-doctor/build/index.js'],opts],
   ['expo-export',['node_modules/expo/bin/cli','export','--platform','all','--output-dir','dist-local'],opts],
  ]);
 } else if(entry.kind==='database') {
  await withDatabase(async(env,restart)=>{
   await databaseWorker('create',env);
   if(entry.operation==='restart'){await databaseWorker('restart-write',env);await restart();await databaseWorker('restart-read',env);}
   else await databaseWorker(entry.operation,env);
  });
 } else if(entry.kind==='backlog') backlog();
 else if(entry.kind==='queue') {
  const result=await run('pwsh',['-NoProfile','-File','C:/dev/afterdesk-project-brain/scripts/validate-continuation-queue.ps1','-QueuePath',resolve(root,'specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json')]);
  requireSuccess(result,'canonical-queue-validator');
  if(!/INVALID=0(?:\s|$)/.test(result.stdout)||!/VERDICT=(?:DRAINED|CONTINUATION_REQUIRED|NO_SUCCESSOR)/.test(result.stdout))throw new Error('QUEUE_VALIDATION_SIGNAL_MISSING');
 } else if(entry.kind==='contracts') {
  await grouped([
   ['phase-contract-adversarial',[`${spec}/scripts/test-phase-check-contract.mjs`]],
   ['frozen-phase-manifest',[`${base}/validate-kit.mjs`]],
   ['provider-boundary',['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts']],
   ['release-package',['scripts/validate-endvera-release-package.mjs']],
  ]);
 } else if(entry.kind==='secrets') {
  const list=await run('git',['ls-files','-z'],{quiet:true});requireSuccess(list,'tracked-file-list');
  const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-(?:proj-|ant-|or-v1-)[A-Za-z0-9_-]{24,}/,/\bgh[pousr]_[A-Za-z0-9]{30,}/,/\bAKIA[A-Z0-9]{16}\b/];
  let count=0;const hits=[];
  for(const path of list.stdout.split('\0').filter(Boolean)) {
   const abs=resolve(root,path);const bytes=readFileSync(abs);if(bytes.length>5_000_000||bytes.includes(0))continue;
   count++; if(patterns.some(p=>p.test(bytes.toString('utf8'))))hits.push(path);
  }
  console.log(`SECRET_SCAN_RESULT scanned=${count} flaggedFiles=${hits.length}`);
  if(hits.length)throw new Error(`SECRET_PATTERN_MATCH_PATHS:${hits.join(',')}`);
 } else if(entry.kind==='native-signal') {
  const pkg=JSON.parse(readFileSync(resolve(root,'apps/mobile/package.json'),'utf8'));
  const paths=filesUnder(resolve(root,spec,'evidence','device'));
  const signals=paths.filter(path=>/crash|logcat|tombstone|anr/i.test(path));
  console.log(`NATIVE_SIGNAL_INVENTORY mobileVersion=${pkg.version} filedArtifacts=${paths.length} crashSignalArtifacts=${signals.length} scope=campaign-device-folder`);
  if(signals.length)throw new Error('NATIVE_CRASH_SIGNAL_REQUIRES_REPRODUCTION');
  console.log('NATIVE_NO_FILED_REPRODUCIBLE_CRASH_SIGNAL');
  return;
 } else if(entry.kind==='routes') {
  // The actual process starts on loopback. No protected session or device claim.
  const { routeSmoke }=await import('./route-smoke.mjs');
  await routeSmoke({root,safeEnv});
 } else throw new Error('CHECK_KIND_NOT_IMPLEMENTED');
 console.log(`CHECK_VERIFIED phase=${phase} checkId=${checkId}`);
}
main().catch(error=>{console.error(`PHASE_CHECK_EXECUTION_FAILURE:${safeOutput(error.message)}`);process.exitCode=1;});
