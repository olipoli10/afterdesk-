import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const s='specs/206-gpt6-astra-endvera-reverification',o=s+'/evidence/observations/';
const pairs=[
 [s+'/evidence/commands/g7-assemble-command-log/stdout.txt',o+'final-command-log.json'],
 [s+'/evidence/commands/g7-assemble-metrics/stdout.txt',o+'final-metric-report.json'],
 [s+'/evidence/commands/g7-assemble-invariants/stdout.txt',o+'final-invariant-manifest.json'],
 ['C:/dev/afterdesk-project-brain/ROADMAP_PROGRESS_MODEL.md',o+'final-brain-roadmap.md']
];
for(const [source,copy]of pairs){const a=readFileSync(source),b=readFileSync(copy);if(!a.equals(b))throw Error('ARTIFACT_COPY_MISMATCH');console.log(JSON.stringify({copy,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),byteIdentical:true}));}
let failures=0;
for(const file of ['final-metric-report.json','final-invariant-manifest.json','brain-checkpoint.json']){
 const r=spawnSync('python',[s+'/scripts/validate-json-schema.py',s+'/audit-contracts/evidence-record.schema.json',o+file],{encoding:'utf8',windowsHide:true,timeout:30000});
 console.log(JSON.stringify({file,schemaExit:r.status,launchError:r.error?.code??null}));
 if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
 if(r.status!==0||r.error)failures++;
}
console.log(JSON.stringify({kind:'LOCAL_CLOSEOUT_ARTIFACT_VALIDATION',copiesChecked:pairs.length,schemaRecordsChecked:3,failures,canonicalSealValidated:false}));
process.exitCode=failures?1:0;
