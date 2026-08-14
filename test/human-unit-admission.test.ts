import { describe, expect, it } from "vitest";
import {
  admitHumanCut,
  type AdmissionEconomics,
  type AdmissionStep,
} from "@/lib/ai-work-engine/human-unit-admission";

/**
 * ADMISSION IS A PURE VERDICT OVER AN ALREADY-SIGNED CONTRACT.
 *
 * The machine stops at exactly one human step, or it does not stop at all.
 * Every refusal here must be provable without a database, a network call or a
 * model — the same standard `resolveTopology` holds itself to, for the same
 * reason: a plan is data a model wrote, and the contract it belongs to was
 * accepted by a client who is owed a stable answer.
 *
 * The verdict is a refusal, never an exception (contracts/runtime-internal.md
 * §1). A shape this function cannot parse is a shape it must not admit — but
 * it is not an error, because the caller is the compiler and the compiler's
 * documented worst case is "everything comes back human".
 */

const machine = (
  order: number,
  deps: number[] = [],
  over: Partial<AdmissionStep> = {}
): AdmissionStep => ({
  order,
  executor: "ai",
  dependsOnOrder: deps,
  fixedMinutes: null,
  secondsPerUnit: null,
  estimatedMinutesOptimistic: 5,
  estimatedMinutesLikely: 10,
  estimatedMinutesConservative: 20,
  ...over,
});

const human = (
  order: number,
  deps: number[] = [],
  over: Partial<AdmissionStep> = {}
): AdmissionStep => ({
  ...machine(order, deps),
  executor: "human",
  // R-05 clause 2: a human cut is only economically mapped when its own
  // accepted `fixedMinutes` is present and positive. The default here is the
  // ADMISSIBLE value; the economics spec varies it deliberately.
  fixedMinutes: 30,
  ...over,
});

/** The economics that pass R-05 clause 3, so topology cases isolate topology. */
const payable: AdmissionEconomics = { vaPayoutCents: 4_000, estimatedMinutes: 60 };

/**
 * A minimal admissible plan: 1 → 2(human) → 3. Step 1 is an ancestor of the
 * cut, step 3 a descendant, so nothing crosses it.
 */
const straightLine = (): AdmissionStep[] => [
  machine(1),
  human(2, [1]),
  machine(3, [2]),
];

