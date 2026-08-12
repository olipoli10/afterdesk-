import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  capabilityDescriptors,
  plannerCapabilityContract,
} from "@/lib/ai-work-engine/capability-contract";
import {
  PRIMITIVE_PARAM_SCHEMAS,
  parsePrimitiveParams,
  primitiveTakesNoParams,
} from "@/lib/ai-work-engine/primitive-params";
import { PLAN_PRIMITIVE_IDS, PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";
import { WEB_FETCH_ENVELOPE } from "@/lib/ai-work-engine/web-fetch-envelope";
import { classifyMandateData } from "@/lib/ai-work-engine/data-class";
import { applyIntakeFraming } from "@/lib/ai-work-engine/intake-framing";

/**
 * SEAM REPAIR PINS — the structural tests the GO order demands, one family
 * per Level-2 failure mode. Their common shape: the planner's view of a
 * contract and the runtime's enforcement of it must be the same object, or
 * derived from it so directly that drifting requires editing BOTH on purpose.
 */

/* ─────────────── 1. the contract IS what the planner reads ─────────────── */

describe("the capability contract is generated, complete, and embedded verbatim", () => {
  it("covers every primitive in the vocabulary, at its current version", () => {
    const byId = new Map(capabilityDescriptors().map((d) => [d.id, d]));
    for (const id of PLAN_PRIMITIVE_IDS) {
      const d = byId.get(id);
      expect(d, `descriptor missing for ${id}`).toBeDefined();
      expect(d!.version).toBe(PLAN_PRIMITIVES[id]);
      expect(plannerCapabilityContract()).toContain(`${id}@${PLAN_PRIMITIVES[id]}`);
    }
  });

  it("THE closing pin: the plan system prompt embeds the generated contract verbatim", async () => {
    // Not a substring of a copy — the exact rendering the generator produced.
    // Change a bound or an enum in primitive-params.ts and this contract
    // changes at module load; a prompt built from anything else fails here.
    const { PLAN_SYSTEM_PROMPT } = await import("@/lib/ai-work-engine/plan");
    expect(PLAN_SYSTEM_PROMPT).toContain(plannerCapabilityContract());
  });

  it("params contracts are DERIVED from the runtime schemas, not authored", () => {
    // Spot-verify the derivation empirically on the exact Level-2 failures:
    // every fact the contract states must be a fact the runtime enforces.
    const contract = plannerCapabilityContract();
    // data.dedupe keep: the enum that caused "most_complete".
    expect(contract).toContain('"keep":{"default":"first","type":"string","enum":["first","last"]}');
    expect(contract).not.toContain("most_complete");
    // web.fetch bounds: the numbers that caused 120/180000.
    expect(contract).toContain('"maxFetches":{"default":3,"type":"integer","minimum":1,"maximum":3}');
    expect(contract).toContain(
      '"maxContentTokens":{"default":10000,"type":"integer","minimum":1000,"maximum":10000}'
    );
  });
});

/* ────────────── 2. noParams: strict runtime, explicit contract ────────────── */

describe("noParams primitives: the planner is told null, the runtime stays fail-closed", () => {
  const NO_PARAMS_IDS = PLAN_PRIMITIVE_IDS.filter((id) => primitiveTakesNoParams(id));

  it("the verified noParams list is exactly the four 1B-era primitives", () => {
    expect(NO_PARAMS_IDS.sort()).toEqual(
      ["extract.structured_rows", "normalize.contact_fields", "research.web_search", "split.exceptions"].sort()
    );
  });

  it("the contract says params: null for each of them, never an empty object schema", () => {
    for (const d of capabilityDescriptors()) {
      if (NO_PARAMS_IDS.includes(d.id)) {
        expect(d.paramsJsonSchema).toBeNull();
        expect(plannerCapabilityContract()).toMatch(
          new RegExp(`${d.id.replace(".", "\\.")}@\\d+ \\[[^\\]]+\\][^\\n]*\\n  params: null`)
        );
      } else {
        expect(d.paramsJsonSchema).not.toBeNull();
      }
    }
  });

  it("an invented parameter on a noParams primitive STILL fails at runtime (never stripped)", () => {
    // The exact Level-2 emission: {queries: [...]} on research.web_search.
    for (const id of NO_PARAMS_IDS) {
      expect(parsePrimitiveParams(id, { queries: ["plumbers Quebec"] })).toBeNull();
      expect(parsePrimitiveParams(id, { anything: 1 })).toBeNull();
      // null / {} keep compiling — the pre-params contract shape.
      expect(parsePrimitiveParams(id, null)).toEqual({});
      expect(parsePrimitiveParams(id, {})).toEqual({});
    }
  });
});

/* ─────────────── 3. bounds: one source across zod/envelope/contract ─────────────── */

describe("web.fetch bounds: zod, the economic envelope and the contract agree", () => {
  it("the schema maximum IS the envelope ceiling (existing pin, restated at the seam)", () => {
    const d = capabilityDescriptors().find((x) => x.id === "web.fetch")!;
    const schema = d.paramsJsonSchema as {
      properties: { maxFetches: { maximum: number }; maxContentTokens: { maximum: number } };
    };
    expect(schema.properties.maxFetches.maximum).toBe(WEB_FETCH_ENVELOPE.maxFetchesCeiling);
    // Empirical: the contract's stated maxima are exactly where zod flips.
    expect(
      parsePrimitiveParams("web.fetch", { maxFetches: schema.properties.maxFetches.maximum })
    ).not.toBeNull();
    expect(
      parsePrimitiveParams("web.fetch", { maxFetches: schema.properties.maxFetches.maximum + 1 })
    ).toBeNull();
    expect(
      parsePrimitiveParams("web.fetch", {
        maxContentTokens: schema.properties.maxContentTokens.maximum,
      })
    ).not.toBeNull();
    expect(
      parsePrimitiveParams("web.fetch", {
        maxContentTokens: schema.properties.maxContentTokens.maximum + 1,
      })
    ).toBeNull();
  });

  it("the exact Level-2 violation (120 fetches / 180k tokens) is refused by the runtime the contract describes", () => {
    expect(parsePrimitiveParams("web.fetch", { maxFetches: 120, maxContentTokens: 180_000 })).toBeNull();
  });
});

/* ─────────────── 4. enums: every stated value is a real value ─────────────── */

describe("every enum the contract exposes round-trips through the runtime schema", () => {
  /** Walk a generated JSON schema and collect [path, enumValues] pairs. */
  function collectEnums(node: unknown, path: string, out: [string, string[]][]) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((c, i) => collectEnums(c, `${path}[${i}]`, out));
      return;
    }
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec.enum) && rec.enum.every((v) => typeof v === "string")) {
      out.push([path, rec.enum as string[]]);
    }
    for (const [k, v] of Object.entries(rec)) collectEnums(v, `${path}.${k}`, out);
  }

  it("the contract's enums are exactly the zod enums (derived, then re-verified)", () => {
    // The derivation makes equality true by construction; this pin re-derives
    // independently so a future hand-edit of the descriptor cannot slip by.
    let totalEnums = 0;
    for (const d of capabilityDescriptors()) {
      if (d.paramsJsonSchema === null) continue;
      const fromContract: [string, string[]][] = [];
      collectEnums(d.paramsJsonSchema, d.id, fromContract);
      const regenerated = z.toJSONSchema(
        PRIMITIVE_PARAM_SCHEMAS[d.id as keyof typeof PRIMITIVE_PARAM_SCHEMAS],
        { io: "input" }
      );
      const fromZod: [string, string[]][] = [];
      collectEnums(regenerated, d.id, fromZod);
      expect(fromContract.map(([, v]) => v)).toEqual(fromZod.map(([, v]) => v));
      totalEnums += fromContract.length;
    }
    // Non-vacuity: the walk actually found the enums we know exist.
    expect(totalEnums).toBeGreaterThanOrEqual(8);
  });
});

