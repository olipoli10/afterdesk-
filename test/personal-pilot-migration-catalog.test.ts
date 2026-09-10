import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPilotMigrationCatalog, compareSuppliedPilotMigrationRows, inspectPilotMigrationBytes } from "../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";

const modulePath = "specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";
const local = buildPilotMigrationCatalog(process.cwd());
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const rows = () => local.entries.slice(0, 70).map((entry: { migrationName: string; sha256: string }) => ({ migration_name: entry.migrationName, checksum: entry.sha256,
  finished_at: "2026-09-10T01:38:03.400Z" as unknown, rolled_back_at: null as unknown, applied_steps_count: 1 }));
const temporary: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "endvera-pilot-catalog-")); temporary.push(root);
  const migrations = path.join(root, "prisma/migrations"); mkdirSync(migrations, { recursive: true });
  writeFileSync(path.join(migrations, "migration_lock.toml"), 'provider = "postgresql"\n');
  for (const entry of local.entries) { mkdirSync(path.join(migrations, entry.migrationName)); writeFileSync(path.join(root, entry.relativePath), "SELECT 1;\n"); }
  return { root, migrations };
}
afterEach(() => { vi.restoreAllMocks(); for (const root of temporary.splice(0)) {
  // Only exact locally-created direct children of the OS temp directory are removed.
  if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("endvera-pilot-catalog-")) throw new Error("TEMP_CLEANUP_SCOPE_REFUSED");
  rmSync(root, { recursive: true, force: false });
} });

