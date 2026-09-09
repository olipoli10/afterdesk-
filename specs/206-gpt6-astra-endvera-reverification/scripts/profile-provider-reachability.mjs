import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import { findProviderExecutionReachability, findUnresolvedDynamicModuleReachability, findDynamicCodeExecutionReachability } from '../../../src/lib/construction-operating-assistant-r37l/provider-reachability.ts';

const root=process.cwd();
const collect=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collect(resolve(directory,entry.name)):/\.(?:ts|tsx)$/u.test(entry.name)?[resolve(directory,entry.name)]:[]);
const start=performance.now();
const paths=collect(resolve(root,'src'));
const modules=new Map(paths.map(path=>[relative(root,path).replaceAll('\\','/'),readFileSync(path,'utf8')]));
const loadMs=performance.now()-start;
const session=new Session();session.connect();
const post=(method,args={})=>new Promise((done,reject)=>session.post(method,args,(error,result)=>error?reject(error):done(result)));
await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
const measurements=[];
for(const [name,analyze] of [['provider',findProviderExecutionReachability],['computed-import',findUnresolvedDynamicModuleReachability],['dynamic-code',findDynamicCodeExecutionReachability]]){
 const before=performance.now();const result=analyze(modules);
 measurements.push({name,durationMs:performance.now()-before,findingCount:result.length});
}
const {profile}=await post('Profiler.stop');session.disconnect();
const counts=new Map();for(const id of profile.samples??[])counts.set(id,(counts.get(id)??0)+1);
const sampledFunctions=profile.nodes.map(node=>({function:node.callFrame.functionName||'(anonymous)',file:node.callFrame.url.replaceAll('\\','/').split('/').slice(-3).join('/'),samples:counts.get(node.id)??0})).filter(node=>node.samples>0).sort((a,b)=>b.samples-a.samples).slice(0,20);
process.stdout.write(JSON.stringify({kind:'LOCAL_SOURCE_GRAPH_PROFILE',moduleCount:modules.size,sourceBytes:[...modules.values()].reduce((n,s)=>n+Buffer.byteLength(s),0),loadMs,measurements,totalCpuSamples:profile.samples?.length??0,sampledFunctions,providerCalls:0},null,2)+'\n');
