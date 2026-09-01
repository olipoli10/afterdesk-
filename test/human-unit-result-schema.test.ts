import { describe, expect, it } from "vitest";
import {
  compileFrozenOutputSchema,
  validateCandidate,
} from "@/lib/ai-work-engine/human-unit-result-schema";
import type { FrozenHumanUnitDefinition } from "@/lib/ai-work-engine/human-unit-definition";

/**
 * CONFORMANCE IS A PRECONDITION FOR SUBMISSION AND NEVER EVIDENCE OF QUALITY.
 *
 * This module answers one narrow question: does the candidate carry the fields
 * and artifacts the accepted step said it would carry? That is a shape check.
 * It says nothing about whether the work is right, and no caller may read
 * `ok: true` as an acceptance signal (FR-017, readiness CHK040) — acceptance is
 * a decision a named admin makes and signs, and it is the only thing that
 * authorises the machine to resume.
 *
 * The refusal rule is `parsePrimitiveParams`': `null` means "I could not
 * compile this", never "compiled to something that accepts anything". An empty
 * permissive schema is the dangerous failure here, because it would let a
 * candidate through on a mandate whose frozen schema was unreadable — turning a
 * corrupt contract into a silent pass.
 */

const definition = (
  over: Partial<FrozenHumanUnitDefinition> = {}
): FrozenHumanUnitDefinition =>
  ({
    instructions: "Confirm the decision-maker for each row.",
    declaredInputs: [],
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rowsChecked: { type: "number" },
      },
      required: ["summary", "rowsChecked"],
    },
    requiredArtifactKinds: [],
    acceptanceCriteria: [],
    verificationMethod: "sample_check",
    eligibility: {},
    reviewerAuthority: "admin",
    expectedMinutes: 30,
    revisionBound: 2,
    publicationDeadlineHours: 72,
    submissionDeadlineHours: 72,
    claimLeaseHours: 72,
    economicProvenance: {},
    dataClass: "business_confidential",
    ...over,
  }) as FrozenHumanUnitDefinition;

