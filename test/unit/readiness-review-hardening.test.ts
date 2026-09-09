import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCurrentProjection,validateCurrentProjection} from '../../release/current-projection-v3.mjs';
import {validateMarketReadiness} from '../../scripts/validate-endvera-market-readiness.mjs';
import {validateWholeProductClosure} from '../../scripts/validate-endvera-whole-product-closure.mjs';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const json=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
describe('Readiness review: no manufactured historical or current attestation',()=>{
 it('rejects redefining historical bytes by rewriting the adjacent archive index',()=>{
  const archive=json('release/current-projection-v3.history.json');const target=archive.entries[0].path;
  const changed=Buffer.from(JSON.stringify({...json(target),status:'forged static report'}));
  archive.entries[0].checkoutSha256=hash(changed);
  const reader=((path:Parameters<typeof readFileSync>[0])=>String(path)===resolve(target)?changed:String(path)===resolve('release/current-projection-v3.history.json')?Buffer.from(JSON.stringify(archive)):readFileSync(path)) as typeof readFileSync;
  expect(()=>buildCurrentProjection({readFile:reader})).toThrow('HISTORICAL_ARCHIVE_ANCHOR_MISMATCH');
 });
 it('rejects a caller-supplied validation reader even with coherent fixture bytes',()=>{
  expect(()=>validateCurrentProjection(buildCurrentProjection(),{readFile:readFileSync})).toThrow('CURRENT_VALIDATION_READER_OVERRIDE_REFUSED');
 });
 it('rejects non-schema top-level market flags instead of accepting truthy strings',()=>{
  const r=json('release/endvera-construction-v1/market-readiness-report.json');r.sourceHashes=r.sourceHashes.map((x:{path:string})=>({...x,sha256:hash(readFileSync(x.path))}));
  for(const flag of ['deployed','published','productionReady']) expect(()=>validateMarketReadiness({...r,[flag]:'yes'})).toThrow('MARKET_READINESS_CLAIM_INFLATION_REFUSED');
 });
 it('rejects inflated platform claims in the historical closure report itself',()=>{
  const r=json('release/endvera-construction-v1/whole-product-closure-audit.json');r.protectedInputs=r.protectedInputs.map((x:{path:string})=>({...x,sha256:hash(readFileSync(x.path))}));
  for(const target of ['IOS','ANDROID']) expect(()=>validateWholeProductClosure({...r,platforms:r.platforms.map((p:{target:string})=>p.target===target?{...p,binaryBuilt:true}:p)})).toThrow('CLOSURE_PLATFORM_CLAIM_INVALID');
 });
 it('qualifies standalone metadata and current approval capability in both languages',()=>{
  const source=readFileSync('src/app/construction/page.tsx','utf8');
  expect(source).toContain('description: "Démonstration locale');expect(source).toContain('description: "Local demonstration');
  expect(source).toContain('Aucun envoi réel, même après approbation');expect(source).toContain('No live sending, even after approval');
 });
});
