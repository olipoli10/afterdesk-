import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "specs/210-personal-live-activation/build-pgvector-native.ps1"), "utf8");

describe("native pgvector build static contract (no downloaded tool execution)", () => {
  it("pins the source, reviewed Makefile, compiler and existing PostgreSQL archive", () => {
    for (const hash of [
      "bf0e885aeea36c555da5e0c68869d2282ed53020b4388202dae20368f4a9b5ae",
      "79693ec8c97f437d584528e298b7d100fee4ce814b5bafc4b7d28a305dd03d10",
      "88c8344236a27a6e727e0a8edc49aaa2690bdc7a9464b9d18cc7abe70a9f1c0d",
      "4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf",
    ]) expect(source).toContain(hash);
    expect(source).toContain("$digest.ComputeHash($file)");
    expect(source).toContain("$file.Position=0");
  });
  it("creates private fresh ignored copies and refuses unsafe archive paths or replacement", () => {
    expect(source).toContain("$acl.SetAccessRuleProtection($true,$false)");
    expect(source).toContain("PGVECTOR_BUILD_SCRATCH_NOT_IGNORED");
    expect(source).toContain("PGVECTOR_BUILD_ARCHIVE_LINK_REFUSED");
    expect(source).toContain("PGVECTOR_BUILD_ARCHIVE_COLLISION");
    expect(source).toContain("[IO.FileMode]::CreateNew");
    expect(source).toContain("$name -ne $Prefix");
    expect(source).toContain("'pgsql/lib/postgres.lib' (Join-Path $taskPaths.pgSdk 'lib')");
  });
  it("adds only the verified complementary CRT directory after Desktop, without replacing inputs or flags", () => {
    expect(source).toContain("Assert-Hash $taskStoreArchive '9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56'");
    expect(source).toContain("Copy-PinnedArchivePrefix $taskStoreArchive ($vc+'lib/x64/') $taskPaths.crtStoreLib");
    expect(source).toContain("Assert-Hash (Join-Path $taskPaths.crtStoreLib 'oldnames.lib') '35bd82cfb02a0146ff9c0ca6bf7dbde61d49c6d4f3493befe584218c370ff41d'");
    expect(source).toContain("$taskEnvironment['LIB']=$taskPaths.crtLib+';'+$taskPaths.crtStoreLib+';'+(Join-Path $taskPaths.sdkLib 'ucrt')");
    expect(source).not.toMatch(/NODEFAULTLIB|taskEnvironment\['(?:CL|_CL_|CFLAGS|LINK)'\]|crtStoreLib[^\r\n]*'uwp'/);
  });
  it("refuses command-processor hooks and constructs child environment without saved secrets", () => {
    expect(source).toContain("PGVECTOR_BUILD_CMD_AUTORUN_REFUSED");
    expect(source).toContain("[Microsoft.Win32.RegistryView]::Registry64");
    expect(source).toContain("[Microsoft.Win32.RegistryView]::Registry32");
    expect(source).toContain("[Collections.Generic.Dictionary[string,string]]::new");
    expect(source).not.toMatch(/GetEnvironmentVariable|Get-ChildItem\s+Env:|SetEnvironmentVariable/);
  });
  it("passes only STD handles and binds the suspended process to its exact cleanup job before resume", () => {
    expect(source).toContain("struct SIX");
    expect(source).toContain("new IntPtr(0x20002)");
    expect(source).toContain("0x08080404");
    expect(source).toContain("limits.basic.flags=0x2000");
    expect(source.indexOf("if(!AssignProcessToJobObject(job,pi.process))")).toBeLessThan(source.indexOf("if(ResumeThread(pi.thread)"));
    expect(source).toContain("DeleteProcThreadAttributeList(attributes)");
    expect(source).toContain("foreach(var h in handles)SetHandleInformation(h,1,0)");
  });
  it("launches one all target and enforces deadline and descendant cleanup", () => {
    expect(source.match(/\[PgvectorOwnedBuild\]::Run\(/g)).toHaveLength(1);
    expect(source).toContain("/NOLOGO /F Makefile.win all");
    expect(source).toContain("WaitForSingleObject(pi.process,120000)");
    expect(source).toContain("TerminateJobObject(job,result.timedOut?124u:0u)");
    expect(source).toContain("PGVECTOR_BUILD_TREE_CLEANUP_UNCERTAIN");
    expect(source).not.toMatch(/Invoke-WebRequest|HttpClient|New-Service|Start-Service|Remove-Item/);
  });
  it("keeps build success distinct from extension load, runtime changes and network isolation", () => {
    expect(source).toContain("BUILT_NOT_LOADED_PENDING_IMPORT_REVIEW");
    expect(source).toContain("networkIsolationEnforced=$false");
    expect(source).toContain("runtimeModified=$false");
    expect(source).toContain("postgresLaunched=$false");
    expect(source).toContain("compilerLaunchAttempted=$taskLaunched");
    expect(source).toContain("userLicenseAcceptanceSubmitted=$false");
  });
});
