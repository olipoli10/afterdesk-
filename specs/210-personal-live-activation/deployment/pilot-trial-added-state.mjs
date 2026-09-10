// Pure query construction and supplied-snapshot validation. No DB or transport.
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const VERSION = 'pilot-trial-added-state-v1';
const MAX_ROWS = 500000;
const hash = value => createHash('sha256').update(value).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw new Error('PILOT_TRIAL_ADDED_STATE_REFUSED'); };
// Exact inventory from rehearsal.mjs / immutable migrations71,72,73,75,76,78,79.
// Deliberately not imported from the executable filesystem rehearsal module.
export const PILOT_TRIAL_ADDED_STATE_INVENTORY = freeze({
  proofTables: ['PersonalCalendarSmsConfirmationNonce', 'PersonalCalendarSmsConfirmation',
    'PersonalSmsTemporalClarification', 'PersonalSmsTemporalClarificationReply', 'PersonalSmsConversationExpectation',
    'PersonalSmsCorrelatedCalendarReview', 'PersonalSmsCorrelatedCalendarApproval'],
  legacyTables: [
    { table: 'AiOperation', nullColumns: ['personalAssistantOperationId'], subjectKind: null },
    { table: 'PersonalAssistantOperation', nullColumns: ['sourcePersonalOperationId', 'modelGatewayOperationId', 'correlatedTemporalReceiptId'], subjectKind: null },
    { table: 'VoiceIntakeSession', nullColumns: ['requestedByUserId', 'workspaceId', 'projectId', 'intakeId', 'projectBrainSourceId',
      'requestCommandId', 'sourceBinding', 'sourceBindingHash', 'segmentManifest', 'segmentManifestHash'], subjectKind: 'voice_intake' },
  ],
});
const manifestSha256 = hash(JSON.stringify({ version: VERSION, maxLegacyRows: MAX_ROWS, proofCountLimit: 1, inventory: PILOT_TRIAL_ADDED_STATE_INVENTORY }));
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const settings = Object.freeze(["SET LOCAL statement_timeout='30000';", "SET LOCAL lock_timeout='2000';",
  "SET LOCAL idle_in_transaction_session_timeout='5000';", "SET LOCAL transaction_timeout='45000';",
  'SET LOCAL search_path=pg_catalog;', 'SET LOCAL row_security=off;', "SET LOCAL TimeZone='UTC';",
  'SET LOCAL standard_conforming_strings=on;', "SET LOCAL work_mem='4MB';"]);
const proofs = PILOT_TRIAL_ADDED_STATE_INVENTORY.proofTables.map(table =>
  `SELECT ${literal(table)}::text AS "table",count(*)::text AS "rowCountAtMostOne" FROM (SELECT 1 FROM ONLY public.${quote(table)} LIMIT 1) AS bounded`).join('\nUNION ALL\n');
const legacy = PILOT_TRIAL_ADDED_STATE_INVENTORY.legacyTables.map(rule => {
  // Only booleans enter the subquery projection; none of the column values leave SQL.
  const violations = rule.nullColumns.map(column => `t.${quote(column)} IS NOT NULL`);
  if (rule.subjectKind !== null) violations.push(`t."subjectKind" IS DISTINCT FROM ${literal(rule.subjectKind)}`);
  return `SELECT ${literal(rule.table)}::text AS "table",count(*)::text AS "rowCount",`
    + `count(*) FILTER (WHERE invalid)::text AS "invalidRows",count(*)>${MAX_ROWS} AS "truncated" FROM `
    + `(SELECT (${violations.join(' OR ')}) AS invalid FROM ONLY public.${quote(rule.table)} AS t LIMIT ${MAX_ROWS + 1}) AS bounded`;
}).join('\nUNION ALL\n');
const select = `WITH proof_counts AS (${proofs}),legacy_counts AS (${legacy})
SELECT jsonb_build_object('version',${literal(VERSION)},'manifestSha256',${literal(manifestSha256)},
'context',jsonb_build_object('database',current_database(),'role',current_user,'serverVersionNum',current_setting('server_version_num')::int,
'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'timeZone',current_setting('TimeZone')),
'proofTables',(SELECT jsonb_agg(jsonb_build_object('table',"table",'rowCountAtMostOne',"rowCountAtMostOne") ORDER BY "table" COLLATE "C") FROM proof_counts),
'legacyTables',(SELECT jsonb_agg(jsonb_build_object('table',"table",'rowCount',"rowCount",'invalidRows',"invalidRows",'truncated',"truncated") ORDER BY "table" COLLATE "C") FROM legacy_counts)) AS snapshot;`;
const sql = ['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;', ...settings, select, 'COMMIT;'].join('\n') + '\n';
const statements = ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;', ...settings, select];
const query = freeze({ version: VERSION, manifestSha256, sql, querySha256: hash(sql), statements,
  transactionSha256: hash(JSON.stringify(statements)), proofTableCount: 7, legacyTableCount: 3, addedColumnCount: 15,
  maxLegacyRowsPerTable: MAX_ROWS, proofCountLimit: 1, queryExecuted: false, executionAuthorized: false });

