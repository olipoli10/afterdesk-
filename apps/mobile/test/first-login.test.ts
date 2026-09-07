import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldRouteToOnboarding } from "../src/lib/first-login";

const emptyBootstrap = { workspaces: [] };
const initializedBootstrap = { workspaces: [{ id: "workspace-1" }] };

describe("mobile first login routing", () => {
  it("routes a completed authenticated bootstrap with no workspace to onboarding", () => {
    expect(
      shouldRouteToOnboarding({
        bootstrap: emptyBootstrap,
        activeWorkspaceId: null,
        loadState: "READY",
      }),
    ).toBe(true);
  });

  it("waits for a successful bootstrap before routing", () => {
    expect(
      shouldRouteToOnboarding({
        bootstrap: null,
        activeWorkspaceId: null,
        loadState: "IDLE",
      }),
    ).toBe(false);
    expect(
      shouldRouteToOnboarding({
        bootstrap: emptyBootstrap,
        activeWorkspaceId: null,
        loadState: "LOADING",
      }),
    ).toBe(false);
    expect(
      shouldRouteToOnboarding({
        bootstrap: emptyBootstrap,
        activeWorkspaceId: null,
        loadState: "UNAVAILABLE",
      }),
    ).toBe(false);
  });

  it("does not replace the normal workspace flow", () => {
    expect(
      shouldRouteToOnboarding({
        bootstrap: initializedBootstrap,
        activeWorkspaceId: null,
        loadState: "READY",
      }),
    ).toBe(false);
    expect(
      shouldRouteToOnboarding({
        bootstrap: emptyBootstrap,
        activeWorkspaceId: "workspace-1",
        loadState: "READY",
      }),
    ).toBe(false);
  });

  it("wires the empty-workspace decision to the hidden onboarding route", () => {
    const todayScreen = readFileSync(join(process.cwd(), "src/app/(app)/index.tsx"), "utf8");
    const appLayout = readFileSync(join(process.cwd(), "src/app/(app)/_layout.tsx"), "utf8");

    expect(todayScreen).toContain("shouldRouteToOnboarding({");
    expect(todayScreen).toContain('router.replace("/onboarding")');
    expect(appLayout).toContain('<Tabs.Screen name="onboarding" options={{ href: null }} />');
  });
});
