import {readFileSync} from 'node:fs';
const spec='specs/206-gpt6-astra-endvera-reverification';
const lanes=['canon-provenance-r0b','architecture-security','mobile-ux','product-coverage'];
const checks=lanes.map(lane=>{
 const command=JSON.parse(readFileSync(`${spec}/evidence/commands/g2-packet-${lane}/command.json`,'utf8'));
 const report=JSON.parse(readFileSync(command.stdoutPath,'utf8'));
 return {checkId:report.auditLane,result:report.status==='INCOMPLETE'?'FAIL':'PASS',commandId:command.id,evidencePath:command.stdoutPath,evidenceSha256:command.stdoutSha256};
});
console.log(JSON.stringify({kind:'PHASE_EVIDENCE',phase:'G2',status:'REWORK',checks,reason:'Four schema-valid source-packet audit reports. Three explicitly INCOMPLETE; source-only analysis is not executed or exhaustive coverage. Original shell-blocked reports and one recorder incident are preserved separately.'},null,2));
