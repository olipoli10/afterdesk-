import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OUTPUT_FORMAT_CODES,
  RECURRENCES,
  SOURCE_SHAPES,
  VERIFICATION_EXPECTATIONS,
  applyIntakeFraming,
} from "@/lib/ai-work-engine/intake-framing";
import {
  CLASSIFICATION_JSON_SCHEMA,
  classificationOutputSchema,
} from "@/lib/ai-work-engine/schemas";

/**
 * LOT C — INTAKE FRAMING: the intent distinctions, tested where code can
 * test them. What a live model actually EMITS for a given brief is Level-2
 * territory (real planner emission, 3 runs per brief); this file pins the
 * machinery those measurements depend on:
 *
 *   - the closed vocabularies (a rename is a commercial change, not a tweak),
 *   - the code-enforced gate (recurring / operator-decided format -> manual,
 *     regardless of what any prompt says),
 *   - the resume-path safety (a pre-LOT-C stored classification still parses,
 *     and its defaults can only TIGHTEN the gate),
 *   - the zod <-> JSON-schema lockstep for the four new fields,
 *   - the prompt seams (the rules exist in the prompts the models receive).
 */

describe("the vocabularies are frozen", () => {
  it("exact members, exact order", () => {
    expect(SOURCE_SHAPES).toEqual(["existing_file", "pasted_targets", "build_list", "mixed"]);
    expect(VERIFICATION_EXPECTATIONS).toEqual([
      "best_available",
      "two_independent_sources",
      "official_source",
    ]);
    expect(OUTPUT_FORMAT_CODES).toEqual(["csv", "xlsx", "table_in_message", "other"]);
    expect(RECURRENCES).toEqual(["one_off", "recurring"]);
  });
});

describe("applyIntakeFraming — the gate is code, not prompt", () => {
  // Seam repair: the framing now also owns the attachment-existence fact
  // (g07), so every call carries the code-known count. One attachment here:
  // these cases test the tier gate, not the file correction (that suite
  // lives in capability-contract.test.ts).
  const CTX = { attachmentCount: 1 };
  const base = {
    quote_tier: "assisted" as const,
    recurrence: "one_off" as const,
    output_format_code: "csv" as const,
    source_shape: "build_list" as const,
    missing_information: [] as string[],
  };

  it("a recurring ask is forced to manual", () => {
    expect(applyIntakeFraming({ ...base, recurrence: "recurring" }, CTX).quote_tier).toBe("manual");
  });

  it("an artifact no primitive produces is forced to manual", () => {
    expect(applyIntakeFraming({ ...base, output_format_code: "other" }, CTX).quote_tier).toBe(
      "manual"
    );
  });

  it("a one-off csv keeps the model's assisted tier", () => {
    expect(applyIntakeFraming(base, CTX).quote_tier).toBe("assisted");
  });

  it("the gate only tightens: manual never becomes assisted", () => {
    for (const recurrence of RECURRENCES) {
      for (const output_format_code of OUTPUT_FORMAT_CODES) {
        const out = applyIntakeFraming(
          {
            ...base,
            quote_tier: "manual" as const,
            recurrence,
            output_format_code,
          },
          CTX
        );
        expect(out.quote_tier).toBe("manual");
      }
    }
  });

  it("never mutates its input", () => {
    const input = { ...base, recurrence: "recurring" as const };
    const out = applyIntakeFraming(input, CTX);
    expect(input.quote_tier).toBe("assisted");
    expect(out).not.toBe(input);
  });
});

