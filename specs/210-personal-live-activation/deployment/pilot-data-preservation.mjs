import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { compareSuppliedPilotSchemaSnapshots } from './pilot-schema-drift.mjs';
import { inspectSuppliedPilotMigrationCatalog } from './pilot-migration-catalog.mjs';

const VERSION = 'personal-pilot-data-preservation-v1';
const MAX_TABLES = 256, MAX_COLUMNS = 128, MAX_TOTAL_COLUMNS = 4096, MAX_ROWS = 500000;
const MAX_SQL_BYTES = 1048576, MAX_RESULT_BYTES = 131072;
const sha = value => createHash('sha256').update(value).digest('hex');
/** @returns {never} */
const fail = reason => { throw new Error(`PILOT_DATA_${reason}`); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const keys = (value, expected) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== expected.length
    || expected.some(key => !Object.hasOwn(value, key))) fail('SHAPE');
};

// Snapshot untrusted supplied objects without invoking getters/toJSON/proxy traps.
// The larger input bound covers a full schema catalog, not customer row payloads.
function copy(value, maxBytes = 5242880) {
  let bytes = 0, nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 500000 || depth > 20) fail('BOUND');
    if (typeof v === 'string') {
      if (v.length > 65536 || v.includes('\0') || Buffer.from(v).toString('utf8') !== v) fail('STRING');
      bytes += Buffer.byteLength(v) + 4; if (bytes > maxBytes) fail('BYTES'); return v;
    }
    if (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) { bytes += 24; if (bytes > maxBytes) fail('BYTES'); return v; }
    if (!v || typeof v !== 'object' || types.isProxy(v)) fail('SHAPE');
    const array = Array.isArray(v);
    if (Object.getPrototypeOf(v) !== (array ? Array.prototype : Object.prototype)) fail('SHAPE');
    const length = array ? Object.getOwnPropertyDescriptor(v, 'length')?.value : undefined;
    if (array && (!Number.isSafeInteger(length) || length > 25000)) fail('BOUND');
    const names = Reflect.ownKeys(v);
    if (names.length > 25001 || (array && names.length !== length + 1)) fail('BOUND');
    const out = array ? [] : {};
    for (const name of names) {
      if (array && name === 'length') continue;
      if (typeof name !== 'string' || name === '__proto__' || (array && (!/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= length))) fail('SHAPE');
      const d = Object.getOwnPropertyDescriptor(v, name);
      if (!d?.enumerable || !('value' in d)) fail('ACCESSOR');
      visit(name, depth + 1);
      Object.defineProperty(out, name, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  };
  const result = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > maxBytes) fail('BYTES');
  return result;
}
const identifier = value => {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 63 || /[\u0000-\u001f\u007f]/.test(value)) fail('IDENTIFIER');
  return '"' + value.replaceAll('"', '""') + '"';
};
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const digestSql = expression => `pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${expression},'UTF8')),'hex')`;
const builtins = new Set(['text','varchar','bool','int2','int4','int8','float4','float8','numeric','uuid','bytea','date','timestamp','timestamptz','time','timetz','interval','jsonb']);
const arrays = new Set(['_text','_int4']);
const historyFields = ['id','checksum','finished_at','migration_name','logs','rolled_back_at','started_at','applied_steps_count'];

