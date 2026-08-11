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
   * INTERNAL LINEAGE. Stable, deterministic, and not the client's business.
   *
   * A logical row needs an identity that survives being rewritten. `unitKey`
   * cannot serve: it is derived from the client's own data, several legitimate
   * rows may share one, and a transform that reformats a field changes it.
   * Object identity cannot serve either, because schema_map and normalize
   * build new objects for the same logical record. Value equality cannot serve
   * because two distinct entries are allowed to be identical.
   *
   * Getting this wrong is not academic. Every one of those three heuristics
   * was tried while closing a delivery-duplication bug, and each was worse
   * than the bug: keying on `unitKey` collapsed three distinct records into
   * one in a DEDUPLICATION mandate, which is silent client data loss.
   *
   * ── HOW IT IS BUILT ──
   *
   * Ingested rows: `${fileId}#${sheet}#${originalRowIndex}`, from the file
   * identity FROZEN on the acceptance snapshot. Replaying the same bytes
   * therefore yields the same ids, which is what makes a retried step produce
   * a byte-identical artifact. Multi-file mandates cannot collide because the
   * fileId leads.
   *
   * Derived rows (a join pairing two parents, an aggregate group) mint an id
   * that is a deterministic function of the parents' ids. A transform that
   * merely rewrites a row KEEPS its id: same logical record, new shape.
   *
   * Optional only so payloads written before 1E-alpha still parse. Anything
   * that reads it must treat an absent id as "no lineage known" and never
   * invent one.
   */
  rowId?: string;
  /**
   * Stable identity of the unit across steps, in the CLIENT's terms. Derived
   * from the source data, never a positional index: a step that drops a row
   * must not silently renumber the ones after it.
   *
   * Not unique, and not a lineage. Two suppliers really can share a name.
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
   *
   * The three optional fields are 1E-beta1 provenance, written by web.fetch
   * when it upgrades an item's text from a page title to a page excerpt. All
   * optional for the rowId reason: payloads written before the fields existed
   * must still parse, and research@1 keeps writing exactly the two-field
   * shape it always wrote. `retrievedAt` comes from the provider's own result
   * block (it may predate the call: the provider caches fetches);
   * `contentSha256` is OUR hash of the FULL retrieved text, so a later
   * re-fetch can prove whether the page moved even though only an excerpt
   * rides in the payload.
   */
  evidence?: {
    url: string;
    text: string;
    kind?: "fetched_excerpt";
    retrievedAt?: string;
    contentSha256?: string;
  }[];
};

/**
 * WHAT WENT WRONG WITH ONE LOGICAL ROW. Metadata, not a second row.
 *
 * The delivery-duplication bug came from modelling exceptions as rows: a
 * transform that flagged a record it also kept returned it twice, the wiring
 * concatenated both lists, and the client received every flagged record
 * twice. A deduplication mandate delivering each candidate twice is the
 * worst version of that.
 *
 * So an exception REFERENCES a row by lineage and carries no data of its own.
 * A builder joins on `rowId` to fill a review column; the working dataset
 * stays exactly one entry per logical row.
 */
export type RowException = {
  /** The logical row this is about. */
  rowId: string;
  /** Closed vocabulary, so an operator can count them. */
  code:
    | "UNPARSEABLE_VALUE"
    | "UNMAPPED_COLUMN"
    | "AMBIGUOUS_DUPLICATE"
    | "AMBIGUOUS_JOIN_KEY"
    | "CONFLICTING_VALUE"
    | "NON_NUMERIC_COMPARISON"
    | "POISONED_AGGREGATE";
  /** The column concerned, when the exception is about one. */
  field: string | null;
  /**
   * One sentence for the person who will resolve it. Operator-facing: it may
   * name a column and another row's id, never a cell's contents.
   */
  detail: string;
};

export type WorkflowPayload = {
  /**
   * The working set: what the next step operates on unless its params name a
   * dataset. Ingestion and every transform write here as well as into
   * `datasets`, so a plan that never mentions a dataset name behaves exactly
   * as plans did before 1E-alpha.
   */
  rows: WorkflowRow[];
  /**
   * NAMED SETS, so a mandate can hold more than one table at a time.
   *
   * A join needs two inputs and the runner only ever hands a step its
   * predecessor's output, so the second table has to travel inside the
   * payload. `data.join` reads `datasets[left]` and `datasets[right]`; two
   * `ingest.csv` steps with different `datasetName` params fill them.
   *
   * Absent on every payload written before this phase, which is why it is
   * optional rather than defaulted: an old artifact replayed today must not
   * grow a field it did not have.
   */
  datasets?: Record<string, WorkflowRow[]>;
  /**
   * WHERE THESE ROWS CAME FROM, which decides what may be claimed about them.
   *
   * `web_research`  assembled from public sources. Field-level `sources` and
   *                 the two-independent-hosts bar are meaningful, and
   *                 split.exceptions applies.
   * `client_file`   read out of the client's own attachment. There are no
   *                 source URLs to cite because the client's file IS the
   *                 source, and verifying it against the web would be
   *                 answering a question nobody asked.
   *
   * Absent means `web_research`: every payload written before 1E-alpha was
   * one, and defaulting is safer than back-filling a claim.
   */
  provenance?: "web_research" | "client_file";
  /**
   * Exceptions accumulated by the transforms that ran, as references. Never a
   * parallel copy of the rows: see RowException.
   */
  exceptions?: RowException[];
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
  /**
   * 1E-beta1. Fetches the provider counted for this call
   * (usage.server_tool_use.web_fetch_requests). Priced at the documented $0
   * per fetch — the tokens carry the cost — so this is telemetry the bulk
   * gate and the fetch-success rate read, never a billing input on its own.
   */
  fetchCount: number;
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
  extension: "csv" | "json" | "xlsx";
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
   * The step's frozen parameters, already parsed against its capability's
   * schema by the compiler. A step whose params did not parse never reaches a
   * primitive: it was compiled to human work.
   */
  params: Record<string, unknown>;
  /**
   * THE CLIENT FILES THIS RUN MAY READ, AND NOTHING ELSE.
   *
   * Frozen onto the acceptance snapshot when the client accepted, by id AND by
   * sha256. The runner verifies the hash before handing bytes to a primitive
   * and hands the mandate to a person if it moved, so a replay after a
   * re-upload cannot silently operate on different content than the one that
   * was quoted. `read()` is a function rather than a buffer because most steps
   * read no file at all and downloading every attachment on every step would
   * be a waste that grows with the mandate.
   *
   * Empty for every run that carries no attachment, which is every run that
   * existed before 1E-alpha.
   */
  inputFiles: {
    fileId: string;
    fileName: string;
    sizeBytes: number;
    sha256: string;
    read: () => Promise<Buffer>;
  }[];
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
