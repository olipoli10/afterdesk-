import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const s='specs/206-gpt6-astra-endvera-reverification',finalHead=process.argv[2];
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
if(!/^[a-f0-9]{40}$/.test(finalHead??''))throw new Error('FINAL_HEAD_REQUIRED');
const finalTree=git('rev-parse',finalHead+'^{tree}');
const ids=['root-tests','mobile-tests','voice-spend','root-build','mobile-build','http-smoke','backlog','legacy-queue','recorder-integrity'].map(n=>'g7-extra-'+n);
const descriptors=ids.map(id=>({id,path:s+'/launch/'+id+'.json'}));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const d of descriptors){d.hash=hash(readFileSync(d.path));if(existsSync(s+'/evidence/commands/'+d.id))throw new Error('FINAL_EXTRA_ALREADY_EXISTS');}
const stable=()=>{if(git('rev-parse','HEAD')!==finalHead||git('diff','--name-only','HEAD')!=='')throw new Error('FINAL_EXTRA_TRACKED_INPUT_DRIFT');for(const d of descriptors)if(hash(readFileSync(d.path))!==d.hash)throw new Error('FINAL_EXTRA_DESCRIPTOR_DRIFT');};
const results=[];
for(const d of descriptors){
stable();console.log(JSON.stringify({kind:'FINAL_EXTRA_STARTED',id:d.id}));
await new Promise((done,reject)=>{const c=spawn(process.execPath,[s+'/scripts/record-command.mjs',d.path],{windowsHide:true,stdio:'inherit'});c.once('error',reject);c.once('close',done);});
const c=JSON.parse(readFileSync(s+'/evidence/commands/'+d.id+'/command.json','utf8'));
if(c.observedHead!==finalHead||c.observedTree!==finalTree)throw new Error('FINAL_EXTRA_OBSERVED_HEAD_MISMATCH');
const stdout=readFileSync(c.stdoutPath,'utf8');
const ownership=[...stdout.matchAll(/DATABASE_OWNERSHIP engine=PrismaDev-PGlite name=(endvera206-[a-f0-9]+) databasePort=(\d+)/g)];
const databaseCleanup=ownership.length?ownership.every(match=>stdout.includes(`DATABASE_SERVER_CLOSED name=${match[1]} retainedSyntheticStore=true`))?'OWNED_DATABASE_SERVERS_CLOSED':'OWNED_DATABASE_CLOSURE_UNCONFIRMED':'NO_DATABASE_OWNERSHIP_REPORTED';
const diagnosticPath=s+'/evidence/commands/'+d.id+'/runner-diagnostic.json';
const diagnostic=existsSync(diagnosticPath)?JSON.parse(readFileSync(diagnosticPath,'utf8')):null;
results.push({id:d.id,exitCode:c.exitCode,stdoutPath:c.stdoutPath,stderrPath:c.stderrPath,stdoutSha256:c.stdoutSha256,stderrSha256:c.stderrSha256,databaseCleanup,runnerCleanup:diagnostic?.cleanupStatus??null});
stable();console.log(JSON.stringify({kind:'FINAL_EXTRA_RECORDED',...results.at(-1)}));
if(databaseCleanup==='OWNED_DATABASE_CLOSURE_UNCONFIRMED')throw new Error('FINAL_EXTRA_DATABASE_CLEANUP_UNCONFIRMED');
if(diagnostic?.timedOut&&diagnostic.cleanupStatus!=='OWNED_PROCESS_TREE_STOPPED')throw new Error('FINAL_EXTRA_PROCESS_CLEANUP_UNCONFIRMED');
}
const result={kind:'FINAL_EXTRA_EXECUTION_INDEX',finalHead,finalTree,allChecksExecuted:results.length===ids.length,globalPassClaimed:false,results};
writeFileSync(s+'/evidence/observations/final-extra-index.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
