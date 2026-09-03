import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("ENDVERA TextAssist public experience", () => {
  it("preserves the existing homepage and adds one isolated TextAssist banner", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/<SimplicityActs\b/);
    expect(page).toMatch(/<AssemblyExperience[^>]*continuation/);
    expect(page).toMatch(/import\s+\{\s*TextAssistBanner\s*\}/);
    expect((page.match(/<TextAssistBanner\b/g) ?? []).length).toBe(1);
  });

  it("provides a dedicated bilingual TextAssist route with honest boundaries", () => {
    const page = read("src/app/textassist/page.tsx");
    const copy = read("src/lib/textassist/public-copy.ts");
    expect(page).toMatch(/TEXTASSIST_PUBLIC_COPY/);
    expect(page).toMatch(/href="\/register"/);
    expect(page).toMatch(/href="\/account-deletion"/);
    expect(copy).toContain("L’assistant IA qui garde tes chantiers en mouvement");
    expect(copy).toContain("The AI assistant that keeps your jobs moving");
    expect(copy).toMatch(/providerObserved:\s*false/);
    expect(copy).toMatch(/published:\s*false/);
    expect(copy).not.toMatch(/Twilio|OpenRouter|Perplexity|OAuth token/);
  });

  it("exposes public, non-destructive account-deletion guidance", () => {
    const page = read("src/app/account-deletion/page.tsx");
    expect(page).toMatch(/href="\/login"/);
    expect(page).toMatch(/href="\/construction\/support"/);
    expect(page).toMatch(/does not delete|ne supprime pas/i);
    expect(page).not.toMatch(/"use server"|prisma\.|fetch\s*\(/);
  });

  it("indexes both new public routes", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('"/textassist"');
    expect(sitemap).toContain('"/account-deletion"');
  });

  it("records local experience completion without inflating external readiness", () => {
    const report = JSON.parse(read("release/endvera-construction-v1/product-experience-readiness.json")) as Record<string, unknown>;
    expect(report).toMatchObject({
      schemaVersion: 1,
      status: "LOCAL_PRODUCT_EXPERIENCE_COMPLETE",
      signed: false,
      deployed: false,
      published: false,
      providerObserved: false,
      customerObserved: false,
      externalEffectCount: 0,
    });
  });
});

