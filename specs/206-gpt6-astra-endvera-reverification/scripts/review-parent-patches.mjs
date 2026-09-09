// Distinct implementation lane, same Astra model. Read-only diagnostic review.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildReleaseManifest } from '../../../scripts/generate-endvera-release-package.mjs';
import { validateReleaseManifest } from '../../../scripts/validate-endvera-release-package.mjs';
import { assertReleaseSourceBinding } from '../../../scripts/endvera-release-source-binding.mjs';
const spec = 'specs/206-gpt6-astra-endvera-reverification';
const files = ['src/lib/construction-assistant-v1/interpreter.ts','test/unit/calendar-dst-revalidation.test.ts','src/app/layout.tsx','src/lib/construction-operating-assistant-r35/registry.ts','release/endvera-construction-v1/release-definition-v3.json','scripts/generate-endvera-release-package.mjs','scripts/validate-endvera-release-package.mjs','scripts/validate-endvera-mobile-build-readiness.mjs','scripts/validate-endvera-native-preflight.mjs','apps/mobile/src/lib/release.ts','apps/mobile/app.json','apps/mobile/eas.json','package.json','test/unit/parent-patch-dst-review.test.ts',`${spec}/scripts/review-parent-patches.mjs`];
const sourceHashes = files.map(path => ({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
sourceHashes.push({path:'scripts/endvera-release-source-binding.mjs',sha256:createHash('sha256').update(readFileSync('scripts/endvera-release-source-binding.mjs')).digest('hex')});
const definition = JSON.parse(readFileSync(files[4], 'utf8'));
const webPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const findings = [];
if (definition.identities.find(x => x.target === 'WEB').semanticVersion !== webPackage.version) findings.push({id:'PARENT-PATCH-WEB-IDENTITY',severity:'P2',classification:'FACT',introducedByPatch:true,summary:'V3 WEB semanticVersion differs from the Web package version.',expected:webPackage.version,actual:definition.identities.find(x => x.target === 'WEB').semanticVersion});
let syntheticSourceAccepted = false, productionBindingRejection = null;
try {
 const manifest = buildReleaseManifest({sourceHead:'0'.repeat(40),sourceTree:'1'.repeat(40)});
 validateReleaseManifest({manifest}); syntheticSourceAccepted = true;
 try { assertReleaseSourceBinding({repositoryRoot:process.cwd(),manifest}); } catch (error) { productionBindingRejection = error.message; }
} catch {}
if (syntheticSourceAccepted && productionBindingRejection !== 'RELEASE_SOURCE_COMMIT_NOT_FOUND') findings.push({id:'RELEASE-SOURCE-PROVENANCE',severity:'P2',classification:'FACT',introducedByPatch:false,summary:'Synthetic source was not rejected by production Git binding. No manifest written.'});
const fontAssets = [...readFileSync('src/app/layout.tsx','utf8').matchAll(/src: "([^"]+\.woff2)"/g)].map(([,path]) => {
 const bytes = readFileSync(resolve('src/app',path));
 return {path,byteSize:bytes.length,woff2MagicValid:bytes.subarray(0,4).toString('ascii') === 'wOF2',sha256:createHash('sha256').update(bytes).digest('hex')};
});
const args = ['--require',`./${spec}/phase-checks/network-guard.cjs`,'node_modules/vitest/vitest.mjs','run','test/unit/calendar-dst-revalidation.test.ts','test/unit/parent-patch-dst-review.test.ts','test/construction-operating-assistant-r35-release-package.test.ts','--reporter=json','--maxWorkers=1'];
let testExitCode = 0, testOutput;
try { testOutput = execFileSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:60000}); }
catch (error) { testExitCode = error.status ?? 1; testOutput = String(error.stdout ?? ''); }
const testReport = testOutput.split(/\r?\n/).map(line => {try{return JSON.parse(line);}catch{return null;}}).find(item => item?.testResults);
console.log(JSON.stringify({kind:'DISTINCT_LANE_PATCH_REVIEW',reviewer:{model:'gpt-6-astra',sameModelAsImplementation:true,independentModelReview:false,lane:'g0_invariants',provenanceCorrectionAuthoredByReviewer:true,provenanceCorrectionNeedsSeparateReview:true},reviewStatus:findings.length||testExitCode?'FINDINGS':'NO_FINDING_IN_REVIEWED_SCOPE',sourceHashes,findings,fontAssets,nextPackageVersion:webPackage.dependencies.next,syntheticFactorySourceAcceptedWithoutObservationClaim:syntheticSourceAccepted,productionBindingRejection,testExecution:{executable:process.execPath,args,exitCode:testExitCode,stdout:testOutput,parsed:testReport?{total:testReport.numTotalTests,passed:testReport.numPassedTests,failed:testReport.numFailedTests}:null},limitations:['No browser or fresh installation run; bundled fonts verified only against pinned installed Next package.','No provider, signing, upload or device execution.','No manifest written; actual v3 source provenance must be checked after committing inputs.','Toronto spring/fall boundaries covered; no universal historical timezone claim.','Provenance correction is self-reviewed here and requires another reviewer.']},null,2));
process.exitCode = testExitCode;