/** Fixed SQL and exact managed-transaction wrapper. No caller SQL or target options. */
export function buildPilotTrialAddedStateQuery() {
  if (arguments.length !== 0) fail();
  return query;
}
function object(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(name => !keys.includes(name))) fail();
  const result = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !('value' in d)) fail();
    result[key] = d.value;
  }
  return result;
}
function array(value, count) {
  if (!value || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || Object.getOwnPropertyDescriptor(value, 'length')?.value !== count || Reflect.ownKeys(value).length !== count + 1) fail();
  const result = [];
  for (let i = 0; i < count; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !('value' in d)) fail(); result.push(d.value);
  }
  return result;
}
function count(value, max) {
  if (typeof value !== 'string' || value.length > 6 || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > BigInt(max)) fail();
  return BigInt(value);
}
/** Supplied counts only, never proof of actual branch, migration, guards or backup.
 * A violation is a valid negative observation; malformed/incomplete data throws. */
export function inspectSuppliedPilotTrialAddedState(raw) {
  const value = object(raw, ['version', 'manifestSha256', 'context', 'proofTables', 'legacyTables']);
  if (value.version !== VERSION || value.manifestSha256 !== manifestSha256) fail();
  const context = object(value.context, ['database', 'role', 'serverVersionNum', 'readOnly', 'isolation', 'timeZone']);
  if (context.database !== 'neondb' || context.role !== 'neondb_owner' || !Number.isInteger(context.serverVersionNum)
    || context.serverVersionNum < 180000 || context.serverVersionNum >= 190000 || context.readOnly !== 'on'
    || context.isolation !== 'repeatable read' || context.timeZone !== 'UTC') fail();
  const proofNames = new Set(PILOT_TRIAL_ADDED_STATE_INVENTORY.proofTables), legacyNames = new Set(PILOT_TRIAL_ADDED_STATE_INVENTORY.legacyTables.map(x => x.table));
  let nonEmptyProofTables = 0, totalRows = 0n, totalInvalid = 0n;
  for (const rawRow of array(value.proofTables, 7)) {
    const row = object(rawRow, ['table', 'rowCountAtMostOne']);
    if (!proofNames.delete(row.table)) fail();
    if (count(row.rowCountAtMostOne, 1) === 1n) nonEmptyProofTables++;
  }
  const legacyTables = array(value.legacyTables, 3).map(rawRow => {
    const row = object(rawRow, ['table', 'rowCount', 'invalidRows', 'truncated']);
    if (!legacyNames.delete(row.table) || row.truncated !== false) fail();
    const rows = count(row.rowCount, MAX_ROWS), invalid = count(row.invalidRows, MAX_ROWS);
    if (invalid > rows) fail(); totalRows += rows; totalInvalid += invalid;
    return { table: row.table, rowCount: row.rowCount, invalidRows: row.invalidRows, vacuous: rows === 0n };
  }).sort((a, b) => a.table < b.table ? -1 : a.table > b.table ? 1 : 0);
  if (proofNames.size || legacyNames.size) fail();
  return freeze({ version: 'pilot-trial-added-state-review-v1', manifestSha256,
    status: nonEmptyProofTables || totalInvalid ? 'SUPPLIED_ADDED_STATE_VIOLATIONS' : 'SUPPLIED_ADDED_STATE_MATCH',
    proofTableCount: 7, nonEmptyProofTables, proofTablesEmpty: nonEmptyProofTables === 0, proofCountsAreCappedAtOne: true,
    legacyTableCount: 3, addedColumnCount: 15, legacyRowCount: totalRows.toString(), invalidLegacyRows: totalInvalid.toString(),
    legacyTables, vacuousLegacyTables: legacyTables.filter(row => row.vacuous).map(row => row.table),
    allLegacyTablesNonEmpty: legacyTables.every(row => !row.vacuous),
    snapshotProvenanceVerified: false, targetBranchVerified: false, migrationHistoryVerified: false,
    oldDataPreservationVerified: false, schemaGuardsVerified: false, utcDefaultsVerified: false,
    fullSchemaEquivalent: false, backupVerified: false, executionAuthorized: false, databaseRead: false });
}
