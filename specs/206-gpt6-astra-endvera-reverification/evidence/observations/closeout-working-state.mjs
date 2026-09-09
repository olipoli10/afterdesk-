import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {createHash} from 'node:crypto';
const s='specs/206-gpt6-astra-endvera-reverification';
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();
const root=process.cwd(), original='C:/dev/nightlexicon-endvera-construction-operating-assistant-r10-r12-autonomous', brain='C:/dev/afterdesk-project-brain';
const states=[['campaign',root],['protectedOriginal',original],['brain',brain]].map(([name,path])=>({name,path,head:git(path,'rev-parse','HEAD'),tree:git(path,'rev-parse','HEAD^{tree}'),trackedDiff:git(path,'diff','--name-only','HEAD'),status:git(path,'status','--short')}));
const owners=[],web=[];
for(const dir of readdirSync(s+'/evidence/commands')){
 const p=s+'/evidence/commands/'+dir+'/command.json';
 if(!existsSync(p))continue;
 const c=JSON.parse(readFileSync(p,'utf8')),out=readFileSync(c.stdoutPath,'utf8');
 for(const m of out.matchAll(/DATABASE_OWNERSHIP engine=PrismaDev-PGlite name=(endvera206-[a-f0-9]+) databasePort=(\d+)/g)){
  owners.push({commandId:dir,name:m[1],port:Number(m[2]),closeMarker:out.includes('DATABASE_SERVER_CLOSED name='+m[1]+' retainedSyntheticStore=true')});
 }
 if(dir.includes('http-smoke')||dir.includes('critical-route')){
  for(const m of out.matchAll(/Local:\s+http:\/\/127\.0\.0\.1:(\d+)/g))web.push({commandId:dir,port:Number(m[1]),closeMarker:out.includes('OWNED_WEB_PROCESS_SHUTDOWN_CONFIRMED')});
 }
}
const ports=[...new Set([...owners,...web].map(x=>x.port))];
const listenerChecks=await Promise.all(ports.map(port=>new Promise(done=>{
 const socket=createConnection({host:'127.0.0.1',port});let finished=false;
 const finish=listening=>{if(finished)return;finished=true;socket.destroy();done({port,listening});};
 socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(1000,()=>finish(null));
})));
const result={kind:'LOCAL_CLOSEOUT_STATE',observedAt:new Date().toISOString(),states,databaseOwnershipRecords:owners,webOwnershipRecords:web,listenerChecks,allReportedDatabaseClosuresConfirmed:owners.every(x=>x.closeMarker),allReportedWebClosuresConfirmed:web.every(x=>x.closeMarker),processesKilledByThisCheck:0,retainedSyntheticStoresDeleted:false};
const invariant=states[0].head==='baa38383d590eb531ef98c584e257b73c3bff4cc'&&states[0].trackedDiff===''&&states[1].head==='7f369989533f994cfb5828498d80624d4bdfcfa9'&&states[1].status===''&&states[2].status===''&&result.allReportedDatabaseClosuresConfirmed&&result.allReportedWebClosuresConfirmed&&listenerChecks.every(x=>x.listening===false);
console.log(JSON.stringify({...result,verified:invariant,payloadSha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')},null,2));
process.exitCode=invariant?0:1;
