import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Assembly only: no phase execution, evidence writes, provider calls or verdict defaults.
// Parent must persist the emitted JSON and run the canonical seal validator afterward.
// Uses corrected scanner boundaries for provisional assembly only. The unchanged
// canonical scanner has a reproduced digest false positive; this is not a bypass
// or proof of canonical validation. Diagnostic r0b validation cannot grant PASS.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const spec='specs/206-gpt6-astra-endvera-reverification';
const metrics=['roadmap','localBuildReadiness','c2','realProviderCustomerReadiness','verifiedE2E'];
const phases=['G0','G1','G2','G3','G4','G5','G6','G7'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const demand=(condition,code)=>{if(!condition)throw new Error(`ASSEMBLY_${code}`);};
function pathOf(path){
 demand(typeof path==='string'&&path.length>0&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').some(part=>['','.','..'].includes(part)),'PATH_INVALID');
 const absolute=resolve(root,path),rel=relative(root,absolute);
 demand(!isAbsolute(rel)&&rel!==''&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'),'PATH_ESCAPE');
 return absolute;
}
const secretPatterns=[
 /sk-or-v1-[A-Za-z0-9_-]{20,}/u,/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u,/gh[pousr]_[A-Za-z0-9]{20,}/u,
 /AKIA[0-9A-Z]{16}/u,/AIza[0-9A-Za-z_-]{20,}/u,/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
 /(?:OPENAI_API_KEY|OPENROUTER_API_KEY|TWILIO_AUTH_TOKEN)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>)[^\s"',}]{16,}/iu,
 /(?:api[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|password|secret)\s*["']?\s*[:=]\s*["']?(?!REDACTED|\[REDACTED\]|<REDACTED>|null\b|false\b)[A-Za-z0-9_./+=:@-]{16,}/iu,
 /Bearer\s+[A-Za-z0-9_./+=-]{20,}/iu,/postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s/]+@/iu,/\bAC[0-9a-f]{32}\b/iu,/\bSK[0-9a-f]{32}\b/iu,
 /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
];
function safe(bytes){demand(!secretPatterns.some(pattern=>pattern.test(bytes.toString('utf8'))),'SECRET_MATERIAL_REFUSED');return bytes;}
const bytes=path=>safe(readFileSync(pathOf(path)));
const json=path=>JSON.parse(bytes(path).toString('utf8'));
function gitAt(cwd,args,{optional=false,binary=false}={}){
 const r=spawnSync('git',args,{cwd,windowsHide:true,encoding:binary?null:'utf8',maxBuffer:64*1024*1024});
 if(optional&&r.status!==0)return null;
 demand(!r.error&&r.status===0,'GIT_PROOF_FAILED');return binary?r.stdout:r.stdout.trim();
}
const git=(...args)=>gitAt(root,args);
function walk(directory){return readdirSync(pathOf(directory),{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(`${directory}/${item.name}`):[`${directory}/${item.name}`]);}
function checkCommand(command){
 demand(command&&typeof command.id==='string'&&phases.includes(command.phase),'COMMAND_SHAPE_INVALID');
 demand(Number.isInteger(command.exitCode)&&Number.isInteger(command.expectedExitCode),'COMMAND_EXIT_MISSING');
 demand(Number.isFinite(Date.parse(command.startedAt))&&Date.parse(command.finishedAt)>=Date.parse(command.startedAt),'COMMAND_TIME_INVALID');
 demand(hash(bytes(command.stdoutPath))===command.stdoutSha256&&hash(bytes(command.stderrPath))===command.stderrSha256,'COMMAND_STREAM_HASH_MISMATCH');
 demand(command.classification!=='PROVIDER_CALL'&&command.providerAttemptRequestId===null,'PROVIDER_EVIDENCE_FORBIDDEN_IN_LOCAL_ASSEMBLY');
 return command;
}
function loadCommands(path){const value=json(path);demand(value.kind==='COMMAND_LOG'&&Array.isArray(value.commands),'COMMAND_LOG_INVALID');value.commands.forEach(checkCommand);demand(new Set(value.commands.map(c=>c.id)).size===value.commands.length,'COMMAND_DUPLICATE');return value;}
function commandLog(config){
 demand(typeof config.commandDirectory==='string','COMMAND_DIRECTORY_REQUIRED');
 const commandPaths=walk(config.commandDirectory).filter(path=>path.endsWith('/command.json')).sort();
 demand(commandPaths.length>0,'NO_OBSERVED_COMMANDS');
 const commands=commandPaths.map(path=>checkCommand(json(path))).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt)||a.id.localeCompare(b.id));
 demand(new Set(commands.map(c=>c.id)).size===commands.length,'COMMAND_DUPLICATE');
 return {kind:'COMMAND_LOG',commands};
}
function metricReport(config){
 const commands=loadCommands(config.commandLogPath).commands;
 demand(config.metricCommandIds&&Object.keys(config.metricCommandIds).length===5,'FIVE_METRIC_COMMANDS_REQUIRED');
 const rubrics={};
 for(const metric of metrics){
  const command=commands.find(c=>c.id===config.metricCommandIds[metric]);
  demand(command&&command.phase==='G7'&&command.classification==='METRIC_CALCULATION'&&command.exitCode===0&&command.expectedExitCode===0,'METRIC_COMMAND_NOT_SUCCESSFUL_G7');
  const calculation=json(command.stdoutPath);
  demand(calculation.kind==='METRIC_CALCULATION'&&calculation.metric===metric&&calculation.calculationCommandId===command.id,'METRIC_OUTPUT_IDENTITY_INVALID');
  demand(command.replay?.entrypointPath&&command.replay.entrypointSha256===calculation.rubricContractSha256,'METRIC_REPLAY_CONTRACT_MISSING');
  demand(hash(bytes(command.replay.entrypointPath))===calculation.rubricContractSha256,'METRIC_CONTRACT_HASH_MISMATCH');
  demand(calculation.evidencePaths.length===calculation.evidenceSha256.length&&calculation.evidencePaths.length>0,'METRIC_SUPPORT_MISSING');
  calculation.evidencePaths.forEach((path,index)=>demand(hash(bytes(path))===calculation.evidenceSha256[index],'METRIC_SUPPORT_HASH_MISMATCH'));
  const changed=calculation.startValue!==calculation.finalValue;
  demand(calculation.rubricCrossed===changed,'METRIC_CROSSING_MISMATCH');
  rubrics[metric]={startValue:calculation.startValue,finalValue:calculation.finalValue,changedFromStart:changed,rubricCrossed:changed,rubricContractPath:command.replay.entrypointPath,rubricContractSha256:calculation.rubricContractSha256,calculationEvidencePath:command.stdoutPath,calculationEvidenceSha256:command.stdoutSha256,calculationCommandId:command.id,evidencePaths:calculation.evidencePaths,evidenceSha256:calculation.evidenceSha256};
 }
 demand(new Set(Object.values(config.metricCommandIds)).size===5,'METRIC_COMMAND_REUSED');
 const start=String(rubrics.c2.startValue).match(/^(\d+)\/(\d+)$/),final=String(rubrics.c2.finalValue).match(/^(\d+)\/(\d+)$/);
 demand(start&&final,'C2_COUNT_FORMAT_INVALID');
 return {kind:'METRIC_REPORT',startRoadmapPercent:rubrics.roadmap.startValue,startLocalBuildReadinessPercent:rubrics.localBuildReadiness.startValue,startC2Completed:Number(start[1]),startC2Total:Number(start[2]),startRealProviderCustomerReadiness:rubrics.realProviderCustomerReadiness.startValue,startVerifiedE2EPercent:rubrics.verifiedE2E.startValue,roadmapPercent:rubrics.roadmap.finalValue,localBuildReadinessPercent:rubrics.localBuildReadiness.finalValue,c2Completed:Number(final[1]),c2Total:Number(final[2]),realProviderCustomerReadiness:rubrics.realProviderCustomerReadiness.finalValue,verifiedE2EPercent:rubrics.verifiedE2E.finalValue,rubrics};
}
function invariantManifest(config){
 const commands=loadCommands(config.commandLogPath).commands;
 demand(Array.isArray(config.invariants)&&config.invariants.length>0,'INVARIANT_INVENTORY_REQUIRED');
 const seen=new Set();
 const invariants=config.invariants.map(item=>{
  demand(typeof item.id==='string'&&typeof item.critical==='boolean'&&Object.hasOwn(item,'resultPath')&&!seen.has(item.id),'INVARIANT_INVENTORY_INVALID');seen.add(item.id);
  if(item.resultPath===null)return {id:item.id,critical:item.critical,observed:false,passed:null,evidencePaths:[],evidenceSha256:[]};
  const result=json(item.resultPath);
  demand(result.kind==='INVARIANT_RESULT'&&result.invariantId===item.id&&['PASS','FAIL'].includes(result.result),'INVARIANT_RESULT_INVALID');
  if(result.method==='AUTOMATED'){
   const command=commands.find(c=>c.id===result.commandId);
   demand(command&&command.phase!=='G6'&&command.classification==='INVARIANT_CHECK'&&command.stdoutPath===item.resultPath,'INVARIANT_COMMAND_NOT_OBSERVED');
   demand((command.exitCode===0)===(result.result==='PASS'),'INVARIANT_EXIT_RESULT_MISMATCH');
  }else demand(result.method==='DEVICE'&&result.deviceEvidencePath&&hash(bytes(result.deviceEvidencePath))===result.deviceEvidenceSha256,'DEVICE_PROOF_MISSING');
  return {id:item.id,critical:item.critical,observed:true,passed:result.result==='PASS',evidencePaths:[item.resultPath],evidenceSha256:[hash(bytes(item.resultPath))]};
 });
 return {kind:'INVARIANT_MANIFEST',invariants};
}

function assemble(config){
 const identityPath=`${spec}/CAMPAIGN_IDENTITY.json`,identity=json(identityPath);
 demand(typeof config.campaignHead==='string'&&typeof config.brainStartHead==='string'&&typeof config.brainRoot==='string','SOURCE_HEADS_REQUIRED');
 demand(config.providerAuthorityGranted===false&&config.providerBudgetGranted===false,'LOCAL_AUTHORITY_EXPLICITLY_REQUIRED');
 const brainRoot=resolve(config.brainRoot),finalHead=git('rev-parse','HEAD'),brainFinalHead=gitAt(brainRoot,['rev-parse','HEAD']);
 if(config.expectedFinalHead)demand(config.expectedFinalHead===finalHead,'FINAL_HEAD_CHANGED');
 const source={productHead:identity.sourceProductHead,productTree:git('rev-parse',`${identity.sourceProductHead}^{tree}`),specHead:identity.specHead,specTree:git('rev-parse',`${identity.specHead}^{tree}`),campaignHead:config.campaignHead,campaignTree:git('rev-parse',`${config.campaignHead}^{tree}`),campaignIdentityPath:identityPath,campaignIdentitySha256:hash(bytes(identityPath)),brainStartHead:config.brainStartHead,brainStartTree:gitAt(brainRoot,['rev-parse',`${config.brainStartHead}^{tree}`]),brainFinalHead,brainFinalTree:gitAt(brainRoot,['rev-parse',`${brainFinalHead}^{tree}`]),finalHead,finalTree:git('rev-parse',`${finalHead}^{tree}`)};
 const commands=loadCommands(config.commandLogPath).commands;
 demand(commands.every(c=>c.campaignId===identity.campaignId),'COMMAND_CAMPAIGN_MISMATCH');
 demand(git('status','--porcelain','--untracked-files=no')==='','TRACKED_WORKTREE_DIRTY');
 const artifacts=new Map();
 function add(path,role){
  if(path===null||path===undefined)return;
  demand(!(role==='EVALUATION_CONTRACT'&&path.includes('/grader-only/')),'ORACLE_MUST_NOT_BE_EVALUATION_CONTRACT');
  const existing=artifacts.get(path);
  if(existing){if(existing.role===role||role==='SUPPORTING_EVIDENCE')return;if(existing.role==='SUPPORTING_EVIDENCE'){if(role==='EVALUATION_CONTRACT'||role==='CORPUS_INPUT')demand(existing.origin==='CAMPAIGN_HEAD_BLOB','EVALUATION_INPUT_NOT_FROZEN');existing.role=role;return;}throw new Error('ASSEMBLY_ARTIFACT_ROLE_CONFLICT');}
  const content=bytes(path);
  const frozen=gitAt(root,['show',`${source.campaignHead}:${path}`],{optional:true,binary:true});
  const final=gitAt(root,['show',`${source.finalHead}:${path}`],{optional:true,binary:true});
  let origin,sourceCommit;
  if(frozen&&content.equals(frozen)){origin='CAMPAIGN_HEAD_BLOB';sourceCommit=source.campaignHead;}
  else if(final){demand(content.equals(final),'FINAL_ARTIFACT_DIFFERS_FROM_COMMIT');origin='FINAL_HEAD_BLOB';sourceCommit=source.finalHead;}
  else {origin='RUN_GENERATED';sourceCommit=null;}
  if(role==='EVALUATION_CONTRACT'||role==='CORPUS_INPUT')demand(origin==='CAMPAIGN_HEAD_BLOB','EVALUATION_INPUT_NOT_FROZEN');
  artifacts.set(path,{role,origin,sourceCommit,path,sha256:hash(content),bytes:content.length});
 }
 // Include every frozen evaluation file, not only the selected entrypoint.
 for(const path of git('ls-tree','-r','--name-only',source.campaignHead,'--',`${spec}/evaluation-contracts`).split(/\r?\n/).filter(Boolean))add(path,'EVALUATION_CONTRACT');
 add(identityPath,'EVALUATION_CONTRACT');
 for(const lane of ['canon-provenance','architecture-security','mobile-ux','product-coverage'])add(`${spec}/audit-prompts/${lane}.md`,'AUDIT_PROMPT');
 add(config.commandLogPath,'COMMAND_LOG');add(config.metricReportPath,'METRIC_REPORT');add(config.correctionReviewPath,'CORRECTION_REVIEW');add(config.invariantManifestPath,'INVARIANT_MANIFEST');
 for(const item of config.additionalArtifacts??[])add(item.path,item.role);
 const findingReports=[];
 for(const command of commands){
  const stdoutRole=command.phase==='G2'&&command.classification==='MODEL_AUDIT'?'FINDING_REPORT':command.classification==='PHASE_CHECK'?'PHASE_CHECK_RESULT':command.classification==='METRIC_CALCULATION'?'METRIC_CALCULATION':command.classification==='INVARIANT_CHECK'?'INVARIANT_RESULT':'RAW_OUTPUT';
  add(command.stdoutPath,stdoutRole);add(command.stderrPath,command.phase==='G2'?'MODEL_STDERR':'RAW_OUTPUT');
  if(command.replay){add(command.replay.entrypointPath,'EVALUATION_CONTRACT');command.replay.readPaths.forEach(path=>add(path,'SUPPORTING_EVIDENCE'));}
  if(stdoutRole==='FINDING_REPORT')findingReports.push(json(command.stdoutPath));
  if(stdoutRole==='PHASE_CHECK_RESULT'){
   const result=json(command.stdoutPath);add(result.contractPath,'EVALUATION_CONTRACT');add(result.observationPath,'SUPPORTING_EVIDENCE');
  }
 }
 const phaseRows=phases.map(id=>{
  if(id==='G6')return {id,status:'NOT_APPLICABLE',evidencePath:null,reasonCode:'NO_PROVIDER_AUTHORITY_OR_BUDGET'};
  const evidencePath=config.phaseEvidencePaths?.[id];demand(evidencePath,'PHASE_EVIDENCE_MISSING');
  const record=json(evidencePath);demand(record.kind==='PHASE_EVIDENCE'&&record.phase===id&&['PASS','REWORK','BLOCKED'].includes(record.status),'PHASE_EVIDENCE_INVALID');
  add(evidencePath,'PHASE_EVIDENCE');for(const check of record.checks)add(check.evidencePath,'SUPPORTING_EVIDENCE');
  const reasonCode=record.status==='BLOCKED'?config.phaseReasonCodes?.[id]:null;
  if(record.status==='BLOCKED')demand(typeof reasonCode==='string'&&reasonCode.length>0,'BLOCKED_PHASE_REASON_REQUIRED');
  return {id,status:record.status,evidencePath,reasonCode};
 });
 demand(findingReports.length===4&&new Set(findingReports.map(r=>r.auditLane)).size===4,'FOUR_NATIVE_AUDIT_REPORTS_REQUIRED');
 if(phaseRows.find(row=>row.id==='G2').status==='PASS')demand(findingReports.every(report=>report.status!=='INCOMPLETE'),'INCOMPLETE_AUDIT_CANNOT_PASS');
 for(const report of findingReports){
  const command=commands.find(item=>item.id===report.auditor.commandId);
  demand(command&&command.exitCode===0&&command.expectedExitCode===0&&command.classification==='MODEL_AUDIT'&&command.phase==='G2','AUDIT_COMMAND_NOT_SUCCESSFUL');
  demand(report.auditor.requestedModel===config.models?.codexAudit?.requestedModel&&report.sourceProductHead===source.productHead,'AUDIT_PROVENANCE_MISMATCH');
 }
 const allFindings=findingReports.flatMap(report=>report.findings);
 demand(new Set(allFindings.map(f=>f.id)).size===allFindings.length,'FINDING_ID_DUPLICATE');
 const correction=json(config.correctionReviewPath);demand(correction.kind==='CORRECTION_REVIEW','CORRECTIONS_RECORD_INVALID');
 const resolved=new Set(correction.corrections.filter(item=>item.resolved).map(item=>item.findingId));
 for(const item of correction.corrections){demand(allFindings.some(f=>f.id===item.findingId),'CORRECTION_UNKNOWN_FINDING');add(item.patchPath,'SUPPORTING_EVIDENCE');add(item.reviewEvidencePath,'SUPPORTING_EVIDENCE');}
 const open=allFindings.filter(f=>!resolved.has(f.id));
 const findingsSummary={total:allFindings.length,p0:allFindings.filter(f=>f.severity==='P0').length,p1:allFindings.filter(f=>f.severity==='P1').length,p2:allFindings.filter(f=>f.severity==='P2').length,p3:allFindings.filter(f=>f.severity==='P3').length,open:open.length,resolved:resolved.size,openP0:open.filter(f=>f.severity==='P0').length,openP1:open.filter(f=>f.severity==='P1').length};
 const metric=json(config.metricReportPath);demand(metric.kind==='METRIC_REPORT','METRIC_REPORT_INVALID');
 for(const key of metrics){const rubric=metric.rubrics[key];demand(rubric,'METRIC_RUBRIC_MISSING');add(rubric.rubricContractPath,'EVALUATION_CONTRACT');add(rubric.calculationEvidencePath,'METRIC_CALCULATION');rubric.evidencePaths.forEach(path=>add(path,'SUPPORTING_EVIDENCE'));}
 const metricValues={...metric};delete metricValues.kind;delete metricValues.rubrics;
 const invariant=json(config.invariantManifestPath);demand(invariant.kind==='INVARIANT_MANIFEST','INVARIANT_MANIFEST_INVALID');
 for(const item of invariant.invariants){for(const path of item.evidencePaths){add(path,'INVARIANT_RESULT');json(path).evidencePaths.forEach(dependency=>add(dependency,'SUPPORTING_EVIDENCE'));}}
 const critical=invariant.invariants.filter(item=>item.critical),observed=critical.filter(item=>item.observed);
 const corpus=config.corpusManifestPath===null?null:json(config.corpusManifestPath);
 if(corpus){add(config.corpusManifestPath,'CORPUS_MANIFEST');add(corpus.promptPath,'EVALUATION_CONTRACT');add(corpus.toolSchemaPath,'EVALUATION_CONTRACT');add(corpus.baselineProfilePath,'EVALUATION_CONTRACT');add(corpus.candidateProfilePath,'EVALUATION_CONTRACT');corpus.cases.forEach(item=>add(item.inputPath,'CORPUS_INPUT'));const oraclePath=`${spec}/corpus/oracle-manifest.json`;add(oraclePath,'ORACLE_MANIFEST');json(oraclePath).entries.forEach(item=>add(item.oracleEntryPath,'SUPPORTING_EVIDENCE'));}
 const protection=config.oracleProtectionEvidencePath===null?null:json(config.oracleProtectionEvidencePath);
 if(protection){add(config.oracleProtectionEvidencePath,'ORACLE_PROTECTION');add(protection.oracleManifestPath,'ORACLE_MANIFEST');add(protection.protectionEvidencePath,'SUPPORTING_EVIDENCE');json(protection.oracleManifestPath).entries.forEach(item=>add(item.oracleEntryPath,'SUPPORTING_EVIDENCE'));}
 const closure=json(config.brainClosureEvidencePath);demand(['BRAIN_CHECKPOINT','BRAIN_PACKET'].includes(closure.kind),'BRAIN_CLOSURE_INVALID');
 const brainClosureMode=closure.kind==='BRAIN_CHECKPOINT'?'CHECKPOINT':'PACKET';
 add(config.brainClosureEvidencePath,closure.kind);add(closure.evidencePath??closure.packetPath,'SUPPORTING_EVIDENCE');(closure.includedEvidence??[]).forEach(item=>add(item.path,'SUPPORTING_EVIDENCE'));
 const reviewed=config.reviewedEvaluation;
 demand(reviewed&&Number.isInteger(reviewed.unauthorizedExternalTransportCount)&&reviewed.unauthorizedExternalTransportCount>=0&&typeof reviewed.customerDataUsed==='boolean'&&typeof reviewed.secretLeakObserved==='boolean'&&['NOT_PERFORMED','OBSERVED'].includes(reviewed.deviceObservationStatus),'REVIEWED_OBSERVATIONS_REQUIRED');
 for(const field of ['corpusManifestPath','oracleProtectionEvidencePath','incidentEvidencePath'])demand(Object.hasOwn(config,field),'EXPLICIT_OPTIONAL_PATH_REQUIRED');
 demand(Object.hasOwn(reviewed,'deviceObservationEvidencePath'),'EXPLICIT_DEVICE_EVIDENCE_REQUIRED');
 add(reviewed.deviceObservationEvidencePath,'DEVICE_OBSERVATION');add(config.incidentEvidencePath,'INCIDENT_EVIDENCE');
 const evaluation={criticalInvariantsTotal:critical.length,criticalInvariantsObserved:observed.length,criticalInvariantsPassed:observed.filter(item=>item.passed===true).length,criticalInvariantsFailed:observed.filter(item=>item.passed===false).length,deterministicFailures:commands.filter(c=>['DETERMINISTIC_TEST','PHASE_CHECK','INVARIANT_CHECK'].includes(c.classification)&&c.exitCode!==c.expectedExitCode).length,providerRunStatus:'NOT_STARTED',developmentCaseCount:corpus?.developmentCaseCount??null,hiddenCaseCount:corpus?.hiddenCaseCount??null,hiddenOraclesProtected:protection?.hiddenOraclesProtected??null,providerCalls:0,providerCostSettlementStatus:'NOT_APPLICABLE',unsettledProviderCalls:0,providerReconciliationStatus:'NOT_APPLICABLE',providerReconciledCalls:0,settledSpendCad:0,unauthorizedExternalTransportCount:reviewed.unauthorizedExternalTransportCount,customerDataUsed:reviewed.customerDataUsed,secretLeakObserved:reviewed.secretLeakObserved,secretsSerializedInSeal:false,deviceObservationStatus:reviewed.deviceObservationStatus,deviceObservationEvidencePath:reviewed.deviceObservationEvidencePath,corpusManifestPath:config.corpusManifestPath,oracleProtectionEvidencePath:config.oracleProtectionEvidencePath,incidentEvidencePath:config.incidentEvidencePath,brainClosureMode,brainClosureEvidencePath:config.brainClosureEvidencePath,invariantManifestPath:config.invariantManifestPath};
 for(const field of ['baselineDevelopmentEvaluated','candidateDevelopmentEvaluated','baselineHiddenEvaluated','candidateHiddenEvaluated','baselineHiddenPassed','candidateHiddenPassed','highRiskRegressionCount','stabilityRepetitions','authorizedBudgetCad','worstCaseBudgetCad','perCallCapCad','fxUsdCad','reserveMultiplier','baselineCostPerSuccessCad','candidateCostPerSuccessCad','baselineP95DurationMs','candidateP95DurationMs','baselineOutputManifestPath','candidateOutputManifestPath','gradingManifestPath','budgetAuthorityEvidencePath','pricingEvidencePath','costReceiptEvidencePath'])evaluation[field]=null;
 demand(config.models&&Object.keys(config.models).length===4,'FOUR_MODEL_RECORDS_REQUIRED');
 for(const key of ['runtimeBaseline','runtimeCandidate'])demand(config.models[key]?.access==='UNPROBED','RUNTIME_MUST_REMAIN_UNPROBED');
 for(const [key,value] of Object.entries(config.models)){if(value.tracePath){add(value.tracePath,key==='codexAudit'?'FINDING_REPORT':'RAW_OUTPUT');demand(hash(bytes(value.tracePath))===value.traceSha256,'MODEL_TRACE_HASH_MISMATCH');}}
 const orthogonalStatuses=[];if(reviewed.deviceObservationStatus==='NOT_PERFORMED')orthogonalStatuses.push('DEVICE_OBSERVATION_NOT_PERFORMED');if(config.models.codexAstraProbe.access==='UNAVAILABLE')orthogonalStatuses.push('NO_RUN_MODEL_UNAVAILABLE');
 const localRows=phaseRows.filter(row=>row.id!=='G6');
 const qualityIssue=evaluation.deterministicFailures>0||critical.length===0||observed.length!==critical.length||evaluation.criticalInvariantsFailed>0||findingsSummary.openP0>0||findingsSummary.openP1>0||(config.incidentEvidencePath!==null&&json(config.incidentEvidencePath).phase!=='G6')||brainClosureMode==='PACKET';
 let localResult;
 if(localRows.some(row=>row.status==='BLOCKED'))localResult='LOCAL_REVALIDATION_BLOCKED';
 else if(localRows.every(row=>row.status==='PASS'))localResult=qualityIssue?'LOCAL_REVALIDATION_REWORK':'LOCAL_REVALIDATION_COMPLETE_ADOPTION_NOT_EVALUATED';
 else if(localRows.every(row=>['PASS','REWORK'].includes(row.status)))localResult='LOCAL_REVALIDATION_REWORK';
 else throw new Error('ASSEMBLY_LOCAL_PHASE_COMBINATION_INVALID');
 const report={schemaVersion:'1.3',runId:config.runId??identity.campaignId,sealedAt:new Date().toISOString(),serialization:'RAW_UTF8_SHA256',source,models:config.models,phases:phaseRows,localResult,orthogonalStatuses,providerVerdict:null,adoptionDecision:null,findingsSummary,evaluation,commandsSummary:{total:commands.length,failed:commands.filter(c=>c.exitCode!==c.expectedExitCode).length,evidencePath:config.commandLogPath},correctionsSummary:{applied:correction.corrections.filter(c=>c.applied).length,reviewsCompleted:correction.corrections.filter(c=>c.reviewCompleted).length,evidencePath:config.correctionReviewPath},metrics:{...metricValues,evidencePath:config.metricReportPath},artifacts:[...artifacts.values()].sort((a,b)=>a.path.localeCompare(b.path))};
 // This does not replace semantic replay. Verify every referenced artifact exists.
 demand(report.artifacts.every(item=>statSync(pathOf(item.path)).isFile()),'ARTIFACT_NOT_FILE');
 return report;
}

export { commandLog, metricReport, invariantManifest, assemble };

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))try {
 const [mode,configPath]=process.argv.slice(2);demand(process.argv.length===4,'MODE_AND_CONFIG_REQUIRED');
 const config=json(configPath);
 const operation={'command-log':commandLog,'metric-report':metricReport,'invariant-manifest':invariantManifest,'seal':assemble}[mode];
 demand(operation,'MODE_INVALID');
 const output=Buffer.from(JSON.stringify(operation(config),null,2)+'\n','utf8');
 safe(output);process.stdout.write(output);
}catch(error){
 process.stderr.write(error instanceof Error&&/^ASSEMBLY_[A-Z_]+$/.test(error.message)?`${error.message}\n`:'ASSEMBLY_INPUT_OR_DEPENDENCY_INVALID\n');
 process.exitCode=1;
}
