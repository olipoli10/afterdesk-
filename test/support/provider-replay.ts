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

export const GOLDEN_ROOT = join(process.cwd(), "test", "golden");

export type GoldenFixture = {
  /** Which stage produced it, for humans reading the directory. */
  stage: string;
  key: string;
  /** The request, stored for provenance and for regenerating the key. */
  request: {
    model: string;
    system: string;
    messages: unknown;
    outputSchemaName: string | null;
    tools: string[];
  };
  /** The provider's answer, as the SDK returned it. */
  response: unknown;
  meta: {
    /** "verbatim" = recorded from a real call. "reconstructed" = rebuilt from
     *  a parsed output that WAS paid for, when the raw text was not kept. */
    provenance: "verbatim" | "reconstructed" | "synthetic";
    recordedAt: string;
    model: string;
    costMicros: number;
    note?: string;
  };
};

/** Which stage a request belongs to, inferred from its own shape. */
export function stageOf(params: Record<string, unknown>): string {
  const sys = systemTextOf(params);
  if (sys.includes("task classifier for AfterDesk")) return "classification";
  if (sys.includes("execution planner for AfterDesk")) return "planning";
  if (sys.includes("critique") || sys.includes("adversarial")) return "critique";
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

/**
 * The addressing hash. Deliberately covers everything that changes the
 * ANSWER and nothing that does not: `max_tokens` and `cache_control` are
 * included because they are part of the request we would replay, while
 * transport-only fields are not present in params at all.
 */
export function fixtureKey(params: Record<string, unknown>): string {
  const outputConfig = params.output_config as { format?: { schema?: unknown } } | undefined;
  const canonical = JSON.stringify({
    model: params.model,
    system: systemTextOf(params),
    messages: params.messages,
    schema: outputConfig?.format?.schema ?? null,
    tools: ((params.tools as { type?: string; name?: string }[] | undefined) ?? []).map(
      (t) => `${t.type}:${t.name}`
    ),
    max_tokens: params.max_tokens,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
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
  budget: ReturnType<ProviderBudget["snapshot"]>;
};

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
  budget = new ProviderBudget({ label: `provider:${mode}` }, env);
  stats = { mode, replayed: 0, recorded: 0, synthetic: 0, misses: [], budget: budget.snapshot() };

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
          };
        };
        const { costMicrosFor } = await import("@/lib/ai-work-engine/tool-cost");
        const costMicros = costMicrosFor(String(params.model), {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
        });
        (budget as ProviderBudget).settle(costMicros);
        writeFixture({
          stage,
          key,
          request: {
            model: String(params.model),
            system: systemTextOf(params),
            messages: params.messages,
            outputSchemaName: stage,
            tools: ((params.tools as { type?: string }[] | undefined) ?? []).map((t) => String(t.type)),
          },
          response,
          meta: {
            provenance: "verbatim",
            recordedAt: new Date().toISOString(),
            model: String(params.model),
            costMicros,
          },
        });
        (stats as ReplayStats).recorded += 1;
        // The running total, printed on every paid call: the operator sees the
        // meter move rather than discovering the bill afterwards.
        console.log(`[provider:live] recorded ${stage}/${key} — ${(budget as ProviderBudget).status()}`);
        return response;
      },
    };
  }

  return { default: ReplayAnthropic, Anthropic: ReplayAnthropic };
}
