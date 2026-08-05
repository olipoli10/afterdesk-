import { describe, expect, it } from "vitest";
import {
  PUBLISHED_COURSES,
  isPublished,
  publicCourseFull,
  publicCourses,
} from "@/lib/academy/public";

/**
 * The publication line, pinned.
 *
 * Two things have to stay true and neither is enforced by the compiler. First,
 * the nine withheld courses are effectively the specification the QC queue
 * grades deliveries against — publishing one hands a would-be worker the
 * answers to the standard instead of teaching them to meet it. Second, a
 * course added tomorrow must be WITHHELD until someone names it: an allowlist
 * that silently became a denylist would publish the grading spec by accident.
 *
 * The exam is a third guarantee and the strongest one, because it is
 * structural: publicCourseFull never reads `exam`, so no answer key can reach
 * a public page regardless of what any page renders.
 */

const WITHHELD = [
  "va-foundations",
  "business-english",
  "professional-habits",
  "data-cleanup",
  "data-entry",
  "list-building",
  "document-production",
  "analysis",
  "admin-coordination",
];

describe("the publication line", () => {
  it("publishes exactly the courses named on the allowlist", () => {
    expect(PUBLISHED_COURSES).toHaveLength(25);
    expect(new Set(PUBLISHED_COURSES).size).toBe(PUBLISHED_COURSES.length);
  });

  it("withholds every course that restates the grading standard", () => {
    for (const slug of WITHHELD) {
      expect(isPublished(slug), `${slug} must stay withheld`).toBe(false);
      expect(publicCourseFull(slug), `${slug} must have no public page`).toBeNull();
    }
  });

  it("accounts for every course in the curriculum — none is unclassified", () => {
    const all = publicCourses().map((c) => c.slug);
    const classified = new Set([...PUBLISHED_COURSES, ...WITHHELD]);
    for (const slug of all) {
      expect(classified.has(slug), `${slug} is in neither list — decide, do not drift`).toBe(true);
    }
    expect(all.length).toBe(PUBLISHED_COURSES.length + WITHHELD.length);
  });

  it("withholds an unknown course by default — the list is an allowlist", () => {
    expect(isPublished("a-course-invented-tomorrow")).toBe(false);
    expect(publicCourseFull("a-course-invented-tomorrow")).toBeNull();
  });

  it("gives every published course real teaching text, not just titles", () => {
    for (const slug of PUBLISHED_COURSES) {
      const c = publicCourseFull(slug);
      expect(c, `${slug} is on the allowlist but has no course`).not.toBeNull();
      expect(c!.lessons.length).toBeGreaterThanOrEqual(5);
      const words = c!.lessons
        .flatMap((l) => l.sections.map((s) => s.body))
        .join(" ")
        .split(/\s+/).length;
      expect(words, `${slug} would be a thin page`).toBeGreaterThan(1200);
    }
  });

  it("carries no exam field at all — the key cannot leak through this door", () => {
    for (const slug of PUBLISHED_COURSES) {
      const serialized = JSON.stringify(publicCourseFull(slug));
      expect(serialized).not.toContain('"exam"');
      expect(serialized).not.toContain('"correct"');
      expect(serialized).not.toContain('"explain"');
      expect(serialized).not.toContain('"questions"');
    }
  });
});
