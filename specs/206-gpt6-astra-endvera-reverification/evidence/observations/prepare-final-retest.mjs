import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
const s='specs/206-gpt6-astra-endvera-reverification';
const sourcePlan=JSON.parse(readFileSync(s+'/launch/g7-final/plan.json','utf8'));
const out=s+'/launch/g7-final-r2';
if(existsSync(out)||existsSync(s+'/scripts/run-g7-final-r2.mjs'))throw new Error('RETEST_KIT_ALREADY_EXISTS');
mkdirSync(out,{recursive:true});
const entries=[];
for(const e of sourcePlan.entries){
 const newId=e.id+'-r2';
 const convert=v=>JSON.parse(JSON.stringify(v).replaceAll(e.id,newId));
 const raw=convert(JSON.parse(readFileSync(e.descriptorPath,'utf8')));
 const wrapper=convert(JSON.parse(readFileSync(e.wrapperPath,'utf8')));
 const row=convert(e);row.descriptorPath=out+'/'+newId+'.json';row.wrapperPath=out+'/'+newId+'-wrapper.json';
 writeFileSync(row.descriptorPath,JSON.stringify(raw)+'\n',{flag:'wx'});
 writeFileSync(row.wrapperPath,JSON.stringify(wrapper)+'\n',{flag:'wx'});
 entries.push(row);
}
writeFileSync(out+'/plan.json',JSON.stringify({...sourcePlan,entries},null,2)+'\n',{flag:'wx'});
let run=readFileSync(s+'/scripts/run-g7-final.mjs','utf8');
for(const [a,b] of [['/launch/g7-final/plan.json','/launch/g7-final-r2/plan.json'],['/scripts/run-g7-final.mjs','/scripts/run-g7-final-r2.mjs'],['/evidence/G7-execution-summary.json','/evidence/G7-r2-execution-summary.json']]){
 if(!run.includes(a))throw new Error('RETEST_SOURCE_BINDING_MISSING');
 run=run.replaceAll(a,b);
}
writeFileSync(s+'/scripts/run-g7-final-r2.mjs',run,{flag:'wx'});
for(const id of ['g7-extra-root-tests','g7-local-oracle-denial','g7-local-synthetic-no-pii']){
 const d=JSON.parse(readFileSync(s+'/launch/'+id+'.json','utf8'));
 const next=JSON.parse(JSON.stringify(d).replaceAll(id,id+'-r2'));
 writeFileSync(s+'/launch/'+id+'-r2.json',JSON.stringify(next)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({kind:'ADDITIVE_G7_RETEST_KIT_PREPARED',rawCommands:36,originalDescriptorsUnchanged:true,frozenPhaseContractsUnchanged:true,resultSupersession:false}));
