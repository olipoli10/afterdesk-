import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA Construction conversion surface", () => {
  it("renders the complete accepted operating loop and concrete outcomes", () => {
    const page = read("src/app/construction/page.tsx");
    const styles = read("src/app/construction/construction.module.css");
    expect(page).toMatch(/TEXTASSIST_PUBLIC_COPY/);
    expect(page).toMatch(/textAssist\.outcomes\.map/);
    expect(page).toMatch(/textAssist\.steps\.map/);
    expect(page).toMatch(/textAssist\.humanBackupTitle/);
    expect(page).toMatch(/textAssist\.trustTitle/);
    expect(page).toContain("Une mémoire opérationnelle qui travaille avec toi");
    expect(page).toContain("Operational memory that works alongside you");
    expect(page).toContain("ENDVERA tient le fil");
    expect(page).toContain("productScene");
    expect(styles).toContain(".phone");
    expect(styles).toContain(".calendarCard");
    expect(styles).toContain(".memoryCard");
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
    expect(page).toContain("No live text, call or external connector leaves this version yet.");
    expect(page).not.toMatch(/providerObserved=\{String|pricingValidated=\{String|published=\{String/);
    expect(homepage).toMatch(/<SimplicityActs\b/);
    expect(homepage).toMatch(/<TextAssistBanner\b/);
  });

  it("offers only languages with real construction copy and keeps interaction accessible", () => {
    const page = read("src/app/construction/page.tsx");
    const styles = read("src/app/construction/construction.module.css");
    expect(page).toContain('{ code: "en", label: "EN" }');
    expect(page).toContain('{ code: "fr", label: "FR" }');
    expect(page).not.toContain('{ code: "es", label: "ES" }');
    expect(page).not.toContain('{ code: "tl", label: "FIL" }');
    expect(page).toContain("skipLink");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("@media (max-width: 640px)");
  });
});