/** Builds SQL only. Supplied fingerprints bind inputs, not their provenance or a real migration count. */
export function buildPilotDataPreservationQuery(raw) {
  const input = copy(raw); keys(input, ['catalog70','migrationCatalog','expectedCatalogSha256']);
  if (!hash(input.expectedCatalogSha256)) fail('CATALOG_HASH');
  const checked = compareSuppliedPilotSchemaSnapshots(input.catalog70, input.catalog70);
  if (checked.leftSha256 !== input.expectedCatalogSha256) fail('CATALOG_HASH');
  if (checked.status !== 'SUPPLIED_SUPPORTED_PUBLIC_CATALOG_MATCH' || checked.coverage.unsupportedObjectCount !== 0) fail('UNSUPPORTED_CATALOG');
  const migrations = inspectSuppliedPilotMigrationCatalog(input.migrationCatalog);
  const names = migrations.entries.slice(0, 70).map(entry => entry.migrationName);
  const source = input.catalog70.objects;
  const tables = source.filter(entry => entry.family === 'table').sort((a,b) => a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0);
  if (!tables.length || tables.length > MAX_TABLES) fail('TABLE_BOUND');
  const enumNames = new Set(source.filter(entry => entry.family === 'enum').map(entry => JSON.stringify(entry.key)));
  const vector = source.some(entry => entry.family === 'extension' && entry.key[1] === 'vector'
    && entry.properties.schema === 'public' && entry.properties.version === '0.8.6');
  let totalColumns = 0;
  const tablePlans = tables.map(table => {
    const [schema, name] = table.key; identifier(schema); identifier(name);
    if (schema !== 'public' || table.properties.persistence !== 'p' || table.properties.accessMethod !== 'heap'
      || table.properties.rls || table.properties.forceRls) fail('UNSUPPORTED_TABLE');
    const columns = source.filter(entry => entry.family === 'column' && entry.key[0] === schema && entry.key[1] === name)
      .sort((a,b) => a.properties.position - b.properties.position);
    totalColumns += columns.length;
    if (!columns.length || columns.length > MAX_COLUMNS || totalColumns > MAX_TOTAL_COLUMNS) fail('COLUMN_BOUND');
    const positions = new Set();
    const projected = columns.map(column => {
      identifier(column.key[2]); const p = column.properties;
      if (positions.has(p.position) || p.generated !== '' || p.identity !== '') fail('UNSUPPORTED_COLUMN');
      positions.add(p.position);
      const [ns, type] = p.type;
      const array = ns === 'pg_catalog' && arrays.has(type);
      if (array ? p.dimensions !== 1 : p.dimensions !== 0) fail('UNSUPPORTED_TYPE');
      if (!(ns === 'pg_catalog' && (builtins.has(type) || array))
        && !(ns === 'public' && enumNames.has(JSON.stringify(p.type)))
        && !(ns === 'public' && type === 'vector' && vector)) fail('UNSUPPORTED_TYPE');
      return { name: column.key[2], type: [...p.type], modifier: p.modifier, dimensions: p.dimensions, position: p.position, array };
    });
    if (name === '_prisma_migrations' && (projected.length !== 8 || historyFields.some(field => !projected.some(c => c.name === field)))) fail('HISTORY_COLUMNS');
    return { schema, name, historyPrefixOnly: name === '_prisma_migrations', columns: projected };
  });
  if (!tablePlans.some(table => table.historyPrefixOnly)) fail('HISTORY_REQUIRED');
  const manifest = { version: VERSION, suppliedCatalogSha256: checked.leftSha256, migrationCatalogSha256: migrations.catalogSha256,
    historicalMigrationNames: names, tables: tablePlans, maxRowsPerTable: MAX_ROWS,
    canonicalization: 'old-column-jsonb-record-sha256-ordered-multiset-v1' };
  const planSha256 = sha(JSON.stringify(manifest));
  const selects = tablePlans.map(table => {
    const projection = table.columns.map(column => {
      const ref = `t.${identifier(column.name)}`;
      // to_jsonb(array) alone loses lower bounds. Keep dimensional metadata too.
      return (column.array ? `pg_catalog.jsonb_build_object('dimensions',pg_catalog.array_dims(${ref}),'value',pg_catalog.to_jsonb(${ref}))` : ref) + ` AS ${identifier(column.name)}`;
    }).join(',');
    const where = table.historyPrefixOnly ? ` WHERE t."migration_name" IN (${names.map(literal).join(',')})` : '';
    const history = table.historyPrefixOnly
      ? `pg_catalog.count(*)=70 AND pg_catalog.count(DISTINCT old_row."migration_name")=70 AND pg_catalog.bool_and(old_row."finished_at" IS NOT NULL AND old_row."rolled_back_at" IS NULL AND old_row."applied_steps_count">=1)`
      : 'true';
    return `SELECT ${literal(table.name)}::pg_catalog.text AS "table",pg_catalog.count(*)::pg_catalog.text AS "rowCount",`
      + `CASE WHEN pg_catalog.count(*)<=${MAX_ROWS} THEN ${digestSql(`COALESCE(pg_catalog.string_agg(${digestSql('pg_catalog.to_jsonb(old_row)::pg_catalog.text')},'' ORDER BY ${digestSql('pg_catalog.to_jsonb(old_row)::pg_catalog.text')} COLLATE "C"),'')`)} ELSE NULL END AS "digest",`
      + `pg_catalog.count(*)>${MAX_ROWS} AS "truncated",(${history}) AS "historyComplete" FROM `
      + `(SELECT ${projection} FROM ONLY ${identifier(table.schema)}.${identifier(table.name)} AS t${where} LIMIT ${MAX_ROWS + 1}) AS old_row`;
  });
  const statement = `WITH aggregates AS (${selects.join('\nUNION ALL\n')})\nSELECT pg_catalog.jsonb_build_object('version',${literal(VERSION)},'planSha256',${literal(planSha256)},`
    + `'catalogSha256',${literal(checked.leftSha256)},'tables',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('table',"table",'rowCount',"rowCount",'digest',"digest",'truncated',"truncated",'historyComplete',"historyComplete") ORDER BY "table" COLLATE "C")) AS snapshot FROM aggregates;`;
  const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL statement_timeout='30000';\nSET LOCAL lock_timeout='2000';\nSET LOCAL idle_in_transaction_session_timeout='5000';\nSET LOCAL transaction_timeout='45000';\nSET LOCAL search_path=pg_catalog;\nSET LOCAL row_security=off;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL TimeZone='UTC';\nSET LOCAL DateStyle='ISO, YMD';\nSET LOCAL IntervalStyle='postgres';\nSET LOCAL bytea_output='hex';\nSET LOCAL extra_float_digits=3;\nSET LOCAL work_mem='4MB';\n${statement}\nCOMMIT;\n`;
  if (Buffer.byteLength(sql) > MAX_SQL_BYTES) fail('SQL_BOUND');
  return freeze({ version: VERSION, manifest, planSha256, querySha256: sha(sql), sql, tableCount: tablePlans.length, columnCount: totalColumns,
    sourceProvenanceVerified: false, historical70Authenticated: false, executionAuthorized: false, backupVerified: false, databaseRead: false });
}

function inspectCapture(raw, plan) {
  const value = copy(raw, MAX_RESULT_BYTES); keys(value, ['version','planSha256','catalogSha256','tables']);
  if (value.version !== VERSION || value.planSha256 !== plan.planSha256 || value.catalogSha256 !== plan.manifest.suppliedCatalogSha256) fail('CAPTURE_BINDING');
  if (!Array.isArray(value.tables) || value.tables.length !== plan.tableCount) fail('CAPTURE_TABLE_COUNT');
  const expected = new Set(plan.manifest.tables.map(table => table.name)), seen = new Set();
  const result = new Map();
  for (const row of value.tables) {
    keys(row, ['table','rowCount','digest','truncated','historyComplete']);
    if (typeof row.table !== 'string' || !expected.has(row.table) || seen.has(row.table)) fail('CAPTURE_TABLE');
    seen.add(row.table);
    if (typeof row.rowCount !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(row.rowCount) || BigInt(row.rowCount)>9223372036854775807n) fail('CAPTURE_COUNT');
    if (row.truncated !== false || BigInt(row.rowCount)>BigInt(MAX_ROWS)) fail('CAPTURE_TRUNCATED');
    if (!hash(row.digest) || (row.rowCount === '0' && row.digest !== sha(''))) fail('CAPTURE_DIGEST');
    if (row.historyComplete !== true || (row.table === '_prisma_migrations' && row.rowCount !== '70')) fail('CAPTURE_HISTORY');
    result.set(row.table, row);
  }
  return result;
}

/** Supplied aggregate equality only. Rebuilds the closed plan; never authenticates captures or releases row digests. */
export function compareSuppliedPilotDataPreservation(sourceInput, leftInput, rightInput) {
  const plan = buildPilotDataPreservationQuery(sourceInput);
  const left = inspectCapture(leftInput, plan), right = inspectCapture(rightInput, plan);
  let changedTables = 0, changedCounts = 0, changedDigests = 0;
  for (const [name, a] of left) {
    const b = right.get(name), count = a.rowCount !== b.rowCount, digest = a.digest !== b.digest;
    if (count) changedCounts++; if (digest) changedDigests++; if (count || digest) changedTables++;
  }
  return freeze({ version: 'personal-pilot-data-comparison-v1', status: changedTables ? 'SUPPLIED_OLD_COLUMN_AGGREGATES_DIFFER' : 'SUPPLIED_OLD_COLUMN_AGGREGATES_MATCH',
    tableCount: plan.tableCount, columnCount: plan.columnCount, changedTables, changedCounts, changedDigests,
    historicalMigrationScope: 'EXACT_PREFIX_70_ONLY_NEW_HISTORY_REQUIRES_SEPARATE_CHECK',
    dataPreservationAuthenticated: false, fullSchemaEquivalent: false, newColumnsVerified: false, newProofTablesVerified: false,
    snapshotProvenanceVerified: false, executionAuthorized: false, backupVerified: false, databaseRead: false });
}
