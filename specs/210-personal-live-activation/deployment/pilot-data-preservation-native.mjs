// Controller-owned one-shot synthetic validation. Never remote or a migration executor.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'C:/dev/endvera-astra-r03';
const CLUSTER = `${ROOT}/.scratch/personal-pg-native-15b8389313f549c8b912fde2f657acb9`;
const RUNTIME = `${ROOT}/.scratch/postgres-native-17.11-3/runtime/pgsql`;
const BASELINE = 'endvera_personal_210_3bc830c1027d44aba7320251b97c2104';
const BEFORE = 'endvera_function_definition_review_20260910';
const AFTER = 'endvera_personal_210_95f266aa635145b8a908fee97bec609a';
const NEGATIVE = 'endvera_data_preservation_negative_20260910';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(`NATIVE_DATA_${code}`); };
function regular(file) {
  for (let parent = path.resolve(file);; parent = path.dirname(parent)) {
    if (lstatSync(parent).isSymbolicLink()) fail('LINK');
    if (path.dirname(parent) === parent) break;
  }
  if (path.resolve(realpathSync(file)).toLowerCase() !== path.resolve(file).toLowerCase()) fail('PATH');
}
function pinned(file, expected) {
  regular(file); const bytes = readFileSync(file);
  if (sha(bytes) !== expected) fail('PIN'); return bytes;
}

