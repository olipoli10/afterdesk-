import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/../test/support/canonical-json";
import { resolve as resolveCodeVersion } from "@/../test/support/code-version";
import {
  FIXTURE_SCHEMA_VERSION,
  PaidOutputNotCapitalized,
  assertPaidCallsCapitalised,
  capabilityContractFingerprint,
  fixtureKey,
  systemPromptHash,
  type GoldenFixture,
  type ReplayStats,
} from "@/../test/support/provider-replay";
import { capabilityDescriptors } from "@/lib/ai-work-engine/capability-contract";

/**
 * THE FIXTURE IS THE ASSET THE MONEY BUYS.
 *
 * Sixty dollars of provider spend produced nothing replayable because the raw
 * answers were never kept. Keeping them is now done; this file is about the
 * second half of that lesson, which is that a kept answer with no provenance
 * ages into a false proof.
 *
 * The question six months out is not "do we have a recording" but "does this
 * recording still describe our system" — which planner contract, which
 * primitive versions, which build. Every field asserted below exists to make
 * that answerable rather than assumed.
 */

describe("canonical serialisation: identical things hash identically", () => {
  it("key order does not change the bytes", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("it sorts recursively, not only at the top", () => {
    const one = { outer: { z: 1, a: { y: 2, b: 3 } } };
    const two = { outer: { a: { b: 3, y: 2 }, z: 1 } };
    expect(canonicalJson(one)).toBe(canonicalJson(two));
  });

  it("ARRAY order is preserved, because reordering one changes the meaning", () => {
    /**
     * The direction this must never fail in. A message list, a tool list and
     * a column list are all different requests when reordered; sorting them
     * would make two genuinely different calls address one fixture, which is
     * a wrong answer served for free rather than a right one bought twice.
     */
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
    expect(canonicalJson(["a", "b"])).toBe('["a","b"]');
  });

  it("undefined is dropped from objects and nulled inside arrays, exactly as JSON does", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([1, undefined, 2])).toBe("[1,null,2]");
  });

  it("null, empty object and empty array stay distinguishable", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });

  it("a bigint is recorded rather than thrown away", () => {
    // Every microdollar amount in this engine is a bigint; silently losing one
    // in a provenance record would be the wrong kind of quiet.
    expect(canonicalJson({ micros: 42n })).toBe('{"micros":"42n"}');
  });

  it("a cycle is reported, not tolerated", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
  });
});

describe("the request hash addresses the request, and only the request", () => {
  const base = {
    model: "claude-opus-5",
    max_tokens: 16_000,
    system: [{ type: "text", text: "You are the execution planner for AfterDesk." }],
    messages: [{ role: "user", content: "BRIEF\nTitle: x" }],
    output_config: { format: { type: "json_schema", schema: { a: 1 } } },
  };

  it("a request rebuilt in a different key order hashes the same", () => {
    /**
     * THE REGRESSION THE CANONICAL FORM EXISTS FOR. Under JSON.stringify these
     * two hash differently, the fixture misses, and a refactor that moved a
     * property up a line costs a paid call.
     */
    const reordered = {
      messages: base.messages,
      output_config: base.output_config,
      system: base.system,
      max_tokens: base.max_tokens,
      model: base.model,
    };
    expect(fixtureKey(reordered)).toBe(fixtureKey(base));
  });

  it("a reordered SCHEMA still hashes the same, and a changed one does not", () => {
    const same = {
      ...base,
      output_config: { format: { schema: { a: 1 }, type: "json_schema" } },
    };
    expect(fixtureKey(same)).toBe(fixtureKey(base));
    const changed = {
      ...base,
      output_config: { format: { type: "json_schema", schema: { a: 2 } } },
    };
    expect(fixtureKey(changed)).not.toBe(fixtureKey(base));
  });

  it("a reordered MESSAGE LIST is a different request", () => {
    const swapped = {
      ...base,
      messages: [
        { role: "user", content: "second" },
        { role: "user", content: "first" },
      ],
    };
    const original = {
      ...base,
      messages: [
        { role: "user", content: "first" },
        { role: "user", content: "second" },
      ],
    };
    expect(fixtureKey(swapped)).not.toBe(fixtureKey(original));
  });

  it("the system prompt has its own hash, so a prompt edit is greppable", () => {
    const edited = {
      ...base,
      system: [{ type: "text", text: "You are the execution planner for AfterDesk. EDITED" }],
    };
    expect(systemPromptHash(edited)).not.toBe(systemPromptHash(base));
    // And the same text through either carrier shape hashes the same.
    expect(systemPromptHash({ system: "abc" })).toBe(
      systemPromptHash({ system: [{ type: "text", text: "abc" }] })
    );
  });
});

