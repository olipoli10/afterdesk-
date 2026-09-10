// Reads PE bytes only. Never loads a downloaded executable or DLL.
import { readFileSync, readdirSync, realpathSync, lstatSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const supplied = process.argv[2];
const root = realpathSync(supplied);
const expectedPrefix = path.resolve('.scratch') + path.sep;
if (!root.startsWith(expectedPrefix) || !/^personal-msvc-inspection-[a-f0-9]{32}$/.test(path.basename(root))) throw Error('TOOLCHAIN_INSPECTION_ROOT_REFUSED');
for (let ancestor = root;; ancestor = path.dirname(ancestor)) { if (lstatSync(ancestor).isSymbolicLink()) throw Error('TOOLCHAIN_REPARSE_REFUSED'); if (path.dirname(ancestor) === ancestor) break; }
const toolDir = path.join(root, 'msvc-tools-x64-complete/Contents/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64');
const systemDir = path.join(process.env.SystemRoot, 'System32');
function inspect(file) {
  const b = readFileSync(file);
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('ascii', 0, 2) !== 'MZ' || b.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw Error('PE_FORMAT_REFUSED');
  const machine = b.readUInt16LE(pe + 4), sectionCount = b.readUInt16LE(pe + 6), opt = pe + 24;
  const optionalSize = b.readUInt16LE(pe + 20), magic = b.readUInt16LE(opt);
  if (![0x8664, 0x14c].includes(machine) || ![0x20b, 0x10b].includes(magic) || sectionCount > 96) throw Error('PE_ARCHITECTURE_REFUSED');
  const directories = opt + (magic === 0x20b ? 112 : 96);
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const at = opt + optionalSize + i * 40;
    return { virtualSize: b.readUInt32LE(at + 8), va: b.readUInt32LE(at + 12), rawSize: b.readUInt32LE(at + 16), raw: b.readUInt32LE(at + 20) };
  });
  function offset(rva) {
    const s = sections.find(s => rva >= s.va && rva < s.va + Math.max(s.rawSize, s.virtualSize));
    if (!s || rva - s.va >= s.rawSize) throw Error('PE_RVA_REFUSED');
    return s.raw + rva - s.va;
  }
  function cstring(rva) {
    const start = offset(rva), end = b.indexOf(0, start);
    if (end < start || end - start > 260) throw Error('PE_STRING_REFUSED');
    const result = b.toString('ascii', start, end);
    if (!/^[a-z0-9_.-]+$/i.test(result)) throw Error('PE_IMPORT_NAME_REFUSED');
    return result;
  }
  const imports = [];
  const importRva = b.readUInt32LE(directories + 8);
  if (importRva) {
    const at = offset(importRva);
    for (let i = 0; i < 1024; i++) { const entry = at + i * 20; const name = b.readUInt32LE(entry + 12); if (!name) break; imports.push(cstring(name)); if (i === 1023) throw Error('PE_IMPORT_BOUND'); }
  }
  const delayed = [];
  const delayRva = b.readUInt32LE(directories + 13 * 8);
  if (delayRva) {
    const at = offset(delayRva);
    for (let i = 0; i < 1024; i++) { const entry = at + i * 32; const name = b.readUInt32LE(entry + 4); if (!name) break; if (!(b.readUInt32LE(entry) & 1)) throw Error('PE_DELAY_VA_UNSUPPORTED'); delayed.push(cstring(name)); if (i === 1023) throw Error('PE_DELAY_BOUND'); }
  }
  function resolve(name) {
    if (/^(api|ext)-ms-/i.test(name)) return { name, resolution: 'WINDOWS_API_SET_CONTRACT_UNOBSERVED' };
    if (existsSync(path.join(toolDir, name))) return { name, resolution: 'SAME_PUBLISHER_TOOL_DIRECTORY' };
    if (existsSync(path.join(systemDir, name))) return { name, resolution: 'EXISTING_WINDOWS_SYSTEM32' };
    return { name, resolution: 'MISSING_STATIC_IMPORT' };
  }
  return { file: path.relative(root, file), bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex'), machine: machine === 0x8664 ? 'AMD64' : 'I386_OR_MANAGED_ANYCPU', imports: imports.map(resolve), delayImports: delayed.map(resolve) };
}
const names = readdirSync(toolDir).filter(name => /\.(exe|dll)$/i.test(name));
const files = names.map(name => inspect(path.join(toolDir, name)));
const missing = files.flatMap(file => [
  ...file.imports.filter(i => i.resolution === 'MISSING_STATIC_IMPORT').map(i => ({ file: file.file, dependency: i.name, kind: 'EAGER' })),
  ...file.delayImports.filter(i => i.resolution === 'MISSING_STATIC_IMPORT').map(i => ({ file: file.file, dependency: i.name, kind: 'DELAY' })),
]);
const requiredNames = ['cl.exe', 'nmake.exe', 'link.exe', 'c1.dll', 'c2.dll', 'cvtres.exe', 'mspdb140.dll', 'mspdbcore.dll'];
const required = requiredNames.map(name => ({ name, present: existsSync(path.join(toolDir, name)), machine: files.find(file => path.basename(file.file) === name)?.machine }));
const report = { inspectedAt: new Date().toISOString(), downloadedToolExecuted: false, dynamicLoaderObserved: false, packageSignatureVerified: false, toolDir, fileCount: files.length, required, missing, files };
writeFileSync(path.join(root, 'pe-import-inspection.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ fileCount: files.length, required, missing, downloadedToolExecuted: false, dynamicLoaderObserved: false }, null, 2));
