// One-shot LOCAL synthetic catalog inspection; never a remote migration tool.
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildPilotMigrationCatalog, compareSuppliedPilotMigrationRows } from './pilot-migration-catalog.mjs';

const sha = x => createHash('sha256').update(x).digest('hex');
const root = 'C:/dev/endvera-astra-r03';
const cluster = root+'/.scratch/personal-pg-native-15b8389313f549c8b912fde2f657acb9';
const runtime = root+'/.scratch/postgres-native-17.11-3/runtime/pgsql';
const baseline = 'endvera_personal_210_3bc830c1027d44aba7320251b97c2104';
const upgraded = 'endvera_personal_210_95f266aa635145b8a908fee97bec609a';
const inspection = 'endvera_function_definition_review_20260910';
export const FUNCTION_DEFINITION_SQL = `BEGIN READ ONLY;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s';
WITH defs AS (
 SELECT pg_catalog.jsonb_build_array(n.nspname,p.proname,
  (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(tn.nspname,t.typname) ORDER BY a.ordinal),'[]'::pg_catalog.jsonb)::text
   FROM pg_catalog.unnest(p.proargtypes::pg_catalog.oid[]) WITH ORDINALITY a(typ,ordinal)
   JOIN pg_catalog.pg_type t ON t.oid=a.typ JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace)) AS key,
  pg_catalog.pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS
 (SELECT 1 FROM pg_catalog.pg_depend ed WHERE ed.classid='pg_catalog.pg_proc'::pg_catalog.regclass
  AND ed.objid=p.oid AND ed.objsubid=0 AND ed.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass AND ed.deptype='e')
), hashes AS (SELECT key,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(definition,'UTF8')),'hex') AS raw,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(definition,chr(13)||chr(10),chr(10)),'UTF8')),'hex') AS lf,
 pg_catalog.octet_length(definition) AS bytes,
 (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,chr(13)||chr(10),'')))/2 AS pairs
 FROM defs)
SELECT pg_catalog.jsonb_build_object('database',pg_catalog.current_database(),'version',pg_catalog.current_setting('server_version_num'),
 'readOnly',pg_catalog.current_setting('transaction_read_only'),'searchPath',pg_catalog.current_setting('search_path'),
 'historyCount',(SELECT count(*) FROM public."_prisma_migrations"),'functions',
 (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(h) ORDER BY key::text COLLATE "C") FROM hashes h));
ROLLBACK;`;

