import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildPilotMigrationCatalog } from "../specs/210-personal-live-activation/deployment/pilot-migration-catalog.mjs";
import { stageMigrationRehearsal, verifyInstalledPrisma, verifyStagedInputs } from "../specs/210-personal-live-activation/deployment/migration-rehearsal/rehearsal.mjs";

const actualRoot = process.cwd(), catalog = buildPilotMigrationCatalog(actualRoot);
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "endvera-rehearsal-peer-")); roots.push(root);
  const files = ["prisma/schema.prisma", "prisma/migrations/migration_lock.toml", "node_modules/prisma/package.json",
    "specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql",
    ...catalog.entries.map((e: { relativePath: string }) => e.relativePath)];
  for (const file of files) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(actualRoot, file), target); }
  const cluster = path.join(root, ".scratch", "personal-pg-native-" + randomUUID().replaceAll("-", "")); mkdirSync(cluster, { recursive: true });
  const stage = stageMigrationRehearsal(root, cluster);
  return { root, cluster, staged: stage.destination };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("endvera-rehearsal-peer-")) throw new Error("PEER_CLEANUP_SCOPE_REFUSED");
    rmSync(root, { recursive: true, force: false });
  }
});

describe("populated rehearsal independent local staging — no SQL or native execution", () => {
  it("accepts exact private copies and does not modify the source migration bytes", () => {
    const f = fixture();
    expect(verifyStagedInputs(f.root, f.cluster).catalogSha256).toBe(catalog.catalogSha256);
    expect(readFileSync(path.join(f.staged, "79/migrations", catalog.entries[78].migrationName, "migration.sql")))
      .toEqual(readFileSync(path.join(actualRoot, catalog.entries[78].relativePath)));
  });
  it.each(["70", "79"])("refuses an additional executable migration in staged%s before execution", label => {
    const f = fixture(), extra = path.join(f.staged, label, "migrations", "20260911000000_unreviewed");
    mkdirSync(extra); writeFileSync(path.join(extra, "migration.sql"), "SELECT 'SYNTHETIC_UNREVIEWED';\n");
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow();
  });
  it("refuses extra SQL beside an expected staged migration", () => {
    const f = fixture(); writeFileSync(path.join(f.staged, "79/migrations", catalog.entries[0].migrationName, "extra.sql"), "SELECT 0;\n");
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow();
  });
  it.each(["schema.prisma", "seed-70.sql", "snapshot-70.sql", "snapshot-79.sql", "prisma-70.config.ts", "prisma-79.config.ts", "70/migrations/migration_lock.toml", "79/migrations/migration_lock.toml"])("refuses changed staged executable input %s", relative => {
    const f = fixture(), file = path.join(f.staged, relative);
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("\n-- SYNTHETIC_TAMPER\n")]));
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("STAGED_BYTES_CHANGED");
  });
  it.each(["schema.prisma", "seed-70.sql"])("refuses source %s changed after staging", name => {
    const f = fixture(), file = path.join(f.root, name === "schema.prisma" ? "prisma/schema.prisma" : "specs/210-personal-live-activation/deployment/migration-rehearsal/seed-70.sql");
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("\n// SYNTHETIC_SOURCE_CHANGED\n")]));
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("SOURCE_CHANGED");
  });
  it("refuses source SQL changed after stage even if staged SQL remains exact", () => {
    const f = fixture(), file = path.join(f.root, catalog.entries[78].relativePath);
    writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("\n-- CHANGED\n")]));
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("CATALOG_CHANGED");
  });
  it("never overwrites a previous rehearsal stage on replay", () => {
    const f = fixture(), before = readFileSync(path.join(f.staged, "inputs.json"));
    expect(() => stageMigrationRehearsal(f.root, f.cluster)).toThrow();
    expect(readFileSync(path.join(f.staged, "inputs.json"))).toEqual(before);
  });
  it("rejects a stage migration ancestor junction", () => {
    const f = fixture(), source = path.join(f.staged, "79/migrations"), moved = path.join(f.staged, "held-migrations");
    renameSync(source, moved); symlinkSync(moved, source, "junction");
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("REPARSE");
  });
  it("rejects arbitrary and traversal cluster paths before staging", () => {
    const f = fixture();
    for (const cluster of [f.root, path.join(f.root, ".scratch"), f.cluster + "/../" + path.basename(f.cluster)]) {
      expect(() => stageMigrationRehearsal(f.root, cluster)).toThrow("CLUSTER_PATH");
    }
  });
  it("requires the actual installed Prisma version before reusing staged inputs", () => {
    const f = fixture(), file = path.join(f.root, "node_modules/prisma/package.json");
    const current = JSON.parse(readFileSync(file, "utf8")); current.version = "6.19.4"; writeFileSync(file, JSON.stringify(current));
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("PRISMA_VERSION");
  });
  it("reads the approved actual checkout dependency chain without a CLI or database", () => {
    expect(verifyInstalledPrisma(actualRoot)).toEqual({ version: "6.19.3", sharedDependencyJunction: true, readOnly: true });
  });
  it("still refuses arbitrary dependency junctions in an otherwise valid fixture", () => {
    const f = fixture(), original = path.join(f.root, "node_modules"), target = path.join(f.root, "unapproved-dependencies");
    renameSync(original, target); symlinkSync(target, original, "junction");
    expect(() => verifyInstalledPrisma(f.root)).toThrow("DEPENDENCY_JUNCTION");
    expect(() => verifyStagedInputs(f.root, f.cluster)).toThrow("DEPENDENCY_JUNCTION");
  });
  it("preserves native runtime, private ACL and environment gates ahead of rehearsal staging (static)", () => {
    const source = readFileSync(path.join(actualRoot, "specs/210-personal-live-activation/validate-postgres-native.ps1"), "utf8");
    const stage = source.indexOf("$taskStage = 'REHEARSAL_STAGE'"); expect(stage).toBeGreaterThan(0);
    for (const sentinel of ["PERSONAL_NATIVE_RUNTIME_HASH_MISMATCH", "Set-Acl -LiteralPath $taskCluster -AclObject $taskAcl",
      "PERSONAL_NATIVE_SCRATCH_NOT_IGNORED", "PERSONAL_NATIVE_POSTGRES_17_11_VERIFIED", "PERSONAL_NATIVE_SIMULTANEOUS_DISTINCT_BACKENDS_VERIFIED"]) {
      expect(source.indexOf(sentinel)).toBeGreaterThan(0); expect(source.indexOf(sentinel)).toBeLessThan(stage);
    }
    expect(source).toContain("$info.Environment.Clear()"); expect(source).toContain("$info.CreateNoWindow = $true");
    expect(source).toContain("$taskAcl.SetAccessRuleProtection($true, $false)");
    expect(source).toContain('"-h 127.0.0.1');
  });
  it("checks all private executable files before their bounded native phases (static)", () => {
    const source = readFileSync(path.join(actualRoot, "specs/210-personal-live-activation/validate-postgres-native.ps1"), "utf8");
    for (const [stage, label, file] of [["MIGRATE_70", "migrate-70", "prisma-70.config.ts"], ["SEED_70", "seed-70", "seed-70.sql"],
      ["SNAPSHOT_70", "snapshot-70", "snapshot-70.sql"], ["MIGRATE_79", "migrate-79", "prisma-79.config.ts"], ["SNAPSHOT_79", "snapshot-79", "snapshot-79.sql"]]) {
      const start = source.indexOf(`$taskStage = 'REHEARSAL_${stage}'`), end = source.indexOf("$taskStage =", start + 15);
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      const block = source.slice(start, end);
      expect(block).toContain(`Assert-RehearsalInputs 'rehearsal-${label}'`);
      expect(block.indexOf("Assert-RehearsalInputs")).toBeLessThan(block.indexOf(file));
      expect(block).toContain("Get-NativeCampaignRemainingMs $taskRehearsalClock");
      expect(block).toContain("$remaining");
    }
  });
  it("keeps rehearsal separate from normal clones and retains both databases without reset or shared generation (static)", () => {
    const source = readFileSync(path.join(actualRoot, "specs/210-personal-live-activation/validate-postgres-native.ps1"), "utf8");
    expect(source).toContain("$MigrationRehearsal -and $TestFile");
    const start = source.indexOf("# BEGIN_DEFAULT_MIGRATED_TEMPLATE_SUITE"), end = source.indexOf("# END_DEFAULT_MIGRATED_TEMPLATE_SUITE");
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const normal = source.slice(start, end); expect(normal.match(/'migrate', 'deploy'/g)).toHaveLength(1);
    expect(normal).toContain("foreach ($taskTest in $taskTestFiles)");
    expect(source).toContain("CREATE DATABASE $taskDatabase TEMPLATE $taskBaseline;");
    expect(source).toContain("PERSONAL_NATIVE_REHEARSAL_SNAPSHOT_CHANGED");
    expect(source).not.toMatch(/DROP DATABASE|migrate.{0,10}reset|prisma.{0,30}generate|Remove-Item|TRUNCATE/i);
    expect(source).toContain("'-m', 'fast', '-w', '-t', '45', 'stop') 'stop' 55000");
  });
});
