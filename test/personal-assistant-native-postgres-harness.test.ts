import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "specs/210-personal-live-activation/validate-postgres-native.ps1"), "utf8");
describe("native PostgreSQL harness static contract (does not start a process)", () => {
  it("requires explicit runtime and Node paths and a closed optional test-file filter", () => {
    expect(source).toContain('[Parameter(Mandatory = $true)][string]$RuntimeRoot');
    expect(source).toContain('[Parameter(Mandatory = $true)][string]$NodePath');
    expect(source).toContain("'^[a-z-]+\\.postgres\\.test\\.ts$'");
    expect(source).toContain("Assert-NoReparseAncestors $taskRuntime");
    expect(source).toContain("Assert-NoReparseAncestors $taskNode");
    expect(source).toContain("PERSONAL_NATIVE_RUNTIME_HASH_MISMATCH");
    expect(source).toContain("PERSONAL_NATIVE_UNAPPROVED_RUNTIME_PATH");
    expect(source).toContain("Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1");
  });
  it("restricts the new ignored cluster and generates only ephemeral SCRAM material", () => {
    expect(source).toContain("$taskAcl.SetAccessRuleProtection($true, $false)");
    expect(source).toContain("PERSONAL_NATIVE_SCRATCH_NOT_IGNORED");
    expect(source).toContain("[Security.Cryptography.RandomNumberGenerator]::Create()");
    expect(source).toContain("$taskRng.GetBytes($taskRandom)");
    expect(source).toContain("$taskRng.Dispose()");
    expect(source).toContain("'--auth-host=scram-sha-256'");
    expect(source).toContain("$output.Replace($taskPassword, '[REDACTED_EPHEMERAL_PASSWORD]')");
  });
  it("uses a child-environment allowlist and the existing outbound network guard", () => {
    expect(source).toContain("$info.Environment.Clear()");
    expect(source).toContain("PERSONAL_NATIVE_NETWORK_GUARD_REQUIRED");
    expect(source).toContain("$taskChildEnvironment['NODE_OPTIONS']");
    expect(source).toContain("$taskChildEnvironment['DOTENV_CONFIG_PATH']");
    expect(source).not.toMatch(/GetEnvironmentVariable\([^\r\n]*(OPENROUTER|TWILIO|DATABASE_URL|PGPASSWORD)/);
  });
  it("requires overlapping distinct native PostgreSQL backends before migration or tests", () => {
    expect(source).toContain("SHOW server_version_num;");
    expect(source).toContain("$version -ne '170011'");
    expect(source).toContain("$probeA = Start-NativeChild"); expect(source).toContain("$probeB = Start-NativeChild");
    expect(source).toContain("$numbersA[0] -eq $numbersB[0]"); expect(source).toContain("pg_stat_activity");
    expect(source.indexOf("PERSONAL_NATIVE_SIMULTANEOUS_DISTINCT_BACKENDS_VERIFIED")).toBeLessThan(source.indexOf("'migrate', 'deploy'"));
  });
  it("starts loopback-only and stops only its resolved exact data directory without deletion", () => {
    expect(source).toContain("-h 127.0.0.1 -p $taskPort");
    expect(source).toContain("$resolvedData -ne $expectedData");
    expect(source).toContain("@('-D', $resolvedData, '-m', 'fast', '-w', '-t', '45', 'stop') 'stop' 55000");
    expect(source).not.toMatch(/Remove-Item|Delete\(|register|New-Service|SetEnvironmentVariable/);
    expect(source).toContain("$info.CreateNoWindow = $true");
    expect(source).toContain("$Child.Process.Kill([bool]$Child.OwnsProcessTree)");
    expect(source).toContain("-ne 'pg_ctl.exe'");
    expect(source).toContain("[Threading.Tasks.Task]::WhenAll");
    expect(source).toContain("PERSONAL_NATIVE_DAEMON_OUTPUT_PIPE_RETAINED");
    expect(source).toContain("$Child.Process.StandardOutput.Dispose()");
  });
});
