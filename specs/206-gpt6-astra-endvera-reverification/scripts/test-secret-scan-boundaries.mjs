import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const base='specs/206-gpt6-astra-endvera-reverification/scripts/';
function scanner(file){
 const source=readFileSync(base+file,'utf8');
 const match=/const secretPatterns\s*=\s*\[/u.exec(source);
 assert(match,'scanner declaration must exist');
 const end=source.indexOf('];',match.index)+2;
 assert(end>match.index,'scanner declaration must terminate');
 const patterns=runInNewContext(source.slice(match.index,end)+'; secretPatterns;',Object.create(null),{timeout:1000});
 return text=>patterns.some(pattern=>{pattern.lastIndex=0;return pattern.test(text);});
}
// All test material is constructed dummy text. Never load or print a credential.
const digest='0'.repeat(5)+'ac'+'0'.repeat(57);
const accountSid='AC'+'1'.repeat(32), keySid='SK'+'2'.repeat(32);
test('canonical original still reproduces the SHA256 substring false positive',()=>{
 assert.equal(digest.length,64);
 assert.equal(scanner('validate-revalidation-seal.mjs')(digest),true);
});
for(const file of ['validate-revalidation-seal-r0b.mjs','record-command.mjs','assemble-local-seal.mjs']){
 test(`${file}: digest substrings are not standalone Twilio tokens`,()=>{
  const detect=scanner(file);
  for(const value of [digest,digest.toUpperCase(),'abc'+accountSid+'def','name_'+keySid+'_suffix'])assert.equal(detect(value),false);
 });
 test(`${file}: isolated SID and other credential-shape detection remains enabled`,()=>{
  const detect=scanner(file);
  for(const value of [accountSid,keySid,accountSid.toLowerCase(),keySid.toLowerCase(),JSON.stringify({value:accountSid}),`sid=${keySid};`,'sk-'+'X'.repeat(24),'sk-or-v1-'+'X'.repeat(24),'ghp_'+'X'.repeat(24),'AKIA'+'X'.repeat(16)])assert.equal(detect(value),true);
 });
}
