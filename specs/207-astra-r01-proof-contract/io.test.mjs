import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const spec='specs/207-astra-r01-proof-contract',old='specs/206-gpt6-astra-endvera-reverification';
function setup(t) {
  const root=mkdtempSync(join(tmpdir(),'endvera-r01-io-'));
  t.after(()=>{
    const absolute=resolve(root),parent=resolve(tmpdir());
    assert(absolute.startsWith(parent+requireSeparator()) && absolute.includes('endvera-r01-io-'));
    rmSync(absolute,{recursive:true,force:true});
  });
  function write(p,bytes){mkdirSync(resolve(root,p,'..'),{recursive:true});writeFileSync(join(root,p),bytes);}
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath='+join(root,'no-hooks'),...args],{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const commit=()=>{git('add','.');git('-c','user.name=Synthetic contract test','-c','user.email=synthetic@example.invalid','commit','-qm','fixture');return git('rev-parse','HEAD');};
  git('init','-q');git('config','core.autocrlf','false');
  write('.gitignore','node_modules/\n');write('README.md','Entirely synthetic local test fixture.\n');
  write(`${old}/phase-checks-r0b/network-guard.cjs`,"'use strict';\n");
  const historicalHead=commit();
  for(const name of ['campaign.mjs','protocol.mjs'])write(`${spec}/${name}`,readFileSync(new URL(name,import.meta.url)));
  write(`${spec}/probe.mjs`,"console.log(JSON.stringify({complete:true}));\n");
  const c=JSON.parse(readFileSync(new URL('contract.json',import.meta.url)));
  c.historicalSourceHead=historicalHead;c.checks=[{id:'PROBE',cwd:'.',args:[`${spec}/probe.mjs`],timeoutMs:1000,parser:{kind:'json',expected:{complete:true}}}];
  write(`${spec}/contract.json`,JSON.stringify(c)+'\n');
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
