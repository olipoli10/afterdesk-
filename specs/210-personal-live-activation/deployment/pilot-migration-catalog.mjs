import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertReleaseRegularFile } from '../../../scripts/endvera-release-source-binding.mjs';

const VERSION = 'personal-pilot-migration-catalog-v1';
const NAMES_SHA256 = '88fc394fdb36fa5c90441f9f51d4bd5598dea6785efa7c7711a3acb3eb9c1bca';
const BASELINE_LAST = '20260910002000_personal_outbound_budget';
const LAST = '20260911043000_android_device_calendar_bridge';
const MAX_BYTES = 262144;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(`PILOT_MIGRATION_${code}`); };
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nameValid = name => typeof name === 'string' && /^\d{14}_[a-z0-9_]{1,160}$/.test(name);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

function record(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('SHAPE_REFUSED');
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) fail('SHAPE_REFUSED');
  const copy = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !('value' in d)) fail('SHAPE_REFUSED');
    copy[key] = d.value;
  }
  return copy;
}
function array(value, length) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail('COUNT_REFUSED');
  const d = Object.getOwnPropertyDescriptors(value);
  if (d.length.value !== length || Reflect.ownKeys(d).length !== length + 1) fail('COUNT_REFUSED');
  return Array.from({ length }, (_, i) => {
    const item = d[String(i)];
    if (!item || !item.enumerable || !('value' in item)) fail('SHAPE_REFUSED');
    return item.value;
  });
}
function requireNames(names) {
  if (names.length !== 80 || names.some(name => !nameValid(name)) || new Set(names).size !== 80
    || names.some((name, i) => i > 0 && names[i - 1] >= name)
    || names[69] !== BASELINE_LAST || names[79] !== LAST || hash(JSON.stringify(names)) !== NAMES_SHA256) fail('ORDERED_NAMES_REFUSED');
}

/** Exact byte inspection, not SQL parsing or normalization. At most one LF/CRLF
 * representation is changed; BOM, mixed endings, bare CR, NUL and invalid UTF8 refuse. */
export function inspectPilotMigrationBytes(migrationName, input) {
  if (!nameValid(migrationName) || !(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > MAX_BYTES) fail('BYTES_REFUSED');
  const bytes = Buffer.from(input), text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes) || bytes.includes(0) || text.startsWith('\uFEFF')) fail('TEXT_ENCODING_REFUSED');
  const hasCr = text.includes('\r');
  if (hasCr && /[\r\n]/.test(text.replaceAll('\r\n', ''))) fail('LINE_ENDINGS_REFUSED');
  const lf = hasCr ? text.replaceAll('\r\n', '\n') : text;
  return freeze({ migrationName, relativePath: `prisma/migrations/${migrationName}/migration.sql`, byteSize: bytes.length,
    sha256: hash(bytes), lineEnding: hasCr ? 'CRLF' : text.includes('\n') ? 'LF' : 'NONE',
    lfSha256: hash(lf), crlfSha256: hash(lf.replaceAll('\n', '\r\n')) });
}

const entryKeys = ['ordinal', 'migrationName', 'relativePath', 'byteSize', 'sha256', 'lineEnding', 'lfSha256', 'crlfSha256'];
const coreKeys = ['version', 'mode', 'totalCount', 'historicalBaselineCount', 'pendingCount', 'orderedNamesSha256', 'entries',
  'readOnly', 'remoteObserved', 'executionAuthorized', 'backupVerified', 'driftVerified'];
function catalogCore(entries) {
  return { version: VERSION, mode: 'LOCAL_BYTES_ONLY', totalCount: 80, historicalBaselineCount: 70, pendingCount: 10,
    orderedNamesSha256: NAMES_SHA256, entries, readOnly: true, remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false };
}

/** Reads only local regular migration files. No Git CLI, DB, env, credentials,
 * network or writes. The resulting hash pins these observed bytes, not a commit. */
export function buildPilotMigrationCatalog(repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.split(/[\\/]/).includes('..')) fail('ROOT_PATH_REFUSED');
  const root = path.resolve(repositoryRoot);
  // The shared helper covers root and descendants; also refuse linked ancestors.
  for (let ancestor = path.dirname(root);; ancestor = path.dirname(ancestor)) {
    const stat = lstatSync(ancestor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('ROOT_ANCESTOR_REFUSED');
    if (path.dirname(ancestor) === ancestor) break;
  }
  // This checks root/migrations parents before any directory enumeration.
  assertReleaseRegularFile(root, 'prisma/migrations/migration_lock.toml');
  const dir = path.join(root, 'prisma/migrations');
  const children = readdirSync(dir, { withFileTypes: true });
  if (children.length !== 81 || children.some(item => item.name !== 'migration_lock.toml' && (!item.isDirectory() || item.isSymbolicLink()))) fail('DIRECTORY_CONTENT_REFUSED');
  const names = children.filter(item => item.name !== 'migration_lock.toml').map(item => item.name).sort();
  requireNames(names);
  const entries = names.map((name, index) => {
    const relative = `prisma/migrations/${name}/migration.sql`, file = assertReleaseRegularFile(root, relative);
    if (readdirSync(path.dirname(file)).join('|') !== 'migration.sql') fail('DIRECTORY_CONTENT_REFUSED');
    const stat = lstatSync(file);
    if (stat.size < 1 || stat.size > MAX_BYTES) fail('BYTES_REFUSED');
    const item = inspectPilotMigrationBytes(name, readFileSync(file));
    return { ordinal: index + 1, ...item };
  });
  const core = catalogCore(entries);
  return freeze({ ...core, catalogSha256: hash(JSON.stringify(core)) });
}

