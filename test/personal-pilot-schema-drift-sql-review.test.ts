import { describe, expect, it } from 'vitest';
import { PILOT_SCHEMA_CATALOG_SQL } from '../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs';

// Independent source-shape review only: no database parser, catalog or execution
// is simulated. Runtime interpretation and observation remain controller work.
const sql: string = PILOT_SCHEMA_CATALOG_SQL;
const family = (name: string) => sql.split(/\nUNION ALL\n/).filter(part => part.includes(`SELECT '${name}'::text AS family`)).join('\n');

describe('independent fixed catalog SQL review (not native PostgreSQL proof)', () => {
  it('has a nonempty one-statement catalog projection with bounded output', () => {
    expect(sql.startsWith('WITH\n')).toBe(true);
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql.trim().endsWith(';')).toBe(true);
    expect(sql).toContain('LIMIT 25001');
    expect(sql).toContain('pg_catalog.octet_length(value::text)<=4194304');
    expect(sql).toContain("'truncated',true");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|COPY|CALL|DO|SET)\s/i);
    expect(sql).not.toMatch(/pg_(?:read_file|read_binary_file|ls_dir|sleep|terminate_backend)|dblink|lo_export|pg_authid|pg_user_mapping|pg_foreign_server|pg_description/i);
  });

  it.each(['table','column','constraint','index','function','trigger','enum','acl','policy','extension','unsupported'])(
    'actually projects the %s family', name => {
      expect(family(name)).toContain(`SELECT '${name}'::text AS family`);
      expect(family(name)).toContain(' AS properties FROM ');
    },
  );

  it('emits a closed family-count manifest even for zero-row families', () => {
    expect(sql).toContain("'familyCounts'");
    // A count derived only from GROUP BY existing rows cannot attest empty families.
    expect(sql).toMatch(/familyCounts[\s\S]*?(?:jsonb_build_object|jsonb_object_agg)/);
  });

  it('binds extension membership to exact catalog, whole object and extension class', () => {
    const filters = sql.match(/NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_depend ed WHERE[^)]*\)/g) ?? [];
    expect(filters.length).toBeGreaterThanOrEqual(15);
    for (const filter of filters) {
      expect(filter).toMatch(/ed\.classid='pg_catalog\.\w+'::pg_catalog\.regclass/);
      expect(filter).toContain("ed.deptype='e'");
      expect(filter).toContain('ed.objsubid=0');
      expect(filter).toContain("ed.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass");
      expect(filter).not.toMatch(/deptype\s*(?:IN|=\s*'x')/);
    }
  });

  it('keeps PG18-only physical fields behind JSON extraction and explicit version branches', () => {
    expect(sql).not.toMatch(/\b(?:x|nn)\.(?:conenforced|conperiod)\b/);
    expect(family('constraint')).toContain("CASE WHEN v.major=18 THEN (pg_catalog.to_jsonb(x)->>'conenforced')::boolean ELSE NULL END");
    expect(family('constraint')).toContain("CASE WHEN v.major=18 THEN (pg_catalog.to_jsonb(x)->>'conperiod')::boolean ELSE NULL END");
    expect(family('column')).toContain("'notNullValidated'");
    expect(family('column')).toContain('pg_catalog.bool_and(nn.convalidated)');
    expect(family('column')).toContain("'generated',a.attgenerated::text");
  });

  it('retains ordered enum labels and FK source/target columns instead of alphabetic sorting', () => {
    expect(family('enum')).toContain('e.enumlabel ORDER BY e.enumsortorder');
    expect(family('constraint')).toContain('pg_catalog.unnest(x.conkey) WITH ORDINALITY');
    expect(family('constraint')).toContain('pg_catalog.unnest(x.confkey) WITH ORDINALITY');
    expect(family('constraint')).toContain("pg_catalog.jsonb_build_array('public',c.relname,x.conname)");
    for (const field of ['onUpdate','onDelete','match','deferrable','deferred','validated','enforced','period']) {
      expect(family('constraint')).toContain(`'${field}'`);
    }
  });

  it('hashes sensitive definitions/configuration inside PostgreSQL rather than projecting them raw', () => {
    for (const expression of ['p.prosrc','p.proconfig::text','pg_catalog.pg_get_functiondef(p.oid)','pg_catalog.pg_get_expr(p.proargdefaults,0,false)']) {
      expect(family('function')).toContain(`pg_catalog.sha256(pg_catalog.convert_to(${expression},'UTF8'))`);
    }
    expect(family('column')).toContain("pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(d.adbin,d.adrelid,false),'UTF8'))");
    expect(family('policy')).toContain("pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(p.polqual,p.polrelid,false),'UTF8'))");
    expect(family('trigger')).toContain("pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_triggerdef(t.oid,false),'UTF8'))");
    expect(sql).not.toMatch(/'(?:prosrc|proconfig|body|definition|config|comment)',\s*(?:p\.|pg_catalog\.pg_get_)/);
  });

  it('retains enforcement, RLS and privilege metadata that simple object counts miss', () => {
    for (const field of ['valid','ready','live']) expect(family('index')).toContain(`'${field}'`);
    expect(family('trigger')).toContain("'enabled',t.tgenabled::text");
    expect(family('constraint')).toContain("'internalTriggersHash'");
    expect(family('table')).toContain("'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity");
    for (const scope of ['SCHEMA','TABLE','COLUMN','FUNCTION','TYPE','DEFAULT']) expect(family('acl')).toContain(`'${scope}'`);
    expect(family('acl')).toContain('d.defaclnamespace=0 OR');
    expect(family('policy')).toContain('p.polroles');
    expect(family('function')).toContain("'securityDefiner',p.prosecdef");
  });

  it('classifies unsupported objects and avoids calling function deparser for aggregates', () => {
    expect(family('function')).toContain("WHERE p.prokind='f'");
    expect(family('unsupported')).toContain("WHERE p.prokind<>'f'");
    for (const catalog of ['pg_operator','pg_opclass','pg_opfamily','pg_collation','pg_conversion','pg_statistic_ext','pg_ts_config','pg_ts_dict','pg_ts_parser','pg_ts_template','pg_event_trigger','pg_rewrite','pg_inherits']) {
      expect(family('unsupported')).toContain(`pg_catalog.${catalog}`);
    }
    expect(family('unsupported')).toContain('elem.typarray=t.oid');
    expect(family('unsupported')).toContain("rc.relkind<>'c'");
  });

  it('does not silently normalize non-inheritable PG18 NOT NULL into the PG17 model', () => {
    // A supported field or a visible gap is required; the legacy constraint
    // projection deliberately excludes contype n and cannot supply this pin.
    expect(family('column') + family('unsupported')).toMatch(/\b(?:nn|x)\.connoinherit\b/);
  });

  it('keeps nonmember indexes on excluded parent tables visible as unsupported', () => {
    // app_rel includes a nonmember relkind i, but the supported index branch
    // requires its parent table in app_rel. The initial query lost that index.
    expect(family('unsupported')).toContain('pg_catalog.pg_index');
    expect(family('unsupported')).toMatch(/(?:NOT EXISTS|NOT IN)[\s\S]*app_rel/);
  });

  it.each([['RELKIND_', 'c.relkind'], ['TYPE_', 't.typtype'], ['PROKIND_', 'p.prokind']])(
    'casts internal char explicitly for the %s gap label', (prefix, field) => {
      // Controller PG17 native catalog-70 first failed on unknown || "char".
      // This oracle pins the SQL fix, not an independent native reproduction.
      expect(family('unsupported')).toContain(`'${prefix}'||${field}::text`);
    },
  );
});
