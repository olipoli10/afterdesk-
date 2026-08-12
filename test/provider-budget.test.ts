import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CALLS,
  DEFAULT_MAX_SPEND_MICROS,
  LiveProviderForbidden,
  ProviderBudget,
  ProviderBudgetExceeded,
  resolveMode,
} from "@/../test/support/provider-budget";
import { fixtureKey, stageOf } from "@/../test/support/provider-replay";

/**
 * THE FIREWALL'S OWN TESTS. They exist because the thing being protected is
 * money: a test suite spent twenty dollars in an afternoon with nothing able
 * to stop it. Every assertion below is a way that must never work again.
 */

describe("mode resolution — spending requires typing the opt-in out", () => {
  it("an empty environment is replay, which costs nothing", () => {
    expect(resolveMode({})).toBe("replay");
  });

  it("an unrecognised mode is replay, not a guess", () => {
    expect(resolveMode({ TEST_PROVIDER_MODE: "LIVE!" })).toBe("replay");
    expect(resolveMode({ TEST_PROVIDER_MODE: "" })).toBe("replay");
    expect(resolveMode({ TEST_PROVIDER_MODE: "record" })).toBe("replay");
  });

  it("synthetic needs no permission — it cannot reach a provider", () => {
    expect(resolveMode({ TEST_PROVIDER_MODE: "synthetic" })).toBe("synthetic");
  });

  it("asking for live WITHOUT the opt-in throws instead of quietly downgrading", () => {
    // Silently falling back to replay would be worse than it sounds: the run
    // would look like it proved something live and would not have.
    expect(() => resolveMode({ TEST_PROVIDER_MODE: "live" })).toThrow(LiveProviderForbidden);
  });

  it("the opt-in ALONE does not spend — a mode is still required", () => {
    expect(resolveMode({ ALLOW_LIVE_PROVIDER_TESTS: "true" })).toBe("replay");
  });

  it("live needs both, spelled exactly", () => {
    expect(resolveMode({ TEST_PROVIDER_MODE: "live", ALLOW_LIVE_PROVIDER_TESTS: "true" })).toBe("live");
    expect(() =>
      resolveMode({ TEST_PROVIDER_MODE: "live", ALLOW_LIVE_PROVIDER_TESTS: "1" })
    ).toThrow(LiveProviderForbidden);
    expect(() =>
      resolveMode({ TEST_PROVIDER_MODE: "live", ALLOW_LIVE_PROVIDER_TESTS: "yes" })
    ).toThrow(LiveProviderForbidden);
  });
});

describe("the caps default low, so forgetting to set them is cheap", () => {
  it("five calls and one dollar", () => {
    const b = new ProviderBudget({ label: "t" }, {});
    expect(b.maxCalls).toBe(DEFAULT_MAX_CALLS);
    expect(b.maxSpendMicros).toBe(DEFAULT_MAX_SPEND_MICROS);
    expect(DEFAULT_MAX_SPEND_MICROS).toBe(1_000_000);
  });

  it("a nonsense cap falls back to the default rather than to infinity", () => {
    for (const bad of ["", "0", "-5", "abc", "NaN"]) {
      const b = new ProviderBudget({ label: "t" }, { TEST_PROVIDER_MAX_CALLS: bad, TEST_PROVIDER_MAX_SPEND_MICROS: bad });
      expect(b.maxCalls, bad).toBe(DEFAULT_MAX_CALLS);
      expect(b.maxSpendMicros, bad).toBe(DEFAULT_MAX_SPEND_MICROS);
    }
  });

  it("the environment can tighten or widen them deliberately", () => {
    const b = new ProviderBudget(
      { label: "t" },
      { TEST_PROVIDER_MAX_CALLS: "2", TEST_PROVIDER_MAX_SPEND_MICROS: "250000" }
    );
    expect(b.maxCalls).toBe(2);
    expect(b.maxSpendMicros).toBe(250_000);
  });
});

