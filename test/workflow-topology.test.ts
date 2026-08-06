import { describe, expect, it } from "vitest";
import { resolveTopology, type TopologyStep } from "@/lib/ai-work-engine/topology";
import { PLAN_PRIMITIVES, currentPrimitiveVersion } from "@/lib/ai-work-engine/schemas";

/**
 * The topology resolver is the compiler's core and it runs against a contract
 * the client already signed, so every one of its refusals must be provable
 * without a database, a network call or a model.
 */

const V = PLAN_PRIMITIVES["research.web_search"];

const machine = (order: number, deps: number[] = [], over: Partial<TopologyStep> = {}): TopologyStep => ({
  order,
  executor: "ai",
  primitiveId: "research.web_search",
  primitiveVersion: V,
  dependsOnOrder: deps,
  ...over,
});

const human = (order: number, deps: number[] = []): TopologyStep => ({
  order,
  executor: "human",
  primitiveId: null,
  primitiveVersion: null,
  dependsOnOrder: deps,
});

describe("resolveTopology — what the machine is allowed to run", () => {
  it("runs a clean machine block and stops at the human step", () => {
    const t = resolveTopology([machine(1), machine(2, [1]), human(3, [2])]);
    expect(t.automatableOrders).toEqual([1, 2]);
    expect(t.humanOrders).toEqual([3]);
    expect(t.demotedOrders).toEqual([]);
  });

  it("demotes a machine step that sits behind a human one", () => {
    // The exact shape the real dental plan had: a human gate early, with
    // machine work chained behind it.
    const t = resolveTopology([machine(1), human(2, [1]), machine(3, [2]), machine(4, [3])]);
    expect(t.automatableOrders).toEqual([1]);
    expect(t.demotedOrders).toEqual([3, 4]);
  });

  it("refuses a step with no primitive, however machine-like it looks", () => {
    const t = resolveTopology([machine(1, [], { primitiveId: null })]);
    expect(t.automatableOrders).toEqual([]);
    expect(t.decisions[0].reason).toBe("no_primitive");
  });

  it("refuses an invented primitive id instead of crashing", () => {
    const t = resolveTopology([machine(1, [], { primitiveId: "research.hack_the_mainframe" })]);
    expect(t.automatableOrders).toEqual([]);
    expect(t.decisions[0].reason).toBe("unknown_primitive");
  });

  it("refuses a primitive whose version moved since the plan was accepted", () => {
    // The registry shipping v2 must not silently apply v2 behaviour to a
    // contract that was signed against v1.
    const t = resolveTopology([machine(1, [], { primitiveVersion: V + 1 })]);
    expect(t.automatableOrders).toEqual([]);
    expect(t.decisions[0].reason).toBe("primitive_version_changed");
  });

  it("refuses a machine step pinned to no version at all", () => {
    const t = resolveTopology([machine(1, [], { primitiveVersion: null })]);
    expect(t.decisions[0].reason).toBe("primitive_version_changed");
  });

  it("reports the step's own reason before its dependencies'", () => {
    const t = resolveTopology([human(1), human(2, [1])]);
    expect(t.decisions.map((d) => d.reason)).toEqual(["human_step", "human_step"]);
  });

  it("terminates on a dependency cycle rather than hanging", () => {
    const t = resolveTopology([machine(1, [2]), machine(2, [1])]);
    expect(t.automatableOrders).toEqual([]);
    expect(t.decisions.every((d) => d.reason === "depends_on_human")).toBe(true);
  });

  it("treats a self-dependency and a dangling dependency as unprovable", () => {
    const t = resolveTopology([machine(1, [1]), machine(2, [99])]);
    expect(t.automatableOrders).toEqual([]);
  });

  it("an all-human plan is valid and automates nothing", () => {
    const t = resolveTopology([human(1), human(2, [1]), human(3, [2])]);
    expect(t.automatableOrders).toEqual([]);
    expect(t.humanOrders).toEqual([1, 2, 3]);
  });

  it("an empty plan does not throw", () => {
    expect(resolveTopology([]).automatableOrders).toEqual([]);
  });
});

describe("primitive versioning is a closed, stamped vocabulary", () => {
  it("currentPrimitiveVersion resolves known ids and rejects everything else", () => {
    expect(currentPrimitiveVersion("build.csv")).toBe(PLAN_PRIMITIVES["build.csv"]);
    expect(currentPrimitiveVersion("build.exe")).toBeNull();
    expect(currentPrimitiveVersion(null)).toBeNull();
  });

  it("is not fooled by inherited object members", () => {
    // Object.hasOwn, not `in`: a step naming "constructor" must be unknown,
    // not resolve to a function.
    expect(currentPrimitiveVersion("constructor")).toBeNull();
    expect(currentPrimitiveVersion("__proto__")).toBeNull();
    expect(currentPrimitiveVersion("toString")).toBeNull();
  });

  it("every declared primitive has a positive integer version", () => {
    for (const [id, version] of Object.entries(PLAN_PRIMITIVES)) {
      expect(Number.isInteger(version), `${id} version must be an integer`).toBe(true);
      expect(version).toBeGreaterThan(0);
    }
  });
});
