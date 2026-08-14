import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { vi } from "vitest";

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
  /**
   * BUG FOUND DURING PART C (2026-08-12): this used to match on "critique" or
   * "adversarial", and NEITHER word appears in critique.ts's actual SYSTEM
   * text — only in its surrounding code comments. The match was therefore
   * dead: any real critique call fell through to "other", and a synthetic run
   * that ever reached Stage 4 would have thrown "no responder for stage
   * other" rather than exercising the critique layer at all. Matched on the
   * prompt's own opening sentence instead, which is stable and unique to it.
   */
  if (sys.includes("independent plan critic for AfterDesk")) return "critique";
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

/**
 * ONE LIVE DISPATCH THAT DID NOT REACH `settle()`.
 *
 * Found 2026-08-13, canary run 1: `runWorkEngine`'s own durable-operation
 * wrapper catches and retries provider failures, so by the time a caller
 * sees `AiOperation.lastError` it may already be the error from a LATER
 * retry, not the one that actually explains what went wrong. This record is
 * captured HERE, at the one place that always sees the real, original
 * failure, independent of whatever the caller does with it afterwards.
 *
 * Deliberately excludes `params`/the request body and anything from
 * `error.headers` beyond the request id: a stack trace or an SDK error
 * object can carry request content, and this diagnostic exists to be safe
 * to print and to commit alongside a bug report, never to carry a client's
 * brief.
 */
export type LiveCallError = {
  stage: string;
  /** e.g. "APIConnectionError", "AuthenticationError", "TypeError" — never the raw class, always its name. */
  errorClass: string;
  /** Truncated, and never the request body — see the type's own note above. */
  message: string;
  /** Truncated stack, own file's frames only matter less than the error site. */
  stack: string | null;
  /** The Anthropic SDK exposes this on API errors; null for anything else (network, our own code). */
  httpStatus: number | null;
  /** Anthropic's own request id, when the SDK error carries one — the thing to hand support if asked. */
  providerRequestId: string | null;
  /** Did client.messages.create() itself return successfully before something else threw? */
  responseWasReceived: boolean;
  reservation: {
    beforeReserve: ReturnType<ProviderBudget["snapshot"]>;
    afterHandling: ReturnType<ProviderBudget["snapshot"]>;
    /** What this failure was settled as — see settleFailedReservation()'s own docstring for why. */
    settledAsMicros: number;
  };
  occurredAt: string;
};

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
  /** Every live dispatch that threw before or during response handling. See LiveCallError. */
  liveCallErrors: LiveCallError[];
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
 * THE ONE PLACE THAT SEES A LIVE FAILURE FIRST — before any retry, before
 * any durable-operation error handling upstream gets a chance to catch it,
 * transform it, or (as `runWorkEngine` does) overwrite it with a LATER
 * attempt's different error. Deliberately reads only what is safe to print
 * and to commit to a bug report: no `params`, no request body, nothing from
 * `error.headers` beyond a request id.
 */
function recordLiveCallError(input: {
  stage: string;
  error: unknown;
  responseWasReceived: boolean;
  beforeReserve: ReturnType<ProviderBudget["snapshot"]>;
  afterHandling: ReturnType<ProviderBudget["snapshot"]>;
  settledAsMicros: number;
}): void {
  if (!stats) return;
  const e = input.error as {
    name?: string;
    message?: string;
    stack?: string;
    status?: number;
    statusCode?: number;
    requestID?: string;
    request_id?: string;
    headers?: { get?: (k: string) => string | null } | Record<string, string>;
    constructor?: { name?: string };
  } | null;

  const httpStatus =
    typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : null;

  let providerRequestId: string | null = null;
  const headers = e?.headers;
  if (typeof e?.requestID === "string") providerRequestId = e.requestID;
  else if (typeof e?.request_id === "string") providerRequestId = e.request_id;
  else if (headers && typeof (headers as { get?: unknown }).get === "function") {
    const get = (headers as { get: (k: string) => string | null }).get;
    providerRequestId = get("request-id") ?? get("x-request-id") ?? null;
  } else if (headers && typeof headers === "object") {
    const h = headers as Record<string, string>;
    providerRequestId = h["request-id"] ?? h["x-request-id"] ?? null;
  }

  (stats as ReplayStats).liveCallErrors.push({
    stage: input.stage,
    errorClass: typeof e?.name === "string" ? e.name : (e?.constructor?.name ?? "UnknownError"),
    message: String(e?.message ?? input.error).slice(0, 500),
    stack: typeof e?.stack === "string" ? e.stack.slice(0, 2000) : null,
    httpStatus,
    providerRequestId,
    responseWasReceived: input.responseWasReceived,
    reservation: {
      beforeReserve: input.beforeReserve,
      afterHandling: input.afterHandling,
      settledAsMicros: input.settledAsMicros,
    },
    occurredAt: new Date().toISOString(),
  });
}

/** What the live branch needs from "the real SDK": a class it can `new`. */
type RealSdkModule = {
  default: new (o: unknown) => { messages: { create: (p: unknown) => Promise<unknown> } };
};

