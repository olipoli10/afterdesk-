import {execFileSync} from 'node:child_process';
import {buildReleaseManifest,defaultRepositoryRoot} from '../../../scripts/generate-endvera-release-package.mjs';
import {assertReleaseSourceBinding} from '../../../scripts/endvera-release-source-binding.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const manifest=buildReleaseManifest({sourceHead:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}')});
const binding=assertReleaseSourceBinding({repositoryRoot:defaultRepositoryRoot,manifest});
console.error(JSON.stringify(binding));
console.log(JSON.stringify(manifest,null,2));
