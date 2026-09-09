import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReleaseInputBinding, assertReleaseSourceBinding } from "../../scripts/endvera-release-source-binding.mjs";

const layout = "src/app/layout.tsx";
const derived = "release/endvera-construction-v1/release-manifest-v3.json";
function fixture(test: (f: ReturnType<typeof makeFixture>) => void) {
  const f = makeFixture();
  try { test(f); }
  finally {
    const rel = relative(resolve(tmpdir()), resolve(f.root));
    if (isAbsolute(rel) || !rel.startsWith("endvera-release-tracked-") || /[\\/]/.test(rel)) throw new Error("TEST_CLEANUP_SCOPE_INVALID");
    rmSync(f.root, { recursive: true, force: true });
  }
}
function makeFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "endvera-release-tracked-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, "-c", `core.hooksPath=${resolve(root, ".no-hooks")}`, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (file: string, contents: string) => { const target = resolve(root, file); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, contents); };
  git("-c", "init.templateDir=", "init");
  git("config", "core.autocrlf", "false");
  write("bound.txt", "bound source\n");
  write(layout, "export default function Layout() { return null; }\n");
  write(derived, "{}\n");
  git("add", "."); git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic release fixture");
  const bytes = readFileSync(resolve(root, "bound.txt"));
  const manifest = { source: { head: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") }, inputs: [{ path: "bound.txt", byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] };
  return { root, git, write, manifest };
}

describe("PRR2-007 whole tracked source ignores index suppression flags", () => {
  it.each(["--assume-unchanged", "--skip-worktree"])("rejects hidden non-input edit under %s", (flag) => fixture((f) => {
    f.git("update-index", flag, layout);
    f.write(layout, "export default function Layout() { throw new Error('synthetic mutation'); }\n");
    expect(f.git("diff", "--name-only", "HEAD")).toBe("");
    expect(assertReleaseInputBinding({ repositoryRoot: f.root, manifest: f.manifest }).mode).toBe("GIT_COMMIT_INPUT_BINDING");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it.each(["--assume-unchanged", "--skip-worktree"])("accepts unchanged bytes with %s", (flag) => fixture((f) => {
    f.git("update-index", flag, layout);
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
  }));

  it.each(["addition", "deletion", "index bytes", "index mode"])("rejects tracked/index %s drift", (change) => fixture((f) => {
    if (change === "addition") { f.write("added.txt", "synthetic\n"); f.git("add", "added.txt"); }
    if (change === "deletion") f.git("rm", layout);
    if (change === "index bytes") { f.write(layout, "changed\n"); f.git("add", layout); f.write(layout, "export default function Layout() { return null; }\n"); }
    if (change === "index mode") f.git("update-index", "--chmod=+x", layout);
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it("excludes only the exact derived manifest", () => fixture((f) => {
    f.write(derived, "{\"derived\":true}\n"); f.git("add", derived);
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toMatchObject({ trackedCheckoutMatchesSource: true, excludedDerivedProjection: derived });
    f.write(`${derived}.extra`, "not excluded\n"); f.git("add", `${derived}.extra`);
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it.each(["source only", "index only"])("permits the exact projection in %s", (state) => fixture((f) => {
    f.git("rm", "--cached", derived);
    if (state === "index only") {
      f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic source without projection");
      f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
      f.git("add", derived);
    }
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
  }));

  it("rejects a missing skipped tracked file", () => fixture((f) => {
    f.git("update-index", "--skip-worktree", layout);
    rmSync(resolve(f.root, layout));
    expect(f.git("diff", "--name-only", "HEAD")).toBe("");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it("compares raw binary blobs correctly across batch boundaries", () => fixture((f) => {
    for (let index = 0; index < 130; index++) f.write(`binary/${index}.bin`, `\0binary\n${index}\r\n`);
    f.git("add", ".");
    f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic binary batch");
    f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
    f.git("update-index", "--skip-worktree", "binary/99.bin"); f.write("binary/99.bin", "\0changed");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it("permits exact LF-to-CRLF checkout but not mixed or CRCRLF", () => fixture((f) => {
    f.git("config", "core.autocrlf", "true");
    f.write(layout, "export default function Layout() { return null; }\r\n");
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
    f.git("update-index", "--assume-unchanged", layout);
    f.write(layout, "export default function Layout() { return null; }\r\r\n");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it.each(["check.ps1", "migration.sql", "schema.prisma", "config.toml", ".gitignore", "LICENSE"])("preserves normal Git-text CRLF checkout for %s", (file) => fixture((f) => {
    f.write(file, "synthetic text\nsecond line\n"); f.git("add", file);
    f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic text format");
    f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
    f.git("config", "core.autocrlf", "true"); f.write(file, "synthetic text\r\nsecond line\r\n");
    expect(f.git("ls-files", "--eol", "--", file)).toContain("i/lf");
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
    f.git("update-index", "--assume-unchanged", file); f.write(file, "synthetic text\r\nsecond line\n");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it("does not normalize a path declared binary by Git attributes", () => fixture((f) => {
    f.write(".gitattributes", "binary.ps1 -text\n"); f.write("binary.ps1", "synthetic binary declaration\n"); f.git("add", ".");
    f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic binary attribute");
    f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
    f.write("binary.ps1", "synthetic binary declaration\r\n"); f.git("update-index", "--skip-worktree", "binary.ps1");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));

  it("accepts clean CRLF fixtures of actual committed PowerShell, SQL, Prisma and TOML sources", () => fixture((f) => {
    const files = [".specify/scripts/powershell/check-prerequisites.ps1", "prisma/migrations/20260730000000_baseline/migration.sql", "prisma/schema.prisma", "prisma/migrations/migration_lock.toml"];
    const sources = files.map((file) => {
      const bytes = execFileSync("git", ["show", `HEAD:${file}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 });
      expect(bytes.includes(13)).toBe(false); expect(Buffer.from(bytes.toString("utf8"))).toEqual(bytes);
      f.write(file, bytes.toString("utf8")); return [file, bytes.toString("utf8")] as const;
    });
    f.git("add", "."); f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Actual source bytes in local fixture");
    f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
    f.git("config", "core.autocrlf", "true");
    for (const [file, text] of sources) f.write(file, text.replaceAll("\n", "\r\n"));
    expect(assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest }).trackedCheckoutMatchesSource).toBe(true);
  }));

  it.each([Buffer.from([0, 97, 10]), Buffer.from([255, 97, 10])])("never CRLF-normalizes binary or invalid UTF8 bytes %j", (bytes) => fixture((f) => {
    f.write(".gitattributes", "payload.ps1 text\n"); writeFileSync(resolve(f.root, "payload.ps1"), bytes);
    f.git("add", "."); f.git("-c", "user.name=Local Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "Synthetic nontext byte fixture");
    f.manifest.source = { head: f.git("rev-parse", "HEAD"), tree: f.git("rev-parse", "HEAD^{tree}") };
    writeFileSync(resolve(f.root, "payload.ps1"), Buffer.concat([bytes.subarray(0, -1), Buffer.from([13, 10])])); f.git("update-index", "--assume-unchanged", "payload.ps1");
    expect(() => assertReleaseSourceBinding({ repositoryRoot: f.root, manifest: f.manifest })).toThrow("RELEASE_TRACKED_CHECKOUT_SOURCE_DRIFT");
  }));
});
