import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {sha,encode} from '../208-astra-r02-local-preflight/protocol.mjs';
export function runtimeFingerprint(root){
  const target=realpathSync(resolve(root,'node_modules')),files=[],excluded=['.cache','.vite','.vite-temp'];
  function walk(dir,prefix=''){
    for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      if(!prefix&&excluded.includes(e.name))continue;
      if(e.isSymbolicLink())throw new Error('DEPENDENCY_LINK_REFUSED');
      const path=prefix+e.name,full=join(dir,e.name);
      if(e.isDirectory())walk(full,path+'/');else if(e.isFile())files.push({path,sha256:sha(readFileSync(full))});else throw new Error('DEPENDENCY_FILE_REFUSED');
    }
  }
  walk(target);
  return {target,files:files.length,sha256:sha(encode(files)),excludedGeneratedCaches:excluded,nodeSha256:sha(readFileSync(process.execPath)),limit:'Local byte comparison, not an independent or hostile-host witness'};
}
