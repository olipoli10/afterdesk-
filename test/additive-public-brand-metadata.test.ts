import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA additive public brand metadata", () => {
  it("names the construction operating assistant and retained managed work", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("AI operating assistant for construction and managed work");
    expect(layout).toContain("ENDVERA TextAssist helps small contractors");
    expect(layout).toContain("human-backed managed work");
  });

  it("installs into the additive TextAssist surface without hiding the root site", () => {
    const manifest = read("src/app/manifest.ts");
    const homepage = read("src/app/page.tsx");
    expect(manifest).toContain('name: "ENDVERA TextAssist"');
    expect(manifest).toContain('start_url: "/textassist"');
    expect(manifest).toContain('scope: "/"');
    expect(homepage).toMatch(/<SimplicityActs\b/);
    expect(homepage).toMatch(/<AssemblyExperience[^>]*continuation/);
    expect(homepage).toMatch(/<TextAssistBanner\b/);
  });

  it("keeps construction, TextAssist and deletion guidance discoverable", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('"/construction"');
    expect(sitemap).toContain('"/textassist"');
    expect(sitemap).toContain('"/account-deletion"');
  });
});
