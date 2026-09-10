import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { personalCalendarDraftSchema } from "@/server/personal-assistant/calendar-draft-contract";

// Exact pre-extraction grammar. Ordering/IANA authority remain later checks.
const previousGrammar = z.object({ title: z.string().trim().min(1).max(240), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict();
const valid = { title: "Inspection", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" };
const parseResult = (schema: typeof personalCalendarDraftSchema, value: unknown) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, issues: parsed.error.issues };
};

describe("calendar draft leaf — actual imports and unchanged legacy grammar", () => {
  it.each(["legacy", "projection", "proof", "confirmation"] as const)("loads the real graph starting at %s without a preloader mock", async first => {
    vi.resetModules();
    const starts = {
      legacy: () => import("@/server/personal-assistant/calendar-actions"),
      projection: () => import("@/server/model-gateway/personal-intent/correlated-calendar-projection"),
      proof: () => import("@/server/model-gateway/personal-intent/correlated-calendar-proof"),
      confirmation: () => import("@/server/personal-assistant/calendar-confirmation-authority"),
    };
    await starts[first]();
    const [leaf, legacy, projection, proof, confirmation] = await Promise.all([
      import("@/server/personal-assistant/calendar-draft-contract"), starts.legacy(), starts.projection(), starts.proof(), starts.confirmation(),
    ]);
    expect(legacy.personalCalendarDraftSchema).toBe(leaf.personalCalendarDraftSchema);
    expect(leaf.personalCalendarDraftSchema.parse(valid)).toEqual(valid);
    expect(projection.loadCorrelatedPersonalCalendarReviewInTransaction).toBeTypeOf("function");
    expect(proof.inspectCorrelatedCalendarReferenceProof).toBeTypeOf("function");
    expect(confirmation.inspectCalendarConfirmationBridgePreparationInTransaction).toBeTypeOf("function");
    // Functions are never invoked here: module loading is not execution authority.
  });
  it("keeps the leaf dependency restricted to zod and the same declaration", () => {
    const source = readFileSync("src/server/personal-assistant/calendar-draft-contract.ts", "utf8");
    expect([...source.matchAll(/^import .+ from "([^"]+)";/gm)].map(match => match[1])).toEqual(["zod"]);
    expect(source).not.toMatch(/process\.env|Date\.now|\bfetch\(|prisma|calendar-actions|server-only/);
    const priorDeclaration = 'export const personalCalendarDraftSchema = z.object({ title: z.string().trim().min(1).max(240), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict();';
    expect(source).toContain(priorDeclaration);
    const legacy = readFileSync("src/server/personal-assistant/calendar-actions.ts", "utf8");
    expect(legacy).toContain('import { personalCalendarDraftSchema } from "./calendar-draft-contract"');
    expect(legacy).toContain('export { personalCalendarDraftSchema } from "./calendar-draft-contract"');
    expect(legacy).not.toContain("export const personalCalendarDraftSchema =");
  });
  it.each([
    "src/server/model-gateway/personal-intent/correlated-calendar-projection.ts",
    "src/server/model-gateway/personal-intent/correlated-calendar-proof.ts",
    "src/server/personal-assistant/calendar-confirmation-authority.ts",
  ])("removes the schema-only engine import in %s", path => {
    const source = readFileSync(path, "utf8");
    expect(source).toMatch(/import \{ personalCalendarDraftSchema \} from "[^"\n]*calendar-draft-contract"/);
    expect(source).not.toMatch(/from "[^"\n]*calendar-actions"/);
  });
  it.each([
    ["valid", valid],
    ["Unicode trim", { ...valid, title: "\uFEFF\u00a0 Inspection 🛠️ \u2003" }],
    ["offset instants retained", { ...valid, startsAt: "2026-09-11T14:00:00-04:00", endsAt: "2026-09-11T15:00:00-04:00" }],
    ["fraction precision retained", { ...valid, startsAt: "2026-09-11T18:00:00.123456Z" }],
    ["240 title units", { ...valid, title: "a".repeat(240) }],
    ["241 title units", { ...valid, title: "a".repeat(241) }],
    ["120 astral symbols", { ...valid, title: "😀".repeat(120) }],
    ["121 astral symbols", { ...valid, title: "😀".repeat(121) }],
    ["empty trimmed title", { ...valid, title: " \uFEFF " }],
    ["80 timezone units", { ...valid, timezone: "a".repeat(80) }],
    ["81 timezone units", { ...valid, timezone: "a".repeat(81) }],
    ["empty timezone", { ...valid, timezone: "" }],
    ["invalid date", { ...valid, startsAt: "2026-02-30T18:00:00Z" }],
    ["zone absent", { ...valid, startsAt: "2026-09-11T18:00:00" }],
    ["numeric date", { ...valid, startsAt: 1789060000000 }],
    ["Date object", { ...valid, startsAt: new Date(valid.startsAt) }],
    ["extra authority field", { ...valid, approved: true }],
    ["missing endsAt", { title: valid.title, startsAt: valid.startsAt, timezone: valid.timezone }],
    ["null", null],
    ["array", [valid]],
    // These are deliberately still accepted by this old grammar. Existing
    // downstream temporal/IANA guards, not this extraction, enforce them.
    ["reverse interval unchanged", { ...valid, startsAt: valid.endsAt, endsAt: valid.startsAt }],
    ["unknown timezone unchanged", { ...valid, timezone: "not-a-real-zone" }],
  ])("preserves previous parse result: %s", (_label, value) => {
    expect(parseResult(personalCalendarDraftSchema, value)).toEqual(parseResult(previousGrammar, value));
  });
  it("does not normalize offsets/timezones or add temporal authority while trimming the title", () => {
    const input = { title: "  Inspection  ", startsAt: "2026-09-11T14:00:00-04:00", endsAt: "2026-09-11T13:00:00-04:00", timezone: "unknown-zone" };
    expect(personalCalendarDraftSchema.parse(input)).toEqual({ ...input, title: "Inspection" });
    expect(input.title).toBe("  Inspection  ");
  });
});
