import {spawn,execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {safeEnvironment,generatedClientFingerprint} from '../208-astra-r02-local-preflight/preflight.mjs';
import {sha,encode,secretFlags,parseCheck} from '../208-astra-r02-local-preflight/protocol.mjs';
import {buildArtifacts} from './artifacts.mjs';
import {runtimeFingerprint} from './runtime-fingerprint.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),spec='specs/209-local-web-build-storage';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32000000}).trim();
const checks={
  focused:{args:['node_modules/vitest/vitest.mjs','run','test/public-site-preview-storage.test.ts','--reporter=json'],parser:{kind:'vitest',minimumPassed:19},timeout:120000},
  root:{args:['node_modules/vitest/vitest.mjs','run','--reporter=json'],parser:{kind:'vitest',minimumPassed:2720},timeout:300000},
  boundary:{args:['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts'],parser:{kind:'marker',exactLine:'unused'},timeout:60000},
  build:{args:['node_modules/next/dist/bin/next','build','--webpack'],timeout:900000},
  runtime:{args:[`${spec}/runtime-check.mjs`],parser:{kind:'json',expected:{kind:'COMPILED_RUNTIME_STORAGE_REFUSED',passed:true}},timeout:60000},
};
function sourceFingerprint(){
  const paths=git('ls-files','-z').split('\0').filter(Boolean).filter(p=>!p.startsWith(spec+'/evidence/')&&!p.startsWith(spec+'/reports/')&&!p.endsWith('/WORK_STATUS.json')&&!p.endsWith('/CONTINUATION_QUEUE.json'));
  // Include uncommitted source and new kit bytes in pre-fix development observations.
  const extras=git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean).filter(p=>!p.startsWith(spec+'/evidence/')&&!p.startsWith(spec+'/reports/'));
  return sha(encode([...new Set([...paths,...extras])].sort().map(path=>({path,sha256:sha(readFileSync(resolve(root,path)))}))));
}
const [id,kind]=process.argv.slice(2);
if(!/^[a-z0-9-]{3,60}$/.test(id??'')||!checks[kind])throw new Error('CHECK_REFUSED');
const c=checks[kind],dir=resolve(root,spec,'evidence',id);
if(existsSync(dir))throw new Error('ATTEMPT_ALREADY_EXISTS');
if(kind==='build'&&existsSync(resolve(root,'.next/BUILD_ID')))throw new Error('EXISTING_BUILD_REFUSED');
const before=sourceFingerprint(),client=generatedClientFingerprint(root),env=safeEnvironment(root);
const runtime=runtimeFingerprint(root);
const admission=JSON.parse(readFileSync(resolve(root,'specs/208-astra-r02-local-preflight/reports/preparation.json')));
if(JSON.stringify(client)!==JSON.stringify(admission.client))throw new Error('GENERATED_CLIENT_CHANGED');
const auth=['build','runtime'].includes(kind)?randomBytes(32).toString('hex'):null;
if(auth)Object.assign(env,{BETTER_AUTH_SECRET:auth,BETTER_AUTH_URL:'http://127.0.0.1:3000',NODE_ENV:'production',VERCEL_ENV:'development'});
// NEXT_PHASE is set by Next itself during build; never spoof it in the runner.
mkdirSync(dir,{recursive:true});
const intent={id,kind,head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),sourceSha256:before,command:c.args,timeoutMs:c.timeout,client,runtime,node:process.version,nodeSha256:sha(readFileSync(process.execPath)),startedAt:new Date().toISOString()};
writeFileSync(resolve(dir,'intent.json'),encode(intent),{flag:'wx'});
const child=spawn(process.execPath,c.args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let incident=null,size=0;const out=[],err=[];
const stop=()=>{incident='EXECUTION_OR_CAPTURE_INCOMPLETE';try{if(child.pid)execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'pipe',windowsHide:true,timeout:10000});}catch{}};
const collect=target=>b=>{size+=b.length;if(size>25000000)stop();else target.push(b);};
child.stdout.on('data',collect(out));child.stderr.on('data',collect(err));child.on('error',()=>{incident='CHILD_LAUNCH_FAILED';});
const timer=setTimeout(stop,c.timeout);
const exitCode=await new Promise(done=>child.on('close',(code,signal)=>{if(signal)incident='CHILD_SIGNAL';done(code);}));clearTimeout(timer);
const stdout=Buffer.concat(out),stderr=Buffer.concat(err);
try{if(sourceFingerprint()!==before)incident='SOURCE_CHANGED';}catch{incident='SOURCE_CHECK_FAILED';}
try{if(JSON.stringify(generatedClientFingerprint(root))!==JSON.stringify(client))incident='GENERATED_CLIENT_CHANGED';}catch{incident='GENERATED_CLIENT_CHECK_FAILED';}
try{if(JSON.stringify(runtimeFingerprint(root))!==JSON.stringify(runtime))incident='RUNTIME_CHANGED';}catch{incident='RUNTIME_CHECK_FAILED';}
if(secretFlags(stdout).length||secretFlags(stderr).length||(auth&&(stdout.includes(auth)||stderr.includes(auth))))incident='UNSAFE_OUTPUT_WITHHELD';
let verdict={status:'FAIL',reason:incident??'NATIVE_EXIT_NONZERO'};
if(!incident){
  writeFileSync(resolve(dir,'stdout.txt'),stdout,{flag:'wx'});writeFileSync(resolve(dir,'stderr.txt'),stderr,{flag:'wx'});
  if(kind==='build')verdict=exitCode===0&&existsSync(resolve(root,'.next/BUILD_ID'))&&existsSync(resolve(root,'.next/server/app-paths-manifest.json'))?{status:'PASS',scope:'LOCAL_BUILD_ONLY'}:verdict;
  else if(kind==='boundary')verdict=exitCode===0&&/^R37O_PROVIDER_BOUNDARY_PASS modules=[1-9]\d* violations=0\r?$/m.test(stdout.toString())?{status:'PASS',scope:'STATIC_SOURCE_GRAPH'}:verdict;
  else verdict=parseCheck(c.parser,stdout,stderr,exitCode);
}
let artifacts=null;
try{if(['build','runtime'].includes(kind)&&verdict.status==='PASS')artifacts=buildArtifacts(root);}catch{incident='BUILD_ARTIFACT_CHECK_FAILED';verdict={status:'FAIL',reason:incident};}
const result={finishedAt:new Date().toISOString(),exitCode,incident,stdoutSha256:incident?null:sha(stdout),stderrSha256:incident?null:sha(stderr),artifacts,...verdict};
writeFileSync(resolve(dir,'result.json'),encode(result),{flag:'wx'});
console.log(JSON.stringify({id,kind,...result}));
if(verdict.status!=='PASS')process.exitCode=1;
