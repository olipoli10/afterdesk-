import { createHash } from 'node:crypto';
import { types, isDeepStrictEqual } from 'node:util';

// Sources: PostgreSQL17/18 catalog-pg-constraint, catalog-pg-attribute and
// functions-info official documentation, read2026-09-10. No catalog query is
// executed here. One statement gives one MVCC observation, not backup/provenance.
// All deparsers are non-pretty. Their hashes are NEVER whitespace-normalized.
const VERSION = 'personal-pilot-schema-snapshot-v1';
const MAX_OBJECTS = 25000, MAX_BYTES = 4194304;
const hashSql = expression => `pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${expression},'UTF8')),'hex')`;
const ext = (catalog, alias) => `NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend ed WHERE ed.classid='pg_catalog.${catalog}'::pg_catalog.regclass AND ed.objid=${alias}.oid AND ed.objsubid=0 AND ed.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass AND ed.deptype='e')`;
const pair = (schema, name) => `pg_catalog.jsonb_build_array(${schema},${name})`;
const signature = p => `(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(tn.nspname,t.typname) ORDER BY a.ordinal),'[]'::pg_catalog.jsonb)::text FROM pg_catalog.unnest(${p}.proargtypes::pg_catalog.oid[]) WITH ORDINALITY a(typ,ordinal) JOIN pg_catalog.pg_type t ON t.oid=a.typ JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace)`;
const key = (...parts) => `pg_catalog.jsonb_build_array(${parts.join(',')})`;
const props = entries => `pg_catalog.jsonb_build_object(${Object.entries(entries).map(([name, sql]) => `'${name}',${sql}`).join(',')})`;
const row = (family, identity, fields, from) => `SELECT '${family}'::text AS family, ${identity} AS key, ${props(fields)} AS properties FROM ${from}`;
const columnNames = (table, numbers) => `(SELECT COALESCE(pg_catalog.jsonb_agg(COALESCE(a.attname::text,'<EXPRESSION>') ORDER BY k.ordinal),'[]'::pg_catalog.jsonb) FROM pg_catalog.unnest(${numbers}) WITH ORDINALITY k(num,ordinal) LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=${table} AND a.attnum=k.num)`;

