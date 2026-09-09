import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, lstatSync, existsSync, realpathSync, openSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha, encode, fail, same, safePath, secretFlags, validateLedger, validateContract, hex40, gitSourceBytesEqual } from './protocol.mjs';
import { generatedClientFingerprint, checkPrerequisites, safeEnvironment } from './preflight.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const spec = 'specs/208-astra-r02-local-preflight', ep = `${spec}/evidence`;
const git = (...args) => execFileSync('git', args, { cwd:root, windowsHide:true, maxBuffer:128_000_000 });
const gitText = (...args) => git(...args).toString('utf8').trim();
const read = path => {
  safePath(path); let at = root;
  for (const component of path.split('/')) {
    at = join(at,component); fail(!lstatSync(at).isSymbolicLink(), 'LINK_REFUSED');
  }
  fail(relative(root,realpathSync(at)).split(/[\\/]/)[0] !== '..', 'REALPATH_REFUSED');
  return readFileSync(at);
};
function write(path, data, exclusive = true) {
  safePath(path);
  // Every existing parent must be a real directory, not a junction.
  let at = root;
  for (const component of path.split('/').slice(0,-1)) {
    at = join(at,component);
    if(!existsSync(at))mkdirSync(at);
    fail(lstatSync(at).isDirectory()&&!lstatSync(at).isSymbolicLink(),'LINK_REFUSED');
  }
  if (existsSync(resolve(root,path))) fail(!lstatSync(resolve(root,path)).isSymbolicLink(),'LINK_REFUSED');
  if(exclusive){const fd=openSync(resolve(root,path),'wx');try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}}
  else {
    // Intent is already exclusive and durable; a replacement failure leaves an
    // orphan intent, which validation refuses. Never truncate the old journal.
    const temp=`${resolve(root,path)}.next`,fd=openSync(temp,'wx');
    try { writeFileSync(fd,data);fsyncSync(fd); } finally {closeSync(fd);}
    renameSync(temp,resolve(root,path));
  }
}
function filesAt(head, prefix = '') {
  fail(hex40(head),'HEAD_REFUSED');
  return git('ls-tree','-r','-z',head,...(prefix ? ['--',prefix] : [])).toString('utf8').split('\0').filter(Boolean).map(line => {
    const [meta,path] = line.split('\t'), [mode,type,oid] = meta.split(' ');
    fail(type === 'blob' && ['100644','100755'].includes(mode),'NON_REGULAR_GIT_ENTRY');
    safePath(path); return {path,oid};
  });
}
function blobs(entries) {
  const output = execFileSync('git',['cat-file','--batch'],{cwd:root,windowsHide:true,maxBuffer:128_000_000,input:entries.map(e=>e.oid).join('\n')+'\n'});
  const result = new Map(); let offset = 0;
  for (const entry of entries) {
    const end = output.indexOf(10,offset), header=output.subarray(offset,end).toString('utf8').split(' ');
    fail(header[0]===entry.oid && header[1]==='blob' && /^\d+$/.test(header[2]),'GIT_BLOB_REFUSED');
    const size = Number(header[2]); fail(size <= 25_000_000,'BLOB_TOO_LARGE');
    offset=end+1; result.set(entry.path,output.subarray(offset,offset+size)); offset+=size+1;
  }
  fail(offset===output.length,'GIT_BATCH_TRAILING_BYTES'); return result;
}
function listDisk(directory) {
  if (!existsSync(resolve(root,directory))) return [];
  fail(!lstatSync(resolve(root,directory)).isSymbolicLink(),'LINK_REFUSED');
  return readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(entry => {
    const p=`${directory}/${entry.name}`; fail(!entry.isSymbolicLink(),'LINK_REFUSED');
    return entry.isDirectory()?listDisk(p):[p];
  });
}
function assertSource(frozenHead) {
  const entries=filesAt(frozenHead), content=blobs(entries);
  for (const entry of entries) fail(sourceEqual(entry.path,content.get(entry.path)),'FROZEN_SOURCE_CHANGED');
  // No added source can silently affect tooling; only recorded evidence and local reports.
  const extras=gitText('ls-files','--others','--exclude-standard').split(/\r?\n/).filter(Boolean);
  fail(extras.every(p=>p.startsWith(`${ep}/`) || p.startsWith(`${spec}/reports/`)), 'UNFROZEN_SOURCE_ADDED');
}
function sourceEqual(path, blob) {
  const working=read(path);
  return path.startsWith('specs/206-gpt6-astra-endvera-reverification/')||path.startsWith('specs/207-astra-r01-proof-contract/')||path.startsWith(spec+'/')
    ? working.equals(blob):gitSourceBytesEqual(blob,working);
}
const contract=JSON.parse(read(`${spec}/contract.json`));
validateContract(contract);
function runtimeFingerprint() {
  const roots=['node_modules','apps/mobile/node_modules'];
  const caches=['.cache','.vite','.vite-temp'];
  const dependencies=roots.map(path=>{
    const target=realpathSync(resolve(root,path)),list=[];
    const walk=(dir,prefix='')=>{
      for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
        if(!prefix&&caches.includes(item.name))continue;
        fail(!item.isSymbolicLink(),'DEPENDENCY_LINK_REFUSED');
        const name=prefix+item.name,full=join(dir,item.name);
        if(item.isDirectory())walk(full,`${name}/`);else list.push({path:name,sha256:sha(readFileSync(full))});
      }
    };walk(target);
    return {path,target,fileCount:list.length,treeSha256:sha(encode(list))};
  });
  return {nodeVersion:process.version,nodeExecutable:process.execPath,nodeSha256:sha(readFileSync(process.execPath)),dependencies,generatedClient:generatedClientFingerprint(root),
    excludedGeneratedCaches:caches,limit:'Generated caches are excluded; this is not hostile-host or OS isolation proof'};
}
function history() {
  const entries=filesAt(contract.historicalSourceHead,'specs/206-gpt6-astra-endvera-reverification');
  const content=blobs(entries), commands=[]; let incidents=0, streamErrors=0;
  for (const [path,bytes] of content) {
    if (/\/commands\/[^/]+\/command\.json$/.test(path)) {
      const item=JSON.parse(bytes); commands.push(item);
      for (const side of ['stdout','stderr']) if (!content.has(item[`${side}Path`]) || sha(content.get(item[`${side}Path`]))!==item[`${side}Sha256`]) streamErrors++;
    }
    if (/\/commands\/[^/]+\/INCIDENT\.json$/.test(path)) incidents++;
  }
  fail(streamErrors===0,'HISTORICAL_STREAM_INTEGRITY_FAILED');
  return {sourceHead:contract.historicalSourceHead,disposition:'LOCAL_REVALIDATION_BLOCKED',sealed:false,
    fileCount:entries.length,indexSha256:sha(encode(entries.map(e=>({path:e.path,bytes:content.get(e.path).length,sha256:sha(content.get(e.path))})))),
    commandCount:commands.length,nativeExitMismatches:commands.filter(c=>c.exitCode!==c.expectedExitCode).length,
    auditAttempts:commands.filter(c=>c.phase==='G2'&&c.classification==='MODEL_AUDIT').length,incidents,streamErrors};
}
async function freeze() {
  fail(!gitText('status','--porcelain'),'FREEZE_REQUIRES_CLEAN_GIT');
  fail(!existsSync(resolve(root,ep)),'CAMPAIGN_ALREADY_STARTED');
  const testedHead=gitText('rev-parse','HEAD'), testedTree=gitText('rev-parse','HEAD^{tree}');
  fail(!gitText('diff','--name-only',contract.preparationBaseHead,'HEAD','--','.',`:(exclude)${spec}`,':(exclude)release/current-projection-v3.json'),'PRODUCT_SOURCE_CHANGED');
  assertSource(testedHead); history();await checkPrerequisites(root);
  const runtime=encode(runtimeFingerprint());
  const record={schemaVersion:1,campaignId:contract.campaignId,testedHead,testedTree,contractSha256:sha(encode(contract)),runtimeSha256:sha(runtime),frozenAt:new Date().toISOString()};
  write(`${ep}/runtime.json`,runtime);
  write(`${ep}/freeze.json`,encode(record)); write(`${ep}/journal.json`,encode([]));
  console.log(JSON.stringify({kind:'FROZEN',...record}));
}
async function run(checkId) {
  const f=JSON.parse(read(`${ep}/freeze.json`));
  fail(f.testedHead===gitText('rev-parse','HEAD') && f.contractSha256===sha(encode(contract)),'RUN_FREEZE_MISMATCH');
  assertSource(f.testedHead);
  fail(sha(encode(runtimeFingerprint()))===f.runtimeSha256,'RUNTIME_CHANGED');
  for (const file of ['.env','.env.local','.env.test','.env.production','apps/mobile/.env','apps/mobile/.env.local']) fail(!existsSync(resolve(root,file)),'ENV_FILE_REFUSED');
  const check=contract.checks.find(c=>c.id===checkId); fail(check,'CHECK_NOT_FROZEN');
  const journal=JSON.parse(read(`${ep}/journal.json`));
  const sequence=journal.length+1,id=`a${String(sequence).padStart(4,'0')}`;
  const enrollment={id,sequence,checkId,campaignId:f.campaignId,testedHead:f.testedHead,testedTree:f.testedTree,commandSha256:sha(encode(check)),startedAt:new Date().toISOString(),previous:journal.length?sha(encode(journal.at(-1))):null};
  const prefix=`${ep}/attempts/${id}`;
  write(`${prefix}/intent.json`,encode(enrollment)); journal.push(enrollment);write(`${ep}/journal.json`,encode(journal),false);
  const child=spawn(process.execPath,check.args,{cwd:resolve(root,check.cwd),env:safeEnvironment(root),windowsHide:true,stdio:['ignore','pipe','pipe']});
  let failed=false,total=0;const output=[],errors=[];
  const stop=()=>{failed=true;if(child.pid && child.exitCode===null){
    try{if(process.platform==='win32')execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'pipe',timeout:10000});else child.kill('SIGKILL');}catch{/* uncertainty remains an incident */}
  }};
  child.on('error',()=>{failed=true;});
  const collect=target=>bytes=>{total+=bytes.length;if(total>25_000_000)stop();else target.push(bytes);};
  child.stdout.on('data',collect(output));child.stderr.on('data',collect(errors));
  const timer=setTimeout(stop,check.timeoutMs);
  const exit=await new Promise(done=>child.on('close',(code,signal)=>{if(signal)failed=true;done(code);}));clearTimeout(timer);
  const out=Buffer.concat(output),err=Buffer.concat(errors);
  let incident=failed?'LAUNCH_OR_CAPTURE_FAILED':null;
  let runtimeVerified=false;
  try{runtimeVerified=sha(encode(runtimeFingerprint()))===f.runtimeSha256;}catch{/* missing generated bytes remain a runtime incident */}
  if(!runtimeVerified)incident='RUNTIME_CHANGED';
  try{assertSource(f.testedHead);}catch{incident='SOURCE_CHANGED';}
  if(secretFlags(out).length||secretFlags(err).length)incident='SECRET_OUTPUT_WITHHELD';
  const record={kind:incident?'INCIDENT':'COMPLETED',finishedAt:new Date().toISOString(),exitCode:incident?null:exit,stdoutSha256:incident?null:sha(out),stderrSha256:incident?null:sha(err),incident,runtimeVerified};
  if(!incident){write(`${prefix}/stdout.txt`,out);write(`${prefix}/stderr.txt`,err);}
  write(`${prefix}/result.json`,encode(record));
  console.log(JSON.stringify({id,checkId,exitCode:record.exitCode,incident,stdoutBytes:incident?null:out.length}));
  if(incident)process.exitCode=1;
}
function validate(evidenceHead) {
  const entries=filesAt(evidenceHead,ep), content=blobs(entries);
  fail(same(entries.map(e=>e.path).sort(),listDisk(ep).sort()),'ANCHOR_FILE_SET_MISMATCH');
  for(const entry of entries)fail(read(entry.path).equals(content.get(entry.path)),'ANCHOR_BYTES_CHANGED');
  const get=p=>{const b=content.get(`${ep}/${safePath(p)}`);fail(b,'ANCHORED_ARTIFACT_MISSING');return b;};
  const f=JSON.parse(get('freeze.json'));
  fail(gitText('rev-parse',`${f.testedHead}^{tree}`)===f.testedTree,'TREE_MISMATCH');
  git('merge-base','--is-ancestor',f.testedHead,evidenceHead);
  const frozen=blobs(filesAt(f.testedHead));
  fail(same(JSON.parse(frozen.get(`${spec}/contract.json`)),contract),'CONTRACT_SUBSTITUTION');
  fail(!gitText('diff','--name-only',f.testedHead,evidenceHead,'--','.',`:(exclude)${ep}`,`:(exclude)${spec}/reports`,`:(exclude)${spec}/LONG_RUN_PROGRAM.json`,`:(exclude)${spec}/WORK_STATUS.json`,`:(exclude)${spec}/CONTINUATION_QUEUE.json`),'ANCHOR_SOURCE_CHANGED');
  const mutableMetadata=new Set([`${spec}/LONG_RUN_PROGRAM.json`,`${spec}/WORK_STATUS.json`,`${spec}/CONTINUATION_QUEUE.json`]);
  for(const [path,bytes] of frozen)if(!mutableMetadata.has(path))fail(sourceEqual(path,bytes),'FROZEN_SOURCE_CHANGED');
  const projection=validateLedger(contract,f,JSON.parse(get('journal.json')),entries.map(e=>e.path.slice(ep.length+1)),get);
  const historical=history();
  const seal={schemaVersion:1,kind:'R02_LOCAL_EVIDENCE_SEAL',evidenceHead,testedHead:f.testedHead,testedTree:f.testedTree,
    campaignId:f.campaignId,contractSha256:f.contractSha256,historical,...projection,
    unresolvedProductGates:contract.unresolvedProductGates,productVerdict:'LOCAL_REVALIDATION_REWORK',
    providerVerdict:null,adoptionDecision:null,executionAuthorized:false,
    provenanceLimit:'Local Git and recorder evidence; not an independent runtime or device witness'};
  console.log(JSON.stringify(seal,null,2));
  return seal;
}
try {
  const [mode,arg]=process.argv.slice(2);
  if(mode==='freeze')await freeze();
  else if(mode==='run')await run(arg);
  else if(mode==='validate')validate(arg);
  else if(mode==='seal') { const result=validate(arg);write(`${spec}/reports/seal.json`,encode(result)); }
  else if(mode==='verify-report') {
    const report=JSON.parse(read(`${spec}/reports/seal.json`));
    fail(same(validate(report.evidenceHead),report),'SEAL_PROJECTION_MISMATCH');
  }
  else if(mode==='history')console.log(JSON.stringify(history(),null,2));
  else throw new Error('MODE_REFUSED');
} catch(error) {
  // Only controlled symbolic codes are emitted; child data is never echoed.
  console.error(/^[A-Z_]+$/.test(error.message)?error.message:'CAMPAIGN_OPERATION_REFUSED');process.exitCode=1;
}
