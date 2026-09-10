// Byte-only, exact-file inspection. No compiler/linker/DLL execution.
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = 'C:/dev/endvera-astra-r03/.scratch/personal-msvc-inspection-9ec9decbdfb5472caad50da4b87ead64';
const file = path.join(root, 'msvc-crt-x64-store-complete/Contents/VC/Tools/MSVC/14.44.35207/lib/x64/oldnames.lib');
for (let p = file; ; p = path.dirname(p)) { if (lstatSync(p).isSymbolicLink()) throw Error('OLDNAMES_REPARSE_REFUSED'); if (p === path.dirname(p)) break; }
const b = readFileSync(file);
const hash = crypto.createHash('sha256').update(b).digest('hex');
if (hash !== '35bd82cfb02a0146ff9c0ca6bf7dbde61d49c6d4f3493befe584218c370ff41d') throw Error('OLDNAMES_EXACT_HASH_REFUSED');
if (b.toString('ascii', 0, 8) !== '!<arch>\n') throw Error('OLDNAMES_ARCHIVE_REFUSED');
const members = [], specialMembers = [], shapes = new Map();
let at = 8;
while (at < b.length) {
  if (members.length + specialMembers.length > 50000 || at + 60 > b.length) throw Error('OLDNAMES_MEMBER_BOUND');
  const name = b.toString('ascii', at, at + 16).trim();
  const sizeText = b.toString('ascii', at + 48, at + 58).trim();
  if (!/^\d+$/.test(sizeText) || b.toString('ascii', at + 58, at + 60) !== '`\n') throw Error('OLDNAMES_MEMBER_HEADER_REFUSED');
  const size = Number(sizeText), data = at + 60, end = data + size;
  if (end > b.length || size < 0) throw Error('OLDNAMES_MEMBER_SIZE_REFUSED');
  if (name === '/' || name === '//') specialMembers.push({ name, size, offset: at });
  else {
    if (size < 20) throw Error('OLDNAMES_OBJECT_BOUND');
    const machine = b.readUInt16LE(data), sectionCount = b.readUInt16LE(data + 2), optionalSize = b.readUInt16LE(data + 16);
    if (machine !== 0 || optionalSize !== 0 || sectionCount !== 1) throw Error('OLDNAMES_OBJECT_SHAPE_CHANGED');
    const sections = Array.from({ length: sectionCount }, (_, i) => {
      const q = data + 20 + i * 40;
      if (q + 40 > end) throw Error('OLDNAMES_SECTION_BOUND');
      const sectionName = b.toString('ascii', q, q + 8).split('\0')[0];
      const bytes = b.readUInt32LE(q + 16), pointer = b.readUInt32LE(q + 20), characteristics = b.readUInt32LE(q + 36);
      const relocations = b.readUInt16LE(q + 32), lineNumbers = b.readUInt16LE(q + 34);
      if (sectionName !== '.debug$S' || characteristics !== 0x42100040 || pointer + bytes > size || relocations !== 0 || lineNumbers !== 0) throw Error('OLDNAMES_DEBUG_SECTION_CHANGED');
      return { name: sectionName, bytes, characteristics: `0x${characteristics.toString(16)}`, code: false, executable: false, relocations, lineNumbers };
    });
    const symbolPointer = b.readUInt32LE(data + 8), symbolCount = b.readUInt32LE(data + 12), symbolsAt = data + symbolPointer;
    if (symbolCount !== 5 || symbolPointer < 60 || symbolsAt + symbolCount * 18 + 4 > end) throw Error('OLDNAMES_SYMBOL_BOUND');
    const stringsAt = symbolsAt + symbolCount * 18, stringBytes = b.readUInt32LE(stringsAt);
    if (stringBytes < 4 || stringsAt + stringBytes > end) throw Error('OLDNAMES_STRING_TABLE_BOUND');
    const symbols = [];
    for (let i = 0; i < symbolCount; i++) {
      const q = symbolsAt + i * 18;
      let symbolName;
      if (b.readUInt32LE(q) === 0) {
        const offset = b.readUInt32LE(q + 4);
        if (offset < 4 || offset >= stringBytes) throw Error('OLDNAMES_SYMBOL_NAME_OFFSET');
        const start = stringsAt + offset, stop = b.indexOf(0, start);
        if (stop < start || stop >= stringsAt + stringBytes) throw Error('OLDNAMES_SYMBOL_NAME_END');
        symbolName = b.toString('ascii', start, stop);
      } else symbolName = b.toString('ascii', q, q + 8).split('\0')[0];
      if (!/^[a-z0-9_@.$]+$/i.test(symbolName)) throw Error('OLDNAMES_SYMBOL_NAME_REFUSED');
      const value = b.readUInt32LE(q + 8), section = b.readInt16LE(q + 12), type = b.readUInt16LE(q + 14), storage = b[q + 16], auxCount = b[q + 17];
      if (i + auxCount >= symbolCount) throw Error('OLDNAMES_AUXILIARY_BOUND');
      const auxiliary = auxCount ? { targetIndex: b.readUInt32LE(q + 18), characteristics: b.readUInt32LE(q + 22), reservedZero: b.subarray(q + 26, q + 36).every(x => x === 0) } : null;
      symbols.push({ index: i, name: symbolName, value, section, type, storage, auxCount, auxiliary });
      i += auxCount;
    }
    const [comp, feat, target, alias] = symbols;
    if (symbols.length !== 4 || comp.name !== '@comp.id' || feat.name !== '@feat.00' || [comp, feat].some(s => s.storage !== 3 || s.section !== -1 || s.type !== 0 || s.auxCount !== 0)) throw Error('OLDNAMES_COMPILER_SYMBOL_SHAPE');
    if (target.index !== 2 || target.storage !== 2 || target.section !== 0 || target.value !== 0 || target.type !== 0 || target.auxCount !== 0) throw Error('OLDNAMES_ALIAS_TARGET_SHAPE');
    if (alias.index !== 3 || alias.storage !== 105 || alias.section !== 0 || alias.value !== 0 || alias.type !== 0 || alias.auxCount !== 1 || alias.auxiliary.targetIndex !== 2 || alias.auxiliary.characteristics !== 3 || !alias.auxiliary.reservedZero) throw Error('OLDNAMES_WEAK_ALIAS_SHAPE');
    const shape = JSON.stringify({ machine, optionalSize, sectionCount, sections: sections.map(s => ({ ...s, bytes: undefined })), symbolCount, symbolClasses: symbols.map(s => s.storage), aliasAuxTarget: 2, aliasAuxCharacteristics: 3 });
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    members.push({ member: name, archiveOffset: at, size, machine, sections, symbolCountIncludingAuxiliary: symbolCount, symbols, alias: { from: alias.name, to: target.name } });
  }
  at = end + size % 2;
}
if (at !== b.length || members.length !== 228 || specialMembers.length !== 3 || shapes.size !== 1) throw Error('OLDNAMES_ARCHIVE_SHAPE_CHANGED');
const receipt = {
  inspectedAt: new Date().toISOString(), file, sha256: hash, bytes: b.length, downloadedCodeExecuted: false,
  source: { machineTypes: 'https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#machine-types', weakExternals: 'https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#auxiliary-format-3-weak-externals' },
  classification: 'EXACT_PINNED_COFF_WEAK_ALIAS_OBJECTS_MACHINE_UNSPECIFIED_NOT_AMD64_PROOF',
  specialMembers, objectCount: members.length, shapes: [...shapes].map(([shape, count]) => ({ ...JSON.parse(shape), count })), members,
};
writeFileSync(path.join(root, 'oldnames-symbol-inspection.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ ...receipt, members: undefined }, null, 2));
