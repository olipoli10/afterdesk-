import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const feature = path.join(root, "specs", "196-r38-founder-full-loop-preparation");

describe("R38 founder full-loop preparation", () => {
  it("exposes one local direct-access surface with no provider dependency", async () => {
    const page = await readFile(path.join(root, "src/app/client/founder-full-loop/page.tsx"), "utf8");
    const access = await readFile(path.join(root, "src/app/client/founder-full-loop/access/route.ts"), "utf8");
    const launcher = await readFile(path.join(feature, "scripts/start-founder-test.ps1"), "utf8");
    expect(page).toContain("ENDVERA_R38_FOUNDER_TEST_MODE");
    expect(access).toContain("assertLoopbackHost");
    expect(launcher).toContain("/client/founder-full-loop/access?token=");
    expect(launcher).not.toMatch(/OPENROUTER|TWILIO|GOOGLE_CLIENT|QUICKBOOKS/i);
  });

  it("keeps preflight distinct from a real human observation", async () => {
    const validator = await readFile(path.join(feature, "scripts/validate-preflight.ps1"), "utf8");
    expect(validator).toContain("FOUNDER_OBSERVATION_MUST_NOT_EXIST_DURING_PREFLIGHT");
    expect(validator).toContain("R38_FOUNDER_FULL_LOOP_PREFLIGHT_READY");
    await expect(stat(path.join(feature, "evidence/founder-observation.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("binds the exact synthetic scenario and fail-closed authority", async () => {
    const harness = await readFile(path.join(root, "src/server/construction-operating-assistant-r38/founder-test.ts"), "utf8");
    expect(harness).toContain('"LAVAL-001"');
    expect(harness).toContain('amountMinor: 120000');
    expect(harness).toContain('status: "PREPARED_UNSENT"');
    expect(harness).toContain("transportAuthorized: false");
    expect(harness).toContain("fieldWorkerFinancialLeakCount");
    expect(harness).toContain("FOUNDER_OWNED_FULL_LOOP_OBSERVED_PASS");
  });
});