describe("admitHumanCut — topology (FR-003)", () => {
  it("admits exactly one human step and names it as the cut", () => {
    expect(admitHumanCut(straightLine(), payable)).toEqual({
      admitted: true,
      cutOrder: 2,
    });
  });

  it("refuses a plan with no human step", () => {
    const steps = [machine(1), machine(2, [1])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  it("refuses a plan with two human steps", () => {
    const steps = [machine(1), human(2, [1]), human(3, [2])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  it("refuses three human steps just as flatly as two", () => {
    const steps = [human(1), human(2, [1]), human(3, [2])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  it("refuses an empty plan", () => {
    expect(admitHumanCut([], payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  /**
   * THE LOAD-BEARING TOPOLOGY TEST.
   *
   * Step 3 depends on step 1 only. It is not reachable from the cut, and the
   * cut is not reachable from it: it is a parallel branch that crosses the
   * human step rather than passing through it. Admitting this plan would mean
   * the machine keeps running step 3 while a person is mid-judgment, which is
   * precisely the "stop exactly once" promise being broken. V1 refuses.
   */
  it("refuses a step that is neither ancestor nor descendant of the cut", () => {
    const steps = [machine(1), human(2, [1]), machine(3, [1])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  it("refuses a wholly disconnected step", () => {
    const steps = [machine(1), human(2, [1]), machine(3, [2]), machine(4)];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "unsupported_topology",
    });
  });

  it("admits over a transitive ancestor closure", () => {
    // 1 → 2 → 3(human): step 1 is an ancestor of the cut only transitively.
    const steps = [machine(1), machine(2, [1]), human(3, [2])];
    expect(admitHumanCut(steps, payable)).toEqual({ admitted: true, cutOrder: 3 });
  });

  it("admits over a transitive descendant closure", () => {
    // 1(human) → 2 → 3: step 3 is a descendant of the cut only transitively.
    const steps = [human(1), machine(2, [1]), machine(3, [2])];
    expect(admitHumanCut(steps, payable)).toEqual({ admitted: true, cutOrder: 1 });
  });

  it("admits a diamond that closes through the cut on both sides", () => {
    //   1        6
    //  / \      / \
    // 2   3    /   \
    //  \ /    /     \
    //   4(human) → 5 → 6
    const steps = [
      machine(1),
      machine(2, [1]),
      machine(3, [1]),
      human(4, [2, 3]),
      machine(5, [4]),
      machine(6, [5]),
    ];
    expect(admitHumanCut(steps, payable)).toEqual({ admitted: true, cutOrder: 4 });
  });

  it("admits a lone human step as the whole plan", () => {
    expect(admitHumanCut([human(1)], payable)).toEqual({
      admitted: true,
      cutOrder: 1,
    });
  });
});

describe("admitHumanCut — malformed graphs (cycle safety)", () => {
  /**
   * `resolveTopology` documents that cycles are possible in stored plan data
   * and handles them with an explicit in-progress set (`topology.ts:75-112`).
   * This function must be at least as defensive: it terminates, and it says
   * so in its own vocabulary.
   */
  it("refuses a two-step cycle without hanging", () => {
    const steps = [machine(1, [2]), machine(2, [1]), human(3, [1])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });

  it("refuses a self-dependency", () => {
    const steps = [machine(1, [1]), human(2, [1])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });

  it("refuses a longer cycle that does not include the cut", () => {
    const steps = [human(1), machine(2, [1, 4]), machine(3, [2]), machine(4, [3])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });

  it("refuses a dependency on an order that does not exist", () => {
    const steps = [machine(1), human(2, [1]), machine(3, [2, 99])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });

  it("refuses duplicate orders, which make the graph unaddressable", () => {
    const steps = [machine(1), machine(1), human(2, [1])];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });

  /**
   * Precedence is deliberate and must not drift: a malformed graph is reported
   * as malformed even when it ALSO has the wrong number of human steps. The
   * ancestor/descendant closure is undefined on a graph with a cycle or a
   * dangling edge, so reporting `unsupported_topology` would assert the result
   * of a computation that was never valid. We report what we actually know.
   */
  it("reports malformed before unsupported when a plan is both", () => {
    const steps = [machine(1, [2]), machine(2, [1]), human(3), human(4)];
    expect(admitHumanCut(steps, payable)).toEqual({
      admitted: false,
      cause: "malformed_topology",
    });
  });
});

describe("admitHumanCut — determinism (FR-005)", () => {
  it("returns an identical verdict across repeated evaluation", () => {
    const steps = straightLine();
    const first = admitHumanCut(steps, payable);
    for (let i = 0; i < 25; i += 1) {
      expect(admitHumanCut(steps, payable)).toEqual(first);
    }
  });

  it("does not mutate the steps it is given", () => {
    const steps = straightLine();
    const before = JSON.stringify(steps);
    admitHumanCut(steps, payable);
    expect(JSON.stringify(steps)).toBe(before);
  });

  /**
   * Plan steps arrive from a database read whose ordering nobody has promised.
   * A verdict that depended on row order would be a verdict that changed when
   * an index changed.
   */
  it("returns the same verdict under every input permutation", () => {
    const base = [
      machine(1),
      machine(2, [1]),
      machine(3, [1]),
      human(4, [2, 3]),
      machine(5, [4]),
    ];
    const permutations = [
      [0, 1, 2, 3, 4],
      [4, 3, 2, 1, 0],
      [3, 0, 4, 1, 2],
      [2, 4, 0, 3, 1],
      [1, 2, 4, 0, 3],
    ];
    for (const order of permutations) {
      expect(admitHumanCut(order.map((i) => base[i]), payable)).toEqual({
        admitted: true,
        cutOrder: 4,
      });
    }
  });

  it("returns the same refusal under every input permutation", () => {
    const base = [machine(1), human(2, [1]), machine(3, [1])];
    const permutations = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
    ];
    for (const order of permutations) {
      expect(admitHumanCut(order.map((i) => base[i]), payable)).toEqual({
        admitted: false,
        cause: "unsupported_topology",
      });
    }
  });
});

describe("admitHumanCut — never throws (contracts/runtime-internal.md §1)", () => {
  /**
   * The caller is the compiler, which runs against an accepted contract. An
   * exception there is an outage on a mandate a client has already paid for;
   * a refusal is a mandate that stays fully human, which is exactly how the
   * platform worked before this feature existed.
   */
  const unparseable: unknown[] = [
    null,
    undefined,
    "not a plan",
    42,
    {},
    [null],
    [undefined],
    ["nope"],
    [{ order: 1 }],
    [{ order: "one", executor: "human", dependsOnOrder: [] }],
    [{ order: 1, executor: "wizard", dependsOnOrder: [] }],
    [{ order: 1, executor: "human", dependsOnOrder: null }],
    [{ order: 1, executor: "human", dependsOnOrder: "1" }],
    [{ order: 1, executor: "human", dependsOnOrder: ["1"] }],
    [{ order: Number.NaN, executor: "human", dependsOnOrder: [] }],
    [{ order: 1.5, executor: "human", dependsOnOrder: [] }],
    [{ order: Number.POSITIVE_INFINITY, executor: "human", dependsOnOrder: [] }],
  ];

  it.each(unparseable.map((shape, i) => [i, shape] as const))(
    "refuses unparseable shape #%i instead of throwing",
    (_i, shape) => {
      const call = () =>
        admitHumanCut(shape as AdmissionStep[], payable);
      expect(call).not.toThrow();
      expect(call()).toEqual({ admitted: false, cause: "malformed_topology" });
    }
  );

  it("refuses an unparseable economics shape instead of throwing", () => {
    const bad: unknown[] = [null, undefined, "money", 7, {}, { vaPayoutCents: "40" }];
    for (const economics of bad) {
      const call = () =>
        admitHumanCut(straightLine(), economics as AdmissionEconomics);
      expect(call).not.toThrow();
      expect(call()).toEqual({ admitted: false, cause: "unmapped_economics" });
    }
  });

  it("terminates on a large cyclic graph rather than recursing to death", () => {
    // 2000 steps in one cycle: a stack-based traversal survives, a naive
    // recursive one does not, and neither may hang.
    const steps: AdmissionStep[] = [];
    for (let i = 1; i <= 2000; i += 1) {
      steps.push(machine(i, [i === 1 ? 2000 : i - 1]));
    }
    steps.push(human(2001, [2000]));
    const call = () => admitHumanCut(steps, payable);
    expect(call).not.toThrow();
    expect(call()).toEqual({ admitted: false, cause: "malformed_topology" });
  });

  it("terminates on a large acyclic chain", () => {
    const steps: AdmissionStep[] = [human(1)];
    for (let i = 2; i <= 2000; i += 1) steps.push(machine(i, [i - 1]));
    const call = () => admitHumanCut(steps, payable);
    expect(call).not.toThrow();
    expect(call()).toEqual({ admitted: true, cutOrder: 1 });
  });
});
