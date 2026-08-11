/**
 * THE CLOSED VOCABULARY OF EXECUTABLE PRIMITIVES.
 *
 * NO `server-only` IMPORT IN THIS FILE, deliberately. The admin plan editor is
 * a client component and has to offer this list in a <select>; importing it
 * from schemas.ts (which is server-only, and rightly so) would pull the whole
 * model-schema module into the browser bundle and fail the build. Neither tsc
 * nor vitest catches that, because the vitest config aliases `server-only`
 * away and TypeScript has no concept of a bundle boundary.
 *
 * Nothing here needs the server: it is a table of names, integers and enums.
 * schemas.ts re-exports it so every existing import site keeps working.
 *
 * ── ON THE VERSIONS ──
 *
 * The version is stamped by CODE when a plan version is written, never chosen
 * by a model, and the compiler will only execute a step whose pinned version
 * still matches this table. Bump a version here the moment a primitive's
 * OBSERVABLE BEHAVIOUR changes: every already-accepted plan pinned to the old
 * version then degrades to human work instead of silently getting the new
 * behaviour. A contract the client already accepted is not a place to ship an
 * upgrade.
 *
 * The registry (registry.ts) must implement exactly these ids at exactly these
 * versions; a test pins the two together.
 *
 * ── THESE IDS ARE CAPABILITIES, NOT PRODUCTS ──
 *
 * `data.dedupe`, not `useSomeVendor`. The planner speaks in terms of the work
 * to be done; which implementation satisfies a capability is resolved beneath
 * this table (see PLAN_PRIMITIVE_REACH and the registry). A vendor name in
 * this vocabulary would end up frozen inside accepted contracts and inside
 * calibration keys, which is how a supplier becomes impossible to replace.
 *
 * `research.web_search` is the one id that reads like a mechanism, and it is a
 * pre-existing name kept deliberately: renaming it would bump its version and
 * degrade every accepted plan pinned to it, for a cosmetic gain.
 */

export const PLAN_PRIMITIVES = {
  /** Public web search for candidate facts. Anthropic server-side tool. */
  "research.web_search": 1,
  /** Turn fetched content into typed rows with a source URL per field. */
  "extract.structured_rows": 1,
  /** Pure code: phone, email, URL and casing normalisation. */
  "normalize.contact_fields": 1,
  /**
   * Pure code: split rows into confident ones and ones needing a human.
   *
   * v2 (1D-alpha0) additionally emits a STRUCTURED cause per unresolved field,
   * so "which field generates the exceptions" stops being an unanswerable
   * question. Its verdicts are unchanged; only the output grew.
   *
   * The bump is not free and the cost was accepted deliberately: an already
   * accepted plan pinned to @1 no longer resolves (registry.ts refuses a
   * version mismatch) and degrades to human work, and the step token inside
   * executionWorkflowKey changes, so a new calibration profile starts at
   * `uncalibrated`. Both are the correct behaviour — a workflow that reports
   * different facts is a different workflow — but they are visible, so they
   * are stated here rather than discovered in a dashboard.
   */
  "split.exceptions": 2,
  /**
   * Pure code: write the candidate CSV artifact.
   *
   * v2 (1E-alpha) knows where its rows came from. On a payload ingested from a
   * client file there are no per-field source URLs and no verification verdict
   * to report, because the client's own file IS the source; emitting empty
   * `_sources`, `status` and `review_reason` columns would put three dead
   * columns in the deliverable of every deduplication mandate. Web-research
   * payloads are written exactly as before, column for column.
   *
   * Same bump cost as split.exceptions@2, accepted for the same reason: the
   * file it produces is observably different, so the version has to say so.
   */
  "build.csv": 2,

  /* ───────────────────── 1E-alpha: files and data ───────────────────── */

  /** Read an accepted CSV attachment into rows. Local, bounded. */
  "ingest.csv": 1,
  /** Read an accepted XLSX attachment into rows. Local, bounded, strict subset. */
  "ingest.xlsx": 1,
  /** Exact and normalised-key duplicates. Near-duplicates become candidates. */
  "data.dedupe": 1,
  /** Field-level normalisation to declared types. Never invents a value. */
  "data.normalize": 1,
  /** Join two ingested sets on a declared key. Unmatched rows are reported. */
  "data.join": 1,
  /** Keep or drop rows by declared predicates. */
  "data.filter": 1,
  /** Group and count/sum into a summary set. */
  "data.aggregate": 1,
  /** Row-level difference between two sets: added, removed, changed. */
  "data.compare": 1,
  /** Rename, reorder and drop columns per an EXPLICIT mapping. Never guesses. */
  "data.schema_map": 1,
  /** Write a minimal XLSX workbook: headers and values, one sheet. */
  "build.xlsx": 1,

  /* ───────────────────── 1E-beta1: web completion ───────────────────── */

  /**
   * Read the full text of pages research.web_search already cited. Anthropic
   * server-side tool, bounded by frozen params (maxFetches, maxContentTokens)
   * enforced as API parameters. Text and HTML only: the 1E-beta1 probe proved
   * `max_content_tokens` does not bound PDF consumption, so binary content is
   * refused at harvest and PDF work stays a person's until phase gamma.
   */
  "web.fetch": 1,
} as const;

export type PlanPrimitiveId = keyof typeof PLAN_PRIMITIVES;

export const PLAN_PRIMITIVE_IDS = Object.keys(PLAN_PRIMITIVES) as PlanPrimitiveId[];

