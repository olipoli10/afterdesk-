import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA Construction conversion surface", () => {
  it("renders the complete accepted operating loop and concrete outcomes", () => {
    const page = read("src/app/construction/page.tsx");
    expect(page).toMatch(/TEXTASSIST_PUBLIC_COPY/);
    expect(page).toMatch(/textAssist\.outcomes\.map/);
    expect(page).toMatch(/textAssist\.steps\.map/);
    expect(page).toMatch(/textAssist\.humanBackupTitle/);
    expect(page).toMatch(/textAssist\.trustTitle/);
    expect(page).toContain("Ce qui existe déjà dans le produit local");
    expect(page).toContain("What already exists in the local product");
  });

  it("provides conversion and complete trust navigation", () => {
    const page = read("src/app/construction/page.tsx");
    for (const href of ["/register", "/textassist", "/privacy", "/account-deletion", "/construction/support", "/"]) {
      expect(page).toContain(`href="${href}"`);
    }
  });

  it("keeps availability honest and the existing homepage intact", () => {
    const page = read("src/app/construction/page.tsx");
    const homepage = read("src/app/page.tsx");
    expect(page).toMatch(/TEXTASSIST_RELEASE_BOUNDARY/);
    expect(page).toContain("No live text, call or external connector leaves this version.");
    expect(homepage).toMatch(/<SimplicityActs\b/);
    expect(homepage).toMatch(/<TextAssistBanner\b/);
  });
});
