import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPILABLE_PRIMITIVE_IDS,
  HANDOFF_REASONS,
  compileDecisions,
  type CompileStepInput,
} from "@/lib/ai-work-engine/compile";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/schemas";

/**
 * The compiler runs against a contract the client already signed. Every one
 * of its refusals must be provable here, without a model, a network call or a
 * database.
 */

const OPEN_GATE = { sensitiveData: false, requiredAccessCount: 0 };

const machine = (
  order: number,
  deps: number[] = [],
  over: Partial<CompileStepInput> = {}
): CompileStepInput => ({
  planStepId: `ps${order}`,
  title: `step ${order}`,
  order,
  executor: "ai",
  primitiveId: "research.web_search",
  primitiveVersion: PLAN_PRIMITIVES["research.web_search"],
  dependsOnOrder: deps,
  ...over,
});

const human = (order: number, deps: number[] = []): CompileStepInput => ({
  planStepId: `ps${order}`,
  title: `step ${order}`,
  order,
  executor: "human",
  primitiveId: null,
  primitiveVersion: null,
  dependsOnOrder: deps,
});

describe("the compiler is deterministic", () => {
  it("calls no model and reaches no network", () => {
    // The rule the founder set: after acceptance, nothing reinterprets the
    // plan. The absence of these imports is the enforcement.
    const source = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/compile.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/@anthropic-ai\/sdk|from "openai"|from 'openai'/);
    expect(source).not.toMatch(/\bfetch\(|axios|https?\.request/);
    expect(source).not.toMatch(/Math\.random|Date\.now\(\)/);
  });

  it("returns the same plan for the same input, twice", () => {
    const steps = [machine(1), machine(2, [1]), human(3, [2])];
    expect(compileDecisions(steps, OPEN_GATE)).toEqual(compileDecisions(steps, OPEN_GATE));
  });
});

describe("the mandate-level gate outranks every step decision", () => {
  it("refuses all automation on a sensitive-data mandate", () => {
    // The real CRM-migration test brief: flagged sensitive, and its planner
    // output offered five plausible machine steps that would have piped
    // patient records through a model.
    const steps = [machine(1), machine(2, [1]), machine(3, [2]), human(4, [3])];
    const out = compileDecisions(steps, { sensitiveData: true, requiredAccessCount: 0 });
    expect(out.automatedStepCount).toBe(0);
    expect(out.fullyHuman).toBe(true);
    expect(out.steps.every((s) => s.handoffReason === HANDOFF_REASONS.sensitive_data)).toBe(true);
  });

  it("refuses all automation when the mandate needs client-system access", () => {
    const out = compileDecisions([machine(1)], { sensitiveData: false, requiredAccessCount: 2 });
    expect(out.automatedStepCount).toBe(0);
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.required_access);
  });

  it("reports sensitivity before access when both apply", () => {
    const out = compileDecisions([machine(1)], { sensitiveData: true, requiredAccessCount: 3 });
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.sensitive_data);
  });
});

