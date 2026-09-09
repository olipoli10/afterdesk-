import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const s='specs/206-gpt6-astra-endvera-reverification';
const path=s+'/scripts/validate-revalidation-seal.mjs';
const bytes=readFileSync(path),source=bytes.toString('utf8');
const sha=v=>createHash('sha256').update(v).digest('hex');
const frozen=execFileSync('git',['show','afaedf8e719892503a38016a8c6add55791ddc81:'+path],{windowsHide:true});
if(!bytes.equals(frozen))throw new Error('CANONICAL_VALIDATOR_DRIFT');
const start=source.indexOf('const secretPatterns = ['),end=source.indexOf('];',start)+2;
if(start<0||end<=start)throw new Error('SCANNER_EXTRACTION_FAILED');
const patterns=runInNewContext(source.slice(start,end)+';secretPatterns;',Object.create(null),{timeout:1000});
const examples=[];
for(const id of readdirSync(s+'/evidence/commands')){
let command;try{command=JSON.parse(readFileSync(s+'/evidence/commands/'+id+'/command.json','utf8'));}catch{continue;}
for(const field of ['stdoutSha256','stderrSha256']){
const digest=command[field];if(!/^[a-f0-9]{64}$/.test(digest))throw new Error('BAD_RECORDED_DIGEST');
if(patterns.some(p=>{p.lastIndex=0;return p.test(digest);}))examples.push({id,field,digest});
}}
if(!examples.length)throw new Error('ACTUAL_DIGEST_REPRODUCTION_MISSING');
console.log(JSON.stringify({kind:'CANONICAL_SCANNER_ACTUAL_DIGEST_REPRODUCTION',canonicalValidatorSha256:sha(bytes),canonicalBytesEqualCampaignBlob:true,actualRecordedDigestFalsePositives:examples.length,examples,fullSealValidated:false,secretMaterialRead:false,scope:'Extracted unchanged scanner against actual recorded SHA256 strings; not an alternate seal validator.'}));
