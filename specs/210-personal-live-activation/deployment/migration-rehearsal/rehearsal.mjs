import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildPilotMigrationCatalog } from '../pilot-migration-catalog.mjs';
import { PILOT_SCHEMA_CATALOG_SQL, compareSuppliedPilotSchemaSnapshots } from '../pilot-schema-drift.mjs';
import { assertReleaseRegularFile } from '../../../../scripts/endvera-release-source-binding.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const fail = code => { throw new Error(`PERSONAL_REHEARSAL_${code}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const legacyCounts = Object.freeze({ User: 1, ConstructionWorkspace: 1, ConstructionWorkspaceMember: 1,
  ConstructionConnectorAccount: 2, PersonalAssistantBudget: 1, PersonalAssistantOperation: 4,
  PersonalAssistantDeliveryReceipt: 1, VoiceIntakeSession: 1, VoiceIntakeSegment: 1, AiOperation: 1 });
export const proofTables = Object.freeze(['PersonalCalendarSmsConfirmationNonce', 'PersonalCalendarSmsConfirmation',
  'PersonalSmsTemporalClarification', 'PersonalSmsTemporalClarificationReply', 'PersonalSmsConversationExpectation',
  'PersonalSmsCorrelatedCalendarReview', 'PersonalSmsCorrelatedCalendarApproval']);
const added = Object.freeze({ AiOperation: { personalAssistantOperationId: null }, PersonalAssistantOperation: {
  sourcePersonalOperationId: null, modelGatewayOperationId: null, correlatedTemporalReceiptId: null },
VoiceIntakeSession: { subjectKind: 'voice_intake', requestedByUserId: null, workspaceId: null, projectId: null,
  intakeId: null, projectBrainSourceId: null, requestCommandId: null, sourceBinding: null,
  sourceBindingHash: null, segmentManifest: null, segmentManifestHash: null } });
const defaults = Object.freeze({ AiUsage: 'createdAt', AccountProviderSpendHold: 'createdAt', AiOperation: 'createdAt',
  ModelGatewayPolicyVersion: 'createdAt', ModelGatewayRouteProfile: 'createdAt', ModelGatewayOperation: 'createdAt',
  ModelGatewayDecision: 'decidedAt', ModelGatewayAttempt: 'startedAt', ModelGatewayBreaker: 'changedAt',
  ModelGatewayBreakerEvent: 'createdAt', ModelGatewayAuditEvent: 'createdAt', PersonalAssistantOperation: 'createdAt',
  PersonalCalendarSmsConfirmationNonce: 'createdAt', PersonalCalendarSmsConfirmation: 'createdAt',
  PersonalAssistantBudget: 'createdAt', PersonalAssistantDeliveryReceipt: 'createdAt', VoiceIntakeSession: 'createdAt', VoiceIntakeSegment: 'createdAt' });
const requiredConstraints = ['ai_operation_personal_subject_ck', 'voice_pb_exclusive_subject_ck',
  'voice_pb_source_tenant_fkey', 'personal_correlated_calendar_operation_receipt_fk',
  'sms_correlated_approval_review_fk', 'sms_correlated_approval_shape_check'];
const requiredTriggers = ['sms_correlated_approval_guard', 'sms_correlated_approval_no_truncate',
  'sms_correlated_approval_operation_guard', 'sms_correlated_approval_final_binding', 'sms_correlated_approval_operation_final'];
const requiredIndexes = ['sms_conversation_one_active_pair', 'voice_pb_one_session_per_source_key',
  'sms_correlated_approval_review_key', 'sms_correlated_approval_operation_key', 'sms_correlated_approval_token_key'];
const quote = text => `'${text.replaceAll("'", "''")}'`;

