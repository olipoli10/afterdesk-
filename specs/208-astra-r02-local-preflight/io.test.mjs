import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { generatedClientFingerprint } from './preflight.mjs';
import { recordGenerationResult } from './preparation-output.mjs';
import { sha } from './protocol.mjs';

const spec='specs/208-astra-r02-local-preflight',old='specs/206-gpt6-astra-endvera-reverification';
function setup(t) {
  const root=mkdtempSync(join(tmpdir(),'endvera-r02-io-'));
  t.after(()=>{
    const absolute=resolve(root),parent=resolve(tmpdir());
    assert(absolute.startsWith(parent+requireSeparator()) && absolute.includes('endvera-r02-io-'));
    rmSync(absolute,{recursive:true,force:true});
  });
  function write(p,bytes){mkdirSync(resolve(root,p,'..'),{recursive:true});writeFileSync(join(root,p),bytes);}
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath='+join(root,'no-hooks'),...args],{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const commit=()=>{git('add','.');git('-c','user.name=Synthetic contract test','-c','user.email=synthetic@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
  git('init','-q');git('config','core.autocrlf','false');
  write('.gitignore','node_modules/\n.prisma-client/\n');write('README.md','Entirely synthetic local test fixture.\n');
  write(`${old}/phase-checks-r0b/network-guard.cjs`,"'use strict';\n");
  write('prisma/schema.prisma','synthetic schema\n');
  write('.prisma-client/schema.prisma','synthetic schema\n');
  write('.prisma-client/index.js','exports.PrismaClient=function(){};\n');
  write('.prisma-client/package.json','{}\n');
  write('release/current-projection-v3.mjs',"export const readCurrentProjection=()=>({status:'SYNTHETIC_FIXTURE'});\n");
  write('release/current-projection-v3.json','{}\n');
  const historicalHead=commit();
  for(const name of ['campaign.mjs','protocol.mjs','preflight.mjs'])write(`${spec}/${name}`,readFileSync(new URL(name,import.meta.url)));
  write(`${spec}/probe.mjs`,"console.log(JSON.stringify({complete:true}));\n");
  const c=JSON.parse(readFileSync(new URL('contract.json',import.meta.url)));
  c.historicalSourceHead=historicalHead;c.preparationBaseHead=historicalHead;c.checks=[{id:'PROBE',cwd:'.',args:[`${spec}/probe.mjs`],timeoutMs:1000,parser:{kind:'json',expected:{complete:true}}}];
  write(`${spec}/contract.json`,JSON.stringify(c)+'\n');
  write(`${spec}/reports/preparation.json`,JSON.stringify({kind:'LOCAL_PREPARATION',client:generatedClientFingerprint(root),projection:{status:'SYNTHETIC_FIXTURE'},projectionSha256:sha(Buffer.from('{}\n')),dbConnected:false,providerCalls:0})+'\n');
  write(`${spec}/LONG_RUN_PROGRAM.json`,'{}\n');write(`${spec}/CONTINUATION_QUEUE.json`,'{}\n');
  mkdirSync(join(root,'node_modules'),{recursive:true});mkdirSync(join(root,'apps/mobile/node_modules'),{recursive:true});
  const frozenHead=commit();
  const cli=(...args)=>spawnSync(process.execPath,[`${spec}/campaign.mjs`,...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:20000});
  const start=()=>{const r=cli('freeze');assert.equal(r.status,0,r.stderr);};
  const run=()=>{const r=cli('run','PROBE');assert.equal(r.status,0,r.stderr);};
  return {root,write,git,commit,cli,start,run,frozenHead};
}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}

