/**
 * THE SHAPE THAT FLOWS BETWEEN PRIMITIVES.
 *
 * One row per unit of the mandate (a clinic, a company, a record). Every
 * primitive reads rows and returns rows, so a step can be replayed on its
 * predecessor's output without either knowing about the other.
 *
 * `sources` is per FIELD, not per row, because that is the standard the
 * platform already published: docs/VERIFIED-PROSPECT-STANDARD.md requires an
 * evidence note per record, and a row-level source cannot say WHICH field it
 * backs. A field with fewer than two independent sources is not verified,
 * whatever the model thinks of it.
 *
 * Pure types, no server-only: the pure primitives are unit-tested directly.
 */

import type { FieldExceptionCause } from "@/lib/ai-work-engine/exception-cause";
import type { ProviderErrorClass } from "@/lib/ai-work-engine/provider-error";

export type RowStatus =
  /** Two independent sources agree. Ready to deliver. */
  | "verified"
  /** Found something, but not enough to call it verified. A person checks. */
  | "needs_review"
  /** Nothing credible found. Marked unavailable, never invented. */
  | "not_found";

export type WorkflowRow = {
  /**
   * Stable identity of the unit across steps. Derived from the source data,
   * never a positional index: a step that drops a row must not silently
   * renumber the ones after it.
   */
  unitKey: string;
  /** The requested fields. Null means "not found", never an empty string. */
  fields: Record<string, string | null>;
  /** Field name to the source URLs backing it. */
  sources: Record<string, string[]>;
  status: RowStatus;
  /** Why a person needs to look, in plain words. Null when verified. */
  reviewReason: string | null;
  /**
   * The same answer, machine-readable, one entry per unresolved field. Added
   * in 1D-alpha0 ALONGSIDE the prose, not instead of it: the worker reads the
   * sentence, the operator queries the causes, and neither is a good
   * substitute for the other. Absent on verified rows and on payloads written
   * by split.exceptions@1.
   */
  exceptionCauses?: FieldExceptionCause[];
  /**
   * Raw evidence gathered by research.web_search, before anything is extracted
   * from it. The handoff between the two model primitives: research finds and
   * cites, extract reads and structures. Kept on the row rather than in a
   * side channel so a replay of extract has everything it needs from its
   * input alone.
   */
  evidence?: { url: string; text: string }[];
};

export type WorkflowPayload = {
  rows: WorkflowRow[];
  /**
   * How many units the mandate is FOR, from the accepted contract — not how
   * many rows happen to be in `rows`. The gap between the two is itself part
   * of what a person must resolve, and hiding it would misreport the job as
   * complete.
   */
  unitsTotal: number;
  /** The field names the contract asked for, in the client's order. */
  requestedFields: string[];
  /**
   * What the researching model reported after reading the pages.
   *
   * This exists because of a hard API constraint: a `web_search_result` block
   * carries a url, a title and an ENCRYPTED page body. Only the model that
   * made the search call can read the page text; a later call cannot. So the
   * two halves of research travel separately and are trusted differently:
   *
   *   - `rows[].evidence` is the authoritative url set. The API wrote it and
   *     a model cannot forge it. Source attribution may only use these.
   *   - `researchNarrative` is model prose. It carries the actual values,
   *     because nothing else can, and it is treated as a claim to be
   *     attributed, never as a source in itself.
   */
  researchNarrative?: string;
};

export const emptyPayload = (unitsTotal: number, requestedFields: string[]): WorkflowPayload => ({
  rows: [],
  unitsTotal,
  requestedFields,
});

/** One recorded attempt at an external call. Append-only, cost included. */
export type InvocationRecord = {
  /** Stable logical key of the operation. Identical across attempts. */
  operationKey: string;
  provider: string;
  model: string | null;
  /** The key handed to the provider, when it accepts one. */
  providerIdempotencyKey: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  searchCount: number;
  costMicros: number;
  durationMs: number;
  ok: boolean;
  error: string | null;
  /**
   * 1D-alpha0. What we actually KNOW about this attempt's spend. Not derived
   * from `ok`: a call can fail after being dispatched and billed, and a call
   * can be refused before dispatch and cost nothing. See the enum's comment in
   * schema.prisma for why the two unknown states never release their budget.
   */
  dispatchState:
    | "settled"
    | "cancelled_before_dispatch"
    | "dispatched_then_cancelled"
    | "unaccounted";
  errorClass: ProviderErrorClass | null;
  httpStatus: number | null;
  startedAt: Date;
  finishedAt: Date;
};

export type ArtifactSpec = {
  /**
   * Short slug identifying WHAT this artifact is (`candidate`, `exceptions`).
   * Part of the deterministic storage key, so a replay overwrites its own
   * output instead of accumulating near-duplicates.
   */
  name: string;
  /** Bumped only when the same step legitimately produces a new generation. */
  outputVersion: number;
  extension: "csv" | "json";
  mime: string;
  body: Buffer;
  visibility: "admin_only" | "worker_after_claim" | "deliverable_candidate";
};

export type PrimitiveContext = {
  taskId: string;
  runId: string;
  stepRunId: string;
  /** The accepted contract this run executes. Part of every artifact key. */
  snapshotId: string;
  order: number;
  attempt: number;
  brief: {
    title: string;
    description: string;
    quantity: string | null;
    objective: string;
    geography: string[];
    requiredFields: string[];
    quantityInterpreted: number | null;
  };
  /** Output of the previous step, or an empty payload for the first. */
  input: WorkflowPayload;
  /**
   * What this step may spend, in microdollars. ZERO MEANS "MAY NOT SPEND",
   * never "unbounded": the 1B sense of a zero ceiling is exactly the defect
   * this phase removed, and it must not creep back through a comment.
   *
   * BigInt, like every microdollar amount on the financial path: the Prisma
   * Int ceiling is $2,147.48 and the type must not assume today's primitives
   * are the expensive ones.
   */
  costCeilingMicros: bigint;
  recordInvocation: (record: InvocationRecord) => Promise<void>;
  writeArtifact: (spec: ArtifactSpec) => Promise<{ fileId: string }>;
};

export type PrimitiveResult = {
  payload: WorkflowPayload;
  /** Bounded, admin-facing. Never the full output: that lives in artifacts. */
  summary: Record<string, string | number | boolean>;
};