describe("pilot migration catalog — local bytes and supplied synthetic rows only", () => {
  it("inventories exact current79 in order with historical70 and pending9, never a live claim", () => {
    expect(local.totalCount).toBe(79); expect(local.historicalBaselineCount).toBe(70); expect(local.pendingCount).toBe(9);
    expect(local.entries[69].migrationName).toBe("20260910002000_personal_outbound_budget");
    expect(local.entries[78].migrationName).toBe("20260910180000_sms_correlated_calendar_approval");
    expect(local.entries.map((e: { ordinal: number }) => e.ordinal)).toEqual(Array.from({ length: 79 }, (_, i) => i + 1));
    for (const entry of local.entries) { const bytes = readFileSync(entry.relativePath); expect(entry.sha256).toBe(hash(bytes)); expect(entry.byteSize).toBe(bytes.length); }
    expect(local).toMatchObject({ readOnly: true, remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false });
    expect(Object.isFrozen(local.entries[0])).toBe(true); expect(buildPilotMigrationCatalog().catalogSha256).toBe(local.catalogSha256);
  });
  it("compares supplied successful historical rows independently of input order", () => {
    const result = compareSuppliedPilotMigrationRows(local, rows().reverse());
    expect(result.status).toBe("SUPPLIED_ROWS_MATCH_HISTORICAL_70_ONLY"); expect(result.matchedCount).toBe(70);
    expect(result.pending).toHaveLength(9); expect(result.matches.every((m: { checksumMatch: string }) => m.checksumMatch === "EXACT_BYTES")).toBe(true);
    expect(result.matches.map((m: { ordinal: number }) => m.ordinal)).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    expect(result).toMatchObject({ catalogProvenanceVerified: false, remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false });
  });
  it.each(["LF", "CRLF"] as const)("accepts only exact %s checksum alternative without changing raw catalog hash", mode => {
    const input = rows(); input[0].checksum = mode === "LF" ? local.entries[0].lfSha256 : local.entries[0].crlfSha256;
    const result = compareSuppliedPilotMigrationRows(local, input); expect(result.catalogSha256).toBe(local.catalogSha256);
    expect(result.matches[0].checksumMatch).toBe(input[0].checksum === local.entries[0].sha256 ? "EXACT_BYTES" : `${mode}_BYTES_ONLY`);
  });
  it("finite native Date finish is accepted without invoking polymorphic methods", () => {
    const input = rows(); input[0].finished_at = new Date("2026-09-10T01:38:03.400Z"); expect(compareSuppliedPilotMigrationRows(local, input).matchedCount).toBe(70);
  });
  it.each([null, undefined, "", "bad", "2026-02-30T00:00:00.000Z", new Date(NaN)])("refuses unfinished/invalid timestamp %s", value => {
    const input = rows(); input[0].finished_at = value; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("PILOT_MIGRATION_REMOTE_STATE_REFUSED");
  });
  it.each(["2026-09-10T01:38:03.400Z", false, undefined, {}])("refuses rolledback or missing rollback state %s", value => {
    const input = rows(); input[0].rolled_back_at = value; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("PILOT_MIGRATION_REMOTE_STATE_REFUSED");
  });
  it.each([0, -1, 0.5, NaN, Infinity])("refuses uncompleted applied step count %s", value => {
    const input = rows(); input[0].applied_steps_count = value; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("PILOT_MIGRATION_REMOTE_STATE_REFUSED");
  });
  it("rejects missing and excess rows, including an already-applied79 pretending to be baseline70", () => {
    expect(() => compareSuppliedPilotMigrationRows(local, rows().slice(1))).toThrow("COUNT_REFUSED");
    expect(() => compareSuppliedPilotMigrationRows(local, [...rows(), rows()[0]])).toThrow("COUNT_REFUSED");
  });
  it.each(["../escape", "20260910000000_unknown", local.entries[70].migrationName])("refuses unknown or pending migration supplied as baseline %s", name => {
    const input = rows(); input[0].migration_name = name; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("REMOTE_NAME_REFUSED");
  });
  it("rejects duplicates rather than masking a missing row", () => {
    const input = rows(); input[1] = { ...input[0] }; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("REMOTE_DUPLICATE_REFUSED");
  });
  it.each(["0".repeat(64), "A".repeat(64), "", "sha256:" + "a".repeat(64)])("refuses unknown checksum %s", checksum => {
    const input = rows(); input[0].checksum = checksum; expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("REMOTE_CHECKSUM_REFUSED");
  });
  it("does not execute getters or accept unknown remote keys", () => {
    const input = rows(), getter = vi.fn(() => input[1].checksum); Object.defineProperty(input[0], "checksum", { enumerable: true, get: getter });
    expect(() => compareSuppliedPilotMigrationRows(local, input)).toThrow("SHAPE_REFUSED"); expect(getter).not.toHaveBeenCalled();
    expect(() => compareSuppliedPilotMigrationRows(local, rows().map((r: Record<string, unknown>) => ({ ...r, logs: "private" })))).toThrow("SHAPE_REFUSED");
  });
  it("requires strict catalog shape/hash/order and exact relative path", () => {
    const changed = structuredClone(local); changed.entries[0].relativePath = "../migration.sql";
    expect(() => compareSuppliedPilotMigrationRows(changed, rows())).toThrow("CATALOG_ENTRY_REFUSED");
    expect(() => compareSuppliedPilotMigrationRows({ ...local, catalogSha256: "0".repeat(64) }, rows())).toThrow("CATALOG_HASH_REFUSED");
    expect(() => compareSuppliedPilotMigrationRows({ ...local, executionAuthorized: true }, rows())).toThrow("CATALOG_SHAPE_REFUSED");
    const reordered = structuredClone(local); reordered.entries.reverse(); expect(() => compareSuppliedPilotMigrationRows(reordered, rows())).toThrow("CATALOG_ENTRY_REFUSED");
  });
  it("preserves all SQL bytes other than the explicit newline alternative", () => {
    const name = local.entries[0].migrationName, lf = inspectPilotMigrationBytes(name, Buffer.from("SELECT 'é';\n-- untouched\n"));
    const crlf = inspectPilotMigrationBytes(name, Buffer.from("SELECT 'é';\r\n-- untouched\r\n"));
    expect(lf.lfSha256).toBe(crlf.lfSha256); expect(lf.crlfSha256).toBe(crlf.sha256); expect(lf.sha256).not.toBe(crlf.sha256);
    expect(inspectPilotMigrationBytes(name, Buffer.from("SELECT 'é'; \n-- untouched\n")).lfSha256).not.toBe(lf.lfSha256);
  });
  it.each([Buffer.from("a\r\nb\n"), Buffer.from("a\rb"), Buffer.from("\uFEFFSELECT 1;\n"), Buffer.from([0xff]), Buffer.from([0])])("refuses non-exact encoding/newlines %j", bytes => {
    expect(() => inspectPilotMigrationBytes(local.entries[0].migrationName, bytes)).toThrow();
  });
  it("rejects missing, renamed and extra local migrations", () => {
    const f = fixture(), from = path.join(f.migrations, local.entries[0].migrationName);
    renameSync(from, path.join(f.migrations, "20260730000000_not_the_baseline")); expect(() => buildPilotMigrationCatalog(f.root)).toThrow("ORDERED_NAMES_REFUSED");
    renameSync(path.join(f.migrations, "20260730000000_not_the_baseline"), from);
    writeFileSync(path.join(f.migrations, "extra.sql"), "SELECT 1;"); expect(() => buildPilotMigrationCatalog(f.root)).toThrow("DIRECTORY_CONTENT_REFUSED");
  });
  it("rejects extra nested files and nonregular migration SQL", () => {
    const f = fixture(), file = path.join(f.root, local.entries[0].relativePath);
    renameSync(file, file + ".bak"); mkdirSync(file); expect(() => buildPilotMigrationCatalog(f.root)).toThrow("RELEASE_SOURCE_NONREGULAR_INPUT_REFUSED");
  });
  it("rejects root junction and lexical parent traversal", () => {
    const f = fixture(), link = path.join(f.root, "linked-root"); symlinkSync(f.root, link, "junction");
    expect(() => buildPilotMigrationCatalog(link)).toThrow("RELEASE_SOURCE_SYMLINK_ROOT_REFUSED");
    expect(() => buildPilotMigrationCatalog(path.join(f.root, "child") + "/../")).toThrow("ROOT_PATH_REFUSED");
  });
  it("local CLI emits only the catalog and refuses unknown command arguments", () => {
    const raw = execFileSync(process.execPath, [modulePath], { encoding: "utf8", windowsHide: true });
    expect(JSON.parse(raw)).toEqual(local); expect(raw).not.toContain(process.cwd());
    const failure = spawnSync(process.execPath, [modulePath, "--remote", "private-input"], { encoding: "utf8", windowsHide: true });
    expect(failure.status).toBe(1); expect(failure.stdout).toBe(""); expect(failure.stderr.trim()).toBe("PILOT_MIGRATION_LOCAL_CATALOG_REFUSED");
  });
  it("rejects a regular repository root below a junction ancestor", () => {
    const f = fixture(), parent = fixture(), link = path.join(parent.root, "ancestor");
    symlinkSync(path.dirname(f.root), link, "junction");
    expect(() => buildPilotMigrationCatalog(path.join(link, path.basename(f.root)))).toThrow("ROOT_ANCESTOR_REFUSED");
  });
});
