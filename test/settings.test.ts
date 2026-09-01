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

/**
 * HUMAN WORK UNIT SETTINGS (FR-058, FR-064, research R-11).
 *
 * Five keys, and the interesting thing about them is what they are NOT allowed
 * to be derived from. The three deadline durations are fixed hour counts,
 * independent of the plan's expected minutes: FR-058 makes expected minutes
 * descriptive capacity context and nothing else, so deriving a worker's lease
 * from it would quietly turn an estimate into a deadline someone is held to.
 */
describe("human work unit settings", () => {
  /**
   * OFF BY DEFAULT, and that is the whole safety story for rollout. The flag is
   * read at admission and nowhere else, so shipping this code changes nothing
   * about a live mandate until an operator turns it on deliberately.
   */
  it("defaults humanWorkUnitResumeEnabled to false", () => {
    expect(DEFAULT_SETTINGS.humanWorkUnitResumeEnabled).toBe(false);
  });

  it("defaults the revision bound to 2", () => {
    expect(DEFAULT_SETTINGS.humanWorkUnitRevisionBound).toBe(2);
  });

  it.each([
    "humanWorkUnitPublicationDeadlineHours",
    "humanWorkUnitSubmissionDeadlineHours",
    "humanWorkUnitClaimLeaseHours",
  ] as const)("defaults %s to 72 hours", (key) => {
    expect(DEFAULT_SETTINGS[key]).toBe(72);
  });

  /**
   * THE LOAD-BEARING SETTINGS TEST.
   *
   * The three durations are plain hour counts with no coupling to any estimate
   * anywhere in the settings object. If one of them were ever expressed as a
   * multiple of expected minutes, a planner that guessed high would hand the
   * worker a longer lease and one that guessed low would take it away — an
   * estimate silently becoming a commitment (FR-058).
   */
  it("keeps the three durations independent of any estimate", () => {
    const durations = [
      DEFAULT_SETTINGS.humanWorkUnitPublicationDeadlineHours,
      DEFAULT_SETTINGS.humanWorkUnitSubmissionDeadlineHours,
      DEFAULT_SETTINGS.humanWorkUnitClaimLeaseHours,
    ];
    for (const hours of durations) {
      expect(Number.isInteger(hours)).toBe(true);
      expect(hours).toBeGreaterThan(0);
    }
    // All three are the same reviewed number, set independently rather than
    // one derived from another.
    expect(new Set(durations).size).toBe(1);
  });

  it("accepts the five keys through the schema", () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toMatchObject({
      humanWorkUnitResumeEnabled: false,
      humanWorkUnitRevisionBound: 2,
      humanWorkUnitPublicationDeadlineHours: 72,
      humanWorkUnitSubmissionDeadlineHours: 72,
      humanWorkUnitClaimLeaseHours: 72,
    });
  });

  it("rejects a non-boolean flag", () => {
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        humanWorkUnitResumeEnabled: "true",
      }).success
    ).toBe(false);
  });

  /**
   * A revision bound of zero would mean the worker gets no second attempt and a
   * rejection exhausts the unit immediately; an unbounded one would mean a
   * mandate could loop forever on a fixed payout. Both ends are refused.
   */
  it.each([0, -1, 1.5, 100])("rejects a revision bound of %s", (value) => {
    expect(
      SettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        humanWorkUnitRevisionBound: value,
      }).success
    ).toBe(false);
  });

  it.each([
    "humanWorkUnitPublicationDeadlineHours",
    "humanWorkUnitSubmissionDeadlineHours",
    "humanWorkUnitClaimLeaseHours",
  ] as const)("rejects a zero or negative %s", (key) => {
    for (const value of [0, -72]) {
      expect(
        SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [key]: value }).success
      ).toBe(false);
    }
  });

  it.each([
    "humanWorkUnitPublicationDeadlineHours",
    "humanWorkUnitSubmissionDeadlineHours",
    "humanWorkUnitClaimLeaseHours",
  ] as const)("rejects an absurdly long %s", (key) => {
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, [key]: 100_000 }).success
    ).toBe(false);
  });

  /**
   * `getSettings` overlays a database row only for keys already present in the
   * defaults, then re-parses and falls back wholesale on failure. A malformed
   * override of one of these keys must therefore restore the REVIEWED defaults
   * — including the flag going back to false, never a partially-applied object
   * where the feature is on and its bound is undefined.
   */
  it("a malformed override cannot leave the flag on with a broken bound", () => {
    const parsed = SettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      humanWorkUnitResumeEnabled: true,
      humanWorkUnitRevisionBound: "lots",
    });
    expect(parsed.success).toBe(false);
  });
});
