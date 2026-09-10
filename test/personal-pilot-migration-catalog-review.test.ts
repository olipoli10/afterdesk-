import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPilotMigrationCatalog, compareSuppliedPilotMigrationRows, inspectPilotMigrationBytes } from "../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";

// Actual local reads; no supplied rows below were obtained from a remote DB.
const catalog = buildPilotMigrationCatalog(process.cwd());
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const rows = () => catalog.entries.slice(0, 70).map((e: { migrationName: string; sha256: string }) => ({ migration_name: e.migrationName, checksum: e.sha256,
  finished_at: "2026-09-10T00:00:00.000Z", rolled_back_at: null, applied_steps_count: 1 }));
const temporary: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "endvera-catalog-peer-")); temporary.push(root);
  const directory = path.join(root, "prisma/migrations"); mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "migration_lock.toml"), 'provider = "postgresql"\n');
  for (const entry of catalog.entries) { mkdirSync(path.join(directory, entry.migrationName)); writeFileSync(path.join(root, entry.relativePath), "SELECT 1;\n"); }
  return { root, directory };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("endvera-catalog-peer-")) throw new Error("PEER_TEMP_SCOPE_REFUSED");
    rmSync(root, { recursive: true, force: false });
  }
});

describe("independent local pilot catalog boundary", () => {
  it("keeps actual local byte pins while a shuffled supplied comparison makes no remote/backup/drift claim", () => {
    const supplied = rows().reverse(), result = compareSuppliedPilotMigrationRows(catalog, supplied);
    expect(result.status).toBe("SUPPLIED_ROWS_MATCH_HISTORICAL_70_ONLY");
    expect(result).toMatchObject({ remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false, readOnly: true });
    expect(result.matches.map((e: { ordinal: number }) => e.ordinal)).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    expect(result.pending.map((e: { migrationName: string }) => e.migrationName)).toEqual(catalog.entries.slice(70).map((e: { migrationName: string }) => e.migrationName));
    expect(catalog.entries[78].sha256).toBe(sha(readFileSync(catalog.entries[78].relativePath)));
    expect(Object.isFrozen(result.matches[0])).toBe(true); expect(Object.isFrozen(result.pending)).toBe(true);
  });
  it("rejects migration-directory junction before following its SQL", () => {
    const f = fixture(), directory = path.join(f.directory, catalog.entries[0].migrationName), target = path.join(f.root, "held-migration");
    renameSync(directory, target); symlinkSync(target, directory, "junction");
    expect(() => buildPilotMigrationCatalog(f.root)).toThrow("DIRECTORY_CONTENT_REFUSED");
  });
  it("rejects linked prisma ancestor below a regular root", () => {
    const f = fixture(), original = path.join(f.root, "prisma"), target = path.join(f.root, "held-prisma");
    renameSync(original, target); symlinkSync(target, original, "junction");
    expect(() => buildPilotMigrationCatalog(f.root)).toThrow("RELEASE_SOURCE_SYMLINK_REFUSED");
  });
  it("rejects a migration.sql directory junction and any sibling artifact", () => {
    const f = fixture(), file = path.join(f.root, catalog.entries[0].relativePath), target = path.join(f.root, "sql-directory");
    renameSync(file, file + ".held"); mkdirSync(target); symlinkSync(target, file, "junction");
    expect(() => buildPilotMigrationCatalog(f.root)).toThrow("RELEASE_SOURCE_SYMLINK_REFUSED");
  });
  it("refuses changed membership even when the migration count remains79", () => {
    const f = fixture(), original = path.join(f.directory, catalog.entries[2].migrationName);
    renameSync(original, path.join(f.directory, "20000101000000_substitute"));
    expect(() => buildPilotMigrationCatalog(f.root)).toThrow("ORDERED_NAMES_REFUSED");
  });
  it.each(["..\\prisma", "../prisma", "C:/catalog/../prisma"])("lexical parent root refuses %s", root => {
    expect(() => buildPilotMigrationCatalog(root)).toThrow("ROOT_PATH_REFUSED");
  });
  it("SQL spaces/comments/Unicode are not normalized into a matching checksum", () => {
    const name = catalog.entries[0].migrationName, original = inspectPilotMigrationBytes(name, Buffer.from("SELECT 'é';\n"));
    for (const text of ["SELECT 'é'; \n", "select 'é';\n", "SELECT 'é';\n", "SELECT 'é';\n-- extra\n"]) {
      expect(inspectPilotMigrationBytes(name, Buffer.from(text)).lfSha256).not.toBe(original.lfSha256);
    }
    expect(inspectPilotMigrationBytes(name, Buffer.from("SELECT 'é';\r\n")).lfSha256).toBe(original.lfSha256);
  });
  it.each([Buffer.from("a\r\r\n"), Buffer.from("a\n\r\nb"), Buffer.from([0xc0, 0xaf]), Buffer.from("a\0b"), Buffer.from("\uFEFFx")])("refuses forbidden byte representation %j", bytes => {
    expect(() => inspectPilotMigrationBytes(catalog.entries[0].migrationName, bytes)).toThrow("PILOT_MIGRATION_");
  });
  it("rejects empty/over-limit SQL and does not reinterpret DataView as bytes", () => {
    for (const bytes of [new Uint8Array(), new Uint8Array(262145), new DataView(new ArrayBuffer(1))]) {
      expect(() => inspectPilotMigrationBytes(catalog.entries[0].migrationName, bytes)).toThrow("BYTES_REFUSED");
    }
  });
  it("rejects forged raw checksum despite a recomputed top-level catalog hash", () => {
    const changed = structuredClone(catalog); changed.entries[0].sha256 = "1".repeat(64);
    const { catalogSha256: ignored, ...core } = changed; void ignored; changed.catalogSha256 = sha(JSON.stringify(core));
    expect(() => compareSuppliedPilotMigrationRows(changed, rows())).toThrow("CATALOG_ENTRY_REFUSED");
  });
  it("a rehashed supplied manifest can match invented alternatives but cannot attest local provenance", () => {
    const changed = structuredClone(catalog), input = rows(), entry = changed.entries[0];
    // Keep actual raw sha256 and byteSize intact, alter only the unobserved
    // alternate representation, then recompute the public manifest digest.
    if (entry.lineEnding === "CRLF") entry.lfSha256 = "1".repeat(64); else entry.crlfSha256 = "1".repeat(64);
    input[0].checksum = "1".repeat(64);
    const { catalogSha256: ignored, ...core } = changed; void ignored; changed.catalogSha256 = sha(JSON.stringify(core));
    // Retained reviewer RED19/1 expected rejection; controller clarified that
    // this is intentionally comparison of TWO supplied inputs, not provenance.
    // Operational callers must build the actual catalog themselves, not approve
    // a caller's rehashed manifest. No WeakSet or remote authority is inferred.
    const result = compareSuppliedPilotMigrationRows(changed, input);
    expect(result).toMatchObject({ status: "SUPPLIED_ROWS_MATCH_HISTORICAL_70_ONLY", catalogProvenanceVerified: false,
      remoteObserved: false, executionAuthorized: false, backupVerified: false, driftVerified: false });
  });
  it("rejects getter rows/catalog entries without executing them", () => {
    const input = rows(), getter = vi.fn(() => "2026-09-10T00:00:00.000Z");
    Object.defineProperty(input[0], "finished_at", { enumerable: true, get: getter });
    expect(() => compareSuppliedPilotMigrationRows(catalog, input)).toThrow("SHAPE_REFUSED"); expect(getter).not.toHaveBeenCalled();
    const changed = structuredClone(catalog); Object.defineProperty(changed.entries[0], "sha256", { enumerable: true, get: getter });
    expect(() => compareSuppliedPilotMigrationRows(changed, rows())).toThrow("SHAPE_REFUSED"); expect(getter).not.toHaveBeenCalled();
  });
  it("rejects sparse, extra-key and hidden-accessor row arrays without calling accessors", () => {
    const sparse = Array(70), extra = rows(), hidden = rows(), getter = vi.fn(() => rows()[0]);
    Object.defineProperty(extra, "extra", { value: true }); Object.defineProperty(hidden, "0", { enumerable: false, get: getter });
    for (const input of [sparse, extra, hidden]) expect(() => compareSuppliedPilotMigrationRows(catalog, input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects hidden row metadata, inherited state, subclass Date and ambiguous dates", () => {
    const hidden = rows(); Object.defineProperty(hidden[0], "logs", { value: "not printed" });
    expect(() => compareSuppliedPilotMigrationRows(catalog, hidden)).toThrow("SHAPE_REFUSED");
    class CustomDate extends Date {}
    for (const finished of [new CustomDate(), "2026-09-10T00:00:00Z", "2026-09-10T00:00:00.000+00:00", "2026-09-10"]) {
      const supplied = rows() as Array<Record<string, unknown>>; supplied[0].finished_at = finished;
      expect(() => compareSuppliedPilotMigrationRows(catalog, supplied)).toThrow("REMOTE_STATE_REFUSED");
    }
    const inherited = rows(); Object.setPrototypeOf(inherited[0], { extra: true });
    expect(() => compareSuppliedPilotMigrationRows(catalog, inherited)).toThrow("SHAPE_REFUSED");
  });
});
