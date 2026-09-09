import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,encode,gitSourceBytesEqual,parseCheck} from '../208-astra-r02-local-preflight/protocol.mjs';
import {expectedRuntimeResult} from './runtime-result.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),spec='specs/209-local-web-build-storage';
const read=p=>readFileSync(resolve(root,spec,p)),json=p=>JSON.parse(read(p));
const fail=(ok,why)=>{if(!ok)throw new Error(why);};
// Failed attempts remain enrolled. Selection is explicit, not deletion.
const expected={
 'before-focused':['focused','FAIL',16], 'after-focused':['focused','PASS',19],
 'verified-focused':['focused','PASS',19,true], 'verified-root':['root','FAIL',2719],
 'verified-root-retry':['root','PASS',2720,true],
 'verified-boundary':['boundary','SOURCE_CHECK_FAILED'],
 'verified-boundary-retry':['boundary','PASS',null,true],
 'verified-build':['build','PASS',null,true],
 'verified-runtime':['runtime','JSON_RESULT_MISMATCH'],
 'verified-runtime-retry':['runtime','PASS',null,true],
};
const commands={focused:['node_modules/vitest/vitest.mjs','run','test/public-site-preview-storage.test.ts','--reporter=json'],root:['node_modules/vitest/vitest.mjs','run','--reporter=json'],boundary:['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts'],build:['node_modules/next/dist/bin/next','build','--webpack'],runtime:[`${spec}/runtime-check.mjs`]};
const inventory=readdirSync(resolve(root,spec,'evidence')).sort();
fail(JSON.stringify(inventory)===JSON.stringify(Object.keys(expected).sort()),'ATTEMPT_INVENTORY_CHANGED');
const selected=[];
for(const [id,[kind,outcome,minimumPassed,select]] of Object.entries(expected)){
 const base=`evidence/${id}`,i=json(`${base}/intent.json`),r=json(`${base}/result.json`);
 fail(i.id===id&&i.kind===kind&&JSON.stringify(i.command)===JSON.stringify(commands[kind])&&Date.parse(i.startedAt)<=Date.parse(r.finishedAt),'COMMAND_OR_TIME_FAILED');
 if(outcome==='SOURCE_CHECK_FAILED'){
  fail(r.status==='FAIL'&&r.incident===outcome&&r.exitCode===0&&r.stdoutSha256===null&&r.stderrSha256===null,'INCIDENT_CHANGED');continue;
 }
 const out=read(`${base}/stdout.txt`),err=read(`${base}/stderr.txt`);
 fail(r.incident===null&&sha(out)===r.stdoutSha256&&sha(err)===r.stderrSha256,'STREAM_BINDING_FAILED');
 if(outcome==='JSON_RESULT_MISMATCH'){
  fail(r.status==='FAIL'&&r.reason===outcome&&r.exitCode===0,'RECORDER_FAILURE_CHANGED');continue;
 }
 const pass=outcome==='PASS';
 fail((r.status==='PASS')===pass&&(r.exitCode===0)===pass,'OUTCOME_CHANGED');
 if(['focused','root'].includes(kind))fail((parseCheck({kind:'vitest',minimumPassed},out,err,r.exitCode).status==='PASS')===pass,'TEST_SEMANTICS_FAILED');
 if(kind==='boundary')fail(/^R37O_PROVIDER_BOUNDARY_PASS modules=[1-9]\d* violations=0\r?$/m.test(out.toString()),'BOUNDARY_FAILED');
 if(kind==='runtime')fail(parseCheck({kind:'json',expected:expectedRuntimeResult},out,err,r.exitCode).status==='PASS','RUNTIME_SEMANTICS_FAILED');
 if(select)selected.push({i,r});
}
const buildEntry=selected.find(x=>x.i.kind==='build'),runtimeEntry=selected.find(x=>x.i.kind==='runtime');
const build=buildEntry.r.artifacts,runtime=runtimeEntry.r.artifacts;
fail(build?.files>2&&build.sha256===runtime?.sha256&&build.buildId===runtime.buildId,'COMPILED_ARTIFACT_MISMATCH');
fail(Date.parse(runtimeEntry.i.startedAt)>=Date.parse(buildEntry.r.finishedAt),'BUILD_RUNTIME_ORDER_FAILED');
// A recorder-only correction has its own HEAD, never a pretend product rebuild.
const allowed=new Set(['run.mjs','verify.mjs','runtime-result.mjs']);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32000000}).trim();
const admitted=new Map();
function expectedSourceAt(head){
 if(admitted.has(head))return admitted.get(head);
 const entries=git('ls-tree','-r','-z',head).split('\0').filter(Boolean).map(line=>{const [meta,path]=line.split('\t');const [mode,type,oid]=meta.split(' ');fail(type==='blob'&&['100644','100755'].includes(mode),'SOURCE_ENTRY_REFUSED');return {path,oid};}).filter(({path:p})=>!p.startsWith(spec+'/evidence/')&&!p.startsWith(spec+'/reports/')&&!p.endsWith('/WORK_STATUS.json')&&!p.endsWith('/CONTINUATION_QUEUE.json')).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const batch=execFileSync('git',['cat-file','--batch'],{cwd:root,windowsHide:true,maxBuffer:128000000,input:entries.map(e=>e.oid).join('\n')+'\n'});
 let offset=0;const files=[];
 for(const {path,oid} of entries){
  const end=batch.indexOf(10,offset),header=batch.subarray(offset,end).toString().split(' ');
  fail(header[0]===oid&&header[1]==='blob'&&/^\d+$/.test(header[2]),'SOURCE_BATCH_REFUSED');
  const size=Number(header[2]);offset=end+1;const blob=batch.subarray(offset,offset+size);offset+=size+1;
  let bytes=blob;
  if(!path.startsWith(spec+'/')){
   bytes=readFileSync(resolve(root,path));
   // apply_patch preserved CRLF on untouched lines in these two changed text
   // files. Git normalizes the index; recorded sourceSha binds their raw bytes.
   const patchedText=['src/lib/storage.ts','test/public-site-preview-storage.test.ts'].includes(path)&&!bytes.includes(0)&&Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')).equals(blob);
   fail(gitSourceBytesEqual(blob,bytes)||patchedText,'PRODUCT_CHECKOUT_DRIFT:'+path);
  }
  files.push({path,sha256:sha(bytes)});
 }
 fail(offset===batch.length,'SOURCE_BATCH_TRAILING_BYTES');const hash=sha(encode(files));admitted.set(head,hash);return hash;
}
for(const {i} of selected){
 fail(i.sourceSha256===expectedSourceAt(i.head),'TESTED_SOURCE_ADMISSION_FAILED');
 fail(JSON.stringify(i.runtime)===JSON.stringify(buildEntry.i.runtime)&&JSON.stringify(i.client)===JSON.stringify(buildEntry.i.client),'DEPENDENCY_MISMATCH');
 fail(git('rev-parse',`${i.head}^{tree}`)===i.tree,'TESTED_TREE_MISMATCH');
 if(i.head===buildEntry.i.head)fail(i.sourceSha256===buildEntry.i.sourceSha256,'SOURCE_BYTES_MISMATCH');
 else {
  git('merge-base','--is-ancestor',buildEntry.i.head,i.head);
  const changed=git('diff','--name-only',buildEntry.i.head,i.head).split(/\r?\n/).filter(Boolean);
  fail(changed.every(p=>p.startsWith(spec+'/evidence/')||p.startsWith(spec+'/reports/')||allowed.has(p.slice(spec.length+1))&&p.startsWith(spec+'/')),'PRODUCT_CHANGED_AFTER_BUILD');
 }
}
const anchor=process.argv[2];
if(anchor){
 fail(/^[a-f0-9]{40}$/.test(anchor),'ANCHOR_REFUSED');
 for(const id of inventory)for(const name of readdirSync(resolve(root,spec,'evidence',id))){
  fail(['intent.json','result.json','stdout.txt','stderr.txt'].includes(name),'EXTRA_EVIDENCE_REFUSED');
  const path=`${spec}/evidence/${id}/${name}`;
  const blob=execFileSync('git',['show',`${anchor}:${path}`],{cwd:root,maxBuffer:32000000,windowsHide:true});
  fail(blob.equals(readFileSync(resolve(root,path))),'ANCHOR_BYTES_CHANGED');
 }
}
console.log(JSON.stringify({kind:'R03_LOCAL_BUILD_VALIDATED',passed:true,buildHead:buildEntry.i.head,runtimeHead:runtimeEntry.i.head,attempts:inventory.length,selectedLocalChecksPassed:5,preservedFailures:4,anchor:anchor??null,scope:'LOCAL_ONLY_NOT_PROVIDER_OR_DEVICE_PROOF'}));
