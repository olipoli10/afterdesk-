import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA Construction conversion surface", () => {
  it("renders the complete accepted operating loop and concrete outcomes", () => {
    const page = read("src/app/construction/page.tsx");
    const styles = read("src/app/construction/construction.module.css");
    expect(page).not.toMatch(/TEXTASSIST_PUBLIC_COPY/);
    expect(page).toMatch(/copy\.outcomes\.map/);
    expect(page).toMatch(/copy\.steps\.map/);
    expect(page).toMatch(/copy\.humanBackupTitle/);
    expect(page).toMatch(/copy\.trustTitle/);
    expect(page).toContain("Gère tes chantiers.");
    expect(page).toContain("Par texto ou par appel.");
    expect(page).toContain("Run your jobs.");
    expect(page).toContain("By text or phone.");
    expect(page).toContain("productScene");
    expect(styles).toContain(".phone");
    expect(styles).toContain(".calendarCard");
    expect(styles).toContain(".memoryCard");
  });

  it("uses native contractor language instead of internal product jargon", () => {
    const page = read("src/app/construction/page.tsx");
    expect(page).toContain("Nothing goes out without your approval.");
    expect(page).toContain("Rien ne part sans ton accord.");
    expect(page).not.toMatch(/You do the trade|keeps the thread|operational state|reconstructible|Bounded human support|Role-safe cockpit/);
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
    expect(page).toContain("Live texting, calling and connected calendars are not enabled yet.");
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
