import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertReleaseRegularFile(repositoryRoot, relativePath) {
  const root = path.resolve(repositoryRoot);
  if(lstatSync(root).isSymbolicLink())throw new Error('RELEASE_SOURCE_SYMLINK_ROOT_REFUSED');
  if(!lstatSync(root).isDirectory())throw new Error('RELEASE_SOURCE_ROOT_NOT_DIRECTORY');
  const realRoot = realpathSync(root);
  const normalized = relativePath?.replaceAll('\\','/');
  if (!normalized || path.isAbsolute(normalized) || normalized.split('/').some(part=>!part||part==='.'||part==='..')) throw new Error('RELEASE_SOURCE_INPUT_PATH_INVALID');
  const resolved = path.resolve(root,normalized), within = path.relative(root,resolved);
  if (within.startsWith('..') || path.isAbsolute(within)) throw new Error('RELEASE_SOURCE_INPUT_PATH_INVALID');
  let current=root;
  const parts=normalized.split('/');
  for (const [index,part] of parts.entries()) {
    current=path.join(current,part);
    const stat=lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('RELEASE_SOURCE_SYMLINK_REFUSED');
    if (index===parts.length-1 ? !stat.isFile() : !stat.isDirectory()) throw new Error('RELEASE_SOURCE_NONREGULAR_INPUT_REFUSED');
  }
  const realWithin=path.relative(realRoot,realpathSync(resolved));
  if(realWithin.startsWith('..')||path.isAbsolute(realWithin))throw new Error('RELEASE_SOURCE_REALPATH_ESCAPE_REFUSED');
  return resolved;
}
export function isExactCheckoutCrlfEquivalent(working,blob,relativePath) {
  if(!/\.(?:json|[cm]?js|tsx?|md|txt|svg|css|html|ya?ml)$/i.test(relativePath))return false;
  return isStrictCheckoutCrlfEquivalent(working,blob);
}
function isStrictCheckoutCrlfEquivalent(working,blob) {
  if(working.includes(0)||blob.includes(0)||blob.includes(13))return false;
  const decoded=working.toString('utf8');
  if(!Buffer.from(decoded,'utf8').equals(working)||!decoded.includes('\r\n'))return false;
  // Every newline must be exactly CRLF; reject mixed, lone and doubled CR.
  if(/[\r\n]/.test(decoded.replaceAll('\r\n','')))return false;
  return Buffer.from(decoded.replaceAll('\r\n','\n'),'utf8').equals(blob);
}
export function assertRegularGitEntry(treeEntry,relativePath) {
  const mode=treeEntry.match(/^(100644|100755) blob [a-f0-9]{40}\t([^\0]+)\0$/);
  if(!mode||mode[2]!==relativePath)throw new Error('RELEASE_SOURCE_GIT_NONREGULAR_INPUT_REFUSED');
}
// Production callers use actual working files. readFile injection is only for
// synthetic mutation tests and is not available through either CLI.
export function assertReleaseInputBinding({ repositoryRoot, manifest, readFile = readFileSync }) {
  const root = path.resolve(repositoryRoot);
  const { head, tree } = manifest.source ?? {};
  if (!/^[a-f0-9]{40}$/.test(head ?? '') || !/^[a-f0-9]{40}$/.test(tree ?? '')) throw new Error('RELEASE_SOURCE_FINGERPRINT_INVALID');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true, stdio: ['ignore','pipe','pipe'], maxBuffer:64*1024*1024 });
  let actualTree;
  try {
    if (git('cat-file','-t',head).toString('utf8').trim() !== 'commit') throw new Error('not commit');
    actualTree = git('rev-parse',`${head}^{tree}`).toString('utf8').trim();
  } catch { throw new Error('RELEASE_SOURCE_COMMIT_NOT_FOUND'); }
  if (actualTree !== tree) throw new Error('RELEASE_SOURCE_TREE_MISMATCH');
  if (!Array.isArray(manifest.inputs) || manifest.inputs.length === 0) throw new Error('RELEASE_SOURCE_INPUTS_REQUIRED');
  const crlfCheckoutEquivalentInputPaths = [];
  for (const input of manifest.inputs ?? []) {
    const relativePath = input.path?.replaceAll('\\','/');
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) throw new Error('RELEASE_SOURCE_INPUT_PATH_INVALID');
    const resolved = assertReleaseRegularFile(root,relativePath);
    let treeEntry;
    try { treeEntry=git('ls-tree','-z',head,'--',relativePath).toString('utf8'); } catch { throw new Error('RELEASE_SOURCE_INPUT_NOT_COMMITTED'); }
    assertRegularGitEntry(treeEntry,relativePath);
    const working = Buffer.from(readFile(resolved));
    if (sha256(working) !== input.sha256 || working.length !== input.byteSize) throw new Error('RELEASE_SOURCE_WORKING_BYTES_CHANGED');
    let blob;
    try { blob = git('show',`${head}:${relativePath}`); } catch { throw new Error('RELEASE_SOURCE_INPUT_NOT_COMMITTED'); }
    if (working.equals(blob)) continue;
    if (isExactCheckoutCrlfEquivalent(working,blob,relativePath)) {
      crlfCheckoutEquivalentInputPaths.push(relativePath);
    } else throw new Error('RELEASE_SOURCE_INPUT_BLOB_MISMATCH');
  }
  return { mode:'GIT_COMMIT_INPUT_BINDING',head,tree,exactInputCount:manifest.inputs.length-crlfCheckoutEquivalentInputPaths.length,crlfCheckoutEquivalence:'WORKTREE_CRLF_TO_COMMITTED_LF_ONLY_RAW_MANIFEST_HASHES_UNCHANGED',crlfCheckoutEquivalentInputPaths };
}

