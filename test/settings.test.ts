import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsSchema } from "@/lib/settings";

describe("operator settings", () => {
  it("accepts the reviewed defaults", () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects unsafe upload extensions and unbounded values", () => {
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        allowedExtensions: ["csv", "exe"],
      }).success
    ).toBe(false);
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        maxFileSizeMB: 10_000,
      }).success
    ).toBe(false);
  });
});