/**
 * Build the object `vi.mock("@anthropic-ai/sdk", ...)` should return.
 * Call it from a harness like:
 *
 *   vi.mock("@anthropic-ai/sdk", async () =>
 *     (await import("../test/support/provider-replay")).anthropicMockFactory());
 *
 * `realSdkLoader` is a TEST-ONLY escape hatch, never used by any production
 * or L3/canary caller (which all rely on the default). It exists because
 * `vi.importActual` — correct as it is for reaching the true SDK from
 * inside a mock — cannot itself be redirected to a fake: it always returns
 * the real, installed "@anthropic-ai/sdk" package. Verifying the live
 * branch's OWN logic (reserve → dispatch → settle → golden recording, and
 * the conservative-settlement behaviour on a failed dispatch) at zero cost
 * and zero network therefore needs a way to substitute a fake "real SDK"
 * for that one call — this parameter is that seam, and nothing else.
 */
export function anthropicMockFactory(
  env: BudgetEnv = process.env as BudgetEnv,
  options?: { realSdkLoader?: () => Promise<RealSdkModule> }
) {
  const loadRealSdk = options?.realSdkLoader ?? (() => vi.importActual<RealSdkModule>("@anthropic-ai/sdk"));
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
    liveCallErrors: [],
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
        const beforeReserve = (budget as ProviderBudget).snapshot();
        (budget as ProviderBudget).reserve();
        type AnthropicUsageShape = {
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
            server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
          };
        };
        let response: AnthropicUsageShape | null = null;
        let costMicros: number | undefined;
        let usage:
          | {
              inputTokens: number;
              outputTokens: number;
              cacheReadTokens: number;
              cacheWriteTokens: number;
              searchRequests: number;
              fetchRequests: number;
            }
          | undefined;
        try {
          /**
           * BUG FOUND 2026-08-13, canary run 1: a plain `await
           * import("@anthropic-ai/sdk")` here does NOT reach the real SDK
           * once the test file has `vi.mock("@anthropic-ai/sdk", ...)`'d
           * that specifier — vitest's module interception applies to EVERY
           * import of that specifier for the whole test run, including one
           * written inside the mock factory's own implementation code.
           * Confirmed with a synthetic, zero-network probe
           * (.scratch/probe-mock-self-reference.e2e.ts): the inner import
           * resolved back to the exact same mocked class, so
           * `new RealAnthropic(...)` constructed ANOTHER ReplayAnthropic,
           * and calling `.messages.create()` on it re-entered this exact
           * branch — reserving budget again on every recursive level until
           * the shared ledger cap finally threw, unwinding through however
           * many levels of recursion had run. Every one of those
           * reservations was real (against the ledger) and NONE was ever
           * settled, because the recursion never once reached a genuine
           * response. `vi.importActual` is the documented way to reach the
           * real module from inside code that is itself part of a mock.
           */
          const actual = await loadRealSdk();
          const RealAnthropic = actual.default;
          /**
           * R5.2 — maxRetries: 0, the same doctrine as every production client.
           *
           * This is the ONE client in the repository that has actually spent
           * real money (canary runs 1-5, and R5.1's live positive-path proof).
           * An SDK-internal retry here issues a second billable POST that the
           * run-scoped ledger below counts ONCE — so the very instrument used
           * to prove spend safety would itself have been under-reporting it.
           * The harness caps calls and spend on its own; it does not need the
           * SDK retrying behind that accounting.
           */
          const client = new RealAnthropic({ timeout: 120_000, maxRetries: 0 });
          response = (await client.messages.create(params)) as AnthropicUsageShape;

          usage = {
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
          costMicros =
            costMicrosFor(String(params.model), usage) +
            searchCostMicros(usage.searchRequests) +
            fetchCostMicros(usage.fetchRequests);
          (budget as ProviderBudget).settle(costMicros);
        } catch (error) {
          /**
           * CONSERVATIVE ON PURPOSE — never assume a failed dispatch cost
           * nothing. A response that was never received (the SDK call
           * itself threw — network, auth, rate limit, timeout) is genuinely
           * ambiguous: Anthropic may have billed it before the failure
           * reached us. The reservation is therefore settled at its FULL
           * amount, not released — the same "never lower a figure you are
           * unsure of" rule this codebase already applies to pricing
           * (reprice() takes max(), never min()). A response that WAS
           * received (something in OUR OWN usage/cost-calculation code
           * threw afterwards) is unambiguous: the call was real and its
           * usage figures are already in hand, so it is settled at that
           * real, computed cost rather than either the reservation or zero.
           */
          const settledAsMicros =
            response !== null && typeof costMicros === "number"
              ? costMicros
              : (budget as ProviderBudget).callReserveMicros;
          (budget as ProviderBudget).settle(settledAsMicros);
          const afterHandling = (budget as ProviderBudget).snapshot();
          recordLiveCallError({
            stage,
            error,
            responseWasReceived: response !== null,
            beforeReserve,
            afterHandling,
            settledAsMicros,
          });
          throw error;
        }
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