const queries = [
  row('table', key("'public'", 'c.relname'), {
    persistence: 'c.relpersistence::text', accessMethod: "COALESCE(am.amname::text,'')", replicaIdentity: 'c.relreplident::text',
    rls: 'c.relrowsecurity', forceRls: 'c.relforcerowsecurity', optionsHash: hashSql('c.reloptions::text'), tablespace: 'ts.spcname',
  }, 'app_rel c LEFT JOIN pg_catalog.pg_am am ON am.oid=c.relam LEFT JOIN pg_catalog.pg_tablespace ts ON ts.oid=c.reltablespace WHERE c.relkind=\'r\''),
  row('column', key("'public'", 'c.relname', 'a.attname'), {
    position: 'a.attnum', type: pair('tn.nspname','t.typname'), modifier: 'a.atttypmod', dimensions: 'a.attndims', notNull: 'a.attnotnull',
    notNullCount: "CASE WHEN v.major=18 THEN (SELECT count(*) FROM pg_catalog.pg_constraint nn WHERE nn.conrelid=c.oid AND nn.contype='n' AND a.attnum=ANY(nn.conkey)) ELSE NULL END",
    notNullEnforced: "CASE WHEN v.major=18 THEN (SELECT pg_catalog.bool_and((pg_catalog.to_jsonb(nn)->>'conenforced')::boolean) FROM pg_catalog.pg_constraint nn WHERE nn.conrelid=c.oid AND nn.contype='n' AND a.attnum=ANY(nn.conkey)) ELSE NULL END",
    notNullValidated: "CASE WHEN v.major=18 THEN (SELECT pg_catalog.bool_and(nn.convalidated) FROM pg_catalog.pg_constraint nn WHERE nn.conrelid=c.oid AND nn.contype='n' AND a.attnum=ANY(nn.conkey)) ELSE NULL END",
    generated: 'a.attgenerated::text', identity: 'a.attidentity::text', defaultHash: hashSql('pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)'),
    collation: `CASE WHEN co.oid IS NULL THEN NULL ELSE ${pair('cn.nspname','co.collname')} END`,
    collationHash: hashSql("CASE WHEN co.oid IS NULL THEN NULL ELSE pg_catalog.jsonb_build_array(co.collprovider,co.collisdeterministic,co.collencoding,co.collcollate,co.collctype,co.collversion,pg_catalog.to_jsonb(co)->>'colllocale',pg_catalog.to_jsonb(co)->>'colliculocale',pg_catalog.to_jsonb(co)->>'collicurules')::text END"),
    storage: 'a.attstorage::text', compression: 'a.attcompression::text', optionsHash: hashSql('a.attoptions::text'),
  }, `app_rel c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
    CROSS JOIN v WHERE c.relkind='r'`),
  row('constraint', key("'public'", 'c.relname', 'x.conname'), {
    kind: 'x.contype::text', columns: columnNames('c.oid','x.conkey'),
    target: `CASE WHEN rc.oid IS NULL THEN NULL ELSE ${pair('rn.nspname','rc.relname')} END`, targetColumns: columnNames('rc.oid','x.confkey'),
    onUpdate: 'x.confupdtype::text', onDelete: 'x.confdeltype::text', match: 'x.confmatchtype::text',
    deferrable: 'x.condeferrable', deferred: 'x.condeferred', validated: 'x.convalidated',
    enforced: "CASE WHEN v.major=18 THEN (pg_catalog.to_jsonb(x)->>'conenforced')::boolean ELSE NULL END",
    period: "CASE WHEN v.major=18 THEN (pg_catalog.to_jsonb(x)->>'conperiod')::boolean ELSE NULL END",
    noInherit: 'x.connoinherit', definitionHash: hashSql('pg_catalog.pg_get_constraintdef(x.oid,false)'),
    internalTriggersHash: hashSql("(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pn.nspname,p.proname,tg.tgtype,tg.tgenabled,tg.tgdeferrable,tg.tginitdeferred) ORDER BY pn.nspname,p.proname,tg.tgtype,tg.tgenabled,tg.tgdeferrable,tg.tginitdeferred),'[]'::pg_catalog.jsonb)::text FROM pg_catalog.pg_trigger tg JOIN pg_catalog.pg_proc p ON p.oid=tg.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace WHERE tg.tgconstraint=x.oid AND tg.tgisinternal)"),
  }, `app_rel c JOIN pg_catalog.pg_constraint x ON x.conrelid=c.oid
    LEFT JOIN pg_catalog.pg_class rc ON rc.oid=x.confrelid LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace
    CROSS JOIN v WHERE c.relkind='r' AND x.contype<>'n' AND ${ext('pg_constraint','x')}`),
  row('index', key("'public'", 'ic.relname'), {
    table: pair("'public'",'c.relname'), unique: 'i.indisunique', primary: 'i.indisprimary', exclusion: 'i.indisexclusion', immediate: 'i.indimmediate',
    nullsNotDistinct: 'i.indnullsnotdistinct', valid: 'i.indisvalid', ready: 'i.indisready', live: 'i.indislive', definitionHash: hashSql('pg_catalog.pg_get_indexdef(i.indexrelid,0,false)'),
  }, `app_rel c JOIN pg_catalog.pg_index i ON i.indrelid=c.oid JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid WHERE c.relkind='r' AND ${ext('pg_class','ic')}`),
  row('function', key("'public'", 'p.proname', signature('p')), {
    language: 'l.lanname', returns: pair('rn.nspname','rt.typname'), returnsSet: 'p.proretset', volatility: 'p.provolatile::text', strict: 'p.proisstrict',
    securityDefiner: 'p.prosecdef', leakproof: 'p.proleakproof', parallel: 'p.proparallel::text', configHash: hashSql('p.proconfig::text'),
    bodyHash: hashSql('p.prosrc'), defaultsHash: hashSql('pg_catalog.pg_get_expr(p.proargdefaults,0,false)'), definitionHash: hashSql('pg_catalog.pg_get_functiondef(p.oid)'),
  }, `app_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang JOIN pg_catalog.pg_type rt ON rt.oid=p.prorettype JOIN pg_catalog.pg_namespace rn ON rn.oid=rt.typnamespace WHERE p.prokind='f'`),
  row('trigger', key("'public'", 'c.relname', 't.tgname'), {
    function: key('pn.nspname','p.proname',signature('p')), enabled: 't.tgenabled::text', type: 't.tgtype', deferrable: 't.tgdeferrable', deferred: 't.tginitdeferred', definitionHash: hashSql('pg_catalog.pg_get_triggerdef(t.oid,false)'),
  }, `app_rel c JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace WHERE c.relkind='r' AND NOT t.tgisinternal AND ${ext('pg_trigger','t')}`),
  row('enum', key("'public'",'t.typname'), {
    labels: "(SELECT COALESCE(pg_catalog.jsonb_agg(e.enumlabel ORDER BY e.enumsortorder),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid)",
  }, `app_type t WHERE t.typtype='e'`),
  row('acl', key("'public'","'SCHEMA'","'public'","''"), { owner: 'pg_catalog.pg_get_userbyid(n.nspowner)', aclHash: hashSql('n.nspacl::text') }, "pg_catalog.pg_namespace n WHERE n.nspname='public'"),
  row('acl', key("'public'","'TABLE'",'c.relname',"''"), { owner: 'pg_catalog.pg_get_userbyid(c.relowner)', aclHash: hashSql('c.relacl::text') }, "app_rel c WHERE c.relkind='r'"),
  row('acl', key("'public'","'COLUMN'",'c.relname','a.attname'), { owner: 'pg_catalog.pg_get_userbyid(c.relowner)', aclHash: hashSql('a.attacl::text') }, "app_rel c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped"),
  row('acl', key("'public'","'FUNCTION'",'p.proname',signature('p')), { owner: 'pg_catalog.pg_get_userbyid(p.proowner)', aclHash: hashSql('p.proacl::text') }, "app_proc p WHERE p.prokind='f'"),
  row('acl', key("'public'","'TYPE'",'t.typname',"''"), { owner: 'pg_catalog.pg_get_userbyid(t.typowner)', aclHash: hashSql('t.typacl::text') }, "app_type t WHERE t.typtype='e'"),
  row('acl', key("CASE WHEN d.defaclnamespace=0 THEN '*' ELSE 'public' END","'DEFAULT'",'pg_catalog.pg_get_userbyid(d.defaclrole)','d.defaclobjtype::text'), { owner: 'pg_catalog.pg_get_userbyid(d.defaclrole)', aclHash: hashSql('d.defaclacl::text') }, "pg_catalog.pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='public')"),
  row('policy', key("'public'",'c.relname','p.polname'), { command: 'p.polcmd::text', permissive: 'p.polpermissive',
    roles: "(SELECT pg_catalog.jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(r) END) FROM pg_catalog.unnest(p.polroles) r)",
    usingHash: hashSql('pg_catalog.pg_get_expr(p.polqual,p.polrelid,false)'), checkHash: hashSql('pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false)'),
  }, "app_rel c JOIN pg_catalog.pg_policy p ON p.polrelid=c.oid WHERE c.relkind='r'"),
  row('extension', key('n.nspname','e.extname'), { schema: 'n.nspname', version: 'e.extversion', owner: 'pg_catalog.pg_get_userbyid(e.extowner)' }, 'pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace'),
  row('unsupported', key("'public'","'RELATION'",'c.relname'), { kind: "'RELKIND_'||c.relkind::text" }, "app_rel c WHERE c.relkind NOT IN ('r','i')"),
  row('unsupported', key("'public'","'PARTITION'",'c.relname'), { kind: "'PARTITION_OR_INHERITANCE'" }, "app_rel c WHERE c.relispartition OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits h WHERE h.inhrelid=c.oid OR h.inhparent=c.oid)"),
  row('unsupported', key("'public'","'TYPE'",'t.typname'), { kind: "'TYPE_'||t.typtype::text" }, "app_type t WHERE t.typtype<>'e' AND NOT (t.typelem<>0 AND EXISTS(SELECT 1 FROM pg_catalog.pg_type elem WHERE elem.oid=t.typelem AND elem.typarray=t.oid)) AND NOT(t.typtype='c' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class rc WHERE rc.oid=t.typrelid AND rc.relkind<>'c'))"),
  row('unsupported', key("'public'","'ROUTINE'",'p.proname',signature('p')), { kind: "'PROKIND_'||p.prokind::text" }, "app_proc p WHERE p.prokind<>'f'"),
  row('unsupported', key("'public'","'RULE'",'c.relname','r.rulename'), { kind: "'RULE'" }, `app_rel c JOIN pg_catalog.pg_rewrite r ON r.ev_class=c.oid WHERE ${ext('pg_rewrite','r')}`),
  row('unsupported', key("'public'","'INTERNAL_TRIGGER'",'c.relname','t.tgname'), { kind: "'UNCLASSIFIED_INTERNAL_TRIGGER'" }, "app_rel c JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid WHERE t.tgisinternal AND t.tgconstraint=0"),
  row('unsupported', key("'public'","'COMPLEX_NOT_NULL'",'c.relname','a.attname'), { kind: "'COMPLEX_NOT_NULL'" }, "app_rel c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid CROSS JOIN v WHERE v.major=18 AND a.attnum>0 AND NOT a.attisdropped AND ((SELECT count(*) FROM pg_catalog.pg_constraint x WHERE x.conrelid=c.oid AND x.contype='n' AND a.attnum=ANY(x.conkey))>1 OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint nn WHERE nn.conrelid=c.oid AND nn.contype='n' AND a.attnum=ANY(nn.conkey) AND (nn.connoinherit OR NOT nn.conislocal OR nn.coninhcount<>0 OR nn.condeferrable OR nn.condeferred OR (pg_catalog.to_jsonb(nn)->>'conperiod')::boolean)))"),
];
for (const [catalog, namespace, name] of [['pg_operator','oprnamespace','oprname'],['pg_opclass','opcnamespace','opcname'],
  ['pg_opfamily','opfnamespace','opfname'],['pg_collation','collnamespace','collname'],['pg_conversion','connamespace','conname'],
  ['pg_statistic_ext','stxnamespace','stxname'],['pg_ts_config','cfgnamespace','cfgname'],['pg_ts_dict','dictnamespace','dictname'],
  ['pg_ts_parser','prsnamespace','prsname'],['pg_ts_template','tmplnamespace','tmplname']]) {
  queries.push(row('unsupported', key("'public'",`'${catalog}'`, 'o.'+name,
    `(pg_catalog.pg_identify_object('pg_catalog.${catalog}'::pg_catalog.regclass,o.oid,0)).identity`),
  { kind: `'${catalog}'` }, `pg_catalog.${catalog} o JOIN pg_catalog.pg_namespace n ON n.oid=o.${namespace} WHERE n.nspname='public' AND ${ext(catalog,'o')}`));
}
queries.push(row('unsupported',key("'*'","'EVENT_TRIGGER'",'e.evtname'),{kind:"'DATABASE_EVENT_TRIGGER'"},`pg_catalog.pg_event_trigger e WHERE ${ext('pg_event_trigger','e')}`));
// A non-extension child must not disappear merely because its parent belongs to
// an extension. Its semantics are outside this supported table scope: report gap.
for (const [catalog, parent, name] of [['pg_constraint','conrelid','conname'],['pg_trigger','tgrelid','tgname'],
  ['pg_rewrite','ev_class','rulename'],['pg_policy','polrelid','polname']]) {
  queries.push(row('unsupported',key("'public'",`'EXTENSION_PARENT_${catalog}'`,'c.relname','x.'+name),
    {kind:`'NON_EXTENSION_CHILD_OF_EXTENSION_TABLE'`},`pg_catalog.${catalog} x JOIN pg_catalog.pg_class c ON c.oid=x.${parent}
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM app_rel ar WHERE ar.oid=c.oid) AND ${ext(catalog,'x')}`));
}
queries.push(row('unsupported',key("'public'","'EXTENSION_PARENT_INDEX'",'ic.relname'),{kind:"'NON_EXTENSION_INDEX_OF_EXTENSION_TABLE'"},
  `app_rel ic JOIN pg_catalog.pg_index ix ON ix.indexrelid=ic.oid JOIN pg_catalog.pg_class c ON c.oid=ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM app_rel ar WHERE ar.oid=c.oid)`));
