import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha, encode, secretFlags, safePath, parseCheck, validateLedger, validateContract, gitSourceBytesEqual } from './protocol.mjs';

const base = JSON.parse(readFileSync(new URL('./contract.json',import.meta.url)));
function fixture(checkCount=1) {
  const c=structuredClone(base);
  c.checks=Array.from({length:checkCount},(_,i)=>({id:`LANE_${i}`,cwd:'.',args:['fixture.mjs'],timeoutMs:1000,parser:{kind:'json',expected:{complete:true}}}));
  const runtime=encode({kind:'SYNTHETIC_TEST_RUNTIME'});
  const f={schemaVersion:1,campaignId:c.campaignId,testedHead:'a'.repeat(40),testedTree:'b'.repeat(40),contractSha256:sha(encode(c)),runtimeSha256:sha(runtime),frozenAt:'2026-09-09T12:00:00.000Z'};
  const j=[],m=new Map([['freeze.json',encode(f)],['journal.json',encode(j)],['runtime.json',runtime]]);
  function add(checkId='LANE_0',out={complete:true},exit=0,kind='COMPLETED') {
    const n=j.length+1,id=`a${String(n).padStart(4,'0')}`,check=c.checks.find(x=>x.id===checkId);
    const e={id,sequence:n,checkId,campaignId:f.campaignId,testedHead:f.testedHead,testedTree:f.testedTree,commandSha256:sha(encode(check)),startedAt:`2026-09-09T12:00:${String(n).padStart(2,'0')}.000Z`,previous:j.length?sha(encode(j.at(-1))):null};
    j.push(e);m.set(`attempts/${id}/intent.json`,encode(e));m.set('journal.json',encode(j));
    if(kind==='MISSING')return e;
    const outBytes=typeof out==='string'?Buffer.from(out):encode(out),err=Buffer.alloc(0);
    const r={kind,finishedAt:e.startedAt,exitCode:kind==='INCIDENT'?null:exit,stdoutSha256:kind==='INCIDENT'?null:sha(outBytes),stderrSha256:kind==='INCIDENT'?null:sha(err),incident:kind==='INCIDENT'?'SECRET_OUTPUT_WITHHELD':null,runtimeVerified:true};
    m.set(`attempts/${id}/result.json`,encode(r));
    if(kind!=='INCIDENT'){m.set(`attempts/${id}/stdout.txt`,outBytes);m.set(`attempts/${id}/stderr.txt`,err);}
    return e;
  }
  const run=()=>validateLedger(c,f,j,[...m.keys()],p=>{assert(m.has(p),`missing ${p}`);return m.get(p);});
  const sync=()=>{for(const e of j)m.set(`attempts/${e.id}/intent.json`,encode(e));m.set('journal.json',encode(j));};
  return {c,f,j,m,add,run,sync};
}
test('committed contract has closed authority and meaningful checks',()=>validateContract(base));
test('eight audit-like attempts preserve four incomplete reports and select four fresh reports',()=>{
  const x=fixture(4);for(let i=0;i<4;i++)x.add(`LANE_${i}`,{});for(let i=0;i<4;i++)x.add(`LANE_${i}`);
  const r=x.run();assert.equal(r.attempts.length,8);assert.equal(r.historicalAttemptFailures,4);assert.equal(r.currentFailures,0);assert.equal(r.contractCheckVerdict,'LOCAL_CHECKS_PASS');
});
test('later failure wins over earlier green',()=>{const x=fixture();x.add();x.add('LANE_0',{},1);assert.equal(x.run().currentFailures,1);});
test('later incomplete wins over earlier green',()=>{const x=fixture();x.add();x.add('LANE_0',{},0,'MISSING');assert.equal(x.run().currentIncomplete,1);});
test('missing checks cannot silently pass',()=>{const x=fixture(2);x.add();assert.equal(x.run().currentIncomplete,1);});
test('missing attempt cannot be hidden by editing journal count',()=>{const x=fixture();x.add();x.add();x.j.pop();assert.throws(x.run,/EVIDENCE_SET_MISMATCH/);});
test('unexpected stream cannot be hidden outside manifest',()=>{const x=fixture();x.add();x.m.set('attempts/a9000/stdout.txt',Buffer.from('extra'));assert.throws(x.run,/EVIDENCE_SET_MISMATCH/);});
test('duplicate attempt id refused',()=>{const x=fixture();x.add();x.add();x.j[1].id='a0001';assert.throws(x.run,/ATTEMPT_ID_REFUSED/);});
test('changed previous hash refused',()=>{const x=fixture();x.add();x.add();x.j[1].previous='bad';x.sync();assert.throws(x.run,/JOURNAL_CHAIN_REFUSED/);});
test('wrong tested head refused',()=>{const x=fixture();x.add();x.j[0].testedHead='c'.repeat(40);x.sync();assert.throws(x.run,/ATTEMPT_BINDING_REFUSED/);});
test('wrong tested tree refused',()=>{const x=fixture();x.add();x.j[0].testedTree='c'.repeat(40);x.sync();assert.throws(x.run,/ATTEMPT_BINDING_REFUSED/);});
test('wrong lane refused',()=>{const x=fixture();x.add();x.j[0].checkId='UNKNOWN';x.sync();assert.throws(x.run,/ATTEMPT_BINDING_REFUSED/);});
test('command substitution refused',()=>{const x=fixture();x.add();x.j[0].commandSha256='c'.repeat(64);x.sync();assert.throws(x.run,/ATTEMPT_BINDING_REFUSED/);});
test('pre-freeze timestamp refused',()=>{const x=fixture();x.add();x.j[0].startedAt='2020-01-01T00:00:00Z';x.sync();assert.throws(x.run,/ATTEMPT_TIME_REFUSED/);});
test('raw whitespace tampering refused',()=>{const x=fixture();x.add();x.m.set('attempts/a0001/stdout.txt',Buffer.from('{"complete":true}\r\n'));assert.throws(x.run,/STREAM_HASH_REFUSED/);});
test('exit zero plus incomplete JSON remains failure',()=>{const x=fixture();x.add('LANE_0',{});assert.equal(x.run().currentFailures,1);});
test('exit zero plus semantic FAIL remains failure',()=>{const x=fixture();x.add('LANE_0',{result:'FAIL'});assert.equal(x.run().currentFailures,1);});
test('nonzero exit with success-shaped text remains failure',()=>{const x=fixture();x.add('LANE_0',{complete:true},1);assert.equal(x.run().currentFailures,1);});
test('incident remains incomplete with no invented streams or exit',()=>{const x=fixture();x.add('LANE_0',{},0,'INCIDENT');assert.equal(x.run().currentIncomplete,1);});
test('invented incident exit refused',()=>{const x=fixture();x.add('LANE_0',{},0,'INCIDENT');const p='attempts/a0001/result.json',r=JSON.parse(x.m.get(p));r.exitCode=0;x.m.set(p,encode(r));assert.throws(x.run,/INCIDENT_REFUSED/);});
test('invented incident stream refused',()=>{const x=fixture();x.add('LANE_0',{},0,'INCIDENT');x.m.set('attempts/a0001/stdout.txt',Buffer.from(''));assert.throws(x.run,/EVIDENCE_SET_MISMATCH/);});
test('unknown field cannot inject claimed PASS',()=>{const x=fixture();x.add();x.j[0].status='PASS';x.sync();assert.throws(x.run,/SHAPE_REFUSED/);});
test('mutated parser refuses the frozen hash',()=>{const x=fixture();x.add();x.c.checks[0].parser.expected={};assert.throws(x.run,/FREEZE_REFUSED/);});
test('empty check list cannot be green',()=>{const x=fixture();x.c.checks=[];assert.throws(()=>validateContract(x.c),/CHECK_SET_REFUSED/);});
test('duplicate check ids refused',()=>{const x=fixture();x.c.checks.push(x.c.checks[0]);assert.throws(()=>validateContract(x.c),/CHECK_SET_REFUSED/);});
test('provider authority cannot be asserted',()=>{const c=structuredClone(base);c.authority='PROVIDER_ALLOWED';assert.throws(()=>validateContract(c),/CONTRACT_AUTHORITY_REFUSED/);});
test('product PASS cannot be asserted',()=>{const c=structuredClone(base);c.productVerdict='PASS';assert.throws(()=>validateContract(c),/CONTRACT_AUTHORITY_REFUSED/);});
test('digest embedded token substring is not a token exemption',()=>{
  const digest='11'+'ac'+'a'.repeat(32)+'b'.repeat(28);assert.equal(digest.length,64);assert.deepEqual(secretFlags(digest),[]);
  assert(secretFlags(JSON.stringify({sha256:'AC'+'a'.repeat(32)})).includes('TWILIO_TOKEN'));
});
test('provider-shaped synthetic token is rejected without echo',()=>{
  const token=['sk','or','v1'].join('-')+'-'+'x'.repeat(25);assert.deepEqual(secretFlags(token),['PROVIDER_TOKEN']);
  const x=fixture();x.add('LANE_0',token);assert.throws(x.run,e=>e.message==='SECRET_OUTPUT_REFUSED'&&!e.message.includes(token));
});
test('header marker is not a private key but body is denied',()=>{
  const header=['-----BEGIN','PRIVATE KEY-----'].join(' ');assert.deepEqual(secretFlags(header),[]);
  assert(secretFlags(header+'\n'+'A'.repeat(32)).includes('PRIVATE_KEY_BODY'));
});
test('absolute, traversal, Windows aliases and empty components refused',()=>{
  for(const p of ['/a','C:/a','../a','a/../b','a//b','a\\b','a:stream','a/./b'])assert.throws(()=>safePath(p),/PATH_REFUSED/);
});
test('vitest summary requires actual passing assertions',()=>{
  const report={success:true,numFailedTests:0,numFailedTestSuites:0,numPassedTests:10,testResults:[]};
  assert.equal(parseCheck({kind:'vitest',minimumPassed:1},encode(report),Buffer.alloc(0),0).status,'FAIL');
});
test('empty TAP cannot pass on exit zero',()=>assert.equal(parseCheck({kind:'tap',minimumPassed:1},Buffer.from(''),Buffer.alloc(0),0).status,'FAIL'));
test('valid TAP derives counts not a caller supplied verdict',()=>assert.deepEqual(parseCheck({kind:'tap',minimumPassed:2},Buffer.from('ok 1 - a\nok 2 - b\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'),Buffer.alloc(0),0),{status:'PASS',passed:2}));
test('contradictory TAP summaries refused',()=>assert.equal(parseCheck({kind:'tap',minimumPassed:1},Buffer.from('# pass 20\n# fail 0\n# pass 19\n# fail 1\n'),Buffer.alloc(0),0).status,'FAIL'));
test('failed Vitest assertion cannot hide behind green summary',()=>{
  const report={success:true,numFailedTests:0,numFailedTestSuites:0,numPassedTests:1,testResults:[{status:'passed',assertionResults:[{status:'passed'},{status:'failed'}]}]};
  assert.equal(parseCheck({kind:'vitest',minimumPassed:1},encode(report),Buffer.alloc(0),0).status,'FAIL');
});
test('failed Vitest suite cannot hide behind green summary',()=>{
  const report={success:true,numFailedTests:0,numFailedTestSuites:0,numPassedTests:1,testResults:[{status:'failed',assertionResults:[{status:'passed'}]}]};
  assert.equal(parseCheck({kind:'vitest',minimumPassed:1},encode(report),Buffer.alloc(0),0).status,'FAIL');
});
test('UTF16 and invalid UTF8 outputs are withheld',()=>{
  assert.deepEqual(secretFlags(Buffer.from('Bearer '+'x'.repeat(24),'utf16le')),['NON_UTF8_OUTPUT']);
  assert.deepEqual(secretFlags(Buffer.from([255,254,4])),['NON_UTF8_OUTPUT']);
});
test('labeled access key is withheld',()=>assert(secretFlags('SAUCE_ACCESS_KEY='+'x'.repeat(36)).includes('NAMED_SECRET')));
test('unverified runtime cannot be a completed passing attempt',()=>{
  const x=fixture();x.add();const p='attempts/a0001/result.json',r=JSON.parse(x.m.get(p));r.runtimeVerified=false;x.m.set(p,encode(r));assert.throws(x.run,/NATIVE_RECORD_REFUSED/);
});
test('Windows device and trailing-dot aliases refused',()=>{
  for(const p of ['NUL','a/CON.txt','a/file.','COM1'])assert.throws(()=>safePath(p),/PATH_REFUSED/);
});
test('actual Next dynamic routes and space-containing filenames remain readable',()=>{
  assert.equal(safePath('src/app/(client)/projects/[id]/page.tsx'),'src/app/(client)/projects/[id]/page.tsx');
  assert.equal(safePath('reports/local report.md'),'reports/local report.md');
});
test('Git LF source permits only exact CRLF materialization',()=>{
  const b=Buffer.from('first\nsecond\n');assert(gitSourceBytesEqual(b,Buffer.from('first\r\nsecond\r\n')));
  assert(!gitSourceBytesEqual(b,Buffer.from('first\r\nsecond\n')));
  assert(!gitSourceBytesEqual(b,Buffer.from('first\rsecond\r')));
  assert(!gitSourceBytesEqual(b,Buffer.from('changed\r\nsecond\r\n')));
  assert(!gitSourceBytesEqual(Buffer.from([0,10]),Buffer.from([0,13,10])));
});
