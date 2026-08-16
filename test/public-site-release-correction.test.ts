/* Phase 1.4B.1 guards - written RED against ec12659, then made GREEN.
   Covers: stale admin positioning (metadata + JSON-LD), the unsupported
   "a person signs" claim, the hardcoded accessible name, the leaky A2
   timers, and the preview pipeline that could reach prisma migrate. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("C1 - metadata carries the assembly positioning, not admin-only", () => {
  it("no language's HOME_META says 'admin work' anymore", () => {
    const s = read("src/app/page.tsx");
    expect(s).not.toMatch(/admin work|administratif fini|administrativo terminado|admin na trabaho/i);
    expect(s).toMatch(/One request in\. One verified result out\./);
  });
});

describe("C2 - the Organization JSON-LD tells the broad truthful category", () => {
  it("no 'administrative work' in the JSON-LD description", () => {
    const s = read("src/app/page.tsx");
    const jsonld = s.slice(s.indexOf("ORG_JSONLD"), s.indexOf("export default"));
    expect(jsonld).not.toMatch(/administrative/i);
    expect(jsonld).toMatch(/checked result|verified result/i);
  });
});

describe("C3 - no language claims a person SIGNS the delivery", () => {
  it("the verify line uses the /inside-supported review wording in all four languages", () => {
    const s = read("src/lib/i18n/home-assembly.ts");
    expect(s).not.toMatch(/signs the delivery|signe la livraison|firma la entrega|pumipirma/i);
    /* durable ban on signature variants inside the verify line context */
    for (const banned of ["signs", "signature", " signe ", "firma la", "pumipirma"])
      expect(s.toLowerCase().includes(banned.toLowerCase()), banned).toBe(false);
    expect(s).toMatch(/reviews the delivery against that standard/);
  });
});

describe("C4 - the launcher's accessible name is localized", () => {
  it("aria-label uses copy.ask, and ask is really translated", () => {
    const c = read("src/app/_home/a2-concierge.tsx");
    expect(c).toMatch(/aria-label=\{copy\.ask\}/);
    expect(c).not.toMatch(/aria-label="Ask AfterDesk"/);
    const d = read("src/lib/i18n/home-assembly.ts");
    for (const ask of ['ask: "Ask AfterDesk"', 'ask: "Demandez à AfterDesk"', 'ask: "Pregunta a AfterDesk"', 'ask: "Magtanong sa AfterDesk"'])
      expect(d, ask).toContain(ask);
  });
});

describe("C5/C6 - A2 timers live in refs with real cleanup", () => {
  it("travel, arrival and hail timers are ref-held; no cleanup is returned from an event handler", () => {
    const c = read("src/app/_home/a2-concierge.tsx");
    expect(c).toMatch(/travelTimer/);
    expect(c).toMatch(/hailTimer/);
    expect(c).toMatch(/arrivalTimer/);
    /* the old bug: a cleanup function returned from openPanel (ignored) */
    const openPanel = c.slice(c.indexOf("const openPanel"), c.indexOf("const closePanel"));
    expect(openPanel).not.toMatch(/return \(\) => clearTimeout/);
    /* closing must cancel the travel timer */
    const closePanel = c.slice(c.indexOf("const closePanel"), c.indexOf("/* focus containment"));
    expect(closePanel).toMatch(/travelTimer/);
    /* unmount cleanup clears every timer */
    expect(c).toMatch(/clearAllTimers|clearTimeout\(travelTimer\.current/);
  });
});

describe("C7/C8 - the preview pipeline can NEVER migrate", () => {
  it("package.json build routes through the versioned pipeline script", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.build).toBe("node scripts/vercel-build.mjs");
  });
  it("preview plans next build only - no migrate, no DIRECT_URL requirement", async () => {
    const { computePlan } = await import("../scripts/vercel-build.mjs");
    const plan = computePlan({ VERCEL_ENV: "preview" });
    expect(plan.commands.join(" ")).not.toMatch(/migrate/);
    expect(plan.requires).not.toContain("DIRECT_URL");
  });
  it("production requires DIRECT_URL and migrates before building", async () => {
    const { computePlan } = await import("../scripts/vercel-build.mjs");
    const plan = computePlan({ VERCEL_ENV: "production", DIRECT_URL: "set" });
    expect(plan.commands[0]).toMatch(/prisma migrate deploy/);
    expect(plan.commands[plan.commands.length - 1]).toMatch(/next build/);
    expect(() => computePlan({ VERCEL_ENV: "production" })).toThrow(/DIRECT_URL/);
  });
  it("an unknown environment fails closed", async () => {
    const { computePlan } = await import("../scripts/vercel-build.mjs");
    expect(() => computePlan({})).toThrow(/fail.*closed|unknown/i);
    expect(() => computePlan({ VERCEL_ENV: "staging" })).toThrow(/fail.*closed|unknown/i);
  });
});

describe("C9 - preview deployments are read-only until DB isolation is proven", () => {
  it("the proxy refuses non-idempotent methods when VERCEL_ENV=preview and covers /api", () => {
    const s = read("src/proxy.ts");
    expect(s).toMatch(/VERCEL_ENV === "preview"/);
    expect(s).toMatch(/status: 403/);
    expect(s).toMatch(/"\/api\/:path\*"/);
  });
});