/* ───── 5. sensitive: doctrine-aligned classifier, downgrade impossible ───── */

describe("sensitive_data aligns with the 1E-alpha data classes and can never downgrade them", () => {
  const b2bInspection = {
    fileId: "f1",
    inspected: true,
    headers: ["Company", "Contact Name", "Title", "Work Email", "Office Phone", "Website"],
    sampledValues: ["Acme Tooling", "VP Operations", "ops@acme.example", "+1 514 555 0134"],
  };
  const payrollInspection = {
    fileId: "f2",
    inspected: true,
    headers: ["Employee", "Salary", "Date of Birth", "SIN"],
    sampledValues: ["120000", "1988-04-12"],
  };

  it("a B2B professional-contact export is business_confidential, never personal_sensitive", () => {
    const verdict = classifyMandateData({
      declaredSensitive: false,
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [b2bInspection],
    });
    expect(verdict.dataClass).toBe("business_confidential");
  });

  it("payroll/DOB/HR escalates to personal_sensitive on inspection alone", () => {
    const verdict = classifyMandateData({
      declaredSensitive: false, // the model saying "not sensitive"...
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [payrollInspection],
    });
    // ...cannot downgrade what deterministic inspection found.
    expect(verdict.dataClass).toBe("personal_sensitive");
  });

  it("the model can RAISE (declare sensitive on a clean file) but the max-only rule is the whole policy", () => {
    const raised = classifyMandateData({
      declaredSensitive: true,
      declaredRequiredAccessCount: 0,
      fileCount: 1,
      inspections: [b2bInspection],
    });
    expect(raised.dataClass).toBe("personal_sensitive");
  });

  it("the classifier prompt speaks the doctrine's own line, not a second policy", () => {
    const src = readFileSync(
      join(__dirname, "..", "src", "lib", "ai-work-engine", "classify.ts"),
      "utf8"
    );
    for (const needle of [
      // The doctrine's load-bearing sentence, verbatim spirit:
      "An amount is not sensitive; an account identifier is.",
      // The B2B carve-out that fixes the Level-2 false positives:
      "CRM or lead exports of business contacts",
      "work emails, work phones",
      // The escalators that must never soften:
      "payroll/salary/HR records",
      "dates of birth",
      "health or medical information",
      // The authority rule, stated to the model:
      "can only ever RAISE the restriction",
    ]) {
      expect(src, `classify.ts must contain: ${needle}`).toContain(needle);
    }
  });
});