describe("resume-path safety: a pre-LOT-C rawOutput still parses, conservatively", () => {
  /** Exactly the fields a classification stored before LOT C carries. */
  const legacyRawOutput = {
    category_slug_guess: null,
    objective: "Build a supplier list",
    deliverable_format: "XLSX file",
    required_fields: ["company", "email"],
    quantity_interpreted: 100,
    geography: ["Canada"],
    verification_level: "standard",
    source_requirements: [],
    sensitive_data: false,
    required_access: [],
    missing_information: [],
    assumptions: [],
    quote_tier: "assisted",
    confidence: "medium",
  };

  it("parses, with the documented conservative defaults", () => {
    const parsed = classificationOutputSchema.safeParse(legacyRawOutput);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.source_shape).toBe("mixed");
    expect(parsed.data.verification_expectation).toBe("best_available");
    expect(parsed.data.output_format_code).toBe("other");
    expect(parsed.data.recurrence).toBe("one_off");
  });

  it("the defaults can only tighten: a resumed legacy classification lands on manual", () => {
    const parsed = classificationOutputSchema.parse(legacyRawOutput);
    // output_format_code defaults to "other", so the gate fires. Conservative
    // by design: an old classification never made these distinctions, and the
    // safe reading of "unknown" is "an operator decides".
    expect(applyIntakeFraming(parsed, { attachmentCount: 0 }).quote_tier).toBe("manual");
  });
});

describe("zod and the JSON schema stay in lockstep on the four fields", () => {
  it("all four are REQUIRED of every new model call", () => {
    for (const key of [
      "source_shape",
      "verification_expectation",
      "output_format_code",
      "recurrence",
    ]) {
      expect(CLASSIFICATION_JSON_SCHEMA.required).toContain(key);
    }
  });

  it("the API-level enums are exactly the vocabulary", () => {
    const p = CLASSIFICATION_JSON_SCHEMA.properties;
    expect(p.source_shape.enum).toEqual([...SOURCE_SHAPES]);
    expect(p.verification_expectation.enum).toEqual([...VERIFICATION_EXPECTATIONS]);
    expect(p.output_format_code.enum).toEqual([...OUTPUT_FORMAT_CODES]);
    expect(p.recurrence.enum).toEqual([...RECURRENCES]);
  });

  it("a value outside the vocabulary refuses to parse", () => {
    const parsed = classificationOutputSchema.safeParse({
      ...classificationOutputSchema.parse({
        category_slug_guess: null,
        objective: "x",
        deliverable_format: "x",
        required_fields: [],
        quantity_interpreted: null,
        geography: [],
        verification_level: "light",
        source_requirements: [],
        sensitive_data: false,
        required_access: [],
        missing_information: [],
        assumptions: [],
        quote_tier: "manual",
        confidence: "low",
      }),
      source_shape: "the_cloud",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("the prompt seams exist (source pins, like attachments.test.ts)", () => {
  const classifySource = readFileSync("src/lib/ai-work-engine/classify.ts", "utf8");
  const planSource = readFileSync("src/lib/ai-work-engine/plan.ts", "utf8");

  it("the classifier is instructed on all four distinctions and sees the attachments", () => {
    for (const needle of [
      "source_shape:",
      "verification_expectation:",
      "output_format_code:",
      "recurrence:",
      "ATTACHED FILES",
      // The two honesty rules the framing exists for:
      "A pasted list is never a file",
      "never treat it as one big task",
    ]) {
      expect(classifySource, `classify.ts must contain: ${needle}`).toContain(needle);
    }
  });

  it("the planner is told the framing facts are routing facts", () => {
    for (const needle of [
      "INTAKE FRAMING",
      // pasted targets: no file, no ingest.
      "there is NO ingest step",
      // verification sizes the HUMAN step, never new automation.
      "It never adds automated verification",
      // recurring: one occurrence, operator decides the arrangement.
      "plan ONE occurrence only",
    ]) {
      expect(planSource, `plan.ts must contain: ${needle}`).toContain(needle);
    }
  });

  it("the classifier never receives file ids or file content — only the manifest lines", () => {
    // The seam: classify.ts takes pre-rendered attachmentLines (strings) and
    // must not import the inspection or storage modules to look deeper.
    expect(classifySource).toContain("attachmentLines: string[]");
    expect(classifySource).not.toContain("file-inspection");
    expect(classifySource).not.toContain("@/lib/storage");
  });
});