// Exact concrete first70 migration extraction, independently checked against
// every captured body hash. This is not a general SQL parser.
export function corroborateHistoricalLf(local,remote){
 const historyPath=root+'/specs/210-personal-live-activation/evidence/pilot-migration-metadata-20260910T2106Z.json';
 regular(historyPath);const bytes=readFileSync(historyPath);
 if(sha(bytes)!=='010bf6c0eb2fc3e7d558764c54d7005a0d39de899918cf10d08c09aa40827d09')throw new Error('HISTORY_PIN_REFUSED');
 const history=JSON.parse(bytes),catalog=buildPilotMigrationCatalog(root);
 compareSuppliedPilotMigrationRows(catalog,history.rows);
 const h=new Map(history.rows.map(x=>[x.migration_name,x])),defs=new Map();
 for(const entry of catalog.entries.slice(0,70)){
  const sql=readFileSync(root+'/'+entry.relativePath,'utf8'),row=h.get(entry.migrationName);
  const lf=sha(sql)!==row.checksum&&sha(sql.replaceAll('\r\n','\n'))===row.checksum;
  if(sha(lf?sql.replaceAll('\r\n','\n'):sql)!==row.checksum)throw new Error('HISTORY_BYTES_REFUSED');
  const regex=/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))[\s\S]*?\bAS\s+(\$[A-Za-z_0-9]*\$)([\s\S]*?)\3/gi;
  for(const m of sql.matchAll(regex))defs.set(m[1]??m[2],{body:m[4],lf,migration:entry.migrationName});
 }
 const functions=local.objects.filter(x=>x.family==='function'), names=new Set(),approved=new Set();
 for(const a of functions){
  if(names.has(a.key[1]))throw new Error('AMBIGUOUS_SOURCE_NAME');names.add(a.key[1]);
  const d=defs.get(a.key[1]),b=remote.objects.find(x=>x.family==='function'&&JSON.stringify(x.key)===JSON.stringify(a.key));
  if(!d||!b||sha(d.body)!==a.properties.bodyHash||sha(d.lf?d.body.replaceAll('\r\n','\n'):d.body)!==b.properties.bodyHash)throw new Error('SOURCE_BODY_REFUSED');
  if(d.lf)approved.add(JSON.stringify(a.key));
 }
 if(functions.length!==64||defs.size!==64)throw new Error('SOURCE_COUNT_REFUSED');
 return approved;
}
export function reconcileFunctionDefinitions(capture, local, remote, historicalLfKeys=new Set()) {
 const fail = () => { throw new Error('FUNCTION_DEFINITION_RECONCILIATION_REFUSED'); };
 if(capture.database!==inspection||capture.version!=='170011'||capture.readOnly!=='on'||capture.historyCount!==70||!Array.isArray(capture.functions)||capture.functions.length!==64)fail();
 const index = rows => { const m=new Map(); for(const row of rows){const k=JSON.stringify(row.key);if(m.has(k))fail();m.set(k,row);}return m; };
 const l=index(local.objects.filter(x=>x.family==='function')), r=index(remote.objects.filter(x=>x.family==='function'));
 if(l.size!==64)fail();
 const seen=new Set(), rows=[];
 for(const row of capture.functions){
  const k=JSON.stringify(row.key), a=l.get(k), b=r.get(k);
  if(seen.has(k)||!a||!b||!['raw','lf'].every(x=>/^[0-9a-f]{64}$/.test(row[x]))||!Number.isSafeInteger(row.pairs)||row.pairs<0||!Number.isSafeInteger(row.bytes)||row.bytes<=0)fail();
  seen.add(k);
  rows.push({...row,local:a.properties.definitionHash,remote:b.properties.definitionHash,
   nativeMatchesBaseline:row.raw===a.properties.definitionHash,
   rawMatchesRemote:row.raw===b.properties.definitionHash,
   lfMatchesRemote:row.lf===b.properties.definitionHash,
   historicalLfCorroborated:historicalLfKeys.has(k),
   representation:row.raw===b.properties.definitionHash?'EXACT_RAW':row.lf===b.properties.definitionHash&&historicalLfKeys.has(k)?'HISTORY_CORROBORATED_CRLF_TO_LF':'UNEXPLAINED'});
 }
 return {kind:'LOCAL_NATIVE_FULL_DEFINITION_RECONCILIATION',executionAuthorized:false,backupVerified:false,
  fullSchemaEquivalent:false,remoteProvenanceVerified:false,count:rows.length,
  nativeBaselineMatches:rows.filter(x=>x.nativeMatchesBaseline).length,
  rawRemoteMatches:rows.filter(x=>x.rawMatchesRemote).length,
  lfRemoteMatches:rows.filter(x=>x.lfMatchesRemote).length,
  selectedRepresentationMatches:rows.filter(x=>x.nativeMatchesBaseline&&x.representation!=='UNEXPLAINED').length,
  explainedDeltas:rows.filter(x=>x.nativeMatchesBaseline&&x.representation==='HISTORY_CORROBORATED_CRLF_TO_LF').length,
  unmatched:rows.filter(x=>!x.nativeMatchesBaseline||x.representation==='UNEXPLAINED'),rows};
}

