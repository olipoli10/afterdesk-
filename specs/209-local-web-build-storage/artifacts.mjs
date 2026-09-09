import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {sha,encode} from '../208-astra-r02-local-preflight/protocol.mjs';
export function buildArtifacts(root){
  const files=[];
  function walk(dir){for(const e of readdirSync(resolve(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())walk(p);else if(e.isFile())files.push(p);else throw new Error('BUILD_ARTIFACT_LINK_REFUSED');}}
  walk('.next/server');
  files.push('.next/BUILD_ID');
  const entries=files.sort().map(path=>({path,sha256:sha(readFileSync(resolve(root,path)))}));
  return {files:entries.length,sha256:sha(encode(entries)),buildId:readFileSync(resolve(root,'.next/BUILD_ID'),'utf8').trim()};
}
