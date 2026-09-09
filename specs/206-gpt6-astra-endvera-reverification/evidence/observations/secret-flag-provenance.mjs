import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path='test/construction-operating-assistant-r35-release-package.test.ts';
const raw=readFileSync(path), lines=raw.toString('utf8').split(/\r?\n/);
const pattern=/\bsk-(?:proj-|ant-|or-v1-)[A-Za-z0-9_-]{24,}/;
const hits=lines.flatMap((line,index)=>pattern.test(line)?[{line:index+1,context:lines.slice(Math.max(0,index-3),index).filter(x=>!pattern.test(x)),insideMockReadFile:line.includes('const readFile =')&&line.includes('Buffer.from(')}]:[]);
if(hits.length!==1||!hits[0].insideMockReadFile||!hits[0].context.some(x=>x.includes('refuses secret-shaped package material')))throw new Error('FIXTURE_PROVENANCE_NOT_CONFIRMED');
console.log(JSON.stringify({kind:'SECRET_SCAN_FLAG_PROVENANCE',path,sha256:createHash('sha256').update(raw).digest('hex'),hits,matchedValueSerialized:false,scope:'Flag is in an intentional mock payload for secret rejection. No credential validity was queried. Frozen G7 scanner FAIL is preserved.'}));
