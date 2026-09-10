import { describe, expect, it, vi } from "vitest";
import { compareSuppliedPilotSchemaSnapshots } from "../specs/210-personal-live-activation/deployment/pilot-schema-drift.mjs";

const hash = "a".repeat(64), otherHash = "b".repeat(64);
const families = ["table", "column", "constraint", "index", "function", "trigger", "enum", "acl", "policy", "extension", "unsupported"];
type Entry = { family: string; key: string[]; properties: Record<string, unknown> };
function snapshot() {
  const acl = (kind: string, name: string, sub = ""): Entry => ({ family: "acl", key: ["public", kind, name, sub], properties: { owner: "synthetic_owner", aclHash: null } });
  const signature = '[["pg_catalog", "text"]]';
  const objects: Entry[] = [acl("SCHEMA", "public"),
    { family: "table", key: ["public", "items"], properties: { persistence: "p", accessMethod: "heap", replicaIdentity: "d", rls: false, forceRls: false, optionsHash: null, tablespace: null } }, acl("TABLE", "items"),
    { family: "column", key: ["public", "items", "id"], properties: { position: 1, type: ["pg_catalog", "text"], modifier: -1, dimensions: 0, notNull: true, notNullCount: null, notNullEnforced: null, notNullValidated: null, generated: "", identity: "", defaultHash: null, collation: null, collationHash: null, storage: "x", compression: "", optionsHash: null } }, acl("COLUMN", "items", "id"),
    { family: "constraint", key: ["public", "items", "fk_items"], properties: { kind: "f", columns: ["id"], target: ["public", "items"], targetColumns: ["id"], onUpdate: "a", onDelete: "r", match: "s", deferrable: false, deferred: false, validated: true, enforced: null, period: null, noInherit: true, definitionHash: hash, internalTriggersHash: hash } },
    { family: "index", key: ["public", "items_idx"], properties: { table: ["public", "items"], unique: true, primary: false, exclusion: false, immediate: true, nullsNotDistinct: false, valid: true, ready: true, live: true, definitionHash: hash } },
    { family: "function", key: ["public", "inspect_item", signature], properties: { language: "sql", returns: ["pg_catalog", "text"], returnsSet: false, volatility: "s", strict: true, securityDefiner: false, leakproof: false, parallel: "s", configHash: null, bodyHash: hash, defaultsHash: null, definitionHash: hash } }, acl("FUNCTION", "inspect_item", signature),
    { family: "trigger", key: ["public", "items", "guard"], properties: { function: ["public", "inspect_item", signature], enabled: "O", type: 7, deferrable: false, deferred: false, definitionHash: hash } },
    { family: "enum", key: ["public", "Status"], properties: { labels: ["ONE", "TWO"] } }, acl("TYPE", "Status"),
    { family: "policy", key: ["public", "items", "read_owner"], properties: { command: "r", permissive: false, roles: ["synthetic_owner"], usingHash: hash, checkHash: null } },
    { family: "extension", key: ["public", "vector"], properties: { schema: "public", version: "0.8.6", owner: "synthetic_owner" } },
  ];
  return { version: "personal-pilot-schema-snapshot-v1", server: { versionNum: 170011, versionHash: hash, encoding: "UTF8", collation: "C", ctype: "C", localeProvider: "c", collationVersion: null, localeHash: null, searchPathHash: hash, searchPathSafe: true }, objectCount: objects.length, familyCounts: Object.fromEntries(families.map(f => [f, objects.filter(e => e.family === f).length])), objects, truncated: false };
}
function entry(s: ReturnType<typeof snapshot>, family: string) { return s.objects.find(e => e.family === family)!; }
function recount(s: ReturnType<typeof snapshot>) { s.objectCount = s.objects.length; s.familyCounts = Object.fromEntries(families.map(f => [f, s.objects.filter(e => e.family === f).length])); }
function pg18(s: ReturnType<typeof snapshot>) {
  s.server.versionNum = 180006; s.server.versionHash = otherHash;
  for (const e of s.objects) {
    if (e.family === "column") Object.assign(e.properties, { notNullCount: e.properties.notNull ? 1 : 0, notNullEnforced: e.properties.notNull ? true : null, notNullValidated: e.properties.notNull ? true : null });
    if (e.family === "constraint") Object.assign(e.properties, { enforced: true, period: false });
  }
  return s;
}

