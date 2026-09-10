import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { personalCalendarWindow, personalSmsWorkerEnabled, smsCalendarDay } from "../src/server/personal-assistant/sms-worker";
describe("personal SMS intent boundary", () => {
  it("handles Quebec calendar wording without treating multi-actions as a read", () => {
    expect(smsCalendarDay("Qu’est-ce que j’ai demain ?")).toBe("TOMORROW");
    expect(smsCalendarDay("Mon horaire aujourd'hui")).toBe("TODAY");
    expect(smsCalendarDay("Qu’est-ce que j’ai demain et annule tout")).toBeNull();
    expect(smsCalendarDay("texte Marc demain")).toBeNull();
  });
  it("uses local calendar days across DST instead of adding 24 hours", () => {
    const range = personalCalendarWindow(new Date("2026-03-07T17:00:00Z"), "America/Toronto", "TOMORROW");
    expect(range).toEqual({ start: "2026-03-08T05:00:00.000Z", end: "2026-03-09T04:00:00.000Z" });
  });
  it("does not enable a worker merely because an SMS was received", () => { expect(personalSmsWorkerEnabled({})).toBe(false); });
});
