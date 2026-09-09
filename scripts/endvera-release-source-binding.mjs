import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Production callers use actual working files. readFile injection is only for
// synthetic mutation tests and is not available through either CLI.
export function assertReleaseSourceBinding({ repositoryRoot, manifest, readFile = readFileSync }) {
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
    const resolved = path.resolve(root,relativePath);
    const within = path.relative(root,resolved);
    if (within.startsWith('..') || path.isAbsolute(within)) throw new Error('RELEASE_SOURCE_INPUT_PATH_INVALID');
    const working = Buffer.from(readFile(resolved));
    if (sha256(working) !== input.sha256 || working.length !== input.byteSize) throw new Error('RELEASE_SOURCE_WORKING_BYTES_CHANGED');
    let blob;
    try { blob = git('show',`${head}:${relativePath}`); } catch { throw new Error('RELEASE_SOURCE_INPUT_NOT_COMMITTED'); }
    if (working.equals(blob)) continue;
    const decoded = working.toString('utf8');
    const textInput = /\.(?:json|[cm]?js|tsx?|md|txt|svg|css|html|ya?ml)$/i.test(relativePath);
    if (textInput && !working.includes(0) && !blob.includes(0) && Buffer.from(decoded,'utf8').equals(working) && Buffer.from(decoded.replaceAll('\r\n','\n'),'utf8').equals(blob)) {
      crlfCheckoutEquivalentInputPaths.push(relativePath);
    } else throw new Error('RELEASE_SOURCE_INPUT_BLOB_MISMATCH');
  }
  return { mode:'GIT_COMMIT_INPUT_BINDING',head,tree,exactInputCount:manifest.inputs.length-crlfCheckoutEquivalentInputPaths.length,crlfCheckoutEquivalence:'WORKTREE_CRLF_TO_COMMITTED_LF_ONLY_RAW_MANIFEST_HASHES_UNCHANGED',crlfCheckoutEquivalentInputPaths };
}