describe("schema snapshot separate comparator review — supplied synthetic metadata only", () => {
  it("matches reordered objects, with no provenance/execution/backup or complete database claim", () => {
    const left = snapshot(), right = snapshot(); right.objects.reverse();
    const result = compareSuppliedPilotSchemaSnapshots(left, right);
    expect(result.status).toBe("SUPPLIED_SUPPORTED_PUBLIC_CATALOG_MATCH");
    expect(result).toMatchObject({ snapshotProvenanceVerified: false, executionAuthorized: false, backupVerified: false, remoteObserved: false, coverage: { fullPublicSchemaEquivalent: false, fullDatabaseEquivalent: false } });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([["constraint", "onDelete", "c"], ["constraint", "validated", false], ["index", "valid", false], ["index", "ready", false],
    ["trigger", "enabled", "D"], ["function", "securityDefiner", true], ["function", "configHash", otherHash], ["function", "bodyHash", otherHash],
    ["acl", "aclHash", otherHash], ["table", "rls", true], ["table", "forceRls", true], ["policy", "usingHash", otherHash]])("does not ignore %s.%s change", (family, field, changed) => {
    const left = snapshot(), right = snapshot(); entry(right, family as string).properties[field as string] = changed;
    const result = compareSuppliedPilotSchemaSnapshots(left, right);
    expect(result.status).toBe("DIFFERENT"); expect(result.definitionDifferences).toBeGreaterThan(0);
  });
  it("preserves semantic enum order", () => {
    const left = snapshot(), right = snapshot(); entry(right, "enum").properties.labels = ["TWO", "ONE"];
    expect(compareSuppliedPilotSchemaSnapshots(left, right).status).toBe("DIFFERENT");
  });
  it("identical unsupported metadata cannot certify coverage", () => {
    const left = snapshot(); left.objects.push({ family: "unsupported", key: ["public", "DOMAIN", "Special"], properties: { kind: "DOMAIN" } }); recount(left);
    expect(compareSuppliedPilotSchemaSnapshots(left, structuredClone(left))).toMatchObject({ status: "INCOMPLETE_COVERAGE", coverage: { fullPublicSchemaEquivalent: false } });
  });
  it.each(["TABLE", "COLUMN", "FUNCTION", "TYPE"])("rejects orphaned %s ACL metadata rather than matching a truncated family", kind => {
    const left = snapshot(), target = { TABLE: "table", COLUMN: "column", FUNCTION: "function", TYPE: "enum" }[kind]!;
    // Remove dependent families as needed; retain the orphan ACL as a concrete contradiction.
    const remove = kind === "TABLE" ? ["table", "column", "constraint", "index", "trigger", "policy"] : kind === "FUNCTION" ? ["function", "trigger"] : [target];
    left.objects = left.objects.filter(e => !remove.includes(e.family)); recount(left);
    expect(() => compareSuppliedPilotSchemaSnapshots(left, structuredClone(left))).toThrow("ORPHAN_ACL");
  });
  it("refuses oversized arrays before materializing all their descriptors", () => {
    const left = snapshot(), oversized = Array(25001).fill(left.objects[0]); left.objects = oversized; left.objectCount = 25000;
    const original = Object.getOwnPropertyDescriptors, visited: unknown[] = [];
    const spy = vi.spyOn(Object, "getOwnPropertyDescriptors").mockImplementation(value => { visited.push(value); return original(value); });
    try { expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow(); expect(visited).not.toContain(oversized); }
    finally { spy.mockRestore(); }
  });
  it.each([["constraint", "validated", false], ["index", "valid", false], ["index", "ready", false], ["index", "live", false], ["trigger", "enabled", "D"], ["trigger", "enabled", "R"]])("reports identical known guard issue %s.%s without denying mathematical equality", (family, field, changed) => {
    const left = snapshot(); entry(left, family as string).properties[field as string] = changed;
    const result = compareSuppliedPilotSchemaSnapshots(left, structuredClone(left));
    expect(result.normalizedDefinitionsMatch).toBe(true);
    expect(result.status).toBe("GUARD_REVIEW_REQUIRED"); expect(result.knownGuardReviewCount).toBeGreaterThan(0);
    expect(result).toMatchObject({ snapshotProvenanceVerified: false, executionAuthorized: false, backupVerified: false });
  });
  it.each(["root", "server", "object", "properties", "array"])("refuses an accessor on %s without executing it", where => {
    const left = snapshot(), getter = vi.fn(() => "private");
    const [target, key] = where === "root" ? [left, "version"] : where === "server" ? [left.server, "encoding"] : where === "object" ? [left.objects[0], "family"] : where === "properties" ? [left.objects[0].properties, "owner"] : [left.objects, "0"];
    Object.defineProperty(target, key as string, { enumerable: true, get: getter });
    expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
  it.each(["__proto__", "constructor", "unknown"])("refuses unknown own field %s at nested boundaries", key => {
    const left = snapshot(); Object.defineProperty(entry(left, "function").properties, key, { enumerable: true, value: { polluted: true } });
    expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
  it("refuses proxies before invoking their traps", () => {
    const target = snapshot(), trap = vi.fn(() => { throw new Error("TRAP_CALLED"); });
    const proxy = new Proxy(target, { getPrototypeOf: trap, ownKeys: trap, get: trap });
    expect(() => compareSuppliedPilotSchemaSnapshots(proxy, target)).toThrow("SHAPE"); expect(trap).not.toHaveBeenCalled();
  });
  it("refuses inherited metadata, hidden fields, symbol fields and nonplain arrays", () => {
    const inherited = snapshot(); Object.setPrototypeOf(inherited.server, { inherited: true });
    const hidden = snapshot(); Object.defineProperty(hidden.objects[0], "hidden", { value: true });
    const symbol = snapshot(); Object.defineProperty(symbol.objects[0], Symbol("unknown"), { value: true });
    const sparse = snapshot(); delete sparse.objects[1];
    const arrayExtra = snapshot(); Object.defineProperty(arrayExtra.objects, "extra", { value: true });
    class Objects extends Array<Entry> {} const derived = snapshot(); derived.objects = Objects.from(derived.objects);
    for (const invalid of [inherited, hidden, symbol, sparse, arrayExtra, derived]) expect(() => compareSuppliedPilotSchemaSnapshots(invalid, snapshot())).toThrow();
  });
  it("refuses duplicate identities and declared truncation or incorrect object count", () => {
    const duplicate = snapshot(); duplicate.objects.push(structuredClone(duplicate.objects[0])); recount(duplicate);
    const truncated = snapshot(); truncated.truncated = true;
    const short = snapshot(); short.objectCount++;
    for (const invalid of [duplicate, truncated, short]) expect(() => compareSuppliedPilotSchemaSnapshots(invalid, snapshot())).toThrow();
  });
  it.each(["x".repeat(16385), "bad\u0000name", "bad\uD800"])("refuses bounded invalid identifier text", value => {
    const left = snapshot(); entry(left, "extension").properties.owner = value;
    expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow("STRING");
  });
  it("rejects a bounded aggregate above4MiB before serializing a full result snapshot", () => {
    const left = snapshot();
    for (let i = 0; i < 150; i++) left.objects.push({ family: "unsupported", key: ["public", "SYNTHETIC", "k".repeat(16000) + i], properties: { kind: "v".repeat(16000) } });
    recount(left);
    const original = JSON.stringify, complete: unknown[] = [];
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, ...rest: unknown[]) => {
      if (value && typeof value === "object" && "version" in value) complete.push(value);
      return Reflect.apply(original, JSON, [value, ...rest]);
    }) as typeof JSON.stringify);
    try { expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow("BYTES"); expect(complete).toHaveLength(0); }
    finally { spy.mockRestore(); }
  });
  it("normalizes only explicit PG17 absence versus modeled PG18 enforcement, retaining platform review", () => {
    const result = compareSuppliedPilotSchemaSnapshots(snapshot(), pg18(snapshot()));
    expect(result).toMatchObject({ normalizedDefinitionsMatch: true, status: "ENVIRONMENT_REVIEW_REQUIRED", knownGuardReviewCount: 0, snapshotProvenanceVerified: false });
  });
  it.each(["enforced", "period"])("refuses missing PG18 constraint %s rather than defaulting it", name => {
    const left = pg18(snapshot()); delete entry(left, "constraint").properties[name];
    expect(() => compareSuppliedPilotSchemaSnapshots(left, pg18(snapshot()))).toThrow();
  });
  it.each(["notNullEnforced", "notNullValidated"])("reports identical PG18 %s false as a guard review", field => {
    const left = pg18(snapshot()); entry(left, "column").properties[field] = false;
    expect(compareSuppliedPilotSchemaSnapshots(left, structuredClone(left))).toMatchObject({ normalizedDefinitionsMatch: true, status: "GUARD_REVIEW_REQUIRED", knownGuardReviewCount: 1 });
  });
  it("reports identical PG18 unenforced constraint without granting readiness", () => {
    const left = pg18(snapshot()); entry(left, "constraint").properties.enforced = false;
    expect(compareSuppliedPilotSchemaSnapshots(left, structuredClone(left))).toMatchObject({ status: "GUARD_REVIEW_REQUIRED", knownGuardReviewCount: 1, executionAuthorized: false });
  });
  it.each([160010, 190001, -1])("rejects unsupported server version %s", version => {
    const left = snapshot(); left.server.versionNum = version;
    expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow("SERVER_CONTEXT");
  });
  it("does not ignore ownership and extension version as platform noise", () => {
    for (const family of ["acl", "extension"]) {
      const right = snapshot(); entry(right, family).properties[family === "acl" ? "owner" : "version"] = "changed";
      const result = compareSuppliedPilotSchemaSnapshots(snapshot(), right);
      expect(result).toMatchObject({ status: "ENVIRONMENT_REVIEW_REQUIRED", normalizedDefinitionsMatch: true }); expect(result.environmentDifferences).toBeGreaterThan(0);
    }
  });
  it("requires a closed family manifest with real zeroes, not omitted or guessed families", () => {
    const missing = snapshot(); delete missing.familyCounts.policy;
    const unknown = snapshot(); unknown.familyCounts.future = 0;
    const mismatched = snapshot(); mismatched.familyCounts.trigger = 0;
    const malformed = snapshot(); Object.defineProperty(malformed.familyCounts, "acl", { value: undefined, enumerable: true });
    for (const left of [missing, unknown, mismatched, malformed]) expect(() => compareSuppliedPilotSchemaSnapshots(left, snapshot())).toThrow();
  });
  it("bounds difference detail output and keeps total changes without leaking property values", () => {
    const left = snapshot(), right = snapshot();
    for (let i = 0; i < 200; i++) {
      const key = ["public", "SYNTHETIC", "k".repeat(8000) + i];
      left.objects.push({ family: "unsupported", key, properties: { kind: "before_private_value" } });
      right.objects.push({ family: "unsupported", key: [...key], properties: { kind: "after_private_value" } });
    }
    recount(left); recount(right);
    const result = compareSuppliedPilotSchemaSnapshots(left, right), encoded = JSON.stringify(result);
    expect(result.totalDifferences).toBe(200); expect(result.differencesTruncated).toBe(true);
    expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(131072);
    expect(encoded).not.toContain("before_private_value"); expect(encoded).not.toContain("after_private_value");
  });
  it("includes the response envelope and separators in the128KiB output ceiling", () => {
    const left = snapshot(), right = snapshot();
    const empty = { category: "DEFINITION", family: "unsupported", key: ["public", "SYNTHETIC", "000"], fields: ["kind"] };
    const characters = 8192 - Buffer.byteLength(JSON.stringify(empty));
    for (let i = 0; i < 16; i++) {
      const key = ["public", "SYNTHETIC", "k".repeat(characters) + String(i).padStart(3, "0")];
      expect(Buffer.byteLength(JSON.stringify({ ...empty, key }))).toBe(8192);
      left.objects.push({ family: "unsupported", key, properties: { kind: "before" } });
      right.objects.push({ family: "unsupported", key: [...key], properties: { kind: "after" } });
    }
    recount(left); recount(right);
    const result = compareSuppliedPilotSchemaSnapshots(left, right);
    expect(result.totalDifferences).toBe(16); expect(result.status).toBe("INCOMPLETE_COVERAGE");
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(131072);
  });
});
