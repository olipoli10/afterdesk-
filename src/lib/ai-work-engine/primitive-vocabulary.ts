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
  /** Pure code: split rows into confident ones and ones needing a human. */
  "split.exceptions": 1,
  /** Pure code: write the candidate CSV artifact. */
  "build.csv": 1,
} as const;

export type PlanPrimitiveId = keyof typeof PLAN_PRIMITIVES;

export const PLAN_PRIMITIVE_IDS = Object.keys(PLAN_PRIMITIVES) as PlanPrimitiveId[];

/** The version the code stamps today for a given id, or null if unknown. */
export function currentPrimitiveVersion(id: string | null): number | null {
  if (id === null) return null;
  return Object.hasOwn(PLAN_PRIMITIVES, id)
    ? PLAN_PRIMITIVES[id as PlanPrimitiveId]
    : null;
}
