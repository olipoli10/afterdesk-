import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * THE ZERO-COST PROVIDER LAYER.
 *
 * Every paid call AfterDesk makes goes through one method:
 * `new Anthropic(...).messages.create(params)`. This module stands in front of
 * it. In `replay` it answers from a recorded fixture and costs nothing; in
 * `synthetic` it answers from a response the test wrote itself; in `live` it
 * calls the real provider under the firewall and RECORDS what it gets, so the
 * money spent buys a fixture every later run reuses for free.
 *
 * ── WHY THE KEY IS THE REQUEST ──
 *
 * A fixture is addressed by a hash of the exact request: model, system text,
 * messages, output schema, tools. That makes replay honest — change the
 * prompt or the schema and the key changes, the fixture misses, and the suite
 * says so loudly instead of quietly replaying an answer to a question we no
 * longer ask. It is also stable: AfterDesk's own discipline keeps database
 * ids, timestamps and file ids out of every prompt (the attachment manifest
 * sends `file_1`, never a cuid), so the same scenario hashes the same way on
 * every machine and every run.
 *
 * ── A MISS IS A FAILURE, NEVER A CALL ──
 *
 * The one rule that makes this safe: in replay, a missing fixture throws. It
 * does not "fall back to live". That is the difference between a test layer
 * that saves money and one that silently spends it the first time someone
 * edits a prompt.
 */

import {
  ProviderBudget,
  resolveMode,
  type BudgetEnv,
  type TestProviderMode,
} from "./provider-budget";
import { DEFAULT_LEDGER_PATH, FileSpendLedger } from "./provider-budget-ledger";
import { canonicalJson } from "./canonical-json";
import { codeVersion } from "./code-version";
import { capabilityDescriptors } from "@/lib/ai-work-engine/capability-contract";

export const GOLDEN_ROOT = join(process.cwd(), "test", "golden");

/**
 * Bumped when the fixture SHAPE changes, so a reader six months from now can
 * tell a field's absence from a field that never existed. Version 1 is the
 * first shape written after the corpus was emptied, which is why there is no
 * migration path below it: there is nothing to migrate.
 */
export const FIXTURE_SCHEMA_VERSION = 1;

/**
 * WHAT A FIXTURE IS, WHICH IS NOT THE SAME AS WHERE IT CAME FROM.
 *
 * `LIVE_RECORDED` was paid for and is evidence about a real provider.
 * `SYNTHETIC` was fabricated by the test layer and is evidence about nothing
 * except the harness. Keeping them in one enum on one required field is what
 * makes it impossible to present the second as the first — which is the whole
 * reason the distinction is spelled in capitals rather than left to a folder.
 */
export type FixtureKind = "LIVE_RECORDED" | "SYNTHETIC";

export type GoldenFixture = {
  fixtureSchemaVersion: number;
  kind: FixtureKind;
  /** Which stage produced it, for humans reading the directory. */
  stage: string;
  /** The addressing hash: sha256 over the canonical request. */
  key: string;
  /** The request, stored for provenance and for regenerating the key. */
  request: {
    provider: string;
    model: string;
    /** Kept in full: a hash proves sameness, only the text explains it. */
    system: string;
    /** sha256 of the system text alone, so a prompt edit is greppable. */
    systemPromptHash: string;
    messages: unknown;
    outputSchema: unknown;
    tools: string[];
    maxTokens: number | null;
    /** sha256 over the canonical whole request. Equal to `key`. */
    requestHash: string;
  };
  /**
   * THE RULES THE PLANNER WAS PLAYING BY, so that "does this fixture still
   * describe our system" is answerable rather than assumed.
   *
   * The question this exists for is six months out: a recorded answer replayed
   * against a rebuilt planner still passes, and without these two fields it
   * reads as a stronger proof than it is.
   */
  contract: {
    /** sha256 over the canonical capability descriptors. */
    capabilityContractHash: string;
    /** `id@version` for every capability the planner could see, in order. */
    primitiveInventory: string[];
  };
  /** Which build of AfterDesk made the call. */
  code: {
    gitSha: string | null;
    gitRef: string | null;
    /** Always true: a commit id does not prove a clean working tree. */
    dirtyUnknown: boolean;
  };
  /** The provider's answer, as the SDK returned it. */
  response: unknown;
  meta: {
    recordedAt: string;
    /** As the provider reported it. Absent counters are recorded as 0. */
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      searchRequests: number;
      fetchRequests: number;
    };
    /** What this call actually cost, computed from the usage above. */
    actualCostMicros: number;
    note?: string;
  };
};

