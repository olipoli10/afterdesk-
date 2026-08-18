/* Official ENDVERA rename guards. Written RED against Production 14dafff
   before any product edit. Internal repository, database and Vercel project
   identifiers may remain historical; every user-facing source surface must
   carry the official brand and canonical web origin. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(path: string): string[] {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(path, entry);
    return statSync(join(root, child)).isDirectory()
      ? sourceFiles(child)
      : /\.(?:ts|tsx|svg)$/.test(entry)
        ? [child]
        : [];
  });
}

const publicBrandFiles = [
  ...sourceFiles("src/app"),
  ...sourceFiles("src/components"),
  ...sourceFiles("src/lib/i18n"),
  "src/lib/site.ts",
];

describe("ENDVERA official brand cutover", () => {
  it("removes the retired AfterDesk name from every user-facing source surface", () => {
    const stale = publicBrandFiles.filter((path) => /AfterDesk/.test(read(path)));
    expect(stale, `stale public brand in:\n${stale.join("\n")}`).toEqual([]);
  });

  it("uses endvera.com as the canonical origin and cited public host", () => {
    expect(read("src/lib/site.ts")).toContain('"https://endvera.com"');
    for (const path of publicBrandFiles) {
      const source = read(path).replace(/mailto:[^"']+@afterdesk\.co/g, "legacy-mailbox");
      expect(source, path).not.toMatch(/afterdesk\.co\//i);
      expect(source, path).not.toMatch(/https:\/\/afterdesk\.co/i);
    }
  });

  it("ships one reusable temporary amber ENDVERA lockup", () => {
    const logo = read("src/components/logo.tsx");
    const home = read("src/app/_home/assembly-experience.tsx");
    expect(logo).toMatch(/#d87526/i);
    expect(logo).toMatch(/>\s*Endvera\s*</);
    expect(home).toMatch(/import\s+\{\s*Wordmark\s*\}/);
    expect(home).toMatch(/<Wordmark\s+tone="paper"/);
    expect(home).not.toMatch(/>\s*Endvera\s*<\/Link>/);
  });

  it("keeps the app icon in the same amber temporary identity", () => {
    const icon = read("src/app/icon.svg");
    expect(icon).toMatch(/#d87526/i);
    expect(icon).not.toMatch(/#1E7F5C|#F7F6F3/i);
  });

  it("publishes ENDVERA through metadata, manifest and organization data", () => {
    const layout = read("src/app/layout.tsx");
    const page = read("src/app/page.tsx");
    const manifest = read("src/app/manifest.ts");
    expect(layout).toMatch(/template:\s*"%s · Endvera"/);
    expect(layout).toMatch(/siteName:\s*"Endvera"/);
    expect(manifest).toMatch(/name:\s*"Endvera"/);
    expect(manifest).toMatch(/short_name:\s*"Endvera"/);
    expect(page).toMatch(/name:\s*"Endvera"/);
    const homeMeta = page.slice(page.indexOf("const HOME_META"), page.indexOf("const ORG_JSONLD"));
    const titles = [...homeMeta.matchAll(/title:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(titles).toHaveLength(4);
    expect(titles.every((title) => title.endsWith("| Endvera"))).toBe(true);
  });
});
