import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
if(process.env.NODE_ENV!=='production'||process.env.NEXT_PHASE||['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET'].some(k=>process.env[k]))throw new Error('RUNTIME_PROBE_ENV_REFUSED');
const manifest=JSON.parse(readFileSync(resolve(root,'.next/server/app-paths-manifest.json')));
const require=createRequire(import.meta.url);
const outcomes=[];
for(const name of ['/api/upload/route','/api/files/[id]/download/route']){
  const path=manifest[name];
  if(typeof path!=='string'||path.includes('..')||!path.startsWith('app/'))throw new Error('COMPILED_ROUTE_MISSING');
  let refused=false;
  try{require(resolve(root,'.next/server',path));}
  catch(error){refused=String(error.message).includes('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET must all be set in production.');}
  outcomes.push({route:name,refused});
}
const passed=outcomes.every(o=>o.refused);
console.log(JSON.stringify({kind:'COMPILED_RUNTIME_STORAGE_REFUSED',passed,outcomes,scope:'COMPILED_MODULE_IMPORT_ONLY_NO_REQUEST_OR_DATABASE'}));
if(!passed)process.exitCode=1;