/** Which stage a request belongs to, inferred from its own shape. */
export function stageOf(params: Record<string, unknown>): string {
  const sys = systemTextOf(params);
  if (sys.includes("task classifier for AfterDesk")) return "classification";
  if (sys.includes("execution planner for AfterDesk")) return "planning";
  if (sys.includes("critique") || sys.includes("adversarial")) return "critique";
  // Recognised by its own system text, because it declares no tool at all —
  // deliberately, so the model reading untrusted web prose has no verb.
  if (sys.includes("convert gathered research into structured rows")) return "extract";
  const tools = (params.tools as { type?: string }[] | undefined) ?? [];
  if (tools.some((t) => String(t.type).startsWith("web_search"))) return "research";
  if (tools.some((t) => String(t.type).startsWith("web_fetch"))) return "fetch";
  return "other";
}

function systemTextOf(params: Record<string, unknown>): string {
  const sys = params.system;
  if (typeof sys === "string") return sys;
  if (Array.isArray(sys)) {
    return sys.map((b) => (typeof b === "object" && b && "text" in b ? String(b.text) : "")).join("\n");
  }
  return "";
}

/** The identity of a request, before it is hashed. One definition, one use. */
function canonicalRequest(params: Record<string, unknown>): {
  model: string;
  system: string;
  messages: unknown;
  schema: unknown;
  tools: string[];
  max_tokens: number | null;
} {
  const outputConfig = params.output_config as { format?: { schema?: unknown } } | undefined;
  return {
    model: String(params.model),
    system: systemTextOf(params),
    messages: params.messages,
    schema: outputConfig?.format?.schema ?? null,
    tools: ((params.tools as { type?: string; name?: string }[] | undefined) ?? []).map(
      (t) => `${t.type}:${t.name}`
    ),
    max_tokens: typeof params.max_tokens === "number" ? params.max_tokens : null,
  };
}

/**
 * The addressing hash. Deliberately covers everything that changes the
 * ANSWER and nothing that does not: `max_tokens` and `cache_control` are
 * included because they are part of the request we would replay, while
 * transport-only fields are not present in params at all.
 *
 * Hashed over a CANONICAL serialisation rather than JSON.stringify. Key order
 * is an accident of how an object was built — a spread here, a literal there —
 * and letting it reach the hash means two identical requests can address two
 * different fixtures. A false miss is a paid call bought by a refactor.
 */
export function fixtureKey(params: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(canonicalRequest(params))).digest("hex").slice(0, 32);
}

/** sha256 of the system text alone, so a prompt edit is greppable. */
export function systemPromptHash(params: Record<string, unknown>): string {
  return createHash("sha256").update(systemTextOf(params)).digest("hex").slice(0, 32);
}

/**
 * THE PLANNER'S RULES, HASHED. Computed once: the descriptors are frozen at
 * module load, so a per-call hash would be the same work repeated per dollar.
 *
 * Over the DESCRIPTORS rather than the rendered text, because the descriptors
 * are what the contract IS — ids, versions, modes, reach, params schemas — and
 * the rendering is one presentation of them. A whitespace change in the
 * renderer must not read as a change of rules.
 */
let contractFingerprint: { capabilityContractHash: string; primitiveInventory: string[] } | null =
  null;

export function capabilityContractFingerprint(): {
  capabilityContractHash: string;
  primitiveInventory: string[];
} {
  if (contractFingerprint !== null) return contractFingerprint;
  const descriptors = capabilityDescriptors();
  contractFingerprint = {
    capabilityContractHash: createHash("sha256")
      .update(canonicalJson(descriptors))
      .digest("hex")
      .slice(0, 32),
    primitiveInventory: descriptors.map((d) => `${d.id}@${d.version}`),
  };
  return contractFingerprint;
}

function fixturePath(stage: string, key: string): string {
  return join(GOLDEN_ROOT, stage, `${key}.json`);
}

export function readFixture(stage: string, key: string): GoldenFixture | null {
  const p = fixturePath(stage, key);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as GoldenFixture;
}

export function writeFixture(f: GoldenFixture): string {
  const p = fixturePath(f.stage, f.key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(f, null, 1));
  return p;
}