/** Fixed, read-only queries. No application delegates or migration-history writes. */
export function snapshotSql(upgraded = false) {
  const tables = Object.keys(legacyCounts).map(table => `${quote(table)},(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM "${table}" t)`);
  const checks = upgraded ? `,'proofCounts',jsonb_build_object(${proofTables.map(table => `${quote(table)},(SELECT count(*) FROM "${table}")`).join(',')}),
    'defaults',(SELECT jsonb_object_agg(c.relname || '.' || a.attname,pg_get_expr(d.adbin,d.adrelid))
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND (${Object.entries(defaults).map(([table, column]) => `(c.relname=${quote(table)} AND a.attname=${quote(column)})`).join(' OR ')})),
    'constraints',(SELECT COALESCE(jsonb_object_agg(conname,convalidated),'{}'::jsonb) FROM pg_constraint WHERE connamespace='public'::regnamespace),
    'triggers',(SELECT COALESCE(jsonb_object_agg(tgname,tgenabled::text),'{}'::jsonb) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace),
    'invalidIndexes',(SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND (NOT i.indisvalid OR NOT i.indisready)),
    'indexes',(SELECT jsonb_object_agg(c.relname,i.indisvalid AND i.indisready) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace),
    'invalidTriggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace AND t.tgenabled<>'O'),
    'dispatchBody',(SELECT prosrc FROM pg_proc WHERE oid='sms_temporal_final_binding()'::regprocedure)` : '';
  return `SET TIME ZONE 'UTC';\nSELECT jsonb_build_object('tables',jsonb_build_object(${tables.join(',')}),
    'history',(SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM "_prisma_migrations" m)${checks})::text;\n`;
}

export function privatePrismaConfig(schema, migrations) {
  if (![schema, migrations].every(value => typeof value === 'string' && path.isAbsolute(value))) fail('CONFIG_PATH');
  return `import { defineConfig } from 'prisma/config';\nexport default defineConfig({schema:${JSON.stringify(schema)},migrations:{path:${JSON.stringify(migrations)}}});\n`;
}

function regular(pathname) {
  for (let current = pathname;; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) fail('REPARSE');
    if (current === pathname && !stat.isFile()) fail('FILE_REQUIRED');
    if (path.dirname(current) === current) break;
  }
}
function clusterPath(root, cluster) {
  const expectedParent = path.join(path.resolve(root), '.scratch');
  if (!path.isAbsolute(cluster) || path.dirname(cluster) !== expectedParent || !/^personal-pg-native-[a-f0-9]{32}$/.test(path.basename(cluster))) fail('CLUSTER_PATH');
  for (let current = cluster;; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('REPARSE');
    if (path.dirname(current) === current) break;
  }
  return path.join(cluster, 'migration-rehearsal');
}

/** Called only after the existing harness has applied private ACL and ignore checks. */
export function stageMigrationRehearsal(root, cluster) {
  const destination = clusterPath(root, cluster), catalog = buildPilotMigrationCatalog(root);
  verifyInstalledPrisma(root);
  // Exclusive directory creation: a replay must never overwrite a prior staged rehearsal.
  mkdirSync(destination);
  const write = (name, bytes) => writeFileSync(path.join(destination, name), bytes, { flag: 'wx' });
  const schema = assertReleaseRegularFile(root, 'prisma/schema.prisma');
  const schemaBytes = readFileSync(schema);
  if (schemaBytes.length > 2_000_000) fail('SCHEMA_SIZE');
  write('schema.prisma', schemaBytes);
  const lock = readFileSync(assertReleaseRegularFile(root, 'prisma/migrations/migration_lock.toml'));
  if (lock.length > 4096) fail('LOCK_SIZE');
  for (const [label, count] of [['70', 70], ['79', 79]]) {
    const migrations = path.join(destination, label, 'migrations');
    mkdirSync(migrations, { recursive: true });
    write(`${label}/migrations/migration_lock.toml`, lock);
    for (const entry of catalog.entries.slice(0, count)) {
      const bytes = readFileSync(assertReleaseRegularFile(root, entry.relativePath));
      if (sha(bytes) !== entry.sha256) fail('SOURCE_CHANGED');
      mkdirSync(path.join(migrations, entry.migrationName));
      write(`${label}/migrations/${entry.migrationName}/migration.sql`, bytes);
    }
    write(`prisma-${label}.config.ts`, privatePrismaConfig(path.join(destination, 'schema.prisma'), migrations));
  }
  const seed = readFileSync(assertReleaseRegularFile(root, 'specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql'));
  if (seed.length > 32768) fail('SEED_SIZE');
  write('seed-70.sql', seed);
  write('snapshot-70.sql', snapshotSql(false)); write('snapshot-79.sql', snapshotSql(true));
  write('schema-catalog.sql', PILOT_SCHEMA_CATALOG_SQL);
  write('catalog.json', JSON.stringify(catalog));
  write('inputs.json', JSON.stringify({ schemaSha256: sha(schemaBytes), seedSha256: sha(seed), lockSha256: sha(lock), catalogSha256: catalog.catalogSha256, schemaCatalogQuerySha256: sha(PILOT_SCHEMA_CATALOG_SQL) }));
  return { destination, migrationCount: 79, baselineCount: 70, providerCallsAuthorized: false };
}

