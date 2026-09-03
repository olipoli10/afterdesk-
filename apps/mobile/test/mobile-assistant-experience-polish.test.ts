// @ts-nocheck -- source-contract test runs under Node rather than Expo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("mobile assistant experience polish", () => {
  it("uses one closed bilingual copy contract for the five primary tabs", async () => {
    const copySource = read("src/lib/product-experience.ts");
    const layout = read("src/app/(app)/_layout.tsx");
    expect(copySource).toContain('"fr-CA"');
    expect(copySource).toContain('"en-CA"');
    expect(copySource).toContain('today: "Aujourd’hui"');
    expect(copySource).toContain('today: "Today"');
    expect(layout).toMatch(/mobileProductCopy/);
    expect(layout).toMatch(/useMobileSession/);
    expect(layout).not.toMatch(/title:\s*"Aujourd’hui"/);
  });

  it("localizes the grouped More directory without losing any secondary route", () => {
    const more = read("src/app/(app)/more.tsx");
    const requiredRoutes = [
      "onboarding", "jobs", "follow-ups", "timeline", "provenance", "calendar-connections",
      "messages", "calls", "email", "accounting", "contacts", "evidence", "permissions",
      "privacy", "reliability", "outbox", "receivables", "human-support", "settings",
    ];
    expect(more).toMatch(/mobileProductCopy/);
    expect(more).toMatch(/accessibilityHint/);
    for (const route of requiredRoutes) expect(more).toContain(`/${route}`);
  });

  it("makes assistant errors recoverable and critical controls accessible", () => {
    const assistant = read("src/app/(app)/assistant.tsx");
    expect(assistant).toMatch(/MobileRecoveryNotice/);
    expect(assistant).toMatch(/accessibilityLabel=\{copy\.assistantInputLabel\}/);
    expect(assistant).toMatch(/accessibilityRole="button"/);
    expect(assistant).toMatch(/copy\.retry/);
  });

  it("keeps the assistant-first Today action bilingual", () => {
    const today = read("src/app/(app)/index.tsx");
    expect(today).toMatch(/mobileProductCopy/);
    expect(today).toMatch(/copy\.talkToEndvera/);
    expect(today).toMatch(/router\.push\("\/assistant"\)/);
  });

  it("uses native symbol mappings instead of placeholder text glyphs", () => {
    const layout = read("src/app/(app)/_layout.tsx");
    const icons = read("src/components/app-icon.tsx");
    expect(layout).toMatch(/<AppIcon/);
    expect(layout).not.toMatch(/value="[⌁▦◷]"/u);
    expect(icons).toMatch(/SymbolView/);
    expect(icons).toMatch(/android:\s*"calendar_month"/);
  });
});