export function goldenInventory(): { stage: string; count: number }[] {
  if (!existsSync(GOLDEN_ROOT)) return [];
  return readdirSync(GOLDEN_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      stage: d.name,
      count: readdirSync(join(GOLDEN_ROOT, d.name)).filter((f) => f.endsWith(".json")).length,
    }));
}

export class ReplayMiss extends Error {
  readonly stage: string;
  readonly key: string;
  constructor(stage: string, key: string, hint: string) {
    super(
      `[provider-replay] no fixture for ${stage}/${key}.\n` +
        `  This request has never been recorded, and replay mode does NOT fall back to a paid call.\n` +
        `  ${hint}\n` +
        `  To record it: TEST_PROVIDER_MODE=live ALLOW_LIVE_PROVIDER_TESTS=true (inside the budget caps).`
    );
    this.name = "ReplayMiss";
    this.stage = stage;
    this.key = key;
  }
}

export type ReplayStats = {
  mode: TestProviderMode;
  replayed: number;
  recorded: number;
  synthetic: number;
  misses: { stage: string; key: string }[];
  /**
   * Paid calls whose fixture could not be written. Money left the account and
   * bought nothing reusable — the exact failure that emptied the first golden
   * corpus — so it is surfaced rather than logged and forgotten.
   */
  uncapitalised: { stage: string; key: string; costMicros: number; reason: string }[];
  budget: ReturnType<ProviderBudget["snapshot"]>;
};

export class PaidOutputNotCapitalized extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidOutputNotCapitalized";
  }
}

/**
 * A RUN WITH AN UNCAPITALISED PAID CALL IS NOT A SUCCESSFUL RUN.
 *
 * The money cannot be un-spent, so this cannot undo anything. What it can do
 * is refuse to let the run be reported as green: a canary that paid for an
 * answer and failed to keep it has produced a cost and no asset, which is the
 * exact trade the whole golden corpus exists to stop making twice.
 *
 * Called at the END of a live harness, never inside the call itself — throwing
 * mid-call would fail the step, the runner would retry it, and the retry would
 * spend again. The loud line is printed at the moment it happens; this is the
 * verdict.
 */
export function assertPaidCallsCapitalised(from?: ReplayStats): void {
  const failures = (from ?? stats)?.uncapitalised ?? [];
  if (failures.length === 0) return;
  const lost = failures.reduce((n, f) => n + f.costMicros, 0);
  throw new PaidOutputNotCapitalized(
    `PAID PROVIDER OUTPUT NOT CAPITALIZED: ${failures.length} call(s) worth ` +
      `$${(lost / 1e6).toFixed(4)} were paid for and could not be written to the golden ` +
      `corpus, so they must be paid for again to be replayed. This run is INCOMPLETE ` +
      `whatever else it produced.\n` +
      failures.map((f) => `  - ${f.stage}/${f.key}: ${f.reason}`).join("\n")
  );
}

type SyntheticResponder = (params: Record<string, unknown>, stage: string) => unknown | null;

/**
 * The one mutable piece: a harness in `synthetic` mode registers a responder
 * that builds the model output it wants. Kept module-level because the SDK
 * mock factory cannot reach a test's closure.
 */
let syntheticResponder: SyntheticResponder | null = null;
export function setSyntheticResponder(fn: SyntheticResponder | null): void {
  syntheticResponder = fn;
}

let stats: ReplayStats | null = null;
let budget: ProviderBudget | null = null;

export function providerStats(): ReplayStats {
  if (!stats) throw new Error("[provider-replay] not installed");
  return { ...stats, budget: (budget as ProviderBudget).snapshot() };
}

/**
 * Build the object `vi.mock("@anthropic-ai/sdk", ...)` should return.
 * Call it from a harness like:
 *
 *   vi.mock("@anthropic-ai/sdk", async () =>
 *     (await import("../test/support/provider-replay")).anthropicMockFactory());
 */