test('real Git anchor accepts fresh evidence plus lifecycle metadata, preserves old verdict',t=>{
  const x=setup(t);x.start();x.run();x.write(`${spec}/LONG_RUN_PROGRAM.json`,JSON.stringify({status:'DONE'})+'\n');
  const anchor=x.commit(),r=x.cli('validate',anchor);assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout);assert.equal(report.contractCheckVerdict,'LOCAL_CHECKS_PASS');
  assert.equal(report.historical.disposition,'LOCAL_REVALIDATION_BLOCKED');assert.equal(report.historical.sealed,false);
  assert.equal(report.productVerdict,'LOCAL_REVALIDATION_REWORK');assert.equal(report.testedHead,x.frozenHead);assert.equal(report.providerVerdict,null);
});
test('deleting an anchored attempt remains detectable even if journal is rewritten',t=>{
  const x=setup(t);x.start();x.run();const anchor=x.commit();x.write(`${spec}/evidence/journal.json`,'[]\n');
  const r=x.cli('validate',anchor);assert.equal(r.status,1);assert.match(r.stderr,/ANCHOR_BYTES_CHANGED/);
});
test('one raw byte changed after anchor is refused',t=>{
  const x=setup(t);x.start();x.run();const anchor=x.commit();x.write(`${spec}/evidence/attempts/a0001/stdout.txt`,'changed');
  const r=x.cli('validate',anchor);assert.equal(r.status,1);assert.match(r.stderr,/ANCHOR_BYTES_CHANGED/);
});
test('frozen source changed before run is refused without enrolling an attempt',t=>{
  const x=setup(t);x.start();x.write(`${spec}/probe.mjs`,"console.log('changed');\n");
  const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stderr,/FROZEN_SOURCE_CHANGED/);
  assert.deepEqual(JSON.parse(readFileSync(join(x.root,spec,'evidence/journal.json'))),[]);
});
test('blocked journal replacement preserves old bytes and exposes orphan intent',t=>{
  const x=setup(t);x.start();x.run();const p=`${spec}/evidence/journal.json`,before=readFileSync(join(x.root,p));
  x.write(p+'.next','interrupted write placeholder');
  const r=x.cli('run','PROBE');assert.equal(r.status,1);assert(readFileSync(join(x.root,p)).equals(before));
  assert(existsSync(join(x.root,spec,'evidence/attempts/a0002/intent.json')));
  const anchor=x.commit();assert.equal(x.cli('validate',anchor).status,1);
});
test('junction path is refused before creating an outside attempt directory',t=>{
  const x=setup(t);x.start();const outside=join(x.root,'external-target');mkdirSync(outside);
  // Root is disposable, but the target lies outside the admitted evidence path.
  symlinkSync(outside,join(x.root,spec,'evidence/attempts'),process.platform==='win32'?'junction':'dir');
  const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stderr,/LINK_REFUSED/);
  assert.equal(existsSync(join(outside,'a0001')),false);
});
test('unfrozen extra artifact cannot be omitted from evidence anchor inventory',t=>{
  const x=setup(t);x.start();x.run();const anchor=x.commit();x.write(`${spec}/evidence/extra.txt`,'unexpected');
  const r=x.cli('validate',anchor);assert.equal(r.status,1);assert.match(r.stderr,/ANCHOR_FILE_SET_MISMATCH/);
});
test('changed dependency bytes are refused before launch',t=>{
  const x=setup(t);x.start();x.write('node_modules/injected.js','synthetic changed dependency');
  const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stderr,/RUNTIME_CHANGED/);
});
test('source mutation remains an incident even after original bytes are restored',t=>{
  const x=setup(t),before=readFileSync(join(x.root,'README.md'));
  x.write(`${spec}/probe.mjs`,"import{writeFileSync}from'node:fs';writeFileSync('README.md','mutated');console.log(JSON.stringify({complete:true}));\n");
  x.commit();x.start();const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stdout,/SOURCE_CHANGED/);
  x.write('README.md',before);const anchor=x.commit(),v=x.cli('validate',anchor);assert.equal(v.status,0,v.stderr);
  const result=JSON.parse(v.stdout);assert.equal(result.currentIncomplete,1);assert.equal(result.current[0].reason,'SOURCE_CHANGED');
  assert.equal(result.contractCheckVerdict,'LOCAL_CHECKS_REWORK');
});