describe("compileFrozenOutputSchema — a refusal is null, never a permissive schema", () => {
  it("compiles a well-formed frozen object schema", () => {
    const schema = compileFrozenOutputSchema({
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    });
    expect(schema).not.toBeNull();
    expect(schema!.safeParse({ summary: "done" }).success).toBe(true);
    expect(schema!.safeParse({ summary: 7 }).success).toBe(false);
    expect(schema!.safeParse({}).success).toBe(false);
  });

  it("compiles the supported scalar types", () => {
    const schema = compileFrozenOutputSchema({
      type: "object",
      properties: {
        s: { type: "string" },
        n: { type: "number" },
        i: { type: "integer" },
        b: { type: "boolean" },
      },
      required: ["s", "n", "i", "b"],
    });
    expect(schema).not.toBeNull();
    expect(schema!.safeParse({ s: "x", n: 1.5, i: 2, b: true }).success).toBe(true);
    expect(schema!.safeParse({ s: "x", n: 1.5, i: 2.5, b: true }).success).toBe(false);
  });

  it("compiles arrays of a supported item type", () => {
    const schema = compileFrozenOutputSchema({
      type: "object",
      properties: { notes: { type: "array", items: { type: "string" } } },
      required: ["notes"],
    });
    expect(schema).not.toBeNull();
    expect(schema!.safeParse({ notes: ["a", "b"] }).success).toBe(true);
    expect(schema!.safeParse({ notes: [1] }).success).toBe(false);
  });

  it("treats absent optional properties as optional, present-but-wrong as invalid", () => {
    const schema = compileFrozenOutputSchema({
      type: "object",
      properties: { summary: { type: "string" }, note: { type: "string" } },
      required: ["summary"],
    });
    expect(schema!.safeParse({ summary: "ok" }).success).toBe(true);
    expect(schema!.safeParse({ summary: "ok", note: 3 }).success).toBe(false);
  });

  /**
   * THE LOAD-BEARING COMPILER TEST.
   *
   * Every one of these is a frozen schema the module cannot honestly compile.
   * The only safe answer is `null`. The unsafe answer — the one this test
   * exists to make impossible — is a schema that parses successfully because
   * it constrains nothing.
   */
  const uncompilable: unknown[] = [
    null,
    undefined,
    "object",
    42,
    true,
    [],
    {},
    { type: "string" },
    { type: "array", items: { type: "string" } },
    { type: "object" },
    { type: "object", properties: null },
    { type: "object", properties: [] },
    { type: "object", properties: {} },
    { type: "unicorn", properties: { a: { type: "string" } } },
    { type: "object", properties: { a: { type: "unicorn" } } },
    { type: "object", properties: { a: null } },
    { type: "object", properties: { a: "string" } },
    { type: "object", properties: { a: { type: "array" } } },
    { type: "object", properties: { a: { type: "array", items: { type: "unicorn" } } } },
    { type: "object", properties: { a: { type: "string" } }, required: "a" },
    { type: "object", properties: { a: { type: "string" } }, required: [1] },
    { type: "object", properties: { a: { type: "string" } }, required: ["b"] },
  ];

  it.each(uncompilable.map((s, i) => [i, s] as const))(
    "refuses uncompilable frozen schema #%i with null",
    (_i, frozen) => {
      expect(compileFrozenOutputSchema(frozen)).toBeNull();
    }
  );

  it("never returns a schema that accepts an arbitrary value", () => {
    // Whatever compiles, it must reject at least the values that cannot be a
    // candidate object at all. A schema that accepts these is permissive.
    for (const frozen of [
      { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      { type: "object", properties: { a: { type: "string" } }, required: [] },
    ]) {
      const schema = compileFrozenOutputSchema(frozen);
      expect(schema).not.toBeNull();
      for (const junk of [null, undefined, 42, "text", true, []]) {
        expect(schema!.safeParse(junk).success, JSON.stringify(junk)).toBe(false);
      }
    }
  });

  it("never throws on a hostile frozen schema", () => {
    const deep: Record<string, unknown> = { type: "object", properties: {} };
    let cursor = deep;
    for (let i = 0; i < 200; i += 1) {
      const next: Record<string, unknown> = { type: "object", properties: {} };
      (cursor.properties as Record<string, unknown>).nested = next;
      cursor = next;
    }
    expect(() => compileFrozenOutputSchema(deep)).not.toThrow();
    expect(() => compileFrozenOutputSchema({ type: "object", properties: { __proto__: { type: "string" } } })).not.toThrow();
  });

  it("is deterministic across repeated compilation", () => {
    const frozen = {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    };
    for (let i = 0; i < 10; i += 1) {
      const schema = compileFrozenOutputSchema(frozen);
      expect(schema).not.toBeNull();
      expect(schema!.safeParse({ summary: "s" }).success).toBe(true);
    }
  });
});

describe("validateCandidate — `missing` names what is absent", () => {
  it("accepts a conforming candidate carrying every declared artifact", () => {
    const result = validateCandidate(
      definition({ requiredArtifactKinds: ["source_file"] }),
      { summary: "done", rowsChecked: 40 },
      ["source_file"]
    );
    expect(result.ok).toBe(true);
  });

  it("names each absent required field", () => {
    const result = validateCandidate(definition(), {}, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("summary");
    expect(result.missing).toContain("rowsChecked");
  });

  it("names only what is actually absent", () => {
    const result = validateCandidate(definition(), { summary: "done" }, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("rowsChecked");
    expect(result.missing).not.toContain("summary");
  });

  it("names each absent required artifact kind", () => {
    const result = validateCandidate(
      definition({ requiredArtifactKinds: ["source_file", "exceptions_file"] }),
      { summary: "done", rowsChecked: 40 },
      ["source_file"]
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("exceptions_file");
    expect(result.missing).not.toContain("source_file");
  });

  it("names a missing field and a missing artifact together", () => {
    const result = validateCandidate(
      definition({ requiredArtifactKinds: ["source_file"] }),
      { summary: "done" },
      []
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(
      expect.arrayContaining(["rowsChecked", "source_file"])
    );
  });

  it("does not report a duplicate artifact kind as satisfying two requirements", () => {
    const result = validateCandidate(
      definition({ requiredArtifactKinds: ["source_file", "exceptions_file"] }),
      { summary: "done", rowsChecked: 1 },
      ["source_file", "source_file"]
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(["exceptions_file"]);
  });

  it("ignores an artifact the definition never asked for", () => {
    const result = validateCandidate(
      definition({ requiredArtifactKinds: [] }),
      { summary: "done", rowsChecked: 1 },
      ["something_extra"]
    );
    expect(result.ok).toBe(true);
  });

  /**
   * A frozen schema that will not compile must fail the submission, not wave it
   * through. This is the same fail-closed rule stated for the compiler above,
   * observed from the caller's side.
   */
  it("refuses when the frozen schema will not compile", () => {
    const result = validateCandidate(
      definition({ outputSchema: { type: "unicorn" } }),
      { anything: true },
      []
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("never throws on a hostile payload", () => {
    for (const payload of [null, undefined, 42, "text", true, [], () => {}]) {
      expect(() => validateCandidate(definition(), payload, [])).not.toThrow();
      expect(validateCandidate(definition(), payload, []).ok).toBe(false);
    }
  });

  it("never throws on a hostile artifact list", () => {
    for (const kinds of [null, undefined, "source_file", 42, [null], [42]]) {
      expect(() =>
        validateCandidate(definition(), { summary: "s", rowsChecked: 1 }, kinds as unknown as string[])
      ).not.toThrow();
    }
  });

  it("is deterministic", () => {
    const def = definition({ requiredArtifactKinds: ["a", "b"] });
    const first = validateCandidate(def, { summary: "s" }, ["a"]);
    for (let i = 0; i < 5; i += 1) {
      expect(validateCandidate(def, { summary: "s" }, ["a"])).toEqual(first);
    }
  });
});

describe("a passing validation is not an acceptance signal (FR-017, CHK040)", () => {
  /**
   * THE LOAD-BEARING SEPARATION TEST.
   *
   * The result shape must give no caller anything to mistake for approval. If
   * this object ever grew an `approved`, `passed` or `score` field, a review
   * screen could render it, an admin could read it as a verdict, and the human
   * judgment this whole feature exists to preserve would have been quietly
   * replaced by a shape check.
   */
  it("carries no field a caller could read as approval", () => {
    const pass = validateCandidate(definition(), { summary: "s", rowsChecked: 1 }, []);
    const fail = validateCandidate(definition(), {}, []);
    expect(Object.keys(pass).sort()).toEqual(["ok", "value"]);
    expect(Object.keys(fail).sort()).toEqual(["missing", "ok"]);
    for (const key of [...Object.keys(pass), ...Object.keys(fail)]) {
      expect(key, `${key} reads as a quality verdict`).not.toMatch(
        /approv|accept|verdict|score|quality|grade|rating|confidence|pass/i
      );
    }
  });

  it("returns the parsed value without annotating it", () => {
    const payload = { summary: "s", rowsChecked: 1 };
    const result = validateCandidate(definition(), payload, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(payload);
  });

  /**
   * Conformance is blind to content. Two candidates that differ only in the
   * substance of the work — one careful, one obviously thin — are equally
   * conformant, and this module must treat them identically. Distinguishing
   * them is exactly the judgment the admin is paid to make.
   */
  it("cannot distinguish careful work from thin work", () => {
    const careful = validateCandidate(
      definition(),
      { summary: "Checked all 40 rows against two independent sources.", rowsChecked: 40 },
      []
    );
    const thin = validateCandidate(definition(), { summary: "x", rowsChecked: 0 }, []);
    expect(careful.ok).toBe(true);
    expect(thin.ok).toBe(true);
  });
});
