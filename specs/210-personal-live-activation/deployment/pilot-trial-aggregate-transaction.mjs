// Pure adapter only. No connector, filesystem, credentials or SQL execution.
import { createHash } from 'node:crypto';
import { buildPilotDataPreservationQuery } from './pilot-data-preservation.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const RAW_TRIAL_CATALOG_SHA256 = '05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4';
const NORMALIZED_TRIAL_CATALOG_SHA256 = 'b1c8f9902f0d30d6f0da0c1534f66e72d839a50c5f20af93fff58c2909fd1966';
const BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;';
const FIRST = 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;';
const SETTINGS = Object.freeze(["SET LOCAL statement_timeout='30000';", "SET LOCAL lock_timeout='2000';",
  "SET LOCAL idle_in_transaction_session_timeout='5000';", "SET LOCAL transaction_timeout='45000';",
  'SET LOCAL search_path=pg_catalog;', 'SET LOCAL row_security=off;', 'SET LOCAL standard_conforming_strings=on;',
  "SET LOCAL TimeZone='UTC';", "SET LOCAL DateStyle='ISO, YMD';", "SET LOCAL IntervalStyle='postgres';",
  "SET LOCAL bytea_output='hex';", 'SET LOCAL extra_float_digits=3;', "SET LOCAL work_mem='4MB';"]);
const PREFIX = BEGIN + '\n' + SETTINGS.join('\n') + '\n';
const SUFFIX = 'COMMIT;\n';
/** @returns {never} */
const fail = () => { throw new Error('PILOT_TRIAL_AGGREGATE_INPUT_REFUSED'); };
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };

/** Rebuilds the reviewed builder from supplied catalog inputs; accepts neither a
 * caller SQL string nor a caller-authored plan. This lower-level pure transform
 * is not the operational trial pin check; use preparePilotTrialAggregateTransaction.
 * Semicolons and quotes inside valid identifiers/literals are never split. */
export function buildPilotAggregateTransaction(sourceInput) {
  try {
    const plan = buildPilotDataPreservationQuery(sourceInput);
    if (plan.version !== 'personal-pilot-data-preservation-v1' || plan.manifest.version !== plan.version
      || plan.manifest.maxRowsPerTable !== 500000 || plan.manifest.historicalMigrationNames.length !== 70
      || plan.manifest.canonicalization !== 'old-column-jsonb-record-sha256-ordered-multiset-v1'
      || ['sourceProvenanceVerified', 'historical70Authenticated', 'executionAuthorized', 'backupVerified', 'databaseRead'].some(key => plan[key] !== false)
      || plan.tableCount !== plan.manifest.tables.length
      || plan.columnCount !== plan.manifest.tables.reduce((count, table) => count + table.columns.length, 0)
      || typeof plan.sql !== 'string' || Buffer.byteLength(plan.sql) > 1048576 || sha(plan.sql) !== plan.querySha256
      || !plan.sql.startsWith(PREFIX) || !plan.sql.endsWith(SUFFIX)) fail();
    const body = plan.sql.slice(PREFIX.length, -SUFFIX.length);
    if (!body.startsWith('WITH aggregates AS (') || !body.endsWith(' AS snapshot FROM aggregates;\n')) fail();
    const statements = [FIRST, ...SETTINGS, body];
    // Exact byte reconstruction guards the boundary translation, not a generic
    // SQL grammar. Only BEGIN becomes SET TRANSACTION; connector owns COMMIT.
    if (BEGIN + '\n' + statements.slice(1, -1).join('\n') + '\n' + statements.at(-1) + SUFFIX !== plan.sql) fail();
    return frozen({ version: 'pilot-trial-aggregate-transaction-v1', statements, statementCount: statements.length,
      originalQuerySha256: plan.querySha256, transactionSha256: sha(JSON.stringify(statements)), planSha256: plan.planSha256,
      suppliedCatalogSha256: plan.manifest.suppliedCatalogSha256, migrationCatalogSha256: plan.manifest.migrationCatalogSha256,
      tableCount: plan.tableCount, columnCount: plan.columnCount, maxRowsPerTable: 500000,
      sourceProvenanceVerified: false, historical70Authenticated: false, executionAuthorized: false, backupVerified: false,
      databaseRead: false, dataPreservationVerified: false });
  } catch { fail(); }
}

/** The controller supplies the exact already-captured private T catalog bytes and
 * a freshly built local migration catalog in the same process. Matching the two
 * fixed catalog pins is not a fresh provider/endpoint observation or permission. */
export function preparePilotTrialAggregateTransaction(rawCatalogBytes, migrationCatalog) {
  try {
    if (!(rawCatalogBytes instanceof Uint8Array) || rawCatalogBytes.byteLength < 1 || rawCatalogBytes.byteLength > 5242880) fail();
    const bytes = Buffer.from(rawCatalogBytes);
    if (sha(bytes) !== RAW_TRIAL_CATALOG_SHA256) fail();
    const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) fail();
    const result = buildPilotAggregateTransaction({ catalog70: JSON.parse(text), migrationCatalog,
      expectedCatalogSha256: NORMALIZED_TRIAL_CATALOG_SHA256 });
    if (result.tableCount !== 183 || result.columnCount !== 2624) fail();
    return frozen({ ...result, rawTrialCatalogSha256: RAW_TRIAL_CATALOG_SHA256, trialInputPinsMatched: true, remoteObserved: false });
  } catch { fail(); }
}
