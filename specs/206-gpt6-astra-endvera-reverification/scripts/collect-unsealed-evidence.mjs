// Read-only collection. This report is NOT a revalidation seal or alternate PASS.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = 'specs/206-gpt6-astra-endvera-reverification';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function within(path) { const absolute=resolve(root,path), rel=relative(root,absolute); if(isAbsolute(rel)||rel.startsWith('..')) throw new Error('INVENTORY_PATH_ESCAPE'); return absolute; }
const read = path => readFileSync(within(path));
const json = path => JSON.parse(read(path).toString('utf8'));
const git = (...args) => execFileSync('git',args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});
const gitText = (...args) => git(...args).toString('utf8').trim();
const config = json(process.argv[2] ?? `${spec}/closeout-inventory.config.json`);
if (!/^[a-f0-9]{40}$/.test(config.campaignHead)) throw new Error('INVENTORY_CAMPAIGN_HEAD_REQUIRED');
const startedAt = new Date().toISOString();
const observedHead = gitText('rev-parse','HEAD'), observedTree=gitText('rev-parse','HEAD^{tree}');
if(config.expectedFinalHead!==null && config.expectedFinalHead!==observedHead) throw new Error('INVENTORY_EXPECTED_HEAD_MISMATCH');
const fingerprint = path => {const bytes=read(path);return {path,bytes:bytes.length,sha256:hash(bytes)};};
const walk = dir => existsSync(within(dir))?readdirSync(within(dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${dir}/${entry.name}`):entry.isFile()?[`${dir}/${entry.name}`]:[]):[];
const commandRoot=`${spec}/evidence/commands`;
const directories=readdirSync(within(commandRoot),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>`${commandRoot}/${x.name}`).sort();
const commands=[], incidents=[], unrecordedDirectories=[], evidenceIntegrityProblems=[], auditAttempts=[], knownDigestFalsePositives=[];
const validatorPath=`${spec}/scripts/validate-revalidation-seal.mjs`, validator=read(validatorPath).toString('utf8');
const legacyPatternSource=validator.match(/\/(AC\[0-9a-f\]\{32\})\/([giu]+)/);
if(!legacyPatternSource) throw new Error('INVENTORY_ORIGINAL_SCANNER_PATTERN_CHANGED');
const legacyPattern=new RegExp(legacyPatternSource[1],legacyPatternSource[2].replace('g',''));
const requiredAuditFields=json(`${spec}/audit-contracts/finding-report.schema.json`).required;
for(const directory of directories) {
 const id=directory.split('/').at(-1), recordPath=`${directory}/command.json`, incidentPath=`${directory}/INCIDENT.json`;
 if(existsSync(within(incidentPath))) {
  const incident=json(incidentPath);
  incidents.push({...fingerprint(incidentPath),id,kind:incident.kind,rawStreamsPersisted:incident.rawStreamsPersisted,stdoutFileExists:existsSync(within(`${directory}/stdout.txt`)),stderrFileExists:existsSync(within(`${directory}/stderr.txt`)),commandRecordExists:existsSync(within(recordPath)),interpretation:'RECORDER_REFUSAL_PRESERVED_NO_RECONSTRUCTED_RAW_OUTPUT'});
 }
 if(!existsSync(within(recordPath))) {unrecordedDirectories.push({id,path:directory,state:existsSync(within(incidentPath))?'INCIDENT_WITHOUT_COMMAND_RECORD':id===config.collectorCommandId?'COLLECTOR_RECORD_NOT_YET_FINALIZED':'UNRECORDED_OR_IN_PROGRESS_NOT_A_MEASURED_EXIT'});continue;}
 const command=json(recordPath), record=fingerprint(recordPath), streams={};
 for(const kind of ['stdout','stderr']) {
  const path=command[`${kind}Path`];
  if(!existsSync(within(path))) {evidenceIntegrityProblems.push({id,kind,reason:'MISSING_STREAM'});continue;}
  streams[kind]=fingerprint(path);
  streams[kind].matchesRecordedHash=streams[kind].sha256===command[`${kind}Sha256`];
  if(!streams[kind].matchesRecordedHash)evidenceIntegrityProblems.push({id,kind,reason:'STREAM_HASH_MISMATCH'});
  const digest=command[`${kind}Sha256`];
  if(/^[a-f0-9]{64}$/.test(digest)&&legacyPattern.test(digest))knownDigestFalsePositives.push({commandId:id,field:`${kind}Sha256`,digest,originalScannerMatches:true,tokenBoundedScannerMatches:/\bAC[0-9a-f]{32}\b/i.test(digest)});
 }
 const entry={id,record,phase:command.phase,classification:command.classification,observedHead:command.observedHead,observedTree:command.observedTree,startedAt:command.startedAt,finishedAt:command.finishedAt,expectedExitCode:command.expectedExitCode,exitCode:command.exitCode,nativeExitMatchesExpectation:command.exitCode===command.expectedExitCode,streams};
 let output=null; if(streams.stdout) { try {output=json(command.stdoutPath);}catch{} }
 if(command.classification==='PHASE_CHECK'&&output) entry.wrapper={kind:output.kind,phase:output.phase,checkId:output.checkId,result:output.result,observedCommandId:output.observedCommandId,contractPath:output.contractPath,contractSha256:output.contractSha256,variant:output.contractPath?.includes('/phase-checks-r0b/')?'CORRECTED_R0B_DIAGNOSTIC_ONLY':'CANONICAL_FROZEN',wrapperExitIsNotProductPass:true};
 if(command.classification==='INVARIANT_CHECK'&&output)entry.invariant={kind:output.kind,result:output.result,invariantId:output.invariantId};
 if(command.classification==='METRIC_CALCULATION'&&output)entry.metric={metric:output.metric,startValue:output.startValue,finalValue:output.finalValue,rubricCrossed:output.rubricCrossed};
 if(command.phase==='G2'&&command.classification==='MODEL_AUDIT')auditAttempts.push({id,stdout:streams.stdout,stderr:streams.stderr,status:output?.status??null,auditLane:output?.auditLane??null,missingRequiredTopLevelFields:requiredAuditFields.filter(key=>!Object.hasOwn(output??{},key)),fullSchemaValidation:'NOT_PERFORMED_BY_INVENTORY',selectedAsLatestPacket:config.selectedPacketAuditCommandIds.includes(id),nativeExitCode:command.exitCode});
 const diagnosticPath=`${directory}/runner-diagnostic.json`;
 if(existsSync(within(diagnosticPath))) {const diagnostic=json(diagnosticPath);entry.runnerDiagnostic={...fingerprint(diagnosticPath),timedOut:diagnostic.timedOut,cleanupStatus:diagnostic.cleanupStatus,rawStreamsUnmodified:diagnostic.rawStreamsUnmodified};}
 commands.push(entry);
}
const frozenInputs=[];
for(const folder of ['evaluation-contracts','phase-checks','audit-contracts','audit-prompts']) {
 const paths=gitText('ls-tree','-r','--name-only',config.campaignHead,'--',`${spec}/${folder}`).split(/\r?\n/).filter(Boolean);
 for(const path of paths){const blob=git('show',`${config.campaignHead}:${path}`);const present=existsSync(within(path));const current=present?fingerprint(path):null;frozenInputs.push({path,campaignBlobSha256:hash(blob),currentSha256:current?.sha256??null,matchesCampaignBytes:current?.sha256===hash(blob)});}
}
const diagnostics=walk(`${spec}/phase-checks-r0b`).map(fingerprint);
for(const path of [`${spec}/scripts/validate-revalidation-seal-r0b.mjs`,`${spec}/scripts/assemble-local-seal.mjs`]) if(existsSync(within(path)))diagnostics.push(fingerprint(path));
const deterministicFailures=commands.filter(c=>['DETERMINISTIC_TEST','PHASE_CHECK','INVARIANT_CHECK'].includes(c.classification)&&!c.nativeExitMatchesExpectation);
const lineOf = needle => validator.slice(0,validator.indexOf(needle)).split('\n').length;
const blockers=[
 {id:'CANONICAL_SCANNER_MATCHES_SAFE_DIGESTS',observed:knownDigestFalsePositives.length>0,path:validatorPath,lines:[lineOf('/AC[0-9a-f]{32}/giu'),lineOf('/SK[0-9a-f]{32}/giu')],safeDigestReproductionCount:knownDigestFalsePositives.length},
 {id:'G2_ATTEMPT_CARDINALITY_CONTRADICTION',observed:auditAttempts.length>4,path:validatorPath,lines:[lineOf('assert(findingArtifacts.length === 4'),lineOf('assert(findingArtifacts.length <= 4'),lineOf('const stdoutRole = command.phase === "G2"')],requiredReports:auditAttempts.length,permittedMaximum:4,explanation:'Every retained G2 MODEL_AUDIT stdout must have FINDING_REPORT role; eight real attempts cannot fit four allowed reports. No command is omitted or reclassified.'},
 {id:'INITIAL_G2_OUTPUTS_MISSING_SCHEMA_FIELDS',observed:auditAttempts.some(x=>x.missingRequiredTopLevelFields.length>0),path:validatorPath,lines:[lineOf('validateAgainstSchema(findingPath')],explanation:'Initial shell-blocked outputs lack mandatory fields. Exit zero is not schema validity or audit completeness.'},
 {id:'CANONICAL_VALIDATOR_IS_IMMUTABLE',observed:true,path:validatorPath,lines:[lineOf('const campaignKit = ['),lineOf('REVALIDATION_CAMPAIGN_KIT_MUTATED')],explanation:'A corrected diagnostic validator cannot replace the SPEC/CAMPAIGN/FINAL byte-identical canonical validator.'},
 {id:'HISTORICAL_FAILURES_PRECLUDE_LOCAL_COMPLETE',observed:deterministicFailures.length>0,path:validatorPath,lines:[lineOf('report.evaluation.deterministicFailures === commandLog.commands.filter('),lineOf('REVALIDATION_LOCAL_COMPLETE_HAS_FAILURES')],count:deterministicFailures.length,explanation:'Fresh retests do not erase recorded baseline failures; preserve REWORK.'},
 {id:'CORRECTED_WRAPPERS_NOT_FROZEN_CONTRACT_PROOF',observed:commands.some(c=>c.wrapper?.variant==='CORRECTED_R0B_DIAGNOSTIC_ONLY'),path:validatorPath,lines:[lineOf('REVALIDATION_PHASE_CHECK_CONTRACT_NOT_FROZEN')],explanation:'R0b wrappers stay separate. They cannot replace canonical frozen phase evidence.'}
];
let brain=null;
if(config.brainRoot){const brainGit=(...args)=>execFileSync('git',args,{cwd:config.brainRoot,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();const status=brainGit('status','--porcelain');brain={head:brainGit('rev-parse','HEAD'),tree:brainGit('rev-parse','HEAD^{tree}'),worktreeClean:status==='',mutatedByCollector:false};blockers.push({id:'CLEAN_BRAIN_REQUIRES_CHECKPOINT_NOT_PACKET',observed:brain.worktreeClean,path:validatorPath,lines:[lineOf('REVALIDATION_BRAIN_PACKET_WITH_CLEAN_WORKTREE')],explanation:'Clean Brain cannot use BRAIN_PACKET. Parent must supply honest checkpoint/validation; never fabricate a dirty worktree.'});}
const finalObservedHead=gitText('rev-parse','HEAD');
const changedDuringCollection=commands.filter(c=>fingerprint(c.record.path).sha256!==c.record.sha256).map(c=>c.id);
const packet={kind:'UNSEALED_LOCAL_EVIDENCE_INVENTORY',schemaVersion:'1.0',campaignId:json(`${spec}/CAMPAIGN_IDENTITY.json`).campaignId,startedAt,finishedAt:new Date().toISOString(),observedHead,observedTree,expectedFinalHead:config.expectedFinalHead,finalHeadClaimed:config.expectedFinalHead!==null,headStableDuringCollection:finalObservedHead===observedHead,commandRecordsChangedDuringCollection:changedDuringCollection,sealed:false,canonicalValidationPassed:false,alternateValidationAuthority:false,campaignOutcomeClaim:null,source:{collector:fingerprint(`${spec}/scripts/collect-unsealed-evidence.mjs`),config:fingerprint(process.argv[2]??`${spec}/closeout-inventory.config.json`),canonicalValidator:fingerprint(validatorPath)},brain,counts:{recordedCommands:commands.length,nativeExitMismatches:commands.filter(c=>!c.nativeExitMatchesExpectation).length,canonicalDeterministicFailures:deterministicFailures.length,incidents:incidents.length,g2ModelAuditCommands:auditAttempts.length,providerClassifiedCommands:commands.filter(c=>c.classification==='PROVIDER_CALL').length},commands,incidents,unrecordedDirectories,evidenceIntegrityProblems,auditAttempts,safeDigestScannerReproductions:knownDigestFalsePositives,frozenInputs,correctedDiagnosticArtifacts:diagnostics,canonicalBlockers:blockers,remainingConditions:['Stable final HEAD and completed G7 raw commands plus frozen wrappers, retaining separate R0b retests.','Five final replayed metric rubrics and all six values; no inferred metric improvements.','Explicit local invariant scope and no claim of provider candidate isolation.','Actual clean Brain checkpoint/validation after final observations.','Canonical seal remains blocked by retained audit cardinality/schema and digest-scanner contradictions even if remaining evidence is collected.'],limits:['No raw stdout/stderr text copied; only file fingerprints and selected structured fields.','All completed command records discovered are retained, including failed attempts. Directories without records are not assigned invented exits.','Selected packet reports are an index only, not replacements for original attempts.','The collector cannot include its own not-yet-finalized recorder command; that directory is explicitly marked.','This is a timestamped partial snapshot until final HEAD and G7 evidence are complete, never an alternate canonical seal.']};
console.log(JSON.stringify({...packet,inventoryPayloadSha256:hash(JSON.stringify(packet))},null,2));
process.exitCode=evidenceIntegrityProblems.length||changedDuringCollection.length||finalObservedHead!==observedHead?1:0;
