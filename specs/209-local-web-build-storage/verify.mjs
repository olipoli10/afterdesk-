import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha,parseCheck} from '../208-astra-r02-local-preflight/protocol.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),spec='specs/209-local-web-build-storage';
const read=p=>readFileSync(resolve(root,spec,p)),json=p=>JSON.parse(read(p));
const fail=(ok,why)=>{if(!ok)throw new Error(why);};
const expected={
 'before-focused':['focused',false,16], 'after-focused':['focused',true,19],
 'verified-focused':['focused',true,19], 'verified-root':['root',true,2720],
 'verified-boundary':['boundary',true], 'verified-build':['build',true], 'verified-runtime':['runtime',true],
};
const commands={focused:['node_modules/vitest/vitest.mjs','run','test/public-site-preview-storage.test.ts','--reporter=json'],root:['node_modules/vitest/vitest.mjs','run','--reporter=json'],boundary:['node_modules/tsx/dist/cli.mjs','scripts/validate-provider-boundary.ts'],build:['node_modules/next/dist/bin/next','build','--webpack'],runtime:[`${spec}/runtime-check.mjs`]};
const inventory=readdirSync(resolve(root,spec,'evidence')).sort();
fail(JSON.stringify(inventory)===JSON.stringify(Object.keys(expected).sort()),'ATTEMPT_INVENTORY_CHANGED');
const fresh=[];
for(const [id,[kind,pass,minimumPassed]] of Object.entries(expected)){
 const base=`evidence/${id}`,i=json(`${base}/intent.json`),r=json(`${base}/result.json`),out=read(`${base}/stdout.txt`),err=read(`${base}/stderr.txt`);
 fail(i.id===id&&i.kind===kind&&r.incident===null&&sha(out)===r.stdoutSha256&&sha(err)===r.stderrSha256,'RECORD_BINDING_FAILED');
 fail(JSON.stringify(i.command)===JSON.stringify(commands[kind])&&Date.parse(i.startedAt)<=Date.parse(r.finishedAt),'COMMAND_OR_TIME_FAILED');
 fail((r.status==='PASS')===pass&&(r.exitCode===0)===pass,'OUTCOME_CHANGED');
 if(['focused','root'].includes(kind)){
  const parsed=parseCheck({kind:'vitest',minimumPassed},out,err,r.exitCode);
  fail((parsed.status==='PASS')===pass,'TEST_SEMANTICS_FAILED');
 }
 if(kind==='boundary')fail(/^R37O_PROVIDER_BOUNDARY_PASS modules=[1-9]\d* violations=0\r?$/m.test(out.toString()),'BOUNDARY_FAILED');
 if(kind==='runtime')fail(parseCheck({kind:'json',expected:{kind:'COMPILED_RUNTIME_STORAGE_REFUSED',passed:true}},out,err,r.exitCode).status==='PASS','RUNTIME_SEMANTICS_FAILED');
 if(id.startsWith('verified-'))fresh.push({i,r});
}
fail(fresh.every(({i})=>i.head===fresh[0].i.head&&i.tree===fresh[0].i.tree&&i.sourceSha256===fresh[0].i.sourceSha256&&JSON.stringify(i.runtime)===JSON.stringify(fresh[0].i.runtime)),'FRESH_SOURCE_RUNTIME_MISMATCH');
const build=fresh.find(x=>x.i.kind==='build').r.artifacts,runtime=fresh.find(x=>x.i.kind==='runtime').r.artifacts;
fail(build?.files>2&&build.sha256===runtime?.sha256&&build.buildId===runtime.buildId,'COMPILED_ARTIFACT_MISMATCH');
fail(Date.parse(fresh.find(x=>x.i.kind==='runtime').i.startedAt)>=Date.parse(fresh.find(x=>x.i.kind==='build').r.finishedAt),'BUILD_RUNTIME_ORDER_FAILED');
const anchor=process.argv[2];
if(anchor){
 fail(/^[a-f0-9]{40}$/.test(anchor),'ANCHOR_REFUSED');
 for(const id of inventory)for(const name of ['intent.json','result.json','stdout.txt','stderr.txt']){
  const path=`${spec}/evidence/${id}/${name}`;
  const blob=execFileSync('git',['show',`${anchor}:${path}`],{cwd:root,maxBuffer:32000000,windowsHide:true});
  fail(blob.equals(readFileSync(resolve(root,path))),'ANCHOR_BYTES_CHANGED');
 }
}
console.log(JSON.stringify({kind:'R03_LOCAL_BUILD_VALIDATED',passed:true,testedHead:fresh[0].i.head,attempts:inventory.length,localChecksPassed:5,anchor:anchor??null,scope:'LOCAL_ONLY_NOT_PROVIDER_OR_DEVICE_PROOF'}));
