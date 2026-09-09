import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd();const fixture=mkdtempSync(join(tmpdir(),'endvera206-closure-reproducer-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const original=JSON.parse(readFileSync(resolve(root,'release/endvera-construction-v1/whole-product-closure-audit.json'),'utf8'));
const fixed=['src/app/page.tsx','src/app/textassist/page.tsx','src/app/construction/page.tsx','src/app/account-deletion/page.tsx','release/endvera-construction-v1/native-preflight-readiness.json','release/endvera-construction-v1/release-manifest.json','release/endvera-construction-v1/backend-activation-readiness.json'];
const unrelated=['package.json','tsconfig.json','AGENTS.md','apps/mobile/package.json','apps/mobile/app.json','prisma/schema.prisma','scripts/register-server-only.cjs'];
try {
 for(const path of new Set([...fixed,...unrelated,...original.protectedInputs.map(x=>x.path)])) {const target=resolve(fixture,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(resolve(root,path)));}
 process.chdir(fixture);
 const {validateWholeProductClosure}=await import(pathToFileURL(resolve(root,'scripts/validate-endvera-whole-product-closure.mjs')).href);
 const honest={...original,protectedInputs:original.protectedInputs.map(x=>({...x,sha256:sha(readFileSync(resolve(fixture,x.path)))}))};
 const substitution={...honest,protectedInputs:unrelated.map(path=>({path,sha256:sha(readFileSync(resolve(fixture,path)))}))};
 for(const [id,value] of [['ASTRA-R0-PRODUCT-001',honest],['ASTRA-R0-PRODUCT-003',substitution]]) {
  try {const result=validateWholeProductClosure(value);console.log(JSON.stringify({id,observation:'STATIC_FIXTURE_ACCEPTED_WITHOUT_EXECUTION_PROOF',result,behavioralRunEvidencePresent:false,substitutedUnrelatedSet:id.endsWith('003')}));}
  catch(error){console.log(JSON.stringify({id,observation:'REJECTED',errorCode:error.message}));}
 }
}finally{process.chdir(root);rmSync(fixture,{recursive:true,force:true});}
