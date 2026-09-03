import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA TextAssist additive public offer completion", () => {
  it("keeps the accepted homepage while exposing TextAssist in durable navigation", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/<SimplicityActs\b/);
    expect(page).toMatch(/<AssemblyExperience[^>]*continuation/);
    expect(page).toMatch(/data-product-link="textassist"[^>]*href="\/textassist"/);
    expect(page).toMatch(/data-footer-product-link="textassist"[^>]*href="\/textassist"/);
  });

  it("explains the daily loop, pricing state, approval boundary and human backup in both launch languages", () => {
    const page = read("src/app/textassist/page.tsx");
    const copy = read("src/lib/textassist/public-copy.ts");
    expect(page).toMatch(/copy\.stepsTitle/);
    expect(page).toMatch(/copy\.pricingTitle/);
    expect(page).toMatch(/copy\.faqTitle/);
    expect(page).toMatch(/copy\.humanBackupTitle/);
    expect(copy).toContain("Comment ta journée avance");
    expect(copy).toContain("How your day moves");
    expect(copy).toContain("Tarification en préparation");
    expect(copy).toContain("Pricing in preparation");
    expect(copy).toContain("Appui humain quand le jugement compte");
    expect(copy).toContain("Human backup when judgment matters");
  });

  it("does not promote live providers, fixed pricing or publication as completed", () => {
    const page = read("src/app/textassist/page.tsx");
    const copy = read("src/lib/textassist/public-copy.ts");
    expect(page).toMatch(/TEXTASSIST_RELEASE_BOUNDARY/);
    expect(copy).toMatch(/providerObserved:\s*false/);
    expect(copy).toMatch(/published:\s*false/);
    expect(copy).toMatch(/pricingValidated:\s*false/);
    expect(copy).not.toMatch(/Twilio is live|Google Calendar is connected|Available on the App Store|Disponible sur l.App Store/);
  });
});

