import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const phase=process.argv[2];
if (!/^G[0-7]$/.test(phase)) throw new Error('UNKNOWN_PHASE');
const evidence=JSON.parse(readFileSync(`specs/206-gpt6-astra-endvera-reverification/evidence/${phase}.json`,'utf8'));
if (evidence.kind!=='PHASE_EVIDENCE'||evidence.phase!==phase||!Array.isArray(evidence.checks)||evidence.checks.length===0) throw new Error('PHASE_EVIDENCE_REQUIRED');
for (const check of evidence.checks) {
 if(!existsSync(check.evidencePath)) throw new Error('MISSING_CHECK_EVIDENCE');
 if(createHash('sha256').update(readFileSync(check.evidencePath)).digest('hex')!==check.evidenceSha256) throw new Error('CHECK_EVIDENCE_CHANGED');
}
// REWORK is a recorded result, never a green gate.
console.log(JSON.stringify({phase,status:evidence.status,checks:evidence.checks.length}));
process.exitCode=evidence.status==='PASS'?0:1;
