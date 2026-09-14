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

  it("confirms only a persisted event in a visible writable synchronized calendar", () => {
    expect(source).toContain("calendar.isSynced === true");
    expect(source).toContain("ExpoCalendarEvent.get(candidateId)");
    expect(source).toContain("calendar.listEvents(start, end)");
    expect(source).toContain("persistedDeviceCalendarEventMatches");
    const persisted = source.indexOf("const persisted = await findPersistedEvent");
    expect(persisted).toBeGreaterThan(0);
    expect(source.indexOf('phase: "NATIVE_APPLIED"', persisted)).toBeGreaterThan(persisted);
  });

  it("serializes every wake and drains all pending directives without dropping a notification", () => {
    expect(source).toContain("MAX_DIRECTIVES_PER_WAKE");
    expect(source).toContain("drainDeviceCalendarBridge");
    expect(source).toContain("runQueue.then");
    expect(runner).not.toContain("reconciling.current");
  });

  it("runs only on foreground, registration, or a generic notification wake", () => {
    expect(runner).toContain('state === "active"');
    expect(runner).toContain("addNotificationReceivedListener");
    expect(runner).toContain("addNotificationResponseReceivedListener");
    expect(runner).not.toContain("setInterval");
  });
});

