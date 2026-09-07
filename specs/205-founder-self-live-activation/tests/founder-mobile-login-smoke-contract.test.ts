import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(
  "specs/205-founder-self-live-activation/scripts/seed-founder-mobile-login.ts",
  "utf8",
);
const runnerSource = readFileSync(
  "specs/205-founder-self-live-activation/scripts/validate-founder-mobile-login-local.ps1",
  "utf8",
);

describe("founder mobile login local smoke contract", () => {
  it("requires a new local database and refuses any R38 identity", () => {
    expect(seedSource).toContain('new Set(["localhost", "127.0.0.1"])');
    expect(seedSource).toContain('const DATABASE_PREFIX = "endvera_founder_login_205_"');
    expect(seedSource).toContain('includes("r38")');
    expect(runnerSource).toContain('$serverName = "endvera-founder-login-205-$PID"');
    expect(runnerSource).toContain('$databaseName = "endvera_founder_login_205_$PID"');
  });

  it("creates only a verified synthetic client credential and product workspace", () => {
    expect(seedSource).toContain('syntheticEmail.endsWith("@example.invalid")');
    expect(seedSource).toContain('role: "CLIENT"');
    expect(seedSource).toContain("emailVerified: true");
    expect(seedSource).toContain('providerId: "credential"');
    expect(seedSource).toContain("initializeConstructionWorkspace");
  });

  it("exercises the mobile auth and bootstrap HTTP routes without a provider or deployment", () => {
    expect(runnerSource).toContain('/api/auth/sign-in/email');
    expect(runnerSource).toContain('"expo-origin" = "endvera://"');
    expect(runnerSource).toContain('/api/endvera/v1/mobile/bootstrap');
    expect(runnerSource).toContain('"dev", "--webpack"');
    expect(runnerSource).toContain('providerCalls = 0');
    expect(runnerSource).toContain('externalNetworkCalls = 0');
    expect(runnerSource).toContain('deploymentPerformed = $false');
    expect(runnerSource).toContain('easBuildPerformed = $false');
  });

  it("uses only the checked-in toolchain and restores the caller environment", () => {
    expect(runnerSource).toContain('node_modules\\.bin\\prisma.cmd');
    expect(runnerSource).toContain('node_modules\\.bin\\tsx.cmd');
    expect(runnerSource).not.toContain("& npx.cmd");
    expect(runnerSource).toContain('$previousEnvironment[$name]');
    expect(runnerSource).toContain('[Environment]::SetEnvironmentVariable($name, [string]$previousValue, "Process")');
    expect(runnerSource).toContain('$env:DIRECT_URL = $directDatabaseUri.Uri.AbsoluteUri');
  });

  it("contains no committed credential literal", () => {
    expect(seedSource).not.toMatch(/sk-or-v1-[A-Za-z0-9_-]{20,}/);
    expect(seedSource).not.toMatch(/SYNTHETIC_PASSWORD\s*=\s*["']/);
    expect(runnerSource).not.toMatch(/sk-or-v1-[A-Za-z0-9_-]{20,}/);
    expect(runnerSource).not.toMatch(/\$syntheticPassword\s*=\s*["'][^"']{20,}["']/);
  });
});