function regular(p){
 for(let a=path.resolve(p);;a=path.dirname(a)){if(lstatSync(a).isSymbolicLink())throw new Error('REPARSE_REFUSED');if(path.dirname(a)===a)break;}
 if(path.resolve(realpathSync(p)).toLowerCase()!==path.resolve(p).toLowerCase())throw new Error('PATH_REFUSED');
}
function run(){
 const receipt=cluster+'/function-definition-reconciliation.json';
 if(existsSync(receipt)||existsSync(cluster+'/data/postmaster.pid'))throw new Error('RUN_REPLAY_OR_ACTIVE_REFUSED');
 for(const p of [cluster,runtime,cluster+'/data',cluster+'/ephemeral-password.txt'])regular(p);
 const localPath=cluster+'/migration-rehearsal/catalog-70.json',remotePath=root+'/.scratch/pilot-schema-remote-20260910T2204Z.json';
 for(const [p,hash]of [[localPath,'c65354c20ba3a8b0e32f3887c835fa7e8b2219b79c871da9ac95b87487de01a3'],[remotePath,'05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4']]){regular(p);if(sha(readFileSync(p))!==hash)throw new Error('SNAPSHOT_HASH_REFUSED');}
 regular(cluster+'/rehearsal-databases.json');
 if(sha(readFileSync(cluster+'/rehearsal-databases.json'))!=='4c7d8260e7745381d6eb8e5ab31619eb88a64c457835c97aff30e2d2d937c05f')throw new Error('MANIFEST_HASH_REFUSED');
 const pins={'pg_ctl.exe':'595303cede56a05eff6e2ec6e6e8bd5531c13832ba09fab57b1a9e93bc945c34','postgres.exe':'8ae8bb442e8a4c4fb2c8e9ad38c19aca610ee3cba33afd69249de769f905329b','psql.exe':'aa12e27530ac07f129e69daca953ea5f02202a7bde45d503e771abc39016536d'};
 for(const [name,hash]of Object.entries(pins)){const p=runtime+'/bin/'+name;regular(p);if(sha(readFileSync(p))!==hash)throw new Error('RUNTIME_HASH_REFUSED');}
 const manifest=JSON.parse(readFileSync(cluster+'/rehearsal-databases.json','utf8'));
 if(manifest.mode!=='SYNTHETIC_POPULATED_70_TO_79'||manifest.baselineDatabase!==baseline||manifest.upgradedDatabase!==upgraded)throw new Error('MANIFEST_REFUSED');
 const env={}; for(const n of ['SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT'])if(process.env[n])env[n]=process.env[n];
 const exe=name=>runtime+'/bin/'+name;
 const control=args=>spawnSync(exe('pg_ctl.exe'),args,{cwd:root,env,windowsHide:true,stdio:'ignore',timeout:55000}).status;
 if(control(['-D',cluster+'/data','status'])!==3)throw new Error('NOT_STOPPED');
 let started=false, result={startedAt:new Date().toISOString(),cluster,baseline,upgraded,inspection,port:54754,querySha256:sha(FUNCTION_DEFINITION_SQL)}, failed;
 try{
  started=true;
  if(control(['-D',cluster+'/data','-l',cluster+'/function-definition-server.log','-o','-h 127.0.0.1 -p 54754 -c ssl=off -c log_statement=none -c log_connections=off -c log_disconnections=off','-w','-t','15','start'])!==0)throw new Error('START_FAILED');
  // Consume only this harness's synthetic credential privately, never output it.
  env.PGPASSWORD=readFileSync(cluster+'/ephemeral-password.txt','utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(env.PGPASSWORD))throw new Error('LOCAL_AUTH_FORMAT');
  Object.assign(env,{PGHOST:'127.0.0.1',PGPORT:'54754',PGUSER:'synthetic_local_operator',PGDATABASE:'postgres',PGCONNECT_TIMEOUT:'5',PGAPPNAME:'function_definition_review',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000'});
  const sql=q=>{const p=spawnSync(exe('psql.exe'),['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',q],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:512*1024});if(p.status!==0)throw new Error('LOCAL_QUERY_FAILED');return p.stdout.trim();};
  const identity=JSON.parse(sql(`SELECT json_build_object('directory',current_setting('data_directory'),'port',current_setting('port'),'version',current_setting('server_version_num'),'baselineSealed',(SELECT NOT datallowconn FROM pg_database WHERE datname='${baseline}'),'cloneExists',EXISTS(SELECT 1 FROM pg_database WHERE datname='${inspection}'));`));
  if(path.resolve(identity.directory)!==path.resolve(cluster+'/data')||identity.port!=='54754'||identity.version!=='170011'||identity.baselineSealed!==true||identity.cloneExists!==false)throw new Error('DB_IDENTITY_REFUSED');
  result.identity=identity;
  // Sole explicitly authorized SQL write: fresh named clone of sealed baseline70.
  env.PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=2000';
  sql(`CREATE DATABASE ${inspection} TEMPLATE ${baseline};`);
  env.PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000';env.PGDATABASE=inspection;
  const capture=JSON.parse(sql(FUNCTION_DEFINITION_SQL));
  const lb=readFileSync(localPath),rb=readFileSync(remotePath);
  const local=JSON.parse(lb),remote=JSON.parse(rb);
  result={...result,localSnapshotSha256:sha(lb),remoteSnapshotSha256:sha(rb),capture,...reconcileFunctionDefinitions(capture,local,remote,corroborateHistoricalLf(local,remote))};
 }catch{failed=true;result.error='LOCAL_INSPECTION_FAILED';}
 finally{
  delete env.PGPASSWORD;
  result.stopExit=started?control(['-D',cluster+'/data','-m','fast','-w','-t','45','stop']):null;
  result.statusExit=control(['-D',cluster+'/data','status']);result.stopped=result.statusExit===3&&!existsSync(cluster+'/data/postmaster.pid');result.finishedAt=new Date().toISOString();
  writeFileSync(receipt,JSON.stringify(result,null,2),{flag:'wx'});
 }
 console.log(JSON.stringify({receipt,sha256:sha(readFileSync(receipt)),count:result.count,nativeBaselineMatches:result.nativeBaselineMatches,rawRemoteMatches:result.rawRemoteMatches,lfRemoteMatches:result.lfRemoteMatches,explainedDeltas:result.explainedDeltas,stopped:result.stopped,error:result.error}));
 if(failed||!result.stopped||result.nativeBaselineMatches!==64||result.selectedRepresentationMatches!==64)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.length!==3||process.argv[2]!=='--run-owned-local')throw new Error('EXPLICIT_LOCAL_MODE_REQUIRED');run();}