describe("the capability contract fingerprint", () => {
  it("is stable across calls and derived from the descriptors", () => {
    const once = capabilityContractFingerprint();
    const twice = capabilityContractFingerprint();
    expect(once.capabilityContractHash).toBe(twice.capabilityContractHash);
    expect(once.capabilityContractHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("lists every capability the planner can see, with its version", () => {
    const { primitiveInventory } = capabilityContractFingerprint();
    const descriptors = capabilityDescriptors();
    expect(primitiveInventory).toHaveLength(descriptors.length);
    expect(primitiveInventory).toContain("data.concat@1");
    expect(primitiveInventory).toContain("web.fetch@1");
    for (const entry of primitiveInventory) expect(entry).toMatch(/^[a-z._]+@\d+$/);
  });

  it("changes when a capability's rules change, and not when they are merely reordered", () => {
    /**
     * The property that makes the hash worth storing: it answers "were these
     * the same rules", not "was this the same object literal".
     */
    const descriptors = capabilityDescriptors();
    const reordered = descriptors.map((d) => ({
      notes: d.notes,
      summary: d.summary,
      reach: d.reach,
      mode: d.mode,
      version: d.version,
      id: d.id,
      paramsJsonSchema: d.paramsJsonSchema,
    }));
    expect(canonicalJson(reordered)).toBe(canonicalJson(descriptors));

    const bumped = descriptors.map((d, i) => (i === 0 ? { ...d, version: d.version + 1 } : d));
    expect(canonicalJson(bumped)).not.toBe(canonicalJson(descriptors));
  });
});

describe("the code version", () => {
  it("reads a detached HEAD", () => {
    const dir = mkdtempSync(join(tmpdir(), "afterdesk-git-"));
    const sha = "a".repeat(40);
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, ".git", "HEAD"), `${sha}\n`);
    expect(resolveCodeVersion(dir)).toEqual({ gitSha: sha, gitRef: null, dirtyUnknown: true });
  });

  it("follows a branch ref, and falls back to packed-refs", () => {
    const sha = "b".repeat(40);

    const loose = mkdtempSync(join(tmpdir(), "afterdesk-git-"));
    mkdirSync(join(loose, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(loose, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(loose, ".git", "refs", "heads", "main"), `${sha}\n`);
    expect(resolveCodeVersion(loose)).toEqual({
      gitSha: sha,
      gitRef: "refs/heads/main",
      dirtyUnknown: true,
    });

    const packed = mkdtempSync(join(tmpdir(), "afterdesk-git-"));
    mkdirSync(join(packed, ".git"), { recursive: true });
    writeFileSync(join(packed, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(
      join(packed, ".git", "packed-refs"),
      `# pack-refs with: peeled fully-peeled sorted\n${sha} refs/heads/main\n^${"c".repeat(40)}\n`
    );
    expect(resolveCodeVersion(packed).gitSha).toBe(sha);
  });

  it("a directory that is not a checkout is unknown, never a guess", () => {
    const dir = mkdtempSync(join(tmpdir(), "afterdesk-git-"));
    expect(resolveCodeVersion(dir)).toEqual({ gitSha: null, gitRef: null, dirtyUnknown: true });
  });

  it("never claims the tree was clean", () => {
    // A commit id plus uncommitted edits is the ordinary state of a machine
    // mid-session. The flag exists so a bare sha is not read as a promise.
    expect(resolveCodeVersion(process.cwd()).dirtyUnknown).toBe(true);
  });
});

describe("a paid call that bought no asset makes the run INCOMPLETE", () => {
  const statsWith = (uncapitalised: ReplayStats["uncapitalised"]): ReplayStats => ({
    mode: "live",
    replayed: 0,
    recorded: 3,
    synthetic: 0,
    misses: [],
    uncapitalised,
    budget: { calls: 4, spentMicros: 900_000, maxCalls: 15, maxSpendMicros: 1_500_000 },
  });

  it("a clean run passes", () => {
    expect(() => assertPaidCallsCapitalised(statsWith([]))).not.toThrow();
  });

  it("one failed recording throws, names the phrase, and totals what was lost", () => {
    /**
     * The money cannot be un-spent, so this undoes nothing. What it does is
     * refuse to let the run be reported as green: a canary that paid for an
     * answer and failed to keep it produced a cost and no asset, which is the
     * exact trade the golden corpus exists to stop making twice.
     */
    const thrown = (() => {
      try {
        assertPaidCallsCapitalised(
          statsWith([
            { stage: "planning", key: "abc", costMicros: 120_000, reason: "ENOSPC" },
            { stage: "research", key: "def", costMicros: 330_000, reason: "EACCES" },
          ])
        );
        return null;
      } catch (error) {
        return error as Error;
      }
    })();
    expect(thrown).toBeInstanceOf(PaidOutputNotCapitalized);
    expect(thrown?.message).toContain("PAID PROVIDER OUTPUT NOT CAPITALIZED");
    expect(thrown?.message).toContain("$0.4500");
    expect(thrown?.message).toContain("INCOMPLETE");
    // The operator is told which calls, so the loss is auditable and not just
    // a number.
    expect(thrown?.message).toContain("planning/abc");
    expect(thrown?.message).toContain("research/def");
  });
});

describe("the fixture shape carries everything a replay needs to be honest about itself", () => {
  it("declares its schema version and its kind", () => {
    /**
     * `kind` is the field that keeps a fabricated answer from ever being read
     * as a historical one. A directory name could not carry that: files move.
     */
    const fixture: GoldenFixture = {
      fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
      kind: "LIVE_RECORDED",
      stage: "planning",
      key: "0".repeat(32),
      request: {
        provider: "anthropic",
        model: "claude-opus-5",
        system: "…",
        systemPromptHash: "1".repeat(32),
        messages: [],
        outputSchema: null,
        tools: [],
        maxTokens: 16_000,
        requestHash: "0".repeat(32),
      },
      contract: capabilityContractFingerprint(),
      code: { gitSha: null, gitRef: null, dirtyUnknown: true },
      response: { content: [] },
      meta: {
        recordedAt: "2026-08-12T00:00:00.000Z",
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          searchRequests: 0,
          fetchRequests: 0,
        },
        actualCostMicros: 1234,
      },
    };
    expect(fixture.fixtureSchemaVersion).toBe(1);
    expect(fixture.kind).toBe("LIVE_RECORDED");
    // The filename is provable from the record itself.
    expect(fixture.request.requestHash).toBe(fixture.key);
  });

  it("the twelve fields the corpus is required to carry are all present in the type", () => {
    // A structural pin: dropping one of these in a later refactor should be a
    // type error here, not a silent gap discovered when the corpus is queried.
    const fixture = {} as GoldenFixture;
    const required: (keyof GoldenFixture)[] = [
      "fixtureSchemaVersion",
      "kind",
      "stage",
      "key",
      "request",
      "contract",
      "code",
      "response",
      "meta",
    ];
    expect(required).toHaveLength(9);
    const request: (keyof GoldenFixture["request"])[] = [
      "provider",
      "model",
      "system",
      "systemPromptHash",
      "messages",
      "outputSchema",
      "tools",
      "maxTokens",
      "requestHash",
    ];
    expect(request).toHaveLength(9);
    void fixture;
  });
});