const familyNames=['table','column','constraint','index','function','trigger','enum','acl','policy','extension','unsupported'];

export const PILOT_SCHEMA_CATALOG_SQL = `WITH
v AS (SELECT pg_catalog.current_setting('server_version_num')::integer AS num, pg_catalog.current_setting('server_version_num')::integer/10000 AS major),
app_rel AS MATERIALIZED (SELECT c.* FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND ${ext('pg_class','c')}),
app_proc AS MATERIALIZED (SELECT p.* FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND ${ext('pg_proc','p')}),
app_type AS MATERIALIZED (SELECT t.* FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND ${ext('pg_type','t')}),
objects AS MATERIALIZED (${queries.join('\nUNION ALL\n')}),
limited AS (SELECT * FROM objects ORDER BY family COLLATE "C",key::text COLLATE "C" LIMIT ${MAX_OBJECTS + 1}),
payload AS (SELECT pg_catalog.jsonb_build_object('version','${VERSION}',
  'server',pg_catalog.jsonb_build_object('versionNum',v.num,'versionHash',${hashSql('pg_catalog.version()')},
    'encoding',pg_catalog.pg_encoding_to_char(d.encoding),'collation',d.datcollate,'ctype',d.datctype,'localeProvider',d.datlocprovider::text,
    'collationVersion',d.datcollversion,'localeHash',${hashSql("CASE WHEN d.datlocale IS NULL AND d.daticurules IS NULL THEN NULL ELSE pg_catalog.jsonb_build_array(d.datlocale,d.daticurules)::text END")},
    'searchPathHash',${hashSql("pg_catalog.current_setting('search_path')")},
    'searchPathSafe',(pg_catalog.current_schemas(true))[1]='pg_catalog'),
  'objectCount',(SELECT count(*) FROM objects),
  'familyCounts',pg_catalog.jsonb_build_object(${familyNames.map(name=>`'${name}',(SELECT count(*) FROM objects WHERE family='${name}')`).join(',')}),
  'objects',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('family',family,'key',key,'properties',properties) ORDER BY family COLLATE "C",key::text COLLATE "C"),'[]'::pg_catalog.jsonb) FROM limited),
  'truncated',false) AS value FROM v CROSS JOIN pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database())
SELECT CASE WHEN pg_catalog.octet_length(value::text)<=${MAX_BYTES} AND (value->>'objectCount')::integer<=${MAX_OBJECTS}
  THEN value ELSE pg_catalog.jsonb_build_object('version','${VERSION}','truncated',true) END AS snapshot FROM payload;`;