/**
 * THE SAFETY AXIS, IN A FILE THE PURE COMPILER CAN IMPORT.
 *
 * registry.ts has claimed since 1B that "the compiler refuses any step whose
 * primitive is not READ or PREPARE". It did not: compile.ts never imported
 * REGISTRY and could not, because registry.ts is `server-only` and the
 * compiler is deliberately pure and unit-tested without a database. The
 * promise lived in a comment, which protects nothing.
 *
 * This sibling table carries the same information in a file with no imports,
 * so compile.ts can enforce it for real. `test/workflow-compile.test.ts` pins
 * this table to REGISTRY entry by entry, the same discipline already applied
 * to the versions, so the two cannot drift.
 *
 * There is no WRITE tier, and its absence is the point: adding one requires
 * editing this union, which is a deliberate act that fails closed.
 */
export const PLAN_PRIMITIVE_MODES = {
  "research.web_search": "READ",
  "extract.structured_rows": "PREPARE",
  "normalize.contact_fields": "PREPARE",
  "split.exceptions": "PREPARE",
  "build.csv": "PREPARE",
  "ingest.csv": "PREPARE",
  "ingest.xlsx": "PREPARE",
  "data.dedupe": "PREPARE",
  "data.normalize": "PREPARE",
  "data.join": "PREPARE",
  "data.filter": "PREPARE",
  "data.aggregate": "PREPARE",
  "data.compare": "PREPARE",
  "data.schema_map": "PREPARE",
  "build.xlsx": "PREPARE",
  "web.fetch": "READ",
} as const satisfies Record<PlanPrimitiveId, "READ" | "PREPARE">;

export type PlanPrimitiveMode = (typeof PLAN_PRIMITIVE_MODES)[PlanPrimitiveId];

/**
 * THE SECOND SAFETY AXIS, AND THE ONE 1E-alpha ADDS: HOW FAR THE INPUT GOES.
 *
 * `mode` answers "does this change the world". It says nothing about who gets
 * to READ the input, and once a step can be handed the bytes of a client's
 * spreadsheet that is the more dangerous question. A capability can be
 * flawlessly READ-only and still transmit a supplier list to a third party.
 *
 * `provider` — the input leaves this machine. A model, an API, any network
 *              call. Only `public_business` data may be given to one.
 * `local`    — deterministic code in this process. Nothing leaves.
 *
 * Every capability added in this phase is `local`, which is what makes reading
 * client files safe to ship at all: no misclassification, no bad plan and no
 * mistaken operator can route a client file to a provider, because no
 * file-reading capability has anywhere to send it. See data-class.ts.
 */
export const PLAN_PRIMITIVE_REACH = {
  "research.web_search": "provider",
  "extract.structured_rows": "provider",
  "normalize.contact_fields": "local",
  "split.exceptions": "local",
  "build.csv": "local",
  "ingest.csv": "local",
  "ingest.xlsx": "local",
  "data.dedupe": "local",
  "data.normalize": "local",
  "data.join": "local",
  "data.filter": "local",
  "data.aggregate": "local",
  "data.compare": "local",
  "data.schema_map": "local",
  "build.xlsx": "local",
  /**
   * web.fetch is `provider` FOREVER, and the temptation this note refuses is
   * real: the fetch is initiated by our code, so "it is this machine's step"
   * reads plausibly. Reach is not about who initiates — it is about whether
   * the INPUT leaves this machine, and a fetched URL (plus the bounded brief
   * beside it) leaves. Declaring it `local` would hand it client file bytes
   * (workflow-runs.ts gates on `local`) and exempt it from the mixing rule
   * and the class gate in one stroke. test/capability-substrate.test.ts pins
   * this entry by value.
   */
  "web.fetch": "provider",
} as const satisfies Record<PlanPrimitiveId, "provider" | "local">;

export type PlanPrimitiveReach = (typeof PLAN_PRIMITIVE_REACH)[PlanPrimitiveId];

/** The capabilities that read a client attachment rather than prior rows. */
export const FILE_READING_PRIMITIVE_IDS: readonly PlanPrimitiveId[] = ["ingest.csv", "ingest.xlsx"];

/** Modes the compiler will execute. Anything else compiles to human work. */
export const EXECUTABLE_PRIMITIVE_MODES: readonly string[] = ["READ", "PREPARE"];

/** The declared mode of a primitive id, or null when the id is unknown. */
export function primitiveModeOf(id: string | null): PlanPrimitiveMode | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVE_MODES, id)
    ? PLAN_PRIMITIVE_MODES[id as PlanPrimitiveId]
    : null;
}

/**
 * The declared reach of a primitive id, or null when the id is unknown.
 *
 * An unknown id returning null is load-bearing: the caller must treat "I do
 * not know where this sends data" as disqualifying, never as `local`.
 */
export function primitiveReachOf(id: string | null): PlanPrimitiveReach | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVE_REACH, id)
    ? PLAN_PRIMITIVE_REACH[id as PlanPrimitiveId]
    : null;
}

/** True when the primitive consumes a client attachment. Unknown ids: false. */
export function primitiveReadsFiles(id: string | null): boolean {
  return id !== null && (FILE_READING_PRIMITIVE_IDS as readonly string[]).includes(id);
}

/** The version the code stamps today for a given id, or null if unknown. */
export function currentPrimitiveVersion(id: string | null): number | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVES, id)
    ? PLAN_PRIMITIVES[id as PlanPrimitiveId]
    : null;
}
