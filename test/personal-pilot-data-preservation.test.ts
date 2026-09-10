import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildPilotMigrationCatalog, inspectSuppliedPilotMigrationCatalog } from "../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";
import { compareSuppliedPilotSchemaSnapshots } from "../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs";
import { buildPilotDataPreservationQuery, compareSuppliedPilotDataPreservation } from "../specs/210-personal-live-activation/deployment/pilot-data-preservation.mjs";

type Entry = { family: string; key: string[]; properties: Record<string, unknown> };
const H = "a".repeat(64), EMPTY = createHash("sha256").update("").digest("hex");
const familyNames = ["table", "column", "constraint", "index", "function", "trigger", "enum", "acl", "policy", "extension", "unsupported"];
// Reads repository migration bytes, not a database or fabricated migration history.
const migrationCatalog = buildPilotMigrationCatalog(process.cwd());
function catalog() {
  const acl = (kind: string, name: string, detail = ""): Entry => ({ family: "acl", key: ["public", kind, name, detail], properties: { owner: "synthetic_owner", aclHash: null } });
  const objects: Entry[] = [acl("SCHEMA", "public")];
  for (const [table, columns] of [["items", ["id", "message", "tags"]], ["_prisma_migrations", ["id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"]]] as const) {
    objects.push({ family: "table", key: ["public", table], properties: { persistence: "p", accessMethod: "heap", replicaIdentity: "d", rls: false, forceRls: false, optionsHash: null, tablespace: null } }, acl("TABLE", table));
    columns.forEach((name, index) => {
      const type = name === "tags" ? "_text" : name === "applied_steps_count" ? "int4" : name.endsWith("_at") ? "timestamptz" : "text";
      objects.push({ family: "column", key: ["public", table, name], properties: { position: index + 1, type: ["pg_catalog", type], modifier: -1, dimensions: name === "tags" ? 1 : 0, notNull: false, notNullCount: null, notNullEnforced: null, notNullValidated: null, generated: "", identity: "", defaultHash: null, collation: null, collationHash: null, storage: "x", compression: "", optionsHash: null } }, acl("COLUMN", table, name));
    });
  }
  return { version: "personal-pilot-schema-snapshot-v1", server: { versionNum: 170011, versionHash: H, encoding: "UTF8", collation: "C", ctype: "C", localeProvider: "c", collationVersion: null, localeHash: null, searchPathHash: H, searchPathSafe: true }, objectCount: objects.length,
    familyCounts: Object.fromEntries(familyNames.map(f => [f, objects.filter(e => e.family === f).length])), objects, truncated: false };
}
function fixture(c = catalog()) {
  return { catalog70: c, migrationCatalog, expectedCatalogSha256: compareSuppliedPilotSchemaSnapshots(c, c).leftSha256 };
}
function capture(input = fixture()) {
  const plan = buildPilotDataPreservationQuery(input);
  return { version: "personal-pilot-data-preservation-v1", planSha256: plan.planSha256, catalogSha256: plan.manifest.suppliedCatalogSha256,
    tables: plan.manifest.tables.map((t: {name: string}) => ({ table: t.name, rowCount: t.name === "_prisma_migrations" ? "70" : "2", digest: H, truncated: false, historyComplete: true })) };
}
const column = (c: ReturnType<typeof catalog>, name = "message") => c.objects.find(e => e.family === "column" && e.key[1] === "items" && e.key[2] === name)!;

