import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checks } from './check-map.mjs';
const base='specs/206-gpt6-astra-endvera-reverification/phase-checks-r0b';
const sha=value=>createHash('sha256').update(value).digest('hex');
const contracts=JSON.parse(readFileSync(`${base}/PHASE_CHECK_CONTRACTS.json`,'utf8'));
const commands=JSON.parse(readFileSync(`${base}/commands.json`,'utf8'));
if(contracts.kind!=='PHASE_CHECK_CONTRACTS'||contracts.checks.length!==29||commands.commands.length!==29)throw new Error('PHASE_KIT_CARDINALITY_INVALID');
if(Object.keys(checks.G1).length!==11||Object.keys(checks.G7).length!==18)throw new Error('PHASE_KIT_TAXONOMY_INVALID');
const ids=new Set();
for(const contract of contracts.checks) {
 const id=`${contract.phase}:${contract.checkId}`;if(ids.has(id))throw new Error('DUPLICATE_PHASE_CONTRACT');ids.add(id);
 const def=checks[contract.phase]?.[contract.checkId];if(!def)throw new Error('UNMAPPED_PHASE_CONTRACT');
 const command=commands.commands.find(c=>c.phase===contract.phase&&c.checkId===contract.checkId);
 if(!command||sha(command.command)!==contract.commandSha256||command.commandSha256!==contract.commandSha256)throw new Error('PHASE_COMMAND_HASH_MISMATCH');
 const parser={stdoutAll:contract.stdoutAll,stderrNone:contract.stderrNone,notApplicableStdoutAll:contract.notApplicableStdoutAll};
 if(sha(JSON.stringify(parser))!==command.parserSha256)throw new Error('PHASE_PARSER_HASH_MISMATCH');
 for(const pattern of Object.values(parser).flat())new RegExp(pattern,'u');
 if(contract.allowNotApplicable!==(contract.checkId==='NATIVE_CRASH_REPRODUCTION'))throw new Error('INVALID_NA_SCOPE');
 if(!existsSync(command.args[0]))throw new Error('COMMAND_ENTRYPOINT_MISSING');
 for(const file of def.files??[]) {
  const path=def.cwd==='.'?file:`${def.cwd}/${file}`;if(!existsSync(path))throw new Error(`TEST_FILE_MISSING:${path}`);
  if(def.pattern&&!new RegExp(def.pattern,'u').test(readFileSync(path,'utf8')))throw new Error(`TEST_SELECTOR_MISSING:${id}`);
 }
}
for(const dependency of commands.frozenDependencies) {
 if(!existsSync(dependency.path)||sha(readFileSync(dependency.path))!==dependency.sha256)throw new Error(`FROZEN_PHASE_DEPENDENCY_DRIFT:${dependency.path}`);
}
const critical=contracts.checks.filter(c=>c.checkId!=='NATIVE_CRASH_REPRODUCTION');
for(const contract of critical) {
 if(contract.stdoutAll.every(pattern=>new RegExp(pattern,'u').test('')))throw new Error('EMPTY_OUTPUT_CAN_PASS');
 if(contract.stdoutAll.every(pattern=>new RegExp(pattern,'u').test('PASS')))throw new Error('ARBITRARY_PASS_CAN_PASS');
}
console.log(`PHASE_KIT_VALIDATED commands=${commands.commands.length} contracts=${contracts.checks.length} phases=11/18 frozenDependencies=${commands.frozenDependencies.length} emptyOutputAccepted=false arbitraryPassAccepted=false`);
