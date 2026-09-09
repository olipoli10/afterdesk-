// Executes the source text in the Sol R2 packet as the before snapshot. No
// historical files are edited. Mutable test inputs remain synthetic/in-memory.
import { readFileSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync } from 'node:fs';
import { execFileSync,spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { resolve,relative,isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as currentBinding from '../../../scripts/endvera-release-source-binding.mjs';
import { validateMobileReleaseMetadata } from '../../../scripts/endvera-release-source-contracts.mjs';
import { buildReleaseManifest } from '../../../scripts/generate-endvera-release-package.mjs';
const root=process.cwd(),spec='specs/206-gpt6-astra-endvera-reverification';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const packetPath=`${spec}/evidence/commands/g3-release-binding-correction-review-r2/stderr.txt`;
const packet=JSON.parse(readFileSync(packetPath,'utf8').split(/\r?\n/).find(line=>line.startsWith('[{"path":')));
const sourceMaterializations=[];
const command=JSON.parse(readFileSync(`${spec}/evidence/commands/g3-release-binding-correction-review-r2/command.json`,'utf8'));
if(hash(readFileSync(packetPath))!==command.stderrSha256)throw new Error('BASELINE_PACKET_RAW_HASH_MISMATCH');
function oldSource(path){const item=packet.find(item=>item.path===path);if(!item)throw new Error('BASELINE_SOURCE_ABSENT');const lf=item.source.split('\n').map(line=>line.replace(/^\d+: /,'')).join('\n');const exact=[lf,lf.replaceAll('\n','\r\n')].find(source=>hash(source)===item.sha256);const source=exact??lf;sourceMaterializations.push({path,reportedOriginalByteSha256:item.sha256,materializedSha256:hash(source),originalBytesRecovered:exact!==undefined});return source;}
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const bindingUrl=url(oldSource('scripts/endvera-release-source-binding.mjs'));
const typescriptUrl=pathToFileURL(createRequire(resolve(root,'package.json')).resolve('typescript')).href;
const contractsUrl=url(oldSource('scripts/endvera-release-source-contracts.mjs').replace("from 'typescript'",`from ${JSON.stringify(typescriptUrl)}`).replace("from './endvera-release-source-binding.mjs'",`from ${JSON.stringify(bindingUrl)}`));
const generatorUrl=url(oldSource('scripts/generate-endvera-release-package.mjs').replace('from "./endvera-release-source-binding.mjs"',`from ${JSON.stringify(bindingUrl)}`).replace('from "./endvera-release-source-contracts.mjs"',`from ${JSON.stringify(contractsUrl)}`).replace('const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));',`const scriptDirectory = ${JSON.stringify(resolve(root,'scripts'))};`));
const oldBinding=await import(bindingUrl),oldContracts=await import(contractsUrl),oldGenerator=await import(generatorUrl);
const resultOf=fn=>{try{fn();return 'ACCEPTED';}catch(error){return error.message;}};
const definition=JSON.parse(readFileSync('release/endvera-construction-v1/release-definition-v3.json','utf8'));
const mobile=readFileSync('apps/mobile/src/lib/release.ts','utf8');
const results=[];
const mutable=mobile.replace('export const MOBILE_RELEASE_INFO','export let MOBILE_RELEASE_INFO');
results.push({id:'PRR2-004',mutation:'Mutable exported metadata declaration',before:resultOf(()=>oldContracts.validateMobileReleaseMetadata(mutable,definition)),after:resultOf(()=>validateMobileReleaseMetadata(mutable,definition))});
const easPath=resolve(root,'apps/mobile/eas.json');
const reader=(file,encoding)=>{if(resolve(String(file))!==easPath)return readFileSync(file,encoding);const value=JSON.parse(readFileSync(file,'utf8'));value.build['founder-device'].autoIncrement=true;return encoding?JSON.stringify(value):Buffer.from(JSON.stringify(value));};
const options={sourceHead:'a'.repeat(40),sourceTree:'b'.repeat(40),readFile:reader};
results.push({id:'PRR2-003',mutation:'In-memory EAS founder profile drift',before:resultOf(()=>oldGenerator.buildReleaseManifest(options)),after:resultOf(()=>buildReleaseManifest(options))});
const sourceHead='a9c4c01fdb2fcdff3838a6966f1560832bc32553',sourceTree=execFileSync('git',['rev-parse',`${sourceHead}^{tree}`],{encoding:'utf8',windowsHide:true}).trim();
const bytes=readFileSync('AGENTS.md'),manifest={source:{head:sourceHead,tree:sourceTree},inputs:[{path:'AGENTS.md',byteSize:bytes.length,sha256:hash(bytes)}]};
results.push({id:'PRR2-002',mutation:'Actual tracked source differences outside the single unchanged bound input versus prior source commit',before:resultOf(()=>oldBinding.assertReleaseSourceBinding({repositoryRoot:root,manifest})),after:resultOf(()=>currentBinding.assertReleaseSourceBinding({repositoryRoot:root,manifest})),sourceHead});
const directory=mkdtempSync(resolve(root,'.release-r2-repro-'));
try{
 const real=resolve(directory,'real'),link=resolve(directory,'root-link');mkdirSync(real);writeFileSync(resolve(real,'input.txt'),'synthetic');symlinkSync(real,link,'junction');
 results.push({id:'PRR2-001',mutation:'Actual synthetic junction repository root',before:resultOf(()=>oldBinding.assertReleaseRegularFile(link,'input.txt')),after:resultOf(()=>currentBinding.assertReleaseRegularFile(link,'input.txt'))});
 for(const [id,name] of [['PRR2-005','validate-endvera-native-preflight.mjs'],['PRR2-006','validate-endvera-mobile-build-readiness.mjs']]){
  const repo=resolve(directory,id),outside=resolve(directory,`${id}-outside`);mkdirSync(resolve(repo,'scripts'),{recursive:true});mkdirSync(resolve(repo,'apps'));mkdirSync(outside);writeFileSync(resolve(outside,'app.json'),'INVALID_SYNTHETIC_JSON');symlinkSync(outside,resolve(repo,'apps/mobile'),'junction');
  for(const dependency of ['endvera-release-source-binding.mjs','endvera-mobile-build-contract.mjs'])writeFileSync(resolve(repo,'scripts',dependency),readFileSync(`scripts/${dependency}`));
  const run=source=>{writeFileSync(resolve(repo,'scripts',name),source);const result=spawnSync(process.execPath,[resolve(repo,'scripts',name)],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:10000});return{exitCode:result.status,rejectedBeforeJsonParse:result.stderr.includes('RELEASE_SOURCE_SYMLINK_REFUSED'),parsedExternalSyntheticJson:result.stderr.includes('Unexpected token')};};
  results.push({id,mutation:'Actual intermediate junction to invalid synthetic JSON',before:run(oldSource(`scripts/${name}`)),after:run(readFileSync(`scripts/${name}`,'utf8'))});
 }
}finally{const rel=relative(root,resolve(directory));if(isAbsolute(rel)||!rel.startsWith('.release-r2-repro-')||/[\\/]/.test(rel))throw new Error('REPRO_CLEANUP_SCOPE_INVALID');rmSync(directory,{recursive:true,force:true});}
const passed=results.every(result=>['PRR2-005','PRR2-006'].includes(result.id)?result.before.parsedExternalSyntheticJson&&result.after.rejectedBeforeJsonParse&&!result.after.parsedExternalSyntheticJson:result.before==='ACCEPTED'&&result.after!=='ACCEPTED');
console.log(JSON.stringify({kind:'RELEASE_R2_BEFORE_AFTER',sourcePacketPath:packetPath,sourcePacketSha256:hash(readFileSync(packetPath)),baselinePacketVerifiedAgainstCommandRecord:true,sourceMaterializations,results,expectedBoundaryBehaviorObserved:passed,manifestWritten:false,providerCalls:0,scope:'LOCAL_SYNTHETIC_READ_ONLY_PROBES_WITH_DISPOSABLE_FIXTURES',limitations:['Source packet normalizes presentation line endings; original mixed LF/CRLF bytes cannot always be recovered. Such source is replayed with LF endings and explicitly not claimed byte-identical.','No hostile concurrent filesystem process or malicious same-process isolation claim.','Tracked checkout gate excludes only its derived v3 manifest. Installed dependencies and untracked files are outside the Git-coherence claim.']},null,2));
process.exitCode=passed?0:1;
