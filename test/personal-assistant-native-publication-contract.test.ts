import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "specs/210-personal-live-activation/publish-pgvector-runtime.ps1"), "utf8");

describe("native extension publication static contract (no script execution)", () => {
  it("has a read-only default and pins one reviewed build and one disposable runtime", () => {
    expect(source).toContain("param([switch]$Publish)");
    expect(source).toContain("personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3");
    expect(source).toContain(".scratch\\postgres-native-17.11-3\\runtime\\pgsql");
    expect(source).toContain("PGVECTOR_COPY_VALIDATED_NO_WRITES");
  });
  it("pins exact compiled DLL, generated SQL and control plus unchanged core binaries", () => {
    for (const hash of [
      "1d54ce81495fc481da3d261edf4f797c837340a51648d3456afa3d72e4431cef",
      "7fb5bb279ef83bf9204bfac7405bb5c9a05e49f5ac7d64d1eb4464d103b80f32",
      "f1e1717c0c1da9c200ff3a53acf1d14eba5e3f70da928a723b247b0b1059417d",
      "8ae8bb442e8a4c4fb2c8e9ad38c19aca610ee3cba33afd69249de769f905329b",
    ]) expect(source).toContain(hash);
  });
  it("reads the full pinned source archive for exactly 40 upgrade SQL files", () => {
    expect(source).toContain("bf0e885aeea36c555da5e0c68869d2282ed53020b4388202dae20368f4a9b5ae");
    expect(source).toContain("if ($upgrades -ne 40)");
    expect(source).toContain("if ($taskEntries.Count -ne 43)");
    expect(source).toContain("[IO.FileShare]::Read)");
  });
  it("refuses reparse ancestors, duplicate paths and existing destinations before any staging", () => {
    for (const label of ["REPARSE_REFUSED", "DUPLICATE_REFUSED", "EXISTING_TARGET_REFUSED", "TARGET_REFUSED"]) {
      expect(source).toContain(`PGVECTOR_COPY_${label}`);
    }
    expect(source.indexOf("Add-Entry 'share\\extension\\vector.control'")).toBeLessThan(source.indexOf("$taskStage='STAGING'"));
  });
  it("uses CreateNew staging and exclusive receipt, flushes and hashes bytes, never overwrites", () => {
    expect(source.match(/\[IO.FileMode\]::CreateNew/g)).toHaveLength(2);
    expect(source).toContain("$output.Flush($true)");
    expect(source).toContain("$hash.ComputeHash($output)");
    expect(source).toContain("[IO.File]::Move($entry.temporary,$entry.target,$false)");
    expect(source).toContain("atomicity='PER_FILE_ONLY'");
  });
  it("retains partial publication evidence without retry or deletion", () => {
    expect(source).toContain("$entry.published=$true");
    expect(source).toContain("autoRetry=$false; automaticDeletion=$false");
    expect(source).toContain("$receiptStream.Flush($true)");
    expect(source).not.toMatch(/Remove-Item|File\]::Delete|FileMode\]::Create[,)]/);
  });
  it("cannot launch PostgreSQL, load a DLL, install, download or read product credentials", () => {
    expect(source).toContain("extensionLoaded=$false; postgresLaunched=$false");
    expect(source).not.toMatch(/Start-Process|Diagnostics\.Process|LoadLibrary|DllImport|HttpClient|Invoke-WebRequest|GetEnvironmentVariable|Env:/);
  });
});
