import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA Construction conversion surface", () => {
  it("renders the target operating loop without claiming live text or phone operation", () => {
    const page = read("src/app/construction/page.tsx");
    const styles = read("src/app/construction/construction.module.css");
    expect(page).not.toMatch(/TEXTASSIST_PUBLIC_COPY/);
    expect(page).toMatch(/copy\.outcomes\.map/);
    expect(page).toMatch(/copy\.steps\.map/);
    expect(page).toMatch(/copy\.humanBackupTitle/);
    expect(page).toMatch(/copy\.trustTitle/);
    expect(page).toContain('headlineA: "Notre cible : gérer tes chantiers."');
    expect(page).toContain('headlineB: "À terme, par texto ou appel."');
    expect(page).toContain('headlineA: "Our goal: manage your jobs."');
    expect(page).toContain('headlineB: "Eventually, by text or phone."');
    expect(page).toContain("<span>{copy.headlineA}</span>");
    expect(page).toContain("<strong>{copy.headlineB}</strong>");
    expect(page).not.toMatch(/Gère tes chantiers\.|Par texto ou par appel\.|Run your jobs\.|By text or phone\./);
    expect(page).toContain("productScene");
    expect(styles).toContain(".phone");
    expect(styles).toContain(".calendarCard");
    expect(styles).toContain(".memoryCard");
  });

  it("uses contractor language while distinguishing no sending now from future approval", () => {
    const page = read("src/app/construction/page.tsx");
    expect(page).toContain('trustTitle: "Nothing is sent here. Future actions would require approval."');
    expect(page).toContain('trustTitle: "Ici, rien ne part. À terme, ton accord serait requis."');
    expect(page).toContain("<h2>{copy.trustTitle}</h2>");
    expect(page).toContain("<p>{copy.trustBody}</p>");
    expect(page).not.toMatch(/Nothing goes out without your approval\.|Rien ne part sans ton accord\./);
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