async function run(expectedModuleHash, expectedMigrationModuleHash) {
  const receiptPath = `${CLUSTER}/data-preservation-native.json`;
  const queryPath = `${CLUSTER}/data-preservation-native.sql`;
  if (existsSync(receiptPath) || existsSync(queryPath) || existsSync(`${CLUSTER}/data/postmaster.pid`)) fail('REPLAY_OR_ACTIVE');
  if (![expectedModuleHash, expectedMigrationModuleHash].every(x => /^[a-f0-9]{64}$/.test(x))) fail('EXPECTED_HASH');
  const modulePath = `${ROOT}/specs/210-personal-live-activation/deployment/pilot-data-preservation.mjs`;
  const migrationsPath = `${ROOT}/specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs`;
  pinned(modulePath, expectedModuleHash); pinned(migrationsPath, expectedMigrationModuleHash);
  const transitives = [
    [`${ROOT}/specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs`,'a27b1c23750cf22b5e71ef89c1d6a83606afa0a7b8b3fa583826f409d695cf3d'],
    [`${ROOT}/scripts/endvera-release-source-binding.mjs`,'ea987e4a73e8b689b5cc2810900d3e079c263b481dafc2aaa04a83f059828f81'],
  ];
  for (const [file, hash] of transitives) pinned(file, hash);
  const { buildPilotDataPreservationQuery, compareSuppliedPilotDataPreservation } = await import(pathToFileURL(modulePath).href);
  const { buildPilotMigrationCatalog } = await import(pathToFileURL(migrationsPath).href);
  const catalogBytes = pinned(`${CLUSTER}/migration-rehearsal/catalog-70.json`, 'c65354c20ba3a8b0e32f3887c835fa7e8b2219b79c871da9ac95b87487de01a3');
  const manifest = JSON.parse(pinned(`${CLUSTER}/rehearsal-databases.json`, '4c7d8260e7745381d6eb8e5ab31619eb88a64c457835c97aff30e2d2d937c05f'));
  if (manifest.baselineDatabase !== BASELINE || manifest.upgradedDatabase !== AFTER || manifest.mode !== 'SYNTHETIC_POPULATED_70_TO_79') fail('MANIFEST');
  const source = { catalog70: JSON.parse(catalogBytes), migrationCatalog: buildPilotMigrationCatalog(ROOT),
    expectedCatalogSha256: '4712414bd28abe78b9c3f2b89a67b5cd271d58825ac29e4014ded4b6b3b176ed' };
  const plan = buildPilotDataPreservationQuery(source);
  if (plan.tableCount !== 183 || plan.columnCount !== 2624) fail('SOURCE_COVERAGE');
  for (const file of [CLUSTER, `${CLUSTER}/data`, `${CLUSTER}/ephemeral-password.txt`]) regular(file);
  const binaries = { 'pg_ctl.exe':'595303cede56a05eff6e2ec6e6e8bd5531c13832ba09fab57b1a9e93bc945c34',
    'postgres.exe':'8ae8bb442e8a4c4fb2c8e9ad38c19aca610ee3cba33afd69249de769f905329b',
    'psql.exe':'aa12e27530ac07f129e69daca953ea5f02202a7bde45d503e771abc39016536d' };
  for (const [file, hash] of Object.entries(binaries)) pinned(`${RUNTIME}/bin/${file}`, hash);
  const env = {};
  for (const key of ['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  const control = args => spawnSync(`${RUNTIME}/bin/pg_ctl.exe`, args, { cwd:ROOT,env,windowsHide:true,stdio:'ignore',timeout:55000 }).status;
  if (control(['-D',`${CLUSTER}/data`,'status']) !== 3) fail('NOT_STOPPED');
  writeFileSync(queryPath, plan.sql, { flag:'wx' });
  let started = false, failed = false;
  const result = { version:'personal-pilot-data-native-v1',startedAt:new Date().toISOString(),cluster:CLUSTER,
    before:BEFORE,after:AFTER,negativeDatabase:NEGATIVE,port:54754,moduleSha256:expectedModuleHash,
    migrationModuleSha256:expectedMigrationModuleHash,querySha256:plan.querySha256,planSha256:plan.planSha256,
    remoteObserved:false,backupVerified:false,fullDatabaseEquivalent:false,providerDispatchPerformed:false };
  try {
    started = true;
    if (control(['-D',`${CLUSTER}/data`,'-l',`${CLUSTER}/data-preservation-server.log`,'-o',
      '-h 127.0.0.1 -p 54754 -c ssl=off -c log_statement=none -c log_connections=off -c log_disconnections=off',
      '-w','-t','15','start']) !== 0) fail('START');
    env.PGPASSWORD = readFileSync(`${CLUSTER}/ephemeral-password.txt`,'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(env.PGPASSWORD)) fail('AUTH_FORMAT');
    Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:'54754',PGUSER:'synthetic_local_operator',PGDATABASE:'postgres',
      PGCONNECT_TIMEOUT:'5',PGAPPNAME:'data_preservation_review',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000'});
    const query = (database, sql, file=false) => {
      env.PGDATABASE=database;
      const child=spawnSync(`${RUNTIME}/bin/psql.exe`,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',file?'-f':'-c',sql],
        {cwd:ROOT,env,encoding:'utf8',windowsHide:true,timeout:50000,maxBuffer:262144});
      if (child.status !== 0) fail('QUERY'); return child.stdout.trim();
    };
    const identity=JSON.parse(query('postgres',`SELECT json_build_object('directory',current_setting('data_directory'),'port',current_setting('port'),'version',current_setting('server_version_num'),'baselineSealed',(SELECT NOT datallowconn FROM pg_database WHERE datname='${BASELINE}'),'beforeReady',(SELECT datallowconn FROM pg_database WHERE datname='${BEFORE}'),'afterReady',(SELECT datallowconn FROM pg_database WHERE datname='${AFTER}'),'negativeExists',EXISTS(SELECT 1 FROM pg_database WHERE datname='${NEGATIVE}'));`));
    if(path.resolve(identity.directory)!==path.resolve(`${CLUSTER}/data`)||identity.port!=='54754'||identity.version!=='170011'
      ||identity.baselineSealed!==true||identity.beforeReady!==true||identity.afterReady!==true||identity.negativeExists!==false)fail('IDENTITY');
    result.identity=identity;
    const verifyHistory=(database,count)=>{
      const rows=JSON.parse(query(database,`SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL,'steps',applied_steps_count) ORDER BY migration_name) FROM public."_prisma_migrations";`));
      if(!Array.isArray(rows)||rows.length!==count)fail('HISTORY_COUNT');
      for(let i=0;i<rows.length;i++){
        const r=rows[i],e=source.migrationCatalog.entries[i];
        if(r.name!==e.migrationName||r.finished!==true||r.rolledBack!==false||r.steps!==1
          ||![e.sha256,e.lfSha256,e.crlfSha256].includes(r.checksum))fail('HISTORY_CONTENT');
      }
      return {count,finished:count,exactOrderedCatalogMatch:true};
    };
    result.beforeHistory=verifyHistory(BEFORE,70);result.afterHistory=verifyHistory(AFTER,79);
    const hashSql=e=>`encode(sha256(convert_to(${e},'UTF8')),'hex')`;
    const bag=(values)=>`(SELECT ${hashSql(`string_agg(${hashSql('to_jsonb(r)::text')},'' ORDER BY ${hashSql('to_jsonb(r)::text')} COLLATE "C")`)} FROM (VALUES ${values}) r(payload))`;
    const arrayHash=a=>hashSql(`jsonb_build_object('dimensions',array_dims('${a}'::text[]),'value',to_jsonb('${a}'::text[]))::text`);
    const serializationSql=`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog; SELECT json_build_object(
      'nullTextEmptyDistinct',(SELECT count(DISTINCT ${hashSql('to_jsonb(r)::text')})=3 FROM (VALUES (NULL::text),('null'::text),(''::text))r(payload)),
      'duplicateMultiplicity',${bag("('A'),('A'),('B')")}<>${bag("('A'),('B'),('B')")},
      'rowOrderInvariant',${bag("('A'),('A'),('B')")}=${bag("('B'),('A'),('A')")},
      'arrayBoundsPreserved',${arrayHash('[0:1]={a,b}')}<>${arrayHash('[1:2]={a,b}')}); ROLLBACK;`;
    result.serializationControls=JSON.parse(query(BEFORE,serializationSql));
    if(Object.keys(result.serializationControls).length!==4||Object.values(result.serializationControls).some(x=>x!==true))fail('SERIALIZATION');
    const capture=(name,database)=>{
      pinned(modulePath,expectedModuleHash); pinned(migrationsPath,expectedMigrationModuleHash); pinned(queryPath,plan.querySha256);
      for(const [file,hash] of transitives)pinned(file,hash);
      const output=query(database,queryPath,true),parsed=JSON.parse(output);
      const target=`${CLUSTER}/data-preservation-${name}.json`;
      writeFileSync(target,output+'\n',{flag:'wx'});
      return {parsed,path:target,sha256:sha(readFileSync(target))};
    };
    env.PGOPTIONS+=' -c timezone=America/New_York';
    const before=capture('before70',BEFORE);
    env.PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000 -c timezone=Asia/Tokyo';
    const after=capture('after79',AFTER);
    result.beforeCapture={path:before.path,sha256:before.sha256};result.afterCapture={path:after.path,sha256:after.sha256};
    result.positive=compareSuppliedPilotDataPreservation(source,before.parsed,after.parsed);
    if(result.positive.changedTables!==0)fail('PRESERVATION');
    // Only new synthetic negative clone changes. Existing baseline/70/79 are not written.
    env.PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=2000';
    query('postgres',`CREATE DATABASE ${NEGATIVE} TEMPLATE ${BASELINE};`);result.negativeCloneCreated=true;
    const changed=query(NEGATIVE,`WITH changed AS (UPDATE public."ConstructionWorkspace" SET name='Synthetic altered preservation negative' WHERE id='rehearsal-workspace' AND name='Synthetic upgrade workspace' RETURNING 1) SELECT count(*) FROM changed;`);
    if(changed!=='1')fail('NEGATIVE_FIXTURE');
    env.PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=2000 -c timezone=UTC';
    const negative=capture('negative70',NEGATIVE);result.negativeCapture={path:negative.path,sha256:negative.sha256};
    result.negative=compareSuppliedPilotDataPreservation(source,before.parsed,negative.parsed);
    if(result.negative.changedTables!==1||result.negative.changedCounts!==0||result.negative.changedDigests!==1)fail('NEGATIVE_ORACLE');
    const different=before.parsed.tables.filter(a=>{
      const b=negative.parsed.tables.find(x=>x.table===a.table);return !b||b.digest!==a.digest||b.rowCount!==a.rowCount;
    }).map(x=>x.table);
    if(JSON.stringify(different)!==JSON.stringify(['ConstructionWorkspace']))fail('NEGATIVE_TABLE');
    result.exactNegativeTable='ConstructionWorkspace';
  } catch { failed=true;result.error='NATIVE_DATA_PRESERVATION_FAILED'; }
  finally {
    delete env.PGPASSWORD;
    result.stopExit=started?control(['-D',`${CLUSTER}/data`,'-m','fast','-w','-t','45','stop']):null;
    result.statusExit=control(['-D',`${CLUSTER}/data`,'status']);
    result.stopped=result.statusExit===3&&!existsSync(`${CLUSTER}/data/postmaster.pid`);
    result.finishedAt=new Date().toISOString();writeFileSync(receiptPath,JSON.stringify(result,null,2),{flag:'wx'});
  }
  console.log(JSON.stringify({receipt:receiptPath,sha256:sha(readFileSync(receiptPath)),positive:result.positive?.status,
    negative:result.negative?.status,stopped:result.stopped,error:result.error}));
  if(failed||!result.stopped)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv.length!==5||process.argv[2]!=='--run-owned-local')fail('EXPLICIT_LOCAL_MODE');
  await run(process.argv[3],process.argv[4]);
}