function history(value, catalog, count) {
  if (!Array.isArray(value) || value.length !== count) fail('HISTORY_COUNT');
  value.forEach((row, i) => {
    const entry = catalog.entries[i];
    if (!row || row.migration_name !== entry.migrationName || row.checksum !== entry.sha256
      || typeof row.id !== 'string' || !row.id || typeof row.started_at !== 'string' || !Number.isFinite(Date.parse(row.started_at))
      || typeof row.finished_at !== 'string' || !Number.isFinite(Date.parse(row.finished_at))
      || Date.parse(row.finished_at) < Date.parse(row.started_at) || row.rolled_back_at !== null
      || (row.logs !== null && row.logs !== '') || row.applied_steps_count !== 1) fail('HISTORY_MISMATCH');
  });
}
export function verifyBaseline(snapshot, catalog) {
  history(snapshot?.history, catalog, 70);
  if (!snapshot.tables || !isDeepStrictEqual(Object.keys(snapshot.tables).sort(), Object.keys(legacyCounts).sort())) fail('TABLES');
  for (const [table, count] of Object.entries(legacyCounts)) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows) || rows.length !== count || rows.some(row => typeof row.id !== 'string') || new Set(rows.map(row => row.id)).size !== count) fail('SEED_COUNT');
    if (rows.some(row => Object.keys(added[table] ?? {}).some(key => Object.hasOwn(row, key)))) fail('NOT_BASELINE_70');
  }
  return true;
}
export function migration77Body(sql) {
  const match = /CREATE OR REPLACE FUNCTION sms_temporal_final_binding\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/.exec(sql);
  if (!match) fail('DISPATCH_SOURCE');
  return match[1];
}
export function verifyUpgrade(before, after, catalog, expectedDispatchBody) {
  verifyBaseline(before, catalog); history(after?.history, catalog, 79);
  if (!isDeepStrictEqual(before.history, after.history.slice(0, 70))) fail('HISTORICAL_MIGRATION_CHANGED');
  if (!after.tables || !isDeepStrictEqual(Object.keys(before.tables).sort(), Object.keys(after.tables).sort())) fail('TABLES');
  for (const table of Object.keys(legacyCounts)) {
    const expected = before.tables[table].map(row => ({ ...row, ...added[table] }));
    if (!isDeepStrictEqual(expected, after.tables[table])) fail('LEGACY_DATA_CHANGED');
  }
  if (!isDeepStrictEqual(after.proofCounts, Object.fromEntries(proofTables.map(table => [table, 0])))) fail('PROOF_CREATED');
  const expectedDefaults = Object.entries(defaults).map(([table, column]) => `${table}.${column}`).sort();
  if (!after.defaults || !isDeepStrictEqual(Object.keys(after.defaults).sort(), expectedDefaults)
    || Object.values(after.defaults).some(value => value !== "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text)")) fail('UTC_DEFAULTS');
  if (requiredConstraints.some(name => after.constraints?.[name] !== true)
    || Object.values(after.constraints ?? {}).some(value => value !== true)) fail('CONSTRAINTS');
  if (requiredTriggers.some(name => after.triggers?.[name] !== 'O')
    || Object.values(after.triggers ?? {}).some(value => value !== 'O') || after.invalidIndexes !== 0 || after.invalidTriggers !== 0
    || requiredIndexes.some(name => after.indexes?.[name] !== true)
    || typeof expectedDispatchBody !== 'string' || !expectedDispatchBody || after.dispatchBody !== expectedDispatchBody) fail('SCHEMA_GUARDS');
  return { version: 'personal-pilot-70-to-79-rehearsal-v1', status: 'SYNTHETIC_POPULATED_UPGRADE_VERIFIED',
    baselineCount: 70, finalCount: 79, legacyRowCount: Object.values(legacyCounts).reduce((a, b) => a + b, 0),
    historicalRowsPreserved: true, newProofTablesEmpty: true, databaseRuntime: 'POSTGRESQL_17_11',
    remotePg18Verified: false, providerCallsAuthorized: false, deploymentAuthorized: false };
}

