import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const base='specs/206-gpt6-astra-endvera-reverification';
const planPath=`${base}/launch/g7-final/plan.json`;
const json=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'}).trim();
const fail=(ok,code)=>{if(!ok)throw new Error(code);};
const plan=json(planPath);
fail(plan.entries.length===36&&plan.workerCount===1,'G7_PLAN_CARDINALITY_INVALID');
fail(new Set(plan.entries.flatMap(e=>[e.id,`${e.id}-wrapper`])).size===72,'G7_COMMAND_IDS_DUPLICATED');
for(const variant of ['CANONICAL_FROZEN','CORRECTED_R0B'])fail(plan.entries.filter(e=>e.variant===variant).length===18,'G7_VARIANT_CARDINALITY_INVALID');
const inputPaths=new Set([planPath,`${base}/evaluation-contracts/phase-check.mjs`,`${base}/scripts/record-command.mjs`,`${base}/scripts/run-g7-final.mjs`]);
for(const entry of plan.entries) {
 const kit=entry.variant==='CANONICAL_FROZEN'?'phase-checks':'phase-checks-r0b';
 const commandsPath=`${base}/${kit}/commands.json`;const manifest=json(commandsPath);
 const source=manifest.commands.find(c=>c.phase==='G7'&&c.checkId===entry.checkId);
 const descriptor=json(entry.descriptorPath);const wrapper=json(entry.wrapperPath);
 fail(source&&descriptor.id===entry.id&&descriptor.command===source.command&&JSON.stringify(descriptor.args)===JSON.stringify(source.args)&&descriptor.classification===source.classification&&descriptor.executable===source.executable&&descriptor.cwd===source.cwd&&descriptor.timeoutMs===source.timeoutMs,'G7_DESCRIPTOR_NOT_EXACT_KIT_COMMAND');
 fail(entry.contractPath===`${base}/${kit}/PHASE_CHECK_CONTRACTS.json`&&wrapper.id===`${entry.id}-wrapper`&&wrapper.args[0]===`${base}/evaluation-contracts/phase-check.mjs`&&wrapper.args[1]==='--revalidation-replay'&&wrapper.args[2]===entry.contractPath&&wrapper.args[3]===entry.observationPath,'G7_REPLAY_BINDING_INVALID');
 const contract=json(entry.contractPath).checks.find(c=>c.phase==='G7'&&c.checkId===entry.checkId);
 fail(contract&&hash(source.command)===contract.commandSha256,'G7_FROZEN_COMMAND_HASH_INVALID');
 for(const dep of manifest.frozenDependencies) {
  fail(hash(readFileSync(resolve(root,dep.path)))===dep.sha256,'G7_KIT_DEPENDENCY_DRIFT');inputPaths.add(dep.path);
 }
 for(const path of [commandsPath,entry.descriptorPath,entry.wrapperPath,entry.contractPath])inputPaths.add(path);
}
const bindings=[...inputPaths].map(path=>({path,sha256:hash(readFileSync(resolve(root,path)))}));
if(process.argv[2]==='--validate-only') {
 console.log(JSON.stringify({kind:'G7_PLAN_VALIDATED',rawCommands:36,replayCommands:36,canonical:18,corrected:18,workerCount:1,executedPhaseChecks:0,boundInputs:bindings.length}));
} else {
 const finalHead=process.argv[2];
 fail(/^[a-f0-9]{40}$/.test(finalHead??''),'FINAL_HEAD_ARGUMENT_REQUIRED');
 const finalTree=git('rev-parse',`${finalHead}^{tree}`);
 const stable=()=>{
  fail(git('rev-parse','HEAD')===finalHead&&git('rev-parse','HEAD^{tree}')===finalTree,'FINAL_HEAD_OR_TREE_CHANGED');
  fail(git('diff','--name-only','HEAD')==='','FINAL_TRACKED_CHECKOUT_NOT_CLEAN');
  for(const input of bindings)fail(hash(readFileSync(resolve(root,input.path)))===input.sha256,'G7_EXECUTION_INPUT_CHANGED');
 };
 stable();
 const summaryPath=`${base}/evidence/G7-execution-summary.json`;
 fail(!existsSync(resolve(root,summaryPath)),'G7_SUMMARY_ALREADY_EXISTS');
 for(const entry of plan.entries)for(const path of [entry.observationPath,`${base}/evidence/commands/${entry.id}`,`${base}/evidence/commands/${entry.id}-wrapper`])fail(!existsSync(resolve(root,path)),'G7_OUTPUT_ALREADY_EXISTS');
 const record=descriptorPath=>new Promise((done,reject)=>{
  const child=spawn(process.execPath,[`${base}/scripts/record-command.mjs`,descriptorPath],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  child.once('error',reject);child.once('close',done);
 });
 const results=[];
 for(const entry of plan.entries) {
  stable();console.log(JSON.stringify({kind:'G7_CHECK_STARTED',id:entry.id,variant:entry.variant}));
  await record(entry.descriptorPath);
  const recordPath=`${base}/evidence/commands/${entry.id}/command.json`;
  fail(existsSync(resolve(root,recordPath)),'G7_RAW_RECORD_MISSING_STOP');
  const observed=json(recordPath);
  fail(observed.observedHead===finalHead&&observed.observedTree===finalTree,'G7_RECORDED_HEAD_MISMATCH');
  const observation={kind:'PHASE_CHECK_OBSERVATION',campaignId:observed.campaignId,phase:'G7',checkId:entry.checkId,observedCommandId:observed.id,observedHead:observed.observedHead,observedTree:observed.observedTree,classification:observed.classification,command:observed.command,expectedExitCode:observed.expectedExitCode,exitCode:observed.exitCode,stdoutPath:observed.stdoutPath,stdoutSha256:observed.stdoutSha256,stderrPath:observed.stderrPath,stderrSha256:observed.stderrSha256};
  mkdirSync(dirname(resolve(root,entry.observationPath)),{recursive:true});
  writeFileSync(resolve(root,entry.observationPath),JSON.stringify(observation,null,2)+'\n',{flag:'wx'});
  await record(entry.wrapperPath);
  const wrapperRecord=json(`${base}/evidence/commands/${entry.id}-wrapper/command.json`);
  fail(wrapperRecord.exitCode===0,'G7_REPLAY_EXECUTION_FAILED_STOP');
  const replay=json(wrapperRecord.stdoutPath);
  fail(replay.kind==='PHASE_CHECK_RESULT'&&replay.observedCommandId===entry.id,'G7_REPLAY_RESULT_IDENTITY_INVALID');
  const stdout=readFileSync(resolve(root,observed.stdoutPath),'utf8');
  const ownership=[...stdout.matchAll(/DATABASE_OWNERSHIP engine=PrismaDev-PGlite name=(endvera206-[a-f0-9]+) databasePort=(\d+)/g)];
  const databaseCleanup=ownership.length?ownership.every(match=>stdout.includes(`DATABASE_SERVER_CLOSED name=${match[1]} retainedSyntheticStore=true`))?'OWNED_DATABASE_SERVERS_CLOSED':'OWNED_DATABASE_CLOSURE_UNCONFIRMED':'NO_DATABASE_OWNERSHIP_REPORTED';
  const diagnosticPath=`${base}/evidence/commands/${entry.id}/runner-diagnostic.json`;
  const diagnostic=existsSync(resolve(root,diagnosticPath))?json(diagnosticPath):null;
  results.push({id:entry.id,variant:entry.variant,checkId:entry.checkId,rawExitCode:observed.exitCode,result:replay.result,reason:replay.reason,databaseCleanup,rawRecord:recordPath,replayRecord:`${base}/evidence/commands/${entry.id}-wrapper/command.json`});
  console.log(JSON.stringify({kind:'G7_CHECK_RECORDED',...results.at(-1)}));
  stable();
  fail(databaseCleanup!=='OWNED_DATABASE_CLOSURE_UNCONFIRMED','G7_OWNED_DATABASE_CLEANUP_UNCONFIRMED_STOP');
  fail(!diagnostic?.timedOut||diagnostic.cleanupStatus==='OWNED_PROCESS_TREE_STOPPED','G7_PROCESS_CLEANUP_UNCONFIRMED_STOP');
 }
 stable();
 const summary={kind:'G7_EXECUTION_RECORD_INDEX',observedHead:finalHead,observedTree:finalTree,workerCount:1,trackedCheckoutClean:true,globalPassClaimed:false,originalsNotSuperseded:true,results};
 writeFileSync(resolve(root,summaryPath),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({kind:summary.kind,summaryPath,records:results.length,globalPassClaimed:false}));
}
