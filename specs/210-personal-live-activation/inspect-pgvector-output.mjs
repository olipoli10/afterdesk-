// Static inspection only: no LoadLibrary, extension registration, process or network call.
import { readFileSync, writeFileSync, statSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = realpathSync(process.argv[2]);
const expected = path.resolve('C:/dev/endvera-astra-r03/.scratch') + path.sep;
if (!root.startsWith(expected) || !/^personal-pgvector-build-[a-f0-9]{32}$/.test(path.basename(root))) throw Error('PGVECTOR_OUTPUT_ROOT_REFUSED');
for (let item = root; ; item = path.dirname(item)) {
  if (lstatSync(item).isSymbolicLink()) throw Error('PGVECTOR_OUTPUT_REPARSE_REFUSED');
  if (path.dirname(item) === item) break;
}
const file = path.join(root, 'source/vector.dll');
if (lstatSync(file).isSymbolicLink() || statSync(file).size > 20 * 1024 * 1024) throw Error('PGVECTOR_OUTPUT_FILE_REFUSED');
const b = readFileSync(file);
const pe = b.readUInt32LE(60);
if (b.toString('ascii', 0, 2) !== 'MZ' || b.toString('ascii', pe, pe + 4) !== 'PE\0\0' || b.readUInt16LE(pe + 4) !== 0x8664) throw Error('PGVECTOR_OUTPUT_PE_REFUSED');
const opt = pe + 24;
if (b.readUInt16LE(opt) !== 0x20b) throw Error('PGVECTOR_OUTPUT_PE64_REQUIRED');
const count = b.readUInt16LE(pe + 6), size = b.readUInt16LE(pe + 20), directory = opt + 112;
if (count < 1 || count > 96) throw Error('PGVECTOR_OUTPUT_SECTION_BOUND');
const sections = Array.from({ length: count }, (_, i) => {
  const at = opt + size + 40 * i;
  return { va: b.readUInt32LE(at + 12), rawSize: b.readUInt32LE(at + 16), raw: b.readUInt32LE(at + 20) };
});
function offset(rva) {
  const section = sections.find(s => rva >= s.va && rva < s.va + s.rawSize);
  if (!section || section.raw + rva - section.va >= b.length) throw Error('PGVECTOR_OUTPUT_RVA_REFUSED');
  return section.raw + rva - section.va;
}
function name(rva) {
  const start = offset(rva), end = b.indexOf(0, start);
  if (end < start || end - start > 260) throw Error('PGVECTOR_OUTPUT_STRING_BOUND');
  const value = b.toString('ascii', start, end);
  if (!/^[a-z0-9_.?@$-]+$/i.test(value)) throw Error('PGVECTOR_OUTPUT_NAME_REFUSED');
  return value;
}
function imports(index, stride, nameOffset, delay) {
  const rva = b.readUInt32LE(directory + index * 8);
  if (!rva) return [];
  const start = offset(rva), values = [];
  for (let i = 0; i < 1024; i++) {
    const at = start + i * stride, item = b.readUInt32LE(at + nameOffset);
    if (!item) return values;
    if (delay && !(b.readUInt32LE(at) & 1)) throw Error('PGVECTOR_OUTPUT_DELAY_VA_REFUSED');
    values.push(name(item));
  }
  throw Error('PGVECTOR_OUTPUT_IMPORT_BOUND');
}
const runtime = path.resolve('C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3/runtime/pgsql');
const system = path.join(process.env.SystemRoot, 'System32');
function resolveImport(item) {
  if (/^(api|ext)-ms-/i.test(item)) return { name: item, resolution: 'WINDOWS_API_SET_UNOBSERVED' };
  if (existsSync(path.join(runtime, 'bin', item))) return { name: item, resolution: 'APPROVED_RUNTIME_BIN_FILE_PRESENT' };
  if (existsSync(path.join(runtime, 'lib', item))) return { name: item, resolution: 'RUNTIME_LIB_PRESENT_LOADER_SEARCH_UNOBSERVED' };
  if (existsSync(path.join(system, item))) return { name: item, resolution: 'WINDOWS_SYSTEM32_FILE_PRESENT' };
  return { name: item, resolution: 'MISSING' };
}
const exports = [];
const exportRva = b.readUInt32LE(directory);
if (exportRva) {
  const at = offset(exportRva), namesCount = b.readUInt32LE(at + 24), namesRva = b.readUInt32LE(at + 32);
  if (namesCount > 8192) throw Error('PGVECTOR_OUTPUT_EXPORT_BOUND');
  const namesAt = offset(namesRva);
  for (let i = 0; i < namesCount; i++) exports.push(name(b.readUInt32LE(namesAt + i * 4)));
}
const receipt = {
  inspectedAt: new Date().toISOString(), file, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex'),
  machine: 'AMD64', loaded: false, runtimeModified: false, postgresLaunched: false,
  eagerImports: imports(1, 20, 12, false).map(resolveImport), delayImports: imports(13, 32, 4, true).map(resolveImport),
  exportCount: exports.length, postgresMagicExportPresent: exports.includes('Pg_magic_func'), exports,
};
writeFileSync(path.join(root, 'extension-static-inspection.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ...receipt, exports: undefined }, null, 2));
