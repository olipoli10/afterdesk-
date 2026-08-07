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
 * Nothing here needs the server: it is a table of names and integers. schemas.ts
 * re-exports it so every existing import site keeps working unchanged.
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
   * accepted plan pinned to @1 no longer resolves (registry.ts:118 refuses a
   * version mismatch) and degrades to human work, and the step token inside
   * executionWorkflowKey changes, so a new calibration profile starts at
   * `uncalibrated`. Both are the correct behaviour — a workflow that reports
   * different facts is a different workflow — but they are visible, so they
   * are stated here rather than discovered in a dashboard.
   */
  "split.exceptions": 2,
  /** Pure code: write the candidate CSV artifact. */
  "build.csv": 1,
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
} as const satisfies Record<PlanPrimitiveId, "READ" | "PREPARE">;

export type PlanPrimitiveMode = (typeof PLAN_PRIMITIVE_MODES)[PlanPrimitiveId];

/** Modes the compiler will execute. Anything else compiles to human work. */
export const EXECUTABLE_PRIMITIVE_MODES: readonly string[] = ["READ", "PREPARE"];

/** The declared mode of a primitive id, or null when the id is unknown. */
export function primitiveModeOf(id: string | null): PlanPrimitiveMode | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVE_MODES, id)
    ? PLAN_PRIMITIVE_MODES[id as PlanPrimitiveId]
    : null;
}

/** The version the code stamps today for a given id, or null if unknown. */
export function currentPrimitiveVersion(id: string | null): number | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVES, id)
    ? PLAN_PRIMITIVES[id as PlanPrimitiveId]
    : null;
}
