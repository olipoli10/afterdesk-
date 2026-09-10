import { describe, expect, it } from "vitest";
import { validatePersonalGoogleLaunch, personalGoogleEventsSchema } from "../src/lib/personal-google";
describe("personal Google mobile contracts", () => {
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  it("accepts only the exact backend launch origin and route", () => {
    expect(validatePersonalGoogleLaunch({ launchUrl: "https://endvera.example/api/endvera/v1/personal/google/launch?attempt=1&token=2", expiresAt }, "https://endvera.example").expiresAt).toBe(expiresAt);
    for (const launchUrl of ["https://evil.example/api/endvera/v1/personal/google/launch", "http://endvera.example/api/endvera/v1/personal/google/launch", "https://endvera.example/unrelated", "https://user:pass@endvera.example/api/endvera/v1/personal/google/launch"]) expect(() => validatePersonalGoogleLaunch({ launchUrl, expiresAt }, "https://endvera.example")).toThrow();
  });
  it("rejects expired consent and incomplete calendars", () => {
    expect(() => validatePersonalGoogleLaunch({ launchUrl: "https://endvera.example/api/endvera/v1/personal/google/launch", expiresAt: "2020-01-01T00:00:00Z" }, "https://endvera.example")).toThrow();
    expect(personalGoogleEventsSchema.safeParse({ events: [], complete: false, source: "GOOGLE_CALENDAR", timeZone: null }).success).toBe(false);
  });
});
