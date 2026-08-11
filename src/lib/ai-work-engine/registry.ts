import "server-only";
import {
  PLAN_PRIMITIVES,
  type PlanPrimitiveId,
} from "@/lib/ai-work-engine/schemas";
import type { PrimitiveContext, PrimitiveResult } from "@/lib/ai-work-engine/primitives/types";
import {
  runNormalizeContactFields,
  runSplitExceptions,
} from "@/lib/ai-work-engine/primitives/pure";
import { runResearchWebSearch } from "@/lib/ai-work-engine/primitives/research";
import { runExtractStructuredRows } from "@/lib/ai-work-engine/primitives/extract";
import { runWebFetch } from "@/lib/ai-work-engine/primitives/fetch";
import {
  runBuildCsvV2,
  runBuildXlsx,
  runDataAggregate,
  runDataCompare,
  runDataDedupe,
  runDataFilter,
  runDataJoin,
  runDataNormalize,
  runDataSchemaMap,
  runIngestCsv,
  runIngestXlsx,
} from "@/lib/ai-work-engine/primitives/files";

/**
 * THE ALLOWLIST. A primitive that is not in this table cannot run, whatever a
 * plan says and whoever wrote the plan.
 *
 * `mode` is the safety axis and Phase 1B has no WRITE tier at all — not a
 * disabled one, an absent one. Nothing in this slice sends an email, calls a
 * phone, submits a form, buys anything or writes to a client's system. The
 * compiler refuses any step whose primitive is not READ or PREPARE, so adding
 * a WRITE primitive later is a deliberate act that fails closed until someone
 * also changes the compiler.
 *
 * `idempotent` is likewise not a flag to consider: it is `true` for every
 * entry, and it must stay that way while lease-based recovery exists. A step
 * reclaimed after a crash is replayed in full, so a primitive that is not safe
 * to replay is a primitive that cannot be in this table.
 */

export type PrimitiveMode = "READ" | "PREPARE";

type PrimitiveCore = {
  id: PlanPrimitiveId;
  version: number;
  displayName: string;
  mode: PrimitiveMode;
  /** Replaying this step must land on the same result. Non-negotiable. */
  idempotent: true;
  /** A primitive that may see personal or otherwise sensitive client data. */
  handlesSensitiveData: false;
  timeoutMs: number;
  maxAttempts: number;
  run: (ctx: PrimitiveContext) => Promise<PrimitiveResult>;
};

/**
 * 1D-alpha0 — CAN THIS PRIMITIVE SPEND MONEY.
 *
 * That is ALL the registry says about cost, and the restraint is deliberate.
 * The registry could not previously tell a pure primitive from a billed one:
 * the distinction lived only as an implementation accident (whether the file
 * happened to import the SDK), which is why the budget ceiling introduced in
 * 1B had nowhere to attach and stayed a dead `0` for a whole phase.
 *
 * The AMOUNT lives in two other places, and neither of them is here:
 *
 *   - for a NEW quote, automation-cost-policy.ts, versioned and never edited
 *     in place;
 *   - for an ACCEPTED contract, TaskExecutionPlanStep.maxCostMicrosPerAttemptAtQuote,
 *     frozen before the client signed.
 *
 * A number here would be a third source, and it is exactly the one the runner
 * used to read at execution time — which is how a deploy changed what an
 * already-signed contract could spend.
 */
export type Primitive = PrimitiveCore & { billable: boolean };

const define = (p: Primitive): Primitive => p;

