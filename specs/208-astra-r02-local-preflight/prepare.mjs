import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { safeEnvironment, inspectPrerequisites, checkPrerequisites } from './preflight.mjs';
import { recordGenerationResult } from './preparation-output.mjs';
import { buildCurrentProjection, validateCurrentProjection } from '../../release/current-projection-v3.mjs';
import { fail, encode } from './protocol.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const spec='specs/208-astra-r02-local-preflight';
try {
  fail(!existsSync(resolve(root,spec,'evidence')),'PREPARATION_AFTER_FREEZE_REFUSED');
  fail(!existsSync(resolve(root,spec,'reports/preparation.json')),'PREPARATION_ALREADY_ADMITTED');
  const env=safeEnvironment(root);
  // Both native engines are already installed. Any remote download is denied
  // by the inherited Node network guard; no DB or engine query is invoked.
  for(const file of ['query_engine-windows.dll.node','schema-engine-windows.exe'])fail(existsSync(resolve(root,'node_modules/@prisma/engines',file)),'LOCAL_ENGINE_MISSING');
  Object.assign(env,{DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',DIRECT_URL:'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
    PRISMA_QUERY_ENGINE_LIBRARY:resolve(root,'node_modules/@prisma/engines/query_engine-windows.dll.node'),PRISMA_SCHEMA_ENGINE_BINARY:resolve(root,'node_modules/@prisma/engines/schema-engine-windows.exe'),PRISMA_GENERATE_SKIP_AUTOINSTALL:'1'});
  const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','generate','--schema','prisma/schema.prisma'],{cwd:root,env,windowsHide:true,timeout:90000});
  recordGenerationResult(resolve(root,spec,'reports/generation.json'),result);
  fail(result.status===0,'LOCAL_GENERATION_FAILED');
  const value=buildCurrentProjection();validateCurrentProjection(value);
  // Regenerated current configuration, never a rewrite of historical attestations.
  writeFileSync(resolve(root,'release/current-projection-v3.json'),encode(value));
  const prerequisites=await inspectPrerequisites(root);
  writeFileSync(resolve(root,spec,'reports/preparation.json'),encode({kind:'LOCAL_PREPARATION',...prerequisites,dbConnected:false,providerCalls:0}),{flag:'wx'});
  await checkPrerequisites(root);
  console.log('LOCAL_PREPARATION_PASS');
}catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_PREPARATION_REFUSED');process.exitCode=1;}