/* ─────────────── 6. g07: existing_file requires a real attachment ─────────────── */

describe("source_shape 'existing_file' is impossible without an actual attachment", () => {
  const base = {
    quote_tier: "assisted" as const,
    recurrence: "one_off" as const,
    output_format_code: "csv" as const,
    source_shape: "existing_file" as const,
    missing_information: [] as string[],
  };

  it("zero attachments: the claim is corrected to 'mixed' and the contradiction is recorded", () => {
    const framed = applyIntakeFraming(base, { attachmentCount: 0 });
    expect(framed.source_shape).toBe("mixed");
    expect(framed.missing_information).toContain(
      "The brief refers to an attached file, but nothing is attached."
    );
    // Never mutates its input.
    expect(base.source_shape).toBe("existing_file");
    expect(base.missing_information).toEqual([]);
  });

  it("with a real attachment the claim stands untouched", () => {
    const framed = applyIntakeFraming(base, { attachmentCount: 1 });
    expect(framed.source_shape).toBe("existing_file");
    expect(framed.missing_information).toEqual([]);
  });

  it("the correction composes with the tier gate (recurring existing_file, no attachment)", () => {
    const framed = applyIntakeFraming(
      { ...base, recurrence: "recurring" as const },
      { attachmentCount: 0 }
    );
    expect(framed.source_shape).toBe("mixed");
    expect(framed.quote_tier).toBe("manual");
  });

  it("the missing_information append respects the schema's cap of 10", () => {
    const full = { ...base, missing_information: Array.from({ length: 10 }, (_, i) => `q${i}`) };
    const framed = applyIntakeFraming(full, { attachmentCount: 0 });
    expect(framed.missing_information).toHaveLength(10);
    expect(framed.source_shape).toBe("mixed");
  });
});