function jsonFile(file) {
  regular(file);
  const bytes = readFileSync(file);
  if (bytes.length > 4_000_000) fail('SNAPSHOT_SIZE');
  return JSON.parse(bytes.toString('utf8'));
}
/** Self-comparison validates captured shape, not provenance or remote equivalence. */
export function verifyCatalogCapture(snapshot) {
  const comparison = compareSuppliedPilotSchemaSnapshots(snapshot, snapshot);
  if (snapshot.server.versionNum !== 170011) fail('CATALOG_RUNTIME');
  return { version: 'personal-native-catalog-capture-v1',
    querySha256: sha(PILOT_SCHEMA_CATALOG_SQL), objectCount: snapshot.objectCount,
    familyCounts: snapshot.familyCounts, comparison, remoteObserved: false };
}
/** Read-only dependency exception: the existing r03 -> r9 -> r8 dependency
 * junctions only. Source, staging and paths below the final target reject links. */
export function verifyInstalledPrisma(root) {
  const dependencies = path.join(path.resolve(root), 'node_modules');
  const resolved = realpathSync(dependencies);
  if (lstatSync(dependencies).isSymbolicLink()) {
    const intermediate = path.resolve('C:/dev/nightlexicon-endvera-construction-operating-assistant-r9-mobile-assistant/node_modules');
    const final = path.resolve('C:/dev/nightlexicon-endvera-construction-operating-assistant-r8-mobile-foundation/node_modules');
    if (path.resolve(root) !== path.resolve(ROOT) || readlinkSync(dependencies) !== intermediate
      || !lstatSync(intermediate).isSymbolicLink() || readlinkSync(intermediate) !== final
      || resolved !== final || lstatSync(final).isSymbolicLink()) fail('DEPENDENCY_JUNCTION');
  } else if (resolved !== dependencies) fail('DEPENDENCY_JUNCTION');
  const installed = jsonFile(path.join(resolved, 'prisma/package.json'));
  if (installed.name !== 'prisma' || installed.version !== '6.19.3') fail('PRISMA_VERSION');
  return { version: installed.version, sharedDependencyJunction: resolved !== dependencies, readOnly: true };
}
function exactDirectory(directory, names, directories = []) {
  for (let current = directory;; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('REPARSE');
    if (path.dirname(current) === current) break;
  }
  const entries = readdirSync(directory, { withFileTypes: true });
  if (!isDeepStrictEqual(entries.map(entry => entry.name).sort(), [...names].sort())) fail('STAGED_INVENTORY');
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (directories.includes(entry.name) ? !entry.isDirectory() : !entry.isFile())) fail('REPARSE');
  }
}
export function verifyStagedInputs(root, cluster) {
  const staged = clusterPath(root, cluster), catalog = jsonFile(path.join(staged, 'catalog.json'));
  verifyInstalledPrisma(root);
  if (!isDeepStrictEqual(catalog, buildPilotMigrationCatalog(root))) fail('CATALOG_CHANGED');
  const exact = (file, expected) => {
    regular(file);
    if (!readFileSync(file).equals(Buffer.from(expected))) fail('STAGED_BYTES_CHANGED');
  };
  const schema = readFileSync(assertReleaseRegularFile(root, 'prisma/schema.prisma'));
  const seed = readFileSync(assertReleaseRegularFile(root, 'specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql'));
  const lock = readFileSync(assertReleaseRegularFile(root, 'prisma/migrations/migration_lock.toml'));
  const expectedInputs = { schemaSha256: sha(schema), seedSha256: sha(seed), lockSha256: sha(lock), catalogSha256: catalog.catalogSha256, schemaCatalogQuerySha256: sha(PILOT_SCHEMA_CATALOG_SQL) };
  if (!isDeepStrictEqual(jsonFile(path.join(staged, 'inputs.json')), expectedInputs)) fail('SOURCE_CHANGED');
  exact(path.join(staged, 'schema.prisma'), schema); exact(path.join(staged, 'seed-70.sql'), seed);
  exact(path.join(staged, 'snapshot-70.sql'), snapshotSql(false)); exact(path.join(staged, 'snapshot-79.sql'), snapshotSql(true));
  exact(path.join(staged, 'schema-catalog.sql'), PILOT_SCHEMA_CATALOG_SQL);
  for (const [label, count] of [['70', 70], ['79', 79]]) {
    const migrations = path.join(staged, label, 'migrations');
    const names = catalog.entries.slice(0, count).map(entry => entry.migrationName);
    exactDirectory(path.join(staged, label), ['migrations'], ['migrations']);
    exactDirectory(migrations, ['migration_lock.toml', ...names], names);
    exact(path.join(migrations, 'migration_lock.toml'), lock);
    exact(path.join(staged, `prisma-${label}.config.ts`), privatePrismaConfig(path.join(staged, 'schema.prisma'), migrations));
    for (const entry of catalog.entries.slice(0, count)) {
      exactDirectory(path.join(migrations, entry.migrationName), ['migration.sql']);
      const file = path.join(migrations, entry.migrationName, 'migration.sql'); regular(file);
      if (sha(readFileSync(file)) !== entry.sha256) fail('STAGED_BYTES_CHANGED');
    }
  }
  return catalog;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, cluster] = process.argv.slice(2);
    const staged = clusterPath(ROOT, cluster);
    if (mode === 'stage') console.log(JSON.stringify(stageMigrationRehearsal(ROOT, cluster)));
    else if (['verify-inputs', 'baseline', 'verify', 'catalog-70', 'catalog-79'].includes(mode)) {
      const catalog = verifyStagedInputs(ROOT, cluster);
      if (mode === 'verify-inputs') { console.log('PERSONAL_REHEARSAL_INPUTS_VERIFIED'); process.exitCode = 0; }
      else if (mode === 'catalog-70' || mode === 'catalog-79') {
        const receipt = verifyCatalogCapture(jsonFile(path.join(staged, `${mode}.json`)));
        writeFileSync(path.join(staged, `${mode}-receipt.json`), JSON.stringify(receipt, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(receipt));
      }
      else {
      const before = jsonFile(path.join(staged, 'before.json'));
      if (mode === 'baseline') { verifyBaseline(before, catalog); console.log('PERSONAL_REHEARSAL_BASELINE_70_VERIFIED'); }
      else {
        const source77 = path.join(staged, '79', 'migrations', catalog.entries[76].migrationName, 'migration.sql');
        const receipt = verifyUpgrade(before, jsonFile(path.join(staged, 'after.json')), catalog, migration77Body(readFileSync(source77, 'utf8')));
        writeFileSync(path.join(staged, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(receipt));
      }
      }
    } else fail('MODE');
  } catch (error) {
    console.error(error instanceof Error && /^PERSONAL_REHEARSAL_[A-Z0-9_]+$/.test(error.message) ? error.message : 'PERSONAL_REHEARSAL_REFUSED');
    process.exitCode = 1;
  }
}