describe("per-step refusals", () => {
  it("compiles a clean machine block and hands the rest to a person", () => {
    // The shape the corrected planner produced on the real dental mandate.
    const steps = [
      machine(1),
      machine(2, [1], { primitiveId: "extract.structured_rows", primitiveVersion: PLAN_PRIMITIVES["extract.structured_rows"] }),
      machine(3, [2], { executor: "deterministic_code", primitiveId: "normalize.contact_fields", primitiveVersion: PLAN_PRIMITIVES["normalize.contact_fields"] }),
      machine(4, [3], { executor: "deterministic_code", primitiveId: "split.exceptions", primitiveVersion: PLAN_PRIMITIVES["split.exceptions"] }),
      machine(5, [4], { executor: "deterministic_code", primitiveId: "build.csv", primitiveVersion: PLAN_PRIMITIVES["build.csv"] }),
      human(6, [5]),
    ];
    const out = compileDecisions(steps, OPEN_GATE);
    expect(out.automatedStepCount).toBe(5);
    expect(out.humanStepCount).toBe(1);
    expect(out.fullyHuman).toBe(false);
    expect(out.steps.filter((s) => s.executionMode === "automated").map((s) => s.order)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("refuses an unknown primitive id instead of crashing the mandate", () => {
    const out = compileDecisions([machine(1, [], { primitiveId: "shell.exec" })], OPEN_GATE);
    expect(out.steps[0].executionMode).toBe("human");
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.unknown_primitive);
  });

  it("refuses a primitive whose version moved after acceptance", () => {
    const out = compileDecisions(
      [machine(1, [], { primitiveVersion: PLAN_PRIMITIVES["research.web_search"] + 1 })],
      OPEN_GATE
    );
    expect(out.steps[0].executionMode).toBe("human");
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.primitive_version_changed);
  });

  it("refuses a machine step that named no primitive", () => {
    const out = compileDecisions([machine(1, [], { primitiveId: null })], OPEN_GATE);
    expect(out.steps[0].handoffReason).toBe(HANDOFF_REASONS.no_primitive);
  });

  it("demotes machine work planned behind a human step", () => {
    // The pre-fix shape of the real dental plan: a human gate at position 2
    // with machine work chained behind it.
    const steps = [machine(1), human(2, [1]), machine(3, [2]), machine(4, [3])];
    const out = compileDecisions(steps, OPEN_GATE);
    expect(out.automatedStepCount).toBe(1);
    expect(out.steps[2].handoffReason).toBe(HANDOFF_REASONS.depends_on_human);
    expect(out.steps[3].handoffReason).toBe(HANDOFF_REASONS.depends_on_human);
  });

  it("an all-human plan compiles cleanly to nothing to run", () => {
    const out = compileDecisions([human(1), human(2, [1])], OPEN_GATE);
    expect(out.fullyHuman).toBe(true);
    expect(out.steps.every((s) => s.handoffReason === HANDOFF_REASONS.human_step)).toBe(true);
  });

  it("a pre-Phase-1B plan compiles entirely to human work", () => {
    // Plans accepted before this existed carry no primitiveId at all. They
    // must behave exactly as they did: a person does the whole thing.
    const legacy: CompileStepInput[] = [
      { planStepId: "a", title: "t", order: 1, executor: "deterministic_code", primitiveId: null, primitiveVersion: null, dependsOnOrder: [] },
      { planStepId: "b", title: "t", order: 2, executor: "ai", primitiveId: null, primitiveVersion: null, dependsOnOrder: [1] },
    ];
    const out = compileDecisions(legacy, OPEN_GATE);
    expect(out.fullyHuman).toBe(true);
  });

  it("an empty plan does not throw", () => {
    const out = compileDecisions([], OPEN_GATE);
    expect(out.fullyHuman).toBe(true);
    expect(out.steps).toEqual([]);
  });
});

describe("the registry implements exactly the planner's vocabulary", () => {
  it("no id can be planned that cannot run, and none can run that cannot be planned", async () => {
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    expect(Object.keys(REGISTRY).sort()).toEqual([...COMPILABLE_PRIMITIVE_IDS].sort());
  });

  it("every registry entry declares the version the vocabulary pins", async () => {
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    for (const [id, primitive] of Object.entries(REGISTRY)) {
      expect(primitive.version, `${id} version drifted from PLAN_PRIMITIVES`).toBe(
        PLAN_PRIMITIVES[id as keyof typeof PLAN_PRIMITIVES]
      );
      expect(primitive.id).toBe(id);
    }
  });

  it("no primitive is WRITE, and every one is idempotent", async () => {
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    for (const [id, p] of Object.entries(REGISTRY)) {
      expect(["READ", "PREPARE"], `${id} must not be a WRITE primitive`).toContain(p.mode);
      // Lease-based recovery replays a step in full. A primitive that is not
      // safe to replay cannot be in this table.
      expect(p.idempotent, `${id} must be idempotent`).toBe(true);
      expect(p.handlesSensitiveData, `${id} must not handle sensitive data`).toBe(false);
      expect(p.maxAttempts).toBeGreaterThan(0);
      expect(p.timeoutMs).toBeGreaterThan(0);
    }
  });

  it("PLAN_PRIMITIVE_MODES matches REGISTRY entry by entry (1D-alpha0)", async () => {
    /**
     * The pin that makes the compiler's mode check real. registry.ts is
     * `server-only` and compile.ts is pure, so the compiler cannot import the
     * registry and had to be handed the same facts in an import-free table.
     * Two tables mean drift, so drift is what this test forbids.
     */
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    const { PLAN_PRIMITIVE_MODES } = await import(
      "@/lib/ai-work-engine/primitive-vocabulary"
    );
    expect(Object.keys(PLAN_PRIMITIVE_MODES).sort()).toEqual(Object.keys(REGISTRY).sort());
    for (const [id, p] of Object.entries(REGISTRY)) {
      expect(
        PLAN_PRIMITIVE_MODES[id as keyof typeof PLAN_PRIMITIVE_MODES],
        `${id} mode drifted between the registry and the compiler's table`
      ).toBe(p.mode);
    }
  });

  it("the compiler really refuses a non-executable mode, not just in a comment", async () => {
    /**
     * registry.ts claimed since 1B that "the compiler refuses any step whose
     * primitive is not READ or PREPARE". It did not: compile.ts never
     * imported REGISTRY and contained no mode check at all. This proves the
     * refusal exists by driving the predicate the compiler actually calls.
     */
    const { primitiveModeOf, EXECUTABLE_PRIMITIVE_MODES } = await import(
      "@/lib/ai-work-engine/primitive-vocabulary"
    );
    expect(primitiveModeOf("research.web_search")).toBe("READ");
    expect(primitiveModeOf("build.csv")).toBe("PREPARE");
    // An id with no declared mode cannot be executed.
    expect(primitiveModeOf("crm.write_contacts")).toBeNull();
    expect(EXECUTABLE_PRIMITIVE_MODES).toEqual(["READ", "PREPARE"]);
    expect(EXECUTABLE_PRIMITIVE_MODES).not.toContain("WRITE");

    const source = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/compile.ts"),
      "utf8"
    );
    expect(source).toContain("primitiveModeOf");
    expect(source).toContain("EXECUTABLE_PRIMITIVE_MODES");
  });

  it("the registry says WHETHER a primitive bills, and never HOW MUCH", async () => {
    /**
     * The amount deliberately does not live here. For a NEW quote it comes
     * from automation-cost-policy.ts; for an ACCEPTED contract it comes from
     * the plan step frozen before the client signed. A third number in the
     * registry is exactly what the runner used to read at execution time,
     * which is how a deploy changed what a signed contract could spend.
     */
    const { REGISTRY } = await import("@/lib/ai-work-engine/registry");
    const source = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/registry.ts"),
      "utf8"
    );
    // No DECLARED amount. The word may appear in prose explaining where the
    // number actually lives; what must not exist is a field holding one.
    expect(source).not.toMatch(/maxCostMicrosPerAttempt\s*:/);

    const billable = Object.values(REGISTRY).filter((p) => p.billable).map((p) => p.id).sort();
    const pure = Object.values(REGISTRY).filter((p) => !p.billable).map((p) => p.id).sort();
    /**
     * The BILLABLE list is the closed one, and it is the only one worth
     * pinning by value: it is the set of capabilities that can spend a
     * client's money, so a new entry has to be a deliberate edit here.
     *
     * The pure list was pinned by value too until 1E-alpha added ten
     * deterministic capabilities in one phase. Re-listing all of them would
     * turn this assertion into a chore that gets updated without being read,
     * which is how a pin stops protecting anything. What matters about a pure
     * primitive is stated directly instead: it cannot spend.
     */
    // 1E-beta1 added web.fetch: a THIRD capability that can spend, deliberate
    // edit here as the pin demands, priced by ac4 and funded ONE attempt.
    expect(billable).toEqual(["extract.structured_rows", "research.web_search", "web.fetch"]);
    expect(pure.length).toBe(Object.keys(REGISTRY).length - billable.length);
    for (const id of pure) {
      expect(REGISTRY[id as keyof typeof REGISTRY].billable).toBe(false);
    }
    // Not vacuous: this phase's capabilities are in the registry and pure.
    expect(pure).toContain("ingest.csv");
    expect(pure).toContain("data.dedupe");
    expect(pure).toContain("build.xlsx");
  });

  it("the registry source declares no WRITE tier at all", async () => {
    // Not a disabled tier, an absent one: adding WRITE later must be a
    // deliberate act that also changes the compiler.
    const source = readFileSync(
      join(__dirname, "..", "src/lib/ai-work-engine/registry.ts"),
      "utf8"
    );
    expect(source).toContain('export type PrimitiveMode = "READ" | "PREPARE"');
    expect(source).not.toMatch(/mode:\s*"WRITE"/);
  });

  it("resolvePrimitive refuses inherited members and version drift", async () => {
    const { resolvePrimitive } = await import("@/lib/ai-work-engine/registry");
    expect(resolvePrimitive("build.csv", PLAN_PRIMITIVES["build.csv"])?.id).toBe("build.csv");
    expect(resolvePrimitive("build.csv", PLAN_PRIMITIVES["build.csv"] + 1)).toBeNull();
    expect(resolvePrimitive("build.csv", null)).toBeNull();
    expect(resolvePrimitive("constructor", 1)).toBeNull();
    expect(resolvePrimitive("__proto__", 1)).toBeNull();
    expect(resolvePrimitive(null, 1)).toBeNull();
  });
});