export function anthropicMockFactory(env: BudgetEnv = process.env as BudgetEnv) {
  const mode = resolveMode(env);
  /**
   * The shared ledger is attached ONLY in live mode. Replay and synthetic
   * cannot spend, so giving them a cross-process lock would buy nothing and
   * would make a $0 suite fail on a stale lock file.
   */
  const ledger =
    mode === "live"
      ? new FileSpendLedger(env.TEST_PROVIDER_LEDGER_PATH ?? DEFAULT_LEDGER_PATH)
      : undefined;
  budget = new ProviderBudget({ label: `provider:${mode}`, ledger }, env);
  stats = {
    mode,
    replayed: 0,
    recorded: 0,
    synthetic: 0,
    misses: [],
    uncapitalised: [],
    budget: budget.snapshot(),
  };

  class ReplayAnthropic {
    messages = {
      create: async (params: Record<string, unknown>) => {
        const stage = stageOf(params);
        const key = fixtureKey(params);

        if (mode === "synthetic") {
          const built = syntheticResponder?.(params, stage) ?? null;
          if (built === null) {
            throw new Error(
              `[provider-replay] synthetic mode has no responder for stage "${stage}". ` +
                `Register one with setSyntheticResponder().`
            );
          }
          (stats as ReplayStats).synthetic += 1;
          return built;
        }

        const fixture = readFixture(stage, key);
        if (fixture) {
          (stats as ReplayStats).replayed += 1;
          return fixture.response;
        }

        if (mode !== "live") {
          (stats as ReplayStats).misses.push({ stage, key });
          throw new ReplayMiss(
            stage,
            key,
            `model=${String(params.model)} — the request text changed, or this scenario is new.`
          );
        }

        // ── live: the only branch that can spend, and it is fenced ──
        (budget as ProviderBudget).reserve();
        const actual = (await import("@anthropic-ai/sdk")) as unknown as {
          default: new (o: unknown) => { messages: { create: (p: unknown) => Promise<unknown> } };
        };
        const RealAnthropic = actual.default;
        const client = new RealAnthropic({ timeout: 120_000, maxRetries: 1 });
        const response = (await client.messages.create(params)) as {
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
            server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
          };
        };
        const usage = {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
          searchRequests: response.usage?.server_tool_use?.web_search_requests ?? 0,
          fetchRequests: response.usage?.server_tool_use?.web_fetch_requests ?? 0,
        };
        const { costMicrosFor, searchCostMicros, fetchCostMicros } = await import(
          "@/lib/ai-work-engine/tool-cost"
        );
        /**
         * The SAME arithmetic the run's own accounting uses, tool calls
         * included. Counting only tokens would understate a research call by
         * the whole search bill, and the fixture would then record a cost
         * cheaper than the one the budget settled.
         */
        const costMicros =
          costMicrosFor(String(params.model), usage) +
          searchCostMicros(usage.searchRequests) +
          fetchCostMicros(usage.fetchRequests);
        (budget as ProviderBudget).settle(costMicros);
        /**
         * THE RECORDING IS PART OF THE CALL, NOT AN AFTERTHOUGHT.
         *
         * A paid response that is not written down has to be paid for again,
         * and that is precisely how the first golden corpus ended up empty:
         * money was spent, the parsed projection was kept, the raw answer was
         * not. So a failed write is counted and surfaced in the stats the
         * harness asserts on, rather than swallowed into a log nobody reads.
         */
        try {
          const contract = capabilityContractFingerprint();
          const request = canonicalRequest(params);
          writeFixture({
            fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
            kind: "LIVE_RECORDED",
            stage,
            key,
            request: {
              provider: "anthropic",
              model: request.model,
              system: request.system,
              systemPromptHash: systemPromptHash(params),
              messages: request.messages,
              outputSchema: request.schema,
              tools: request.tools,
              maxTokens: request.max_tokens,
              // Equal to `key` by construction, and stored anyway: a fixture
              // read on its own must be able to prove its own filename.
              requestHash: key,
            },
            contract,
            code: codeVersion(),
            response,
            meta: {
              recordedAt: new Date().toISOString(),
              usage,
              actualCostMicros: costMicros,
            },
          });
          (stats as ReplayStats).recorded += 1;
        } catch (error) {
          (stats as ReplayStats).uncapitalised.push({
            stage,
            key,
            costMicros,
            reason: String(error).slice(0, 300),
          });
          console.log(
            `[provider:live] PAID PROVIDER OUTPUT NOT CAPITALIZED — ${stage}/${key} cost ` +
              `$${(costMicros / 1e6).toFixed(4)} and its fixture could not be written: ` +
              `${String(error).slice(0, 200)}`
          );
        }
        // The running total, printed on every paid call: the operator sees the
        // meter move rather than discovering the bill afterwards.
        console.log(`[provider:live] recorded ${stage}/${key} — ${(budget as ProviderBudget).status()}`);
        return response;
      },
    };
  }

  return { default: ReplayAnthropic, Anthropic: ReplayAnthropic };
}
