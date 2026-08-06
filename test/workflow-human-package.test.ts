import { describe, expect, it } from "vitest";
import { buildHumanPackageCopy } from "@/lib/ai-work-engine/human-package-copy";

/**
 * This copy is the ENTIRE briefing a worker receives when the machine hands
 * over. Nobody reviews it before it reaches them, and every claim it makes is
 * one the worker will act on.
 */

const copy = (over: Partial<Parameters<typeof buildHumanPackageCopy>[0]> = {}) =>
  buildHumanPackageCopy({
    unitsRemaining: 12,
    unitsTotal: 12,
    hasCandidate: true,
    draftedRows: 11,
    verifiedRows: 0,
    ...over,
  });

const allText = (c: ReturnType<typeof buildHumanPackageCopy>) =>
  [c.objective, c.whatIsAlreadyDone, c.instructions, ...c.checklist].join(" ").toLowerCase();

describe("no candidate file means no vocabulary about one", () => {
  // Found by adversarial review: a fully-human run attaches nothing, and the
  // checklist still opened with "open the attached candidate file". The
  // worker's first move would be to ask an operator where the file is, which
  // is the exact contact this platform exists to prevent.
  const FILE_WORDS = ["attached", "attachment", "status column", "verified row", "needs_review"];

  it("says nothing about an attachment on a fully-human run", () => {
    const text = allText(copy({ hasCandidate: false, draftedRows: 0 }));
    for (const word of FILE_WORDS) {
      expect(text).not.toContain(word);
    }
  });

  it("says nothing about an attachment when the machine drafted zero rows", () => {
    // The file may technically exist and be empty. An empty file is not a
    // head start, and pointing at it wastes the worker's first ten minutes.
    const text = allText(copy({ hasCandidate: true, draftedRows: 0 }));
    for (const word of FILE_WORDS) {
      expect(text).not.toContain(word);
    }
  });

  it("still tells the worker what the job is", () => {
    const c = copy({ hasCandidate: false, draftedRows: 0 });
    expect(c.objective).toContain("12");
    expect(c.checklist.length).toBeGreaterThan(2);
    expect(allText(c)).toContain("two independent");
  });

  it("does point at the file once there is something in it", () => {
    expect(allText(copy({ hasCandidate: true, draftedRows: 11 }))).toContain("attached");
  });
});

describe("drafted and verified are different numbers", () => {
  // The live incident: a worker was told "0 of 12 records are already filled
  // in" and handed an 8 KB file with eleven populated rows in it.
  it("does not describe eleven drafted rows as nothing done", () => {
    const c = copy({ draftedRows: 11, verifiedRows: 0 });
    expect(c.whatIsAlreadyDone).toContain("11 of 12");
    expect(c.whatIsAlreadyDone.toLowerCase()).not.toContain("nothing was completed");
  });

  it("does not let drafted rows read as finished work", () => {
    const c = copy({ draftedRows: 11, verifiedRows: 0 });
    expect(c.whatIsAlreadyDone.toLowerCase()).toContain("still needs your check");
  });

  it("reports both numbers when some rows really are verified", () => {
    const c = copy({ draftedRows: 11, verifiedRows: 4 });
    expect(c.whatIsAlreadyDone).toContain("4 of 12");
    expect(c.whatIsAlreadyDone).toContain("7 more");
  });

  it("never reports more verified than drafted", () => {
    // Defensive: the two counts come from different passes over the payload.
    const c = copy({ draftedRows: 3, verifiedRows: 99 });
    expect(c.whatIsAlreadyDone).not.toContain("99");
  });

  it("never emits a negative count from bad inputs", () => {
    const c = copy({ draftedRows: -5, verifiedRows: -2 });
    expect(allText(c)).not.toMatch(/-\d/);
  });
});

describe("the package copy names no person and no price", () => {
  it("carries no payout, cost or identity vocabulary", () => {
    for (const c of [copy(), copy({ hasCandidate: false, draftedRows: 0 })]) {
      const text = allText(c);
      for (const banned of ["payout", "$", "cost", "client", "budget", "cents", "margin"]) {
        expect(text).not.toContain(banned);
      }
    }
  });
});