describe("the caps actually stop a run", () => {
  it("the call cap throws on the call that would exceed it", () => {
    const b = new ProviderBudget({ label: "t", maxCalls: 3, maxSpendMicros: 10_000_000 });
    b.reserve(1);
    b.reserve(1);
    b.reserve(1);
    expect(() => b.reserve(1)).toThrow(ProviderBudgetExceeded);
  });

  it("the spend cap is checked BEFORE the call, on a conservative reserve", () => {
    // Reserve-then-settle, exactly like the production budget engine: you
    // cannot un-spend a call you already made, so the estimate is what gates.
    const b = new ProviderBudget({ label: "t", maxCalls: 99, maxSpendMicros: 1_000_000 });
    b.reserve(400_000);
    b.settle(120_000);
    b.reserve(400_000);
    b.settle(120_000);
    expect(b.snapshot().spentMicros).toBe(240_000);
    // 240k spent + a 800k reserve would cross the 1M cap.
    expect(() => b.reserve(800_000)).toThrow(ProviderBudgetExceeded);
  });

  it("a single enormous call cannot slip through under a small spend", () => {
    const b = new ProviderBudget({ label: "t", maxCalls: 99, maxSpendMicros: 100_000 });
    expect(() => b.reserve(400_000)).toThrow(ProviderBudgetExceeded);
    expect(b.snapshot().calls).toBe(0);
  });

  it("the runaway that actually happened is now impossible", () => {
    // 70 planner calls at roughly $0.12 each is what cost nine dollars.
    const b = new ProviderBudget({ label: "corpus" }, {});
    let made = 0;
    expect(() => {
      for (let i = 0; i < 70; i++) {
        b.reserve(120_000);
        b.settle(120_000);
        made++;
      }
    }).toThrow(ProviderBudgetExceeded);
    expect(made).toBeLessThanOrEqual(DEFAULT_MAX_CALLS);
    expect(b.snapshot().spentMicros).toBeLessThanOrEqual(DEFAULT_MAX_SPEND_MICROS);
  });
});

describe("the operator is told before, and during", () => {
  it("announce states the cap and the worst case ahead of the run", () => {
    const b = new ProviderBudget({ label: "l3" }, { TEST_PROVIDER_MAX_CALLS: "5", TEST_PROVIDER_MAX_SPEND_MICROS: "1000000" });
    const line = b.announce(12);
    expect(line).toContain("provider budget: $1.00");
    expect(line).toContain("5 calls");
    expect(line).toContain("Planned: 12 calls");
  });

  it("status reads like the console line the order asked for", () => {
    const b = new ProviderBudget({ label: "t", maxCalls: 5, maxSpendMicros: 1_000_000 });
    b.reserve(200_000);
    b.settle(370_000);
    expect(b.status()).toBe("Spent: $0.37 | Calls: 1/5 | Remaining: $0.63");
  });
});

describe("fixture addressing — a changed question cannot replay an old answer", () => {
  const base = {
    model: "claude-opus-5",
    max_tokens: 16_000,
    system: [{ type: "text", text: "You are the execution planner for AfterDesk, ..." }],
    messages: [{ role: "user", content: "BRIEF\nTitle: x" }],
    output_config: { format: { type: "json_schema", schema: { a: 1 } } },
  };

  it("the same request hashes the same way, run after run", () => {
    expect(fixtureKey({ ...base })).toBe(fixtureKey({ ...base }));
  });

  it("a changed prompt, model, schema or brief changes the key", () => {
    expect(fixtureKey({ ...base, model: "claude-sonnet-5" })).not.toBe(fixtureKey(base));
    expect(fixtureKey({ ...base, messages: [{ role: "user", content: "BRIEF\nTitle: y" }] })).not.toBe(
      fixtureKey(base)
    );
    expect(
      fixtureKey({ ...base, output_config: { format: { type: "json_schema", schema: { a: 2 } } } })
    ).not.toBe(fixtureKey(base));
    expect(
      fixtureKey({ ...base, system: [{ type: "text", text: "You are the execution planner for AfterDesk, EDITED" }] })
    ).not.toBe(fixtureKey(base));
  });

  it("stages are recognised from the request itself", () => {
    expect(stageOf(base)).toBe("planning");
    expect(stageOf({ ...base, system: [{ type: "text", text: "You are the task classifier for AfterDesk." }] })).toBe(
      "classification"
    );
    expect(stageOf({ ...base, system: "", tools: [{ type: "web_fetch_20260209", name: "web_fetch" }] })).toBe("fetch");
  });
});