test('missing generated client refuses freeze before creating evidence',t=>{
  const x=setup(t);rmSync(join(x.root,'.prisma-client/index.js'));
  const r=x.cli('freeze');assert.equal(r.status,1);assert.match(r.stderr,/GENERATED_CLIENT_INCOMPLETE/);
  assert.equal(existsSync(join(x.root,spec,'evidence')),false);
});
test('generated schema from another revision refuses freeze',t=>{
  const x=setup(t);x.write('.prisma-client/schema.prisma','different schema');
  const r=x.cli('freeze');assert.equal(r.status,1);assert.match(r.stderr,/GENERATED_SCHEMA_MISMATCH/);
});
test('unloadable generated client refuses freeze',t=>{
  const x=setup(t);x.write('.prisma-client/index.js',"throw new Error('synthetic import failure');");
  const path=`${spec}/reports/preparation.json`,admission=JSON.parse(readFileSync(join(x.root,path)));
  admission.client=generatedClientFingerprint(x.root);x.write(path,JSON.stringify(admission)+'\n');x.commit();
  const r=x.cli('freeze');assert.equal(r.status,1);assert.match(r.stderr,/GENERATED_CLIENT_IMPORT_FAILED/);
});
test('projection refusal blocks freeze before evidence exists',t=>{
  const x=setup(t);x.write('release/current-projection-v3.mjs',"export const readCurrentProjection=()=>{throw new Error('SYNTHETIC_PROJECTION_INVALID')};\n");
  // Include altered validator in fixture base: this tests propagation, not product authority.
  const base=x.commit(),c=JSON.parse(readFileSync(join(x.root,spec,'contract.json')));c.preparationBaseHead=base;
  x.write(`${spec}/contract.json`,JSON.stringify(c)+'\n');x.commit();
  const r=x.cli('freeze');assert.equal(r.status,1);assert.match(r.stderr,/SYNTHETIC_PROJECTION_INVALID/);
  assert.equal(existsSync(join(x.root,spec,'evidence')),false);
});
test('changed generated file refuses run without enrolling an attempt',t=>{
  const x=setup(t);x.start();x.write('.prisma-client/index.js','exports.PrismaClient=function changed(){};');
  const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stderr,/RUNTIME_CHANGED/);
  assert.deepEqual(JSON.parse(readFileSync(join(x.root,spec,'evidence/journal.json'))),[]);
});
test('generated file mutation during a check is retained as an incident',t=>{
  const x=setup(t),before=readFileSync(join(x.root,'.prisma-client/index.js'));
  x.write(`${spec}/probe.mjs`,"import{writeFileSync}from'node:fs';writeFileSync('.prisma-client/index.js','mutated');console.log(JSON.stringify({complete:true}));\n");
  x.commit();x.start();const r=x.cli('run','PROBE');assert.equal(r.status,1);assert.match(r.stdout,/RUNTIME_CHANGED/);
  x.write('.prisma-client/index.js',before);const anchor=x.commit(),v=x.cli('validate',anchor);assert.equal(v.status,0,v.stderr);
  const result=JSON.parse(v.stdout);assert.equal(result.currentIncomplete,1);assert.equal(result.current[0].reason,'RUNTIME_CHANGED');
});

test('importable generated client changed after admission refuses freeze',t=>{
  const x=setup(t);x.write('.prisma-client/index.js',"require('node:fs').writeFileSync('unadmitted-executed.txt','sentinel');exports.PrismaClient=function changed(){};");
  const r=x.cli('freeze');assert.equal(r.status,1);assert.match(r.stderr,/PREPARATION_ADMISSION_CHANGED/);
  assert.equal(existsSync(join(x.root,spec,'evidence')),false);
  assert.equal(existsSync(join(x.root,'unadmitted-executed.txt')),false);
});
test('raw unsafe generation streams never reach a persisted report',t=>{
  const x=setup(t),out=join(x.root,'withheld-output.json');
  for(const raw of [Buffer.from('-----BEGIN PRIVATE KEY-----\n'+'A'.repeat(80)+'\n-----END PRIVATE KEY-----'),Buffer.from([255,254,65,0]),Buffer.from([255,254,253])]) {
    assert.throws(()=>recordGenerationResult(out,{status:0,stdout:raw,stderr:Buffer.alloc(0)}),/PREPARATION_OUTPUT_WITHHELD/);
    assert.equal(existsSync(out),false);
    assert.throws(()=>recordGenerationResult(out,{status:0,stderr:raw,stdout:Buffer.alloc(0)}),/PREPARATION_OUTPUT_WITHHELD/);
    assert.equal(existsSync(out),false);
  }
});
test('valid raw generation stream is encoded only after validation and never overwritten',t=>{
  const x=setup(t),out=join(x.root,'safe-output.json'),result={status:0,stdout:Buffer.from('synthetic\n'),stderr:Buffer.alloc(0)};
  recordGenerationResult(out,result);assert.equal(JSON.parse(readFileSync(out)).stdout,'synthetic\n');
  assert.throws(()=>recordGenerationResult(out,result),/EEXIST/);
});
