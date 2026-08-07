import "server-only";
import {
  PLAN_PRIMITIVES,
  type PlanPrimitiveId,
} from "@/lib/ai-work-engine/schemas";
import type { PrimitiveContext, PrimitiveResult } from "@/lib/ai-work-engine/primitives/types";
import {
  runBuildCsv,
  runNormalizeContactFields,
  runSplitExceptions,
} from "@/lib/ai-work-engine/primitives/pure";
import { runResearchWebSearch } from "@/lib/ai-work-engine/primitives/research";
import { runExtractStructuredRows } from "@/lib/ai-work-engine/primitives/extract";

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
 * 1D-alpha0 — CAN THIS PRIMITIVE SPEND MONEY, AND HOW MUCH AT MOST.
 *
 * The registry could not tell a pure primitive from a billed one: that
 * distinction lived only as an implementation accident (whether the file
 * happened to import the SDK), which is why the budget ceiling introduced in
 * 1B had nowhere to attach and stayed a dead `0` for a whole phase.
 *
 * `maxCostMicrosPerAttempt` is a property of the WORK, decided in reviewed
 * code: "one research pass is not worth more than this to us". The adapter
 * computes its own worst case from the model and the token caps; the runner
 * reserves the SMALLER of the two, so neither a tariff change nor a prompt
 * change can quietly raise what a step may cost.
 *
 * The coupling is carried by the TYPE, not by a comment: a pure primitive
 * that declared a budget does not compile, and a billed one that forgot to
 * declare a ceiling does not compile either.
 */
type PurePrimitive = { billable: false; maxCostMicrosPerAttempt: 0 };
type BillablePrimitive = { billable: true; maxCostMicrosPerAttempt: number };

export type Primitive = PrimitiveCore & (PurePrimitive | BillablePrimitive);

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
    /**
     * $2.00, and the number is arithmetic rather than a feeling.
     *
     * A server-side search tool loops INSIDE one request: each result set it
     * fetches is re-sent as input on the next turn, so input grows with the
     * square of the search count. At the dearest model rate, 12 searches
     * accumulate roughly 316k input tokens ($1.58), plus 12k output tokens
     * ($0.30), plus 12 billed queries ($0.12).
     *
     * The first version of this cap said $0.50, counting only the prompt WE
     * wrote. That is below the floor of a full research pass, so the
     * reservation was not a ceiling: the call ran, cost more than was held,
     * and the overrun was only noticed by the NEXT reservation, after the
     * money was gone. worstCaseMicros now models the same accumulation, and
     * meteredCall refuses when its estimate exceeds what was granted.
     */
    maxCostMicrosPerAttempt: 2_000_000,
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
    /**
     * $0.60. No search loop here (the call declares no tools at all), so the
     * input is bounded by what we send: the two 60k-character slices of
     * evidence and narrative, about 30k tokens ($0.15), plus 16k output
     * tokens at the dearest rate ($0.40).
     */
    maxCostMicrosPerAttempt: 600_000,
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
    maxCostMicrosPerAttempt: 0,
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
    maxCostMicrosPerAttempt: 0,
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
    maxCostMicrosPerAttempt: 0,
    run: runBuildCsv,
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
