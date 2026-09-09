import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const path='src/lib/construction-operating-assistant-r37l/provider-reachability.ts';
const baselineCommit=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(baselineCommit??''))throw new Error('PROFILE_BASELINE_COMMIT_REQUIRED');
const root=process.cwd();
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(directory,entry.name)):/\.(?:ts|tsx)$/u.test(entry.name)?[resolve(directory,entry.name)]:[]);
const modules=new Map(files(resolve(root,'src')).map(path=>[relative(root,path).replaceAll('\\','/'),readFileSync(path,'utf8')]));
const localRequire=createRequire(import.meta.url);
function analyzer(source){
 let parseCount=0;
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const dependency=(name)=>name==='typescript'?{...ts,createSourceFile:(...args)=>{parseCount++;return ts.createSourceFile(...args);}}:localRequire(name);
 const api={};new Function('require','exports',output)(dependency,api);
 return {api,count:()=>parseCount,reset:()=>{parseCount=0;}};
}
const baseline=analyzer(execFileSync('git',['show',`${baselineCommit}:${path}`],{encoding:'utf8',windowsHide:true}));
const current=analyzer(readFileSync(path,'utf8'));
const measurements=[];
for(let repetition=0;repetition<3;repetition++)for(const [variant,implementation] of [['baseline',baseline],['current',current]])for(const method of ['findProviderExecutionReachability','findUnresolvedDynamicModuleReachability','findDynamicCodeExecutionReachability']){
 implementation.reset();const start=performance.now();const result=implementation.api[method](modules);
 measurements.push({repetition,variant,method,durationMs:performance.now()-start,modulesParsed:implementation.count(),findingCount:result.length});
}
process.stdout.write(JSON.stringify({kind:'PAIRED_LOCAL_SOURCE_GRAPH_PROFILE',baselineCommit,moduleCount:modules.size,repetitions:3,measurements,providerCalls:0},null,2)+'\n');