function inspectCatalog(raw) {
  const value = record(raw, [...coreKeys, 'catalogSha256']);
  const entries = array(value.entries, 80).map((rawEntry, i) => {
    const entry = record(rawEntry, entryKeys);
    if (entry.ordinal !== i + 1 || !nameValid(entry.migrationName) || entry.relativePath !== `prisma/migrations/${entry.migrationName}/migration.sql`
      || !Number.isSafeInteger(entry.byteSize) || entry.byteSize < 1 || entry.byteSize > MAX_BYTES
      || !hex(entry.sha256) || !hex(entry.lfSha256) || !hex(entry.crlfSha256)
      || !['LF', 'CRLF', 'NONE'].includes(entry.lineEnding)
      || entry.sha256 !== (entry.lineEnding === 'CRLF' ? entry.crlfSha256 : entry.lfSha256)
      || entry.lineEnding === 'NONE' && entry.lfSha256 !== entry.crlfSha256) fail('CATALOG_ENTRY_REFUSED');
    return entry;
  });
  requireNames(entries.map(entry => entry.migrationName));
  const core = catalogCore(entries);
  for (const key of coreKeys.filter(key => key !== 'entries')) if (value[key] !== core[key]) fail('CATALOG_SHAPE_REFUSED');
  if (!hex(value.catalogSha256) || value.catalogSha256 !== hash(JSON.stringify(core))) fail('CATALOG_HASH_REFUSED');
  return { ...core, catalogSha256: value.catalogSha256 };
}

/** Pure shape/hash validation of a supplied catalog; not observed migration history or provenance. */
export function inspectSuppliedPilotMigrationCatalog(raw) {
  return freeze(inspectCatalog(raw));
}
function finished(value) {
  if (value instanceof Date && Object.getPrototypeOf(value) === Date.prototype && Reflect.ownKeys(value).length === 0) return Number.isFinite(Date.prototype.getTime.call(value));
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Only a comparison of supplied five-column migration rows. No remote identity,
 * transport, backup, schema drift or permission is established by a match.
 * Imported catalog hashes provide internal consistency, not byte provenance;
 * rebuild with buildPilotMigrationCatalog before any operational use. */
export function compareSuppliedPilotMigrationRows(rawCatalog, rawRows) {
  const catalog = inspectCatalog(rawCatalog), rows = array(rawRows, 70);
  const expected = new Map(catalog.entries.slice(0, 70).map(item => [item.migrationName, item]));
  const seen = new Set(), matches = [];
  for (const raw of rows) {
    const row = record(raw, ['migration_name', 'checksum', 'finished_at', 'rolled_back_at', 'applied_steps_count']);
    if (!nameValid(row.migration_name) || !expected.has(row.migration_name)) fail('REMOTE_NAME_REFUSED');
    if (seen.has(row.migration_name)) fail('REMOTE_DUPLICATE_REFUSED');
    seen.add(row.migration_name);
    if (!finished(row.finished_at) || row.rolled_back_at !== null || !Number.isSafeInteger(row.applied_steps_count) || row.applied_steps_count < 1) fail('REMOTE_STATE_REFUSED');
    if (!hex(row.checksum)) fail('REMOTE_CHECKSUM_REFUSED');
    const entry = expected.get(row.migration_name);
    const checksumMatch = row.checksum === entry.sha256 ? 'EXACT_BYTES' : row.checksum === entry.lfSha256 ? 'LF_BYTES_ONLY'
      : row.checksum === entry.crlfSha256 ? 'CRLF_BYTES_ONLY' : null;
    if (checksumMatch === null) fail('REMOTE_CHECKSUM_REFUSED');
    matches.push({ ordinal: entry.ordinal, migrationName: entry.migrationName, checksumMatch });
  }
  return freeze({ version: 'personal-pilot-migration-comparison-v1', status: 'SUPPLIED_ROWS_MATCH_HISTORICAL_70_ONLY',
    catalogSha256: catalog.catalogSha256, matchedCount: 70, matches: matches.sort((a, b) => a.ordinal - b.ordinal),
    pending: catalog.entries.slice(70).map(entry => ({ migrationName: entry.migrationName, sha256: entry.sha256 })),
    readOnly: true, catalogProvenanceVerified: false, remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root')) fail('CLI_ARGUMENT_REFUSED');
    process.stdout.write(`${JSON.stringify(buildPilotMigrationCatalog(args[1]))}\n`);
  } catch {
    // Never print paths, raw rows, file contents or arbitrary filesystem errors.
    process.stderr.write('PILOT_MIGRATION_LOCAL_CATALOG_REFUSED\n'); process.exitCode = 1;
  }
}
