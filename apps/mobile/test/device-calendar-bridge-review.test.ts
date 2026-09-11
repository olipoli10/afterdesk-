import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/device-calendar-bridge.ts", "utf8");
const runner = readFileSync("src/components/device-calendar-bridge-runner.tsx", "utf8");

describe("Android calendar bridge safety structure", () => {
  it("journals the claim before the native write and disables automatic write retries", () => {
    expect(source.indexOf('phase: "CLAIMED"')).toBeGreaterThan(0);
    expect(source.indexOf("await writeSecure(JOURNAL_KEY, journal)")).toBeLessThan(source.indexOf("await calendar.createEvent"));
    expect(source).toContain('phase: "UNCERTAIN"');
    expect(source).not.toContain("setInterval");
  });

  it("runs only on foreground, registration, or a generic notification wake", () => {
    expect(runner).toContain('state === "active"');
    expect(runner).toContain("addNotificationReceivedListener");
    expect(runner).toContain("addNotificationResponseReceivedListener");
    expect(runner).not.toContain("setInterval");
  });
});

