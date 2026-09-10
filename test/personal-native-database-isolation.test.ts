import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "specs/210-personal-live-activation");
const source = readFileSync(resolve(root, "validate-postgres-native.ps1"), "utf8");
const config = readFileSync(resolve(root, "vitest.postgres.config.ts"), "utf8");

describe("native per-file database isolation contract (static, no PostgreSQL execution)", () => {
  it("covers the same complete flat test inventory as Vitest, including global sweepers", () => {
    expect(config).toContain('include: ["specs/210-personal-live-activation/*.postgres.test.ts"]');
    const files = readdirSync(root).filter(name => name.endsWith(".postgres.test.ts"));
    expect(files.length).toBeGreaterThan(10);
    expect(files.every(name => /^[a-z-]+\.postgres\.test\.ts$/.test(name))).toBe(true);
    expect(files).toContain("sms-inbound-recovery.postgres.test.ts");
    expect(source).toContain("Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.postgres.test.ts'");
    expect(source).toContain("Sort-Object Name");
    expect(source).toContain("PERSONAL_NATIVE_EMPTY_TEST_INVENTORY");
  });
  it("migrates once, closes the template to connections and clones only after that barrier", () => {
    expect(source.match(/'migrate', 'deploy'/g)).toHaveLength(1);
    const migrated = source.indexOf("PERSONAL_NATIVE_MIGRATIONS_APPLIED");
    const sealed = source.indexOf('ALTER DATABASE $taskTemplate ALLOW_CONNECTIONS false;');
    const disconnected = source.indexOf("PERSONAL_NATIVE_TEMPLATE_CONNECTIONS_REMAIN");
    const cloned = source.indexOf('CREATE DATABASE $taskDatabase TEMPLATE $taskTemplate;');
    expect(migrated).toBeGreaterThan(0);
    expect(sealed).toBeGreaterThan(migrated);
    expect(disconnected).toBeGreaterThan(sealed);
    expect(cloned).toBeGreaterThan(disconnected);
  });
  it("creates a fresh random database and a fresh Vitest child for every file, even a filtered run", () => {
    const loop = source.slice(source.indexOf("foreach ($taskTest in $taskTestFiles)"));
    expect(loop).toContain("$taskDatabase = 'endvera_personal_210_' + [Guid]::NewGuid().ToString('N')");
    expect(loop).toContain("$taskChildEnvironment['DATABASE_URL'] = $taskUrl");
    expect(loop).toContain("$taskChildEnvironment['DIRECT_URL'] = $taskUrl");
    expect(loop).toContain("$taskChildEnvironment['ENDVERA_210_DATABASE_NAME'] = $taskDatabase");
    expect(loop).toContain("$taskChildEnvironment['PGDATABASE'] = $taskDatabase");
    expect(loop).toContain("('specs/210-personal-live-activation/' + $taskTest.Name)");
    expect(loop).toContain("Start-NativeChild $taskNode $testArgs");
    expect(source).not.toMatch(/DROP DATABASE|TRUNCATE|DELETE FROM|migrate.{0,10}reset|db.{0,10}push|pg_terminate_backend/i);
  });
  it("checks copied migrations, records per-file provenance and cannot hide a failing file", () => {
    expect(source).toContain("PERSONAL_NATIVE_CLONE_MIGRATIONS_MISMATCH");
    expect(source).toContain("$testResult.ExitCode -ne 0");
    expect(source).toContain("$taskExit = 1");
    expect(source).toContain("testFile = $taskTest.Name; database = $taskDatabase; template = $taskTemplate");
    expect(source).toContain("isolation = 'MIGRATED_TEMPLATE_CLONE_PER_FILE'");
    expect(source).toContain("($taskLabel + '-receipt.json')");
    expect(source).toContain("PERSONAL_NATIVE_TEST_CAMPAIGN_TIMEOUT");
    expect(source).toContain("PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED");
  });
  it("bounds clone, fingerprint and test phases by the same remaining campaign budget", () => {
    expect(source).toContain("$remaining = 600000 - $Clock.ElapsedMilliseconds");
    expect(source).toContain("[int][Math]::Min($MaximumMs, $remaining)");
    const loop = source.slice(source.indexOf("foreach ($taskTest in $taskTestFiles)", source.indexOf("$taskTestClock =")));
    expect(loop.match(/\$taskPhaseTimeout = Get-NativeCampaignRemainingMs \$taskTestClock/g)).toHaveLength(2);
    expect(loop).toContain("($taskLabel + '-create') $taskPhaseTimeout");
    expect(loop).toContain("($taskLabel + '-migrations') $taskPhaseTimeout");
    expect(loop).toContain("$taskRemainingMs = Get-NativeCampaignRemainingMs $taskTestClock 600000");
    expect(loop.indexOf("$taskRemainingMs =")).toBeLessThan(loop.indexOf("Start-NativeChild $taskNode $testArgs"));
  });
  it("allows a bounded final fsync for retained clones without force-killing PostgreSQL", () => {
    expect(source).toContain("'-m', 'fast', '-w', '-t', '45', 'stop') 'stop' 55000");
    expect(source).toContain("PERSONAL_NATIVE_CLEANUP_REQUIRES_REVIEW");
    expect(source).not.toMatch(/'-m', 'immediate'|Stop-Process|taskkill/i);
  });
});