describe("data preservation builder — supplied catalog only, no database execution", () => {
  it("builds one read-only snapshot, only explicit old columns and final aggregate disclosure", () => {
    const plan = buildPilotDataPreservationQuery(fixture());
    expect(plan.tableCount).toBe(2); expect(plan.columnCount).toBe(11);
    expect(plan.sql).toContain("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;");
    expect(plan.sql.match(/\bBEGIN TRANSACTION/g)).toHaveLength(1);
    expect(plan.sql.endsWith("COMMIT;\n")).toBe(true);
    expect(plan.sql).toContain('FROM ONLY "public"."items" AS t');
    expect(plan.sql).toContain('t."message" AS "message"');
    expect(plan.sql).not.toContain("t.*");
    expect(plan.sql).toContain("AS snapshot FROM aggregates;");
    expect(plan).toMatchObject({ sourceProvenanceVerified: false, historical70Authenticated: false, executionAuthorized: false, backupVerified: false, databaseRead: false });
    expect(Object.isFrozen(plan.manifest.tables[0].columns)).toBe(true);
    expect(plan.querySha256).toBe(createHash("sha256").update(plan.sql).digest("hex"));
  });
  it("pins all serialization settings and resource deadlines", () => {
    const { sql } = buildPilotDataPreservationQuery(fixture());
    for (const setting of ["TimeZone='UTC'", "DateStyle='ISO, YMD'", "IntervalStyle='postgres'", "bytea_output='hex'", "extra_float_digits=3", "search_path=pg_catalog", "row_security=off", "standard_conforming_strings=on", "statement_timeout='30000'", "lock_timeout='2000'", "transaction_timeout='45000'"]) expect(sql).toContain(`SET LOCAL ${setting};`);
  });
  it("retains duplicate row hashes, stable order, empty digest and array bounds", () => {
    const { sql } = buildPilotDataPreservationQuery(fixture());
    expect(sql).toContain("pg_catalog.string_agg(pg_catalog.encode(pg_catalog.sha256");
    expect(sql).not.toContain("string_agg(DISTINCT");
    expect(sql).toContain('COLLATE "C"');
    expect(sql).toContain("pg_catalog.convert_to");
    expect(sql).toContain(`pg_catalog.array_dims(t."tags")`);
    expect(sql).toContain('LIMIT 500001');
    expect(sql).toContain('pg_catalog.count(*)>500000 AS "truncated"');
  });
  it("preserves only the closed historical 70 names, not the 9 newly appended rows", () => {
    const plan = buildPilotDataPreservationQuery(fixture());
    expect(plan.manifest.historicalMigrationNames).toHaveLength(70);
    for (const e of migrationCatalog.entries.slice(0, 70)) expect(plan.sql).toContain(`'${e.migrationName}'`);
    for (const e of migrationCatalog.entries.slice(70)) expect(plan.sql).not.toContain(`'${e.migrationName}'`);
    expect(plan.sql.match(/ WHERE /g)).toHaveLength(1);
    expect(plan.sql).toContain('pg_catalog.count(DISTINCT old_row."migration_name")=70');
    expect(plan.sql).toContain('old_row."rolled_back_at" IS NULL');
  });
  it("quotes hostile but valid identifier bytes and preserves NFD instead of normalizing", () => {
    const c = catalog(), old = "message", next = 'e\u0301"; SELECT bad;--';
    for (const e of c.objects) { if (e.family === "column" && e.key[2] === old) e.key[2] = next; if (e.family === "acl" && e.key[1] === "COLUMN" && e.key[3] === old) e.key[3] = next; }
    expect(buildPilotDataPreservationQuery(fixture(c)).sql).toContain('t."e\u0301""; SELECT bad;--" AS "e\u0301""; SELECT bad;--"');
  });
  it("refuses source mismatch before constructing a query", () => {
    const input = fixture(); input.expectedCatalogSha256 = "b".repeat(64);
    expect(() => buildPilotDataPreservationQuery(input)).toThrow("PILOT_DATA_CATALOG_HASH");
  });
  it.each(["rls", "forceRls", "persistence", "accessMethod"])("refuses unsupported table %s", field => {
    const c = catalog(), p = c.objects.find(e => e.family === "table" && e.key[1] === "items")!.properties;
    p[field] = field === "persistence" ? "u" : field === "accessMethod" ? "other" : true;
    expect(() => buildPilotDataPreservationQuery(fixture(c))).toThrow("PILOT_DATA_UNSUPPORTED_TABLE");
  });
  it.each(["generated", "identity", "position", "dimensions", "type"])("refuses unsupported column %s", field => {
    const c = catalog(); column(c).properties[field] = field === "generated" ? "s" : field === "identity" ? "a" : field === "position" ? 1 : field === "dimensions" ? 2 : ["public", "unknown_custom_type"];
    expect(() => buildPilotDataPreservationQuery(fixture(c))).toThrow(/PILOT_DATA_UNSUPPORTED_/);
  });
  it("rejects a catalog gap even when both supplied snapshots match", () => {
    const c = catalog(); c.objects.push({ family: "unsupported", key: ["public", "custom_object"], properties: { kind: "custom" } });
    c.objectCount++; c.familyCounts.unsupported++;
    expect(() => buildPilotDataPreservationQuery(fixture(c))).toThrow("PILOT_DATA_UNSUPPORTED_CATALOG");
  });
  it("rejects getter and proxy inputs without invoking them", () => {
    const input = fixture(), getter = vi.fn(() => H);
    Object.defineProperty(input, "expectedCatalogSha256", { enumerable: true, get: getter });
    expect(() => buildPilotDataPreservationQuery(input)).toThrow("PILOT_DATA_ACCESSOR"); expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(); expect(() => buildPilotDataPreservationQuery(new Proxy({}, { ownKeys: trap }))).toThrow("PILOT_DATA_SHAPE"); expect(trap).not.toHaveBeenCalled();
  });
  it("checks oversized arrays before descriptor enumeration", () => {
    const input = fixture(); Object.assign(input, { catalog70: Array(25001) });
    expect(() => buildPilotDataPreservationQuery(input)).toThrow("PILOT_DATA_BOUND");
  });
});

