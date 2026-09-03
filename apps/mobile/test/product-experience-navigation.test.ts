// @ts-nocheck -- Vitest runs this source-contract test in Node; the Expo app intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("assistant-first mobile navigation", () => {
  it("shows exactly five primary destinations", () => {
    const layout = read("src/app/(app)/_layout.tsx");
    const visible = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"\s+options=\{\{(?![^}]*href:\s*null)/g)].map((match) => match[1]);
    expect(visible).toEqual(["index", "assistant", "projects", "calendar", "more"]);
  });

  it("keeps every secondary screen hidden from tabs and reachable from More", () => {
    const layout = read("src/app/(app)/_layout.tsx");
    const more = read("src/app/(app)/more.tsx");
    const secondary = [
      "onboarding", "jobs", "follow-ups", "timeline", "provenance", "calendar-connections",
      "messages", "calls", "email", "accounting", "contacts", "evidence", "permissions",
      "privacy", "reliability", "outbox", "receivables", "human-support", "actions", "settings",
    ];
    for (const route of secondary) {
      expect(layout, route).toMatch(new RegExp(`name="${route}"[^>]*href:\\s*null`, "s"));
      expect(more, route).toContain(`/${route}`);
    }
  });

  it("keeps Today connected to the assistant as a primary action", () => {
    const today = read("src/app/(app)/index.tsx");
    expect(today).toMatch(/router\.push\("\/assistant"\)/);
    expect(today).toMatch(/Parler à ENDVERA/);
  });
});