const fail = code => { throw new Error(`PILOT_SCHEMA_${code}`); };
const digest = value => createHash('sha256').update(value).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
function plain(value, keys) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value)!==Object.prototype) fail('SHAPE');
  const names = Reflect.ownKeys(value);
  if (names.length!==keys.length || names.some(name => typeof name!=='string' || !keys.includes(name))) fail('FIELDS');
  const result = {};
  for (const name of keys) { const d=Object.getOwnPropertyDescriptor(value,name); if (!d || !d.enumerable || !('value' in d)) fail('ACCESSOR'); Object.defineProperty(result,name,{value:d.value,enumerable:true,writable:true,configurable:true}); }
  return result;
}
function array(value,max=MAX_OBJECTS) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value)!==Array.prototype) fail('ARRAY');
  if (value.length>max) fail('COUNT');
  const d=Object.getOwnPropertyDescriptors(value), size=d.length?.value;
  if (!Number.isSafeInteger(size) || size<0 || size>max || Reflect.ownKeys(d).length!==size+1) fail('COUNT');
  return Array.from({length:size},(_,i)=>{const x=d[String(i)];if(!x || !x.enumerable || !('value'in x)) fail('ACCESSOR');return x.value;});
}
const S = 'string', H = 'hash', B = 'boolean', N = 'integer', Q = 'qualified', L = 'strings';
const shape = {
  table:{persistence:['p','u','t'],accessMethod:S,replicaIdentity:['d','n','f','i'],rls:B,forceRls:B,optionsHash:H+'?',tablespace:S+'?'},
  column:{position:N,type:Q,modifier:N,dimensions:N,notNull:B,notNullCount:N+'?',notNullEnforced:B+'?',notNullValidated:B+'?',generated:['','s','v'],identity:['','a','d'],defaultHash:H+'?',collation:Q+'?',collationHash:H+'?',storage:['p','e','m','x'],compression:['','p','l'],optionsHash:H+'?'},
  constraint:{kind:['c','f','p','u','t','x'],columns:L,target:Q+'?',targetColumns:L,onUpdate:[' ','a','r','c','n','d'],onDelete:[' ','a','r','c','n','d'],match:[' ','f','p','s'],deferrable:B,deferred:B,validated:B,enforced:B+'?',period:B+'?',noInherit:B,definitionHash:H,internalTriggersHash:H},
  index:{table:Q,unique:B,primary:B,exclusion:B,immediate:B,nullsNotDistinct:B,valid:B,ready:B,live:B,definitionHash:H},
  function:{language:S,returns:Q,returnsSet:B,volatility:['i','s','v'],strict:B,securityDefiner:B,leakproof:B,parallel:['s','r','u'],configHash:H+'?',bodyHash:H,defaultsHash:H+'?',definitionHash:H},
  trigger:{function:'signature',enabled:['O','D','R','A'],type:N,deferrable:B,deferred:B,definitionHash:H},
  enum:{labels:L}, acl:{owner:S,aclHash:H+'?'}, policy:{command:['*','r','a','w','d'],permissive:B,roles:L,usingHash:H+'?',checkHash:H+'?'},
  extension:{schema:S,version:S,owner:S}, unsupported:{kind:S},
};
function inspectSnapshot(raw) {
  let bytes=0;
  const charge=n=>{bytes+=n;if(bytes>MAX_BYTES)fail('BYTES');};
  const text=(value,max=16384)=>{if(typeof value!=='string'||value.length>max||value.includes('\0')||!Buffer.from(value,'utf8').equals(Buffer.from(Buffer.from(value,'utf8').toString('utf8'),'utf8'))||value!==Buffer.from(value,'utf8').toString('utf8'))fail('STRING');charge(Buffer.byteLength(value,'utf8')+4);return value;};
  const scalar=(value,kind)=>{
    if(Array.isArray(kind)){if(!kind.includes(value))fail('ENUM');return text(value);}
    if(kind.endsWith('?')){if(value===null){charge(4);return null;}kind=kind.slice(0,-1);}
    if(kind===S)return text(value);
    if(kind===H){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('HASH');return text(value);}
    if(kind===B){if(typeof value!=='boolean')fail('BOOLEAN');charge(5);return value;}
    if(kind===N){if(!Number.isSafeInteger(value)||Math.abs(value)>2147483647)fail('INTEGER');charge(12);return value;}
    if(kind===Q||kind==='signature'){const parts=array(value,3);if(parts.length!==(kind===Q?2:3))fail('IDENTITY');return parts.map(item=>text(item));}
    if(kind===L)return array(value,10000).map(item=>text(item));
    fail('VALIDATOR');
  };
  const value=plain(raw,['version','server','objectCount','familyCounts','objects','truncated']);
  if(value.version!==VERSION||value.truncated!==false)fail('VERSION_OR_TRUNCATED');
  const server=plain(value.server,['versionNum','versionHash','encoding','collation','ctype','localeProvider','collationVersion','localeHash','searchPathHash','searchPathSafe']);
  for(const name of Object.keys(server))server[name]=scalar(server[name],name==='versionNum'?N:name==='searchPathSafe'?B:['versionHash','searchPathHash'].includes(name)?H:name==='localeHash'?H+'?':name==='collationVersion'?S+'?':S);
  const major=Math.floor(server.versionNum/10000);
  if(![17,18].includes(major)||server.searchPathSafe!==true||server.encoding!=='UTF8'||!['c','i','b'].includes(server.localeProvider))fail('SERVER_CONTEXT');
  if(!Number.isSafeInteger(value.objectCount)||value.objectCount<1||value.objectCount>MAX_OBJECTS)fail('COUNT');
  const entries=array(value.objects),seen=new Set();
  if(entries.length!==value.objectCount)fail('COUNT');
  const familyCounts=plain(value.familyCounts,familyNames);
  for(const name of familyNames)if(!Number.isSafeInteger(familyCounts[name])||familyCounts[name]<0||familyCounts[name]>MAX_OBJECTS)fail('FAMILY_COUNT');
  const objects=entries.map(rawEntry=>{
    const entry=plain(rawEntry,['family','key','properties']);
    if(typeof entry.family!=='string'||!Object.hasOwn(shape,entry.family))fail('FAMILY');
    const fields=shape[entry.family], properties=plain(entry.properties,Object.keys(fields));
    charge(entry.family.length+Object.keys(fields).join('').length+64);
    for(const [name,kind]of Object.entries(fields))properties[name]=scalar(properties[name],kind);
    const identity=array(entry.key,4).map(part=>text(part));
    const lengths={table:2,column:3,constraint:3,index:2,function:3,trigger:3,enum:2,acl:4,policy:3,extension:2};
    if((entry.family==='unsupported'?(identity.length<2):identity.length!==lengths[entry.family])
      ||(!['extension','unsupported'].includes(entry.family)&&identity[0]!=='public'&&!(entry.family==='acl'&&identity[0]==='*')))fail('IDENTITY');
    const id=JSON.stringify([entry.family,identity]);if(seen.has(id))fail('DUPLICATE');seen.add(id);
    if(entry.family==='constraint'){
      if(major===17){if(properties.enforced!==null||properties.period!==null)fail('PG17_ENFORCEMENT');}
      else if(typeof properties.enforced!=='boolean'||typeof properties.period!=='boolean')fail('PG18_ENFORCEMENT');
      if(properties.kind==='f'&&(properties.target===null||properties.columns.length===0||properties.columns.length!==properties.targetColumns.length))fail('FK_SHAPE');
    }
    if(entry.family==='column'){
      if(properties.position<1||properties.dimensions<0||properties.dimensions>6||(major===17&&properties.generated==='v'))fail('COLUMN');
      if(major===17){if(properties.notNullCount!==null||properties.notNullEnforced!==null||properties.notNullValidated!==null)fail('PG17_NULLABILITY');}
      else if(!Number.isSafeInteger(properties.notNullCount)||properties.notNullCount<0
        ||(properties.notNull?(properties.notNullCount<1||typeof properties.notNullEnforced!=='boolean'||typeof properties.notNullValidated!=='boolean'):
          (properties.notNullCount!==0||properties.notNullEnforced!==null||properties.notNullValidated!==null)))fail('PG18_NULLABILITY');
    }
    if(entry.family==='acl'&&(!['SCHEMA','TABLE','COLUMN','FUNCTION','TYPE','DEFAULT'].includes(identity[1])||(identity[0]==='*'&&identity[1]!=='DEFAULT')))fail('ACL_KIND');
    if(entry.family==='enum'&&(properties.labels.length===0||new Set(properties.labels).size!==properties.labels.length))fail('ENUM_LABELS');
    return {family:entry.family,key:identity,properties};
  });
  for(const family of familyNames)if(objects.filter(x=>x.family===family).length!==familyCounts[family])fail('FAMILY_COUNT');
  const has=(family,key)=>seen.has(JSON.stringify([family,key]));
  if(!has('acl',['public','SCHEMA','public','']))fail('MISSING_SCHEMA_ACL');
  for(const entry of objects){
    const [ns,name,sub]=entry.key;
    if(['column','constraint','trigger','policy'].includes(entry.family)&&!has('table',[ns,name]))fail('MISSING_TABLE');
    if(entry.family==='index'&&!has('table',entry.properties.table))fail('MISSING_TABLE');
    if(entry.family==='table'&&!has('acl',[ns,'TABLE',name,'']))fail('MISSING_ACL');
    if(entry.family==='column'&&!has('acl',[ns,'COLUMN',name,sub]))fail('MISSING_ACL');
    if(entry.family==='function'&&!has('acl',[ns,'FUNCTION',name,sub]))fail('MISSING_ACL');
    if(entry.family==='enum'&&!has('acl',[ns,'TYPE',name,'']))fail('MISSING_ACL');
    if(entry.family==='acl'){
      const [,kind,target,detail]=entry.key;
      if(kind==='SCHEMA'&&(target!=='public'||detail!==''))fail('ACL_IDENTITY');
      if(kind==='TABLE'&&(!has('table',[ns,target])||detail!==''))fail('ORPHAN_ACL');
      if(kind==='COLUMN'&&!has('column',[ns,target,detail]))fail('ORPHAN_ACL');
      if(kind==='FUNCTION'&&!has('function',[ns,target,detail]))fail('ORPHAN_ACL');
      if(kind==='TYPE'&&(!has('enum',[ns,target])||detail!==''))fail('ORPHAN_ACL');
    }
  }
  objects.sort((a,b)=>{const x=JSON.stringify([a.family,a.key]),y=JSON.stringify([b.family,b.key]);return x<y?-1:x>y?1:0;});
  const result={version:VERSION,server,objectCount:value.objectCount,familyCounts,objects,truncated:false};
  // Final exact encoded bound, after the bounded descriptor-only traversal.
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>MAX_BYTES)fail('BYTES');
  return result;
}
function normalized(snapshot){
  const major=Math.floor(snapshot.server.versionNum/10000);
  return snapshot.objects.map(entry=>{
    const p={...entry.properties};
    // PostgreSQL17 does not have these pg_constraint fields. This applies ONLY
    // after explicit17+null validation, never to missing/malformed18 metadata.
    if(major===17&&entry.family==='constraint'){p.enforced=true;p.period=false;}
    if(major===17&&entry.family==='column'){p.notNullCount=p.notNull?1:0;p.notNullEnforced=p.notNull?true:null;p.notNullValidated=p.notNull?true:null;}
    return {...entry,properties:p};
  });
}
export function compareSuppliedPilotSchemaSnapshots(leftInput,rightInput){
  const left=inspectSnapshot(leftInput),right=inspectSnapshot(rightInput);
  const a=new Map(normalized(left).map(x=>[JSON.stringify([x.family,x.key]),x]));
  const b=new Map(normalized(right).map(x=>[JSON.stringify([x.family,x.key]),x]));
  const differences=[];let totalDifferences=0,environmentDifferences=0,definitionDifferences=0,detailBytes=0;
  const add=(category,family,key,fields)=>{
    totalDifferences++;if(category==='ENVIRONMENT')environmentDifferences++;else definitionDifferences++;
    const detail={category,family,key,fields},size=Buffer.byteLength(JSON.stringify(detail),'utf8');
    if(differences.length<200&&detailBytes+size<=131072){differences.push(detail);detailBytes+=size;}
  };
  const serverFields=Object.keys(left.server).filter(name=>!isDeepStrictEqual(left.server[name],right.server[name]));
  if(serverFields.length)add('ENVIRONMENT','server',[],serverFields);
  for(const id of new Set([...a.keys(),...b.keys()])){
    const x=a.get(id),y=b.get(id),item=x??y;
    if(!x||!y){add(item.family==='extension'?'ENVIRONMENT':'DEFINITION',item.family,item.key,[!x?'MISSING_LEFT':'MISSING_RIGHT']);continue;}
    const changed=Object.keys(x.properties).filter(name=>!isDeepStrictEqual(x.properties[name],y.properties[name]));
    const env=changed.filter(name=>item.family==='extension'||['owner','collation','collationHash','tablespace'].includes(name));
    const definition=changed.filter(name=>!env.includes(name));
    if(env.length)add('ENVIRONMENT',item.family,item.key,env);if(definition.length)add('DEFINITION',item.family,item.key,definition);
  }
  const unsupported=[...left.objects,...right.objects].filter(x=>x.family==='unsupported');
  const incomplete=unsupported.length>0;
  const guardReviews=new Set();
  for(const entry of [...a.values(),...b.values()]){
    const p=entry.properties;
    if((entry.family==='constraint'&&(!p.enforced||!p.validated))||(entry.family==='index'&&(!p.valid||!p.ready||!p.live))
      ||(entry.family==='trigger'&&p.enabled!=='O')||(entry.family==='column'&&p.notNull&&(!p.notNullEnforced||!p.notNullValidated)))guardReviews.add(JSON.stringify([entry.family,entry.key]));
  }
  const knownGuardReviewCount=guardReviews.size;
  const status=incomplete?'INCOMPLETE_COVERAGE':definitionDifferences?'DIFFERENT':knownGuardReviewCount?'GUARD_REVIEW_REQUIRED':environmentDifferences?'ENVIRONMENT_REVIEW_REQUIRED':'SUPPLIED_SUPPORTED_PUBLIC_CATALOG_MATCH';
  const result={version:'personal-pilot-schema-comparison-v1',status,normalizedDefinitionsMatch:definitionDifferences===0,
    totalDifferences,definitionDifferences,environmentDifferences,knownGuardReviewCount,differences,differencesTruncated:totalDifferences>differences.length,
    coverage:{declaredSchema:'public',supportedFamiliesCompared:true,unsupportedObjectCount:unsupported.length,
      fullPublicSchemaEquivalent:false,fullDatabaseEquivalent:false},
    leftSha256:digest(JSON.stringify(left)),rightSha256:digest(JSON.stringify(right)),
    executionAuthorized:false,backupVerified:false,snapshotProvenanceVerified:false,remoteObserved:false};
  // Bound the WHOLE wire result, including commas, wrapper and fingerprints.
  // Detail removal never changes the complete comparison counts or verdict.
  while(Buffer.byteLength(JSON.stringify(result),'utf8')>131072){
    if(!differences.length)fail('OUTPUT_BYTES');
    differences.pop();result.differencesTruncated=true;
  }
  return freeze(result);
}
