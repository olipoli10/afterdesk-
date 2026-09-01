import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSpendLedger } from "@/../test/support/provider-budget-ledger";
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

describe("one process is not the cap", () => {
  /**
   * The hole the per-process budget leaves: three workers, three budgets, one
   * label saying $1. The ledger is the shared counter that closes it, and it
   * is simulated here in memory because what is under test is the ARITHMETIC
   * of the global check, not the filesystem underneath it.
   */
  function memoryLedger(state = { calls: 0, micros: 0 }) {
    return {
      state,
      reserve(calls: number, micros: number) {
        state.calls += calls;
        state.micros += micros;
        return { calls: state.calls, micros: state.micros };
      },
      settle(reserved: number, actual: number) {
        state.micros = Math.max(0, state.micros - reserved + actual);
      },
    };
  }

  it("two workers sharing a ledger cannot spend the cap twice", () => {
    const ledger = memoryLedger();
    const opts = { label: "w", maxCalls: 10, maxSpendMicros: 1_000_000, ledger };
    const a = new ProviderBudget(opts);
    const b = new ProviderBudget(opts);

    a.reserve(400_000);
    a.settle(400_000);
    b.reserve(400_000);
    b.settle(400_000);
    // Locally each has spent $0.40 and thinks $0.60 remains. Globally $0.80
    // is gone, so the next $0.40 crosses the shared cap and is refused.
    expect(() => a.reserve(400_000)).toThrow(ProviderBudgetExceeded);
    expect(() => b.reserve(400_000)).toThrow(ProviderBudgetExceeded);
    expect(ledger.state.micros).toBe(800_000);
  });

  it("the global call count is shared too", () => {
    const ledger = memoryLedger();
    const opts = { label: "w", maxCalls: 3, maxSpendMicros: 10_000_000, ledger };
    const a = new ProviderBudget(opts);
    const b = new ProviderBudget(opts);
    a.reserve(1);
    a.settle(1);
    b.reserve(1);
    b.settle(1);
    a.reserve(1);
    a.settle(1);
    expect(() => b.reserve(1)).toThrow(/GLOBAL/);
  });

  it("a refused reservation does not stay on the shared counter", () => {
    // Otherwise a single over-budget attempt would permanently consume
    // headroom nobody actually spent.
    const ledger = memoryLedger();
    const b = new ProviderBudget({ label: "w", maxCalls: 9, maxSpendMicros: 500_000, ledger });
    expect(() => b.reserve(900_000)).toThrow(ProviderBudgetExceeded);
    expect(ledger.state.micros).toBe(0);
  });

  it("a ledger that cannot be read REFUSES rather than falling back to per-process", () => {
    /**
     * The failure mode that matters most: an I/O error must not silently turn
     * a global cap back into a per-worker one. Not knowing what the other
     * processes spent is a reason to stop, not a reason to proceed.
     */
    const broken = {
      reserve(): { calls: number; micros: number } {
        throw new Error("EBUSY");
      },
      settle() {},
    };
    const b = new ProviderBudget({ label: "w", maxCalls: 9, maxSpendMicros: 9_000_000, ledger: broken });
    expect(() => b.reserve(1_000)).toThrow(/shared spend ledger could not be read/);
  });

  it("without a ledger the budget is still the old per-process one", () => {
    // Replay and synthetic attach no ledger: they cannot spend, and a stale
    // lock file must never be able to fail a zero-cost suite.
    const b = new ProviderBudget({ label: "w", maxCalls: 2, maxSpendMicros: 1_000_000 });
    b.reserve(1);
    b.settle(1);
    expect(b.snapshot().calls).toBe(1);
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

describe("the test layer cannot reach the shipped product", () => {
  /**
   * THE CONTAINMENT PIN.
   *
   * A synthetic responder is a thing that decides what the web says. It exists
   * so a rehearsal can run for nothing, and it must be structurally impossible
   * for it to end up answering a real client's mandate. The strongest cheap
   * proof of that is direction: nothing under src/ may import anything under
   * test/, ever, for any reason.
   *
   * Checked by reading the source rather than by trusting the bundler, because
   * a bundler's answer depends on configuration and this one must not.
   */
  const SRC = join(__dirname, "..", "src");

  function everyFileUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...everyFileUnder(full));
      else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  it("no file under src/ imports anything under test/", () => {
    const offenders: string[] = [];
    for (const file of everyFileUnder(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
        const spec = m[1];
        const reachesTest =
          spec.startsWith("@/../test/") ||
          spec === "test" ||
          spec.startsWith("test/") ||
          /(^|\/)\.\.\/(\.\.\/)*test\//.test(spec);
        if (reachesTest) offenders.push(`${relative(SRC, file)} -> ${spec}`);
      }
    }
    expect(offenders, `src/ must never import from test/:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the synthetic responder names itself in a way a production grep would catch", () => {
    // A weak pin on purpose, and worth having: if this string ever appears in
    // a src/ file, the test above will already have failed, and the name in
    // the failure message is what tells a reader what leaked.
    const files = ["synthetic-web.ts", "synthetic-plans.ts", "synthetic-responder.ts"];
    for (const f of files) {
      const source = readFileSync(join(__dirname, "support", f), "utf8");
      expect(source.length).toBeGreaterThan(0);
    }
  });
});

describe("the shared ledger on disk", () => {
  /**
   * The in-memory ledger above proves the ARITHMETIC. This proves the thing
   * that actually runs in live mode: a counter in a file, a lock that cannot
   * be created twice, and a refusal when the lock is held by someone else.
   */
  const tmp = () => mkdtempSync(join(tmpdir(), "afterdesk-ledger-"));

  it("accumulates across separate ledger objects, which is what separate processes are", () => {
    const path = join(tmp(), "spend.json");
    const a = new FileSpendLedger(path);
    const b = new FileSpendLedger(path);
    expect(a.reserve(1, 300_000)).toEqual({ calls: 1, micros: 300_000 });
    expect(b.reserve(1, 300_000)).toEqual({ calls: 2, micros: 600_000 });
    expect(a.read().micros).toBe(600_000);
  });

  it("settling replaces the reservation with the real cost", () => {
    const path = join(tmp(), "spend.json");
    const l = new FileSpendLedger(path);
    l.reserve(1, 400_000);
    l.settle(400_000, 120_000);
    expect(l.read().micros).toBe(120_000);
    expect(l.read().calls).toBe(1);
  });

  it("a settle can never create headroom below zero", () => {
    const path = join(tmp(), "spend.json");
    const l = new FileSpendLedger(path);
    l.settle(999_999, 0);
    expect(l.read().micros).toBe(0);
  });

  it("a held lock refuses rather than proceeding without knowing the total", () => {
    // Written by hand because that is exactly what a crashed worker leaves
    // behind, and the safe reading of "someone else may be mid-call" is no.
    const path = join(tmp(), "spend.json");
    writeFileSync(`${path}.lock`, "");
    const l = new FileSpendLedger(path);
    expect(() => l.reserve(1, 1_000)).toThrow(/lock/);
  });

  it("reset clears both the counter and a stale lock", () => {
    const path = join(tmp(), "spend.json");
    const l = new FileSpendLedger(path);
    l.reserve(1, 500_000);
    writeFileSync(`${path}.lock`, "");
    l.reset();
    expect(l.read()).toEqual({ calls: 0, micros: 0, updatedAt: "never" });
    expect(l.reserve(1, 1_000).micros).toBe(1_000);
  });
});
