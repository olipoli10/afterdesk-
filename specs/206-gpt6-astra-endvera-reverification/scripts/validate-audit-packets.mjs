import {spawnSync} from 'node:child_process';
const spec='specs/206-gpt6-astra-endvera-reverification';
let failures=0;
for(const lane of ['canon-provenance-r0b','architecture-security','mobile-ux','product-coverage']) {
 const path=`${spec}/evidence/commands/g2-packet-${lane}/stdout.txt`;
 const r=spawnSync('python',[`${spec}/scripts/validate-json-schema.py`,`${spec}/audit-contracts/finding-report.schema.json`,path],{encoding:'utf8',windowsHide:true});
 process.stdout.write(`${lane}: ${r.stdout??''}`);process.stderr.write(r.stderr??'');
 if(r.status!==0) failures++;
}
process.exitCode=failures?1:0;