describe("supplied aggregate comparator — no raw rows, hashes or authority in output", () => {
  it("compares reordered table aggregates without releasing table names or digests", () => {
    const input = fixture(), a = capture(input), b = structuredClone(a); b.tables.reverse();
    const result = compareSuppliedPilotDataPreservation(input, a, b);
    expect(result.status).toBe("SUPPLIED_OLD_COLUMN_AGGREGATES_MATCH");
    expect(result).toMatchObject({ tableCount: 2, changedTables: 0, executionAuthorized: false, backupVerified: false, snapshotProvenanceVerified: false, fullSchemaEquivalent: false, newColumnsVerified: false, newProofTablesVerified: false });
    expect(JSON.stringify(result)).not.toContain(H); expect(JSON.stringify(result)).not.toContain('"items"');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(["digest", "rowCount"])("reports changed %s without row contents", field => {
    const input = fixture(), a = capture(input), b = structuredClone(a), row = b.tables.find((t: {table: string}) => t.table === "items")!;
    row[field] = field === "digest" ? "b".repeat(64) : "3";
    const r = compareSuppliedPilotDataPreservation(input, a, b); expect(r.status).toBe("SUPPLIED_OLD_COLUMN_AGGREGATES_DIFFER"); expect(r.changedTables).toBe(1);
    expect(r.changedCounts).toBe(field === "rowCount" ? 1 : 0); expect(r.changedDigests).toBe(field === "digest" ? 1 : 0);
  });
  it.each(["missing", "extra", "duplicate", "wrongName", "truncated", "wrongHistory", "wrongPlan", "wrongCatalog", "rawRows"])("refuses %s capture", kind => {
    const input = fixture(), a = capture(input), b = structuredClone(a);
    if (kind === "missing") b.tables.pop();
    if (kind === "extra") b.tables.push(structuredClone(b.tables[0]));
    if (kind === "duplicate") b.tables[1] = structuredClone(b.tables[0]);
    if (kind === "wrongName") b.tables[0].table = "unknown";
    if (kind === "truncated") b.tables[0].truncated = true;
    if (kind === "wrongHistory") b.tables[0].historyComplete = false;
    if (kind === "wrongPlan") b.planSha256 = "c".repeat(64);
    if (kind === "wrongCatalog") b.catalogSha256 = "c".repeat(64);
    if (kind === "rawRows") Object.assign(b.tables[0], { rawRows: ["synthetic_secret"] });
    expect(() => compareSuppliedPilotDataPreservation(input, a, b)).toThrow(/^PILOT_DATA_/);
  });
  it.each(["01", "-1", "1.0", "9007199254740993", "9223372036854775808", "500001"])("never rounds or silently accepts count %s", count => {
    const input = fixture(), a = capture(input), b = structuredClone(a); b.tables[1].rowCount = count;
    expect(() => compareSuppliedPilotDataPreservation(input, a, b)).toThrow(/PILOT_DATA_CAPTURE_(COUNT|TRUNCATED)/);
  });
  it("requires the empty multiset digest and exactly 70 selected migration rows", () => {
    const input = fixture(), a = capture(input), b = structuredClone(a), row = b.tables.find((t: {table: string}) => t.table === "items")!;
    row.rowCount = "0"; expect(() => compareSuppliedPilotDataPreservation(input, a, b)).toThrow("PILOT_DATA_CAPTURE_DIGEST");
    row.digest = EMPTY; expect(compareSuppliedPilotDataPreservation(input, b, b).changedTables).toBe(0);
    b.tables.find((t: {table: string}) => t.table === "_prisma_migrations")!.rowCount = "79";
    expect(() => compareSuppliedPilotDataPreservation(input, b, b)).toThrow("PILOT_DATA_CAPTURE_HISTORY");
  });
});

describe("additive immutable supplied migration catalog inspector", () => {
  it("validates existing catalog without inventing historical rows or observation", () => {
    const result = inspectSuppliedPilotMigrationCatalog(migrationCatalog);
    expect(result).toEqual(migrationCatalog); expect(Object.isFrozen(result.entries)).toBe(true);
    expect(result.remoteObserved).toBe(false); expect(result.executionAuthorized).toBe(false);
  });
  it("rejects altered catalog fingerprint", () => {
    expect(() => inspectSuppliedPilotMigrationCatalog({ ...migrationCatalog, catalogSha256: "b".repeat(64) })).toThrow("PILOT_MIGRATION_CATALOG_HASH_REFUSED");
  });
});