export function assertReleaseSourceBinding(options) {
  const binding=assertReleaseInputBinding(options);
  // The derived projection is the sole permitted tracked difference: it cannot
  // belong to its own input commit. Untracked files and dependencies are not an
  // execution-isolation claim. This gate adds whole tracked-source coherence.
  const root=path.resolve(options.repositoryRoot);
  const excludedDerivedProjection='release/endvera-construction-v1/release-manifest-v3.json';
  const drift=()=>{throw new Error('RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT');};
  const git=(args,input)=>execFileSync('git',['-C',root,...args],{input,windowsHide:true,stdio:['pipe','pipe','pipe'],maxBuffer:64*1024*1024});
  const parseEntries=(bytes,index)=>{
    const decoded=bytes.toString('utf8');
    if(!Buffer.from(decoded,'utf8').equals(bytes)||decoded&&!decoded.endsWith('\0'))drift();
    const entries=new Map();
    for(const record of decoded.split('\0').filter(Boolean)) {
      const match=record.match(index?/^(\d{6}) ([a-f0-9]{40}) ([0-3])\t([\s\S]+)$/:/^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/);
      if(!match)drift();
      const [,mode,second,third,relativePath]=match;
      // Exact equality only: similarly named paths remain authoritative inputs.
      if(relativePath===excludedDerivedProjection)continue;
      if((mode!=='100644'&&mode!=='100755')||(index?third!=='0':second!=='blob')||entries.has(relativePath))drift();
      entries.set(relativePath,{mode,oid:index?second:third});
    }
    return entries;
  };
  // These enumerations do not ask Git whether it considers a worktree entry
  // clean. assume-unchanged and skip-worktree cannot suppress direct reads.
  const source=parseEntries(git(['ls-tree','-r','-z','--full-tree',binding.head]),false);
  const index=parseEntries(git(['ls-files','--stage','-z']),true);
  if(source.size!==index.size)drift();
  for(const [relativePath,entry] of source) {
    const staged=index.get(relativePath);
    if(!staged||staged.mode!==entry.mode||staged.oid!==entry.oid)drift();
  }
  // Only now is Git's index text classification tied to the source object IDs.
  // It covers normal autocrlf formats such as ps1/sql/prisma/toml and dotfiles.
  // The w/* status is deliberately ignored; it never authorizes working bytes.
  const checkoutTextPaths=new Set();
  const eolBytes=git(['ls-files','--eol','-z']);
  const eol=eolBytes.toString('utf8');
  if(!Buffer.from(eol,'utf8').equals(eolBytes)||eol&&!eol.endsWith('\0'))drift();
  for(const record of eol.split('\0').filter(Boolean)) {
    const match=record.match(/^i\/([^\s]*)\s+w\/[^\s]*\s+attr\/([^\t]*)\t([\s\S]+)$/);
    if(!match)drift();
    const [,indexEol,attributes,relativePath]=match;
    if(source.has(relativePath)&&indexEol==='lf'&&!attributes.trim().split(/\s+/).includes('-text'))checkoutTextPaths.add(relativePath);
  }
  const entries=[...source.entries()];
  for(let offset=0;offset<entries.length;offset+=128) {
    const batch=entries.slice(offset,offset+128);
    // Batch raw object bytes, without diff drivers, textconv or clean filters.
    const objects=git(['cat-file','--batch'],`${batch.map(([,entry])=>entry.oid).join('\n')}\n`);
    let cursor=0;
    for(const [relativePath,entry] of batch) {
      const newline=objects.indexOf(10,cursor);
      if(newline<cursor)drift();
      const header=objects.subarray(cursor,newline).toString('ascii').match(/^([a-f0-9]{40}) blob (\d+)$/);
      if(!header||header[1]!==entry.oid)drift();
      const size=Number(header[2]),start=newline+1,end=start+size;
      if(!Number.isSafeInteger(size)||end>=objects.length||objects[end]!==10)drift();
      const blob=objects.subarray(start,end);cursor=end+1;
      let resolved;
      try { resolved=assertReleaseRegularFile(root,relativePath); }
      catch { drift(); }
      // POSIX executable bits have a meaningful Git-mode mapping. Windows
      // lacks that mapping; regular-file type plus exact tree/index mode apply.
      if(process.platform!=='win32'&&((lstatSync(resolved).mode&0o111)!==0)!==(entry.mode==='100755'))drift();
      const working=readFileSync(resolved);
      if(!working.equals(blob)&&!(checkoutTextPaths.has(relativePath)&&isStrictCheckoutCrlfEquivalent(working,blob)))drift();
    }
    if(cursor!==objects.length)drift();
  }
  return {...binding,trackedCheckoutMatchesSource:true,excludedDerivedProjection};
}
