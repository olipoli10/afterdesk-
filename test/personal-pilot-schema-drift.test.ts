import { describe, expect, it } from 'vitest';
import { PILOT_SCHEMA_CATALOG_SQL, compareSuppliedPilotSchemaSnapshots } from '../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs';

type Entry={family:string;key:string[];properties:Record<string,unknown>};
const h=(digit='a')=>digit.repeat(64);
const sig='[["pg_catalog","int4"]]';
const object=(family:string,key:string[],properties:Record<string,unknown>):Entry=>({family,key,properties});
const acl=(kind:string,name:string,sub='')=>object('acl',['public',kind,name,sub],{owner:'synthetic_owner',aclHash:null});
function snapshot(major=17){
  const objects:Entry[]=[acl('SCHEMA','public'),
    object('table',['public','T'],{persistence:'p',accessMethod:'heap',replicaIdentity:'d',rls:false,forceRls:false,optionsHash:null,tablespace:null}),acl('TABLE','T'),
    object('column',['public','T','id'],{position:1,type:['pg_catalog','int4'],modifier:-1,dimensions:0,notNull:true,
      notNullCount:major===17?null:1,notNullEnforced:major===17?null:true,notNullValidated:major===17?null:true,
      generated:'',identity:'',defaultHash:null,collation:null,collationHash:null,storage:'p',compression:'',optionsHash:null}),acl('COLUMN','T','id'),
    object('constraint',['public','T','same_name'],{kind:'f',columns:['id'],target:['public','T'],targetColumns:['id'],onUpdate:'c',onDelete:'r',match:'s',
      deferrable:false,deferred:false,validated:true,enforced:major===17?null:true,period:major===17?null:false,noInherit:true,definitionHash:h(),internalTriggersHash:h('b')}),
    object('index',['public','T_id'],{table:['public','T'],unique:true,primary:false,exclusion:false,immediate:true,nullsNotDistinct:false,valid:true,ready:true,live:true,definitionHash:h()}),
    object('function',['public','f',sig],{language:'plpgsql',returns:['pg_catalog','bool'],returnsSet:false,volatility:'s',strict:true,securityDefiner:false,
      leakproof:false,parallel:'u',configHash:null,bodyHash:h(),defaultsHash:null,definitionHash:h()}),acl('FUNCTION','f',sig),
    object('trigger',['public','T','trigger'],{function:['public','f',sig],enabled:'O',type:19,deferrable:false,deferred:false,definitionHash:h()}),
    object('enum',['public','State'],{labels:['OPEN','CLOSED']}),acl('TYPE','State'),
    object('policy',['public','T','policy'],{command:'r',permissive:true,roles:['PUBLIC'],usingHash:h(),checkHash:null}),
    object('extension',['public','vector'],{schema:'public',version:'0.8.0',owner:'synthetic_owner'}),
  ];
  return {version:'personal-pilot-schema-snapshot-v1',server:{versionNum:major===17?170011:180006,versionHash:h(),encoding:'UTF8',collation:'C',ctype:'C',
    localeProvider:'c',collationVersion:null,localeHash:null,searchPathHash:h(),searchPathSafe:true},objectCount:objects.length,
    familyCounts:Object.fromEntries(['table','column','constraint','index','function','trigger','enum','acl','policy','extension','unsupported'].map(f=>[f,objects.filter(x=>x.family===f).length])),objects,truncated:false};
}
const find=(v:ReturnType<typeof snapshot>,family:string)=>v.objects.find(x=>x.family===family)!;
describe('supplied public schema metadata comparison — pure, no SQL connection',()=>{
  it('matches only its declared modeled scope and keeps all external guarantees false',()=>{
    const a=snapshot(),result=compareSuppliedPilotSchemaSnapshots(a,structuredClone(a));
    expect(result.status).toBe('SUPPLIED_SUPPORTED_PUBLIC_CATALOG_MATCH');expect(result.totalDifferences).toBe(0);
    expect(result).toMatchObject({executionAuthorized:false,backupVerified:false,snapshotProvenanceVerified:false,remoteObserved:false,
      coverage:{fullPublicSchemaEquivalent:false,fullDatabaseEquivalent:false}});
    expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.coverage)).toBe(true);
  });
  it('normalizes only explicit17 enforcement/NOTNULL rules while retaining cross-version review',()=>{
    const result=compareSuppliedPilotSchemaSnapshots(snapshot(17),snapshot(18));
    expect(result.normalizedDefinitionsMatch).toBe(true);expect(result.status).toBe('ENVIRONMENT_REVIEW_REQUIRED');
    expect(result.environmentDifferences).toBe(1);
  });
  it.each(['enforced','period'])('refuses missing/null18 %s, not interpreting it as17',field=>{
    const a=snapshot(18);find(a,'constraint').properties[field]=null;
    expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('PG18_ENFORCEMENT');
    delete find(a,'constraint').properties[field];expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('FIELDS');
  });
  it.each(['notNullCount','notNullEnforced','notNullValidated'])('refuses absent/null18 nonnullable %s',field=>{
    const a=snapshot(18);find(a,'column').properties[field]=null;
    expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('PG18_NULLABILITY');
  });
  it('requires all17 absent-version fields explicitly null',()=>{
    const a=snapshot();find(a,'constraint').properties.enforced=true;
    expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('PG17_ENFORCEMENT');
  });
  it('distinguishes nullable18 from missing NOT NULL evidence',()=>{
    const a=snapshot(18);Object.assign(find(a,'column').properties,{notNull:false,notNullCount:0,notNullEnforced:null,notNullValidated:null});
    expect(compareSuppliedPilotSchemaSnapshots(a,a).totalDifferences).toBe(0);
    find(a,'column').properties.notNull=true;expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('PG18_NULLABILITY');
  });
  it.each([
    ['column','type',['pg_catalog','text']],['column','generated','s'],['column','defaultHash',h('b')],
    ['constraint','onDelete','c'],['constraint','validated',false],['constraint','enforced',false],['constraint','internalTriggersHash',h('c')],
    ['index','valid',false],['index','ready',false],['index','definitionHash',h('c')],
    ['function','bodyHash',h('b')],['function','securityDefiner',true],['function','configHash',h('c')],
    ['trigger','enabled','D'],['trigger','function',['public','other',sig]],['enum','labels',['CLOSED','OPEN']],
    ['table','rls',true],['table','forceRls',true],['policy','usingHash',h('d')],['policy','roles',['PUBLIC','other']],
    ['acl','aclHash',h('e')],
  ] as [string,string,unknown][])('reports %s.%s change without exposing expression bodies', (family,field,value)=>{
    const a=snapshot(18),b=structuredClone(a);find(b,family).properties[field]=value;
    const result=compareSuppliedPilotSchemaSnapshots(a,b);expect(result.status).toBe('DIFFERENT');
    expect(result.normalizedDefinitionsMatch).toBe(false);expect(result.differences.some((x:{fields:string[]})=>x.fields.includes(field))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(h('e'));
  });
  it('keeps FK column order semantic, not sorted into equivalence',()=>{
    const a=snapshot(),b=structuredClone(a);find(a,'constraint').properties.columns=['one','two'];find(a,'constraint').properties.targetColumns=['x','y'];
    find(b,'constraint').properties.columns=['two','one'];find(b,'constraint').properties.targetColumns=['x','y'];
    expect(compareSuppliedPilotSchemaSnapshots(a,b).status).toBe('DIFFERENT');
  });
  it('reports omitted indexes as differences rather than comparing common objects only',()=>{
    const a=snapshot(),b=structuredClone(a);b.objects=b.objects.filter(x=>x.family!=='index');b.objectCount--;b.familyCounts.index--;
    expect(compareSuppliedPilotSchemaSnapshots(a,b).differences).toContainEqual(expect.objectContaining({family:'index',fields:['MISSING_RIGHT']}));
  });
  it.each(['owner','version'])('does not ignore extension %s differences',field=>{
    const a=snapshot(),b=structuredClone(a);find(b,'extension').properties[field]='different';
    expect(compareSuppliedPilotSchemaSnapshots(a,b).status).toBe('ENVIRONMENT_REVIEW_REQUIRED');
  });
  it('does not ignore owner or collation differences',()=>{
    const a=snapshot(),b=structuredClone(a);find(b,'acl').properties.owner='different';b.server.collation='different';
    const r=compareSuppliedPilotSchemaSnapshots(a,b);expect(r.environmentDifferences).toBe(2);expect(r.coverage.fullPublicSchemaEquivalent).toBe(false);
  });
  it('reports supported scope incomplete even when identical unsupported metadata is supplied',()=>{
    const a=snapshot();a.objects.push(object('unsupported',['public','RELATION','view'],{kind:'RELKIND_v'}));a.objectCount++;a.familyCounts.unsupported++;
    const result=compareSuppliedPilotSchemaSnapshots(a,a);expect(result.status).toBe('INCOMPLETE_COVERAGE');expect(result.coverage.unsupportedObjectCount).toBe(2);
  });
  it('allows arbitrary input object ordering but not duplicate tuple identities',()=>{
    const a=snapshot(),b=structuredClone(a);b.objects.reverse();expect(compareSuppliedPilotSchemaSnapshots(a,b).totalDifferences).toBe(0);
    b.objects.push(b.objects[0]);b.objectCount++;expect(()=>compareSuppliedPilotSchemaSnapshots(a,b)).toThrow('DUPLICATE');
  });
  it('rejects forged counts, unknown fields/families, incomplete and unsupported-server inputs',()=>{
    const cases=[(x:ReturnType<typeof snapshot>)=>{x.objectCount--;},(x:ReturnType<typeof snapshot>)=>{x.objects[0].family='surprise';},
      (x:ReturnType<typeof snapshot>)=>{x.truncated=true;},(x:ReturnType<typeof snapshot>)=>{x.server.versionNum=190001;},
      (x:ReturnType<typeof snapshot>)=>{x.server.searchPathSafe=false;}];
    for(const mutate of cases){const a=snapshot();mutate(a);expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow();}
    const a=snapshot();Object.assign(a.server,{secret:'must refuse'});expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('FIELDS');
  });
  it('rejects accessors/proxies/prototypes without calling user getters',()=>{
    const a=snapshot();let called=0;Object.defineProperty(a,'objects',{enumerable:true,get(){called++;return [];}});
    expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('ACCESSOR');expect(called).toBe(0);
    const b=snapshot();Object.setPrototypeOf(b.objects[0].properties,{inherited:true});expect(()=>compareSuppliedPilotSchemaSnapshots(b,b)).toThrow('SHAPE');
    expect(()=>compareSuppliedPilotSchemaSnapshots(new Proxy(snapshot(),{}),snapshot())).toThrow('SHAPE');
  });
  it('rejects sparse arrays, extra array keys, malformed Unicode and oversized strings',()=>{
    const a=snapshot();delete (a.objects as unknown[])[0];expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow('COUNT');
    const b=snapshot();Object.assign(b.objects,{extra:true});expect(()=>compareSuppliedPilotSchemaSnapshots(b,b)).toThrow('COUNT');
    const c=snapshot();c.objects[0].key[2]='\uD800';expect(()=>compareSuppliedPilotSchemaSnapshots(c,c)).toThrow('STRING');
    c.objects[0].key[2]='x'.repeat(16385);expect(()=>compareSuppliedPilotSchemaSnapshots(c,c)).toThrow('STRING');
  });
  it('refuses missing corresponding owner/ACL or parent-table metadata',()=>{
    for(const family of ['table','acl']){const a=snapshot();const index=a.objects.findIndex(x=>x.family===family);a.objects.splice(index,1);a.objectCount--;a.familyCounts[family]--;expect(()=>compareSuppliedPilotSchemaSnapshots(a,a)).toThrow();}
  });
  it('SQL is one fixed SELECT over metadata, with hashes in DB and bounded output',()=>{
    const sql=PILOT_SCHEMA_CATALOG_SQL;
    expect(sql.trim().startsWith('WITH')).toBe(true);expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|CALL|DO|COPY)\b/);
    expect(sql).not.toMatch(/pg_authid|pg_user_mapping|pg_foreign_server|pg_subscription|pg_description/);
    expect(sql).toContain('pg_catalog.sha256');expect(sql).toContain('LIMIT 25001');expect(sql).toContain('<=4194304');
    expect(sql).toContain("pg_catalog.to_jsonb(x)->>'conenforced'");expect(sql).not.toMatch(/\bx\.conenforced\b/);
    expect(sql).toContain("x.contype<>'n'");expect(sql).toContain("p.prokind='f'");
    expect(sql).toContain("ed.classid='pg_catalog.pg_proc'::pg_catalog.regclass");expect(sql).toContain("ed.deptype='e'");
    expect(sql).toContain("'configHash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.proconfig::text");
    expect(sql).toContain('pg_catalog.pg_get_functiondef(p.oid)');expect(sql).toContain("'pg_opclass'");expect(sql).toContain("'pg_ts_dict'");
    expect(sql).toContain('pg_catalog.jsonb_build_array(d.datlocale,d.daticurules)::text');
  });
});
