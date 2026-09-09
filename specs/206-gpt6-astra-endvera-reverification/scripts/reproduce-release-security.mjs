// Actual previous committed implementation vs working correction; all mutations
// are in-memory or disposable synthetic files, never historical/product edits.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { buildReleaseManifest } from '../../../scripts/generate-endvera-release-package.mjs';
import { isExactCheckoutCrlfEquivalent } from '../../../scripts/endvera-release-source-binding.mjs';
const root=process.cwd(),baselineHead='a9c4c01fdb2fcdff3838a6966f1560832bc32553';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseline=path=>execFileSync('git',['show',`${baselineHead}:${path}`],{windowsHide:true,encoding:'utf8'});
const bindingPath='scripts/endvera-release-source-binding.mjs',generatorPath='scripts/generate-endvera-release-package.mjs';
const oldBinding=baseline(bindingPath),oldGenerator=baseline(generatorPath);
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const adjusted=oldGenerator.replace('from "./endvera-release-source-binding.mjs"',`from ${JSON.stringify(dataUrl(oldBinding))}`).replace('const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));',`const scriptDirectory = ${JSON.stringify(resolve(root,'scripts'))};`);
const previous=await import(dataUrl(adjusted));
const options={repositoryRoot:root,sourceHead:'a'.repeat(40),sourceTree:'b'.repeat(40)};
const outcome=fn=>{try{fn();return 'ACCEPTED';}catch(error){return error.message;}};
const mobilePath=resolve(root,'apps/mobile/src/lib/release.ts'),routePath=resolve(root,'src/app/account-deletion/page.tsx');
const alteredMobile=(path,encoding)=>{const bytes=readFileSync(path,encoding);if(resolve(String(path))!==mobilePath)return bytes;const text=String(bytes).replace('semanticVersion: "0.1.1"','semanticVersion: "0.9.9"');return encoding?text:Buffer.from(text);};
const absentRoute=(path,encoding)=>{if(resolve(String(path))===routePath)throw new Error('SYNTHETIC_MISSING_PUBLIC_ROUTE');return readFileSync(path,encoding);};
const results=[
 {id:'PR-003',mutation:'In-memory exported mobile version drift',before:outcome(()=>previous.buildReleaseManifest({...options,readFile:alteredMobile})),after:outcome(()=>buildReleaseManifest({...options,readFile:alteredMobile}))},
 {id:'PR-004',mutation:'In-memory read failure for declared account-deletion page',before:outcome(()=>previous.buildReleaseManifest({...options,readFile:absentRoute})),after:outcome(()=>buildReleaseManifest({...options,readFile:absentRoute}))},
];
const ast=ts.createSourceFile(bindingPath,oldBinding,ts.ScriptTarget.Latest,false);let originalCondition;
const visit=node=>{if(ts.isIfStatement(node)&&node.expression.getText(ast).includes('textInput &&'))originalCondition=node.expression.getText(ast);ts.forEachChild(node,visit);};visit(ast);
if(!originalCondition)throw new Error('ORIGINAL_CRLF_BRANCH_NOT_FOUND');
const originalCrlf=new Function('working','blob',`const decoded=working.toString('utf8');const textInput=true;return (${originalCondition});`);
results.push({id:'PR-002',mutation:'Exact old branch: committed CRLF versus working CRCRLF',before:originalCrlf(Buffer.from('a\r\r\n'),Buffer.from('a\r\n')),after:isExactCheckoutCrlfEquivalent(Buffer.from('a\r\r\n'),Buffer.from('a\r\n'),'file.txt'),scope:'Original conditional branch executed, not a fabricated Git commit.'});
const directory=mkdtempSync(resolve(root,'.release-security-repro-'));
try{
 const repo=resolve(directory,'repo'),outside=resolve(directory,'outside');mkdirSync(repo);mkdirSync(outside);mkdirSync(resolve(outside,'endvera-construction-v1'));writeFileSync(resolve(outside,'endvera-construction-v1/release-definition-v3.json'),'{}');symlinkSync(outside,resolve(repo,'release'),'junction');
 let reads=0;const reader=(...args)=>{reads++;return readFileSync(...args);};
 const before=outcome(()=>previous.buildReleaseManifest({...options,repositoryRoot:repo,readFile:reader})),beforeReads=reads;reads=0;
 const after=outcome(()=>buildReleaseManifest({...options,repositoryRoot:repo,readFile:reader}));
 results.push({id:'PR-001',mutation:'Real synthetic definition junction outside fixture repository',before,beforeExternalReads:beforeReads,after,afterExternalReads:reads});
}finally{const rel=relative(root,resolve(directory));if(isAbsolute(rel)||!rel.startsWith('.release-security-repro-')||rel.includes('/')||rel.includes('\\'))throw new Error('REPRO_CLEANUP_SCOPE_INVALID');rmSync(directory,{recursive:true,force:true});}
const expected=results.every(result=>result.id==='PR-001'?result.beforeExternalReads>0&&result.afterExternalReads===0&&result.after==='RELEASE_SOURCE_SYMLINK_REFUSED':result.id==='PR-002'?result.before===true&&result.after===false:result.before==='ACCEPTED'&&result.after!=='ACCEPTED');
console.log(JSON.stringify({kind:'RELEASE_SECURITY_BEFORE_AFTER',baselineHead,baselineSourceHashes:[{path:bindingPath,sha256:hash(oldBinding)},{path:generatorPath,sha256:hash(oldGenerator)}],workingSourceHashes:[bindingPath,generatorPath,'scripts/endvera-release-source-contracts.mjs'].map(path=>({path,sha256:hash(readFileSync(path))})),expectedBoundaryBehaviorObserved:expected,results,productionExecution:false,providerCalls:0,manifestWritten:false,temporarySyntheticFixtureRemoved:true},null,2));
process.exitCode=expected?0:1;
