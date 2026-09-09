import { readFileSync, readdirSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha, encode, fail, same } from './protocol.mjs';

export function assertNoEnvironmentFiles(root) {
  for(const directory of ['','prisma','apps/mobile']) {
    const dir=resolve(root,directory);
    if(!existsSync(dir))continue;
    fail(!readdirSync(dir).some(name=>name.startsWith('.env')&&!['.env.example','.env.sample'].includes(name)),'ENV_FILE_REFUSED');
  }
}
export function safeEnvironment(root) {
  assertNoEnvironmentFiles(root);
  const env={};
  for(const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','NUMBER_OF_PROCESSORS']) {
    const found=Object.keys(process.env).find(k=>k.toLowerCase()===key.toLowerCase());if(found)env[found]=process.env[found];
  }
  return {...env,CI:'1',NEXT_TELEMETRY_DISABLED:'1',EXPO_NO_TELEMETRY:'1',EXPO_OFFLINE:'1',npm_config_offline:'true',DO_NOT_TRACK:'1',NO_COLOR:'1',CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'1',
    NODE_OPTIONS:`--require="${resolve(root,'specs/206-gpt6-astra-endvera-reverification/phase-checks-r0b/network-guard.cjs').replaceAll('\\','/')}"`};
}
export function generatedClientFingerprint(root) {
  const directory=resolve(root,'.prisma-client');
  fail(existsSync(directory),'GENERATED_CLIENT_MISSING');
  fail(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink(),'GENERATED_CLIENT_LINK_REFUSED');
  fail(realpathSync(directory)===directory,'GENERATED_CLIENT_PATH_REFUSED');
  const files=[];
  function walk(dir,prefix='') {
    for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      fail(!entry.isSymbolicLink(),'GENERATED_CLIENT_LINK_REFUSED');
      const path=prefix+entry.name,full=join(dir,entry.name);
      if(entry.isDirectory())walk(full,path+'/');
      else {fail(entry.isFile(),'GENERATED_CLIENT_FILE_REFUSED');files.push({path,sha256:sha(readFileSync(full))});}
    }
  }
  walk(directory);
  for(const file of ['index.js','package.json','schema.prisma'])fail(files.some(f=>f.path===file),'GENERATED_CLIENT_INCOMPLETE');
  const source=readFileSync(resolve(root,'prisma/schema.prisma'));
  // Prisma preserves semantic schema text but may materialize line endings.
  const normalized=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n').trim();
  fail(normalized(source)===normalized(readFileSync(join(directory,'schema.prisma'))),'GENERATED_SCHEMA_MISMATCH');
  return {path:'.prisma-client',fileCount:files.length,treeSha256:sha(encode(files)),schemaSha256:sha(source)};
}
export function smokeImport(root) {
  const result=spawnSync(process.execPath,['-e',"const p=require('./.prisma-client');if(typeof p.PrismaClient!=='function')process.exit(2);console.log('PRISMA_IMPORT_ONLY_OK');"],
    {cwd:root,env:safeEnvironment(root),encoding:'utf8',timeout:20000,windowsHide:true});
  fail(result.status===0&&result.stdout.trim()==='PRISMA_IMPORT_ONLY_OK','GENERATED_CLIENT_IMPORT_FAILED');
}
export async function inspectPrerequisites(root) {
  assertNoEnvironmentFiles(root);
  const client=generatedClientFingerprint(root);
  // Import local source, never a caller-supplied projection validator.
  const {readCurrentProjection}=await import(new URL('../../release/current-projection-v3.mjs',import.meta.url));
  const projection=readCurrentProjection(root);
  return {client,projection,projectionSha256:sha(readFileSync(resolve(root,'release/current-projection-v3.json')))};
}
export async function checkPrerequisites(root) {
  const actual=await inspectPrerequisites(root);
  const path=resolve(root,'specs/208-astra-r02-local-preflight/reports/preparation.json');
  fail(existsSync(path),'PREPARATION_ADMISSION_MISSING');
  const admitted=JSON.parse(readFileSync(path,'utf8'));
  fail(admitted.kind==='LOCAL_PREPARATION'&&admitted.dbConnected===false&&admitted.providerCalls===0&&
    same(admitted.client,actual.client)&&same(admitted.projection,actual.projection)&&admitted.projectionSha256===actual.projectionSha256,'PREPARATION_ADMISSION_CHANGED');
  // Never execute the client before its exact bytes have passed admission.
  smokeImport(root);
  return actual;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));await checkPrerequisites(root);console.log(JSON.stringify({kind:'LOCAL_PREFLIGHT',passed:true,dbConnected:false})); }
  catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_PREFLIGHT_REFUSED');process.exitCode=1;}
}