export const REGISTRY: Record<PlanPrimitiveId, Primitive> = {
  "research.web_search": define({
    id: "research.web_search",
    version: PLAN_PRIMITIVES["research.web_search"],
    displayName: "Public web research",
    mode: "READ",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 200_000,
    // Search is billed per query: a retry storm here costs real money, so the
    // budget is tighter than for the pure steps.
    maxAttempts: 2,
    billable: true,
    run: runResearchWebSearch,
  }),
  "extract.structured_rows": define({
    id: "extract.structured_rows",
    version: PLAN_PRIMITIVES["extract.structured_rows"],
    displayName: "Structure the findings",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 140_000,
    maxAttempts: 3,
    billable: true,
    run: runExtractStructuredRows,
  }),
  "normalize.contact_fields": define({
    id: "normalize.contact_fields",
    version: PLAN_PRIMITIVES["normalize.contact_fields"],
    displayName: "Normalise contact fields",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 30_000,
    maxAttempts: 3,
    // Pure code: no provider, no network, no spend. The literal types make
    // this an assertion the compiler checks, not a claim in a comment.
    billable: false,
    run: runNormalizeContactFields,
  }),
  "split.exceptions": define({
    id: "split.exceptions",
    version: PLAN_PRIMITIVES["split.exceptions"],
    displayName: "Separate the exceptions",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 30_000,
    maxAttempts: 3,
    // Pure code: no provider, no network, no spend. The literal types make
    // this an assertion the compiler checks, not a claim in a comment.
    billable: false,
    run: runSplitExceptions,
  }),
  "build.csv": define({
    id: "build.csv",
    version: PLAN_PRIMITIVES["build.csv"],
    displayName: "Build the candidate file",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    // Pure code: no provider, no network, no spend. The literal types make
    // this an assertion the compiler checks, not a claim in a comment.
    billable: false,
    run: runBuildCsvV2,
  }),

  /* ───────────────────── 1E-alpha: files and data ─────────────────────
   *
   * Every entry below is PREPARE, non-billable and `local` in the vocabulary:
   * deterministic code that reads a file the contract froze and reshapes rows
   * already in the payload. None of them can reach a network, which is the
   * property that makes reading a client's own file safe to ship (see
   * data-class.ts). None of them can spend, so none reserves budget.
   *
   * Timeouts are wall-clock ceilings inside the runner's ~60s invocation
   * slice, and the codecs' own row and cell bounds are what actually stop a
   * large file: a timeout is the backstop, not the plan.
   */
  "ingest.csv": define({
    id: "ingest.csv",
    version: PLAN_PRIMITIVES["ingest.csv"],
    displayName: "Read the accepted CSV",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runIngestCsv,
  }),
  "ingest.xlsx": define({
    id: "ingest.xlsx",
    version: PLAN_PRIMITIVES["ingest.xlsx"],
    displayName: "Read the accepted workbook",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 90_000,
    maxAttempts: 3,
    billable: false,
    run: runIngestXlsx,
  }),
  "data.dedupe": define({
    id: "data.dedupe",
    version: PLAN_PRIMITIVES["data.dedupe"],
    displayName: "Remove duplicates",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runDataDedupe,
  }),
  "data.normalize": define({
    id: "data.normalize",
    version: PLAN_PRIMITIVES["data.normalize"],
    displayName: "Normalise field formats",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runDataNormalize,
  }),
  "data.join": define({
    id: "data.join",
    version: PLAN_PRIMITIVES["data.join"],
    displayName: "Join two sets",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runDataJoin,
  }),
  "data.filter": define({
    id: "data.filter",
    version: PLAN_PRIMITIVES["data.filter"],
    displayName: "Keep or drop rows",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 30_000,
    maxAttempts: 3,
    billable: false,
    run: runDataFilter,
  }),
  "data.aggregate": define({
    id: "data.aggregate",
    version: PLAN_PRIMITIVES["data.aggregate"],
    displayName: "Group and total",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 30_000,
    maxAttempts: 3,
    billable: false,
    run: runDataAggregate,
  }),
  "data.compare": define({
    id: "data.compare",
    version: PLAN_PRIMITIVES["data.compare"],
    displayName: "Difference two sets",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runDataCompare,
  }),
  "data.schema_map": define({
    id: "data.schema_map",
    version: PLAN_PRIMITIVES["data.schema_map"],
    displayName: "Map columns to the target schema",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 30_000,
    maxAttempts: 3,
    billable: false,
    run: runDataSchemaMap,
  }),
  "build.xlsx": define({
    id: "build.xlsx",
    version: PLAN_PRIMITIVES["build.xlsx"],
    displayName: "Build the candidate workbook",
    mode: "PREPARE",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 60_000,
    maxAttempts: 3,
    billable: false,
    run: runBuildXlsx,
  }),

  /* ───────────────────── 1E-beta1: web completion ───────────────────── */

  "web.fetch": define({
    id: "web.fetch",
    version: PLAN_PRIMITIVES["web.fetch"],
    displayName: "Read the cited pages",
    mode: "READ",
    idempotent: true,
    handlesSensitiveData: false,
    timeoutMs: 200_000,
    /**
     * ONE attempt, and the number is the probe's, not a preference. The
     * provider's content bound does not apply to binary content
     * (.scratch/probe-web-fetch-results-2.json: a 444 KB PDF billed 53,754
     * input tokens under a 2,000-token bound), so a disguised binary is the
     * one fetch whose size the page owner chooses. What bounds it is the
     * pinned model's context window (fetch.ts, FETCH_MODEL): the absolute
     * ceiling of one attempt is proved UNDER the frozen hold in ac4's
     * comment and its theorem test, so even that residual cannot settle
     * above its reservation. One funded attempt keeps the proof per-mandate
     * simple. Raising this is an ac5 decision, not a tweak.
     */
    maxAttempts: 1,
    billable: true,
    run: runWebFetch,
  }),
};

/**
 * Resolve a primitive AT A PINNED VERSION. Both halves matter: an id the
 * registry never had, and an id whose behaviour has since changed, are equally
 * unrunnable against a contract that was signed before the change.
 *
 * Object.hasOwn, not `in`: a plan naming "constructor" must resolve to
 * nothing, not to a function.
 */
export function resolvePrimitive(
  id: string | null,
  pinnedVersion: number | null
): Primitive | null {
  if (id === null) return null;
  if (!Object.hasOwn(REGISTRY, id)) return null;
  const primitive = REGISTRY[id as PlanPrimitiveId];
  if (pinnedVersion !== primitive.version) return null;
  return primitive;
}
