import { z } from "zod";
import type { FrozenHumanUnitDefinition } from "@/lib/ai-work-engine/human-unit-definition";

/**
 * DOES THE CANDIDATE CARRY WHAT THE ACCEPTED STEP SAID IT WOULD CARRY?
 *
 * That is the whole question. It is a shape check, and it says nothing about
 * whether the work is any good. Conformance is a PRECONDITION for submission
 * and is never evidence of correctness (FR-017, readiness CHK040): no caller
 * may read `ok: true` as an acceptance signal, because acceptance is a judgment
 * a named admin makes and signs, and that judgment is the only thing that
 * authorises the machine to resume.
 *
 * The refusal rule is `parsePrimitiveParams`': `null` means "I could not
 * compile this", never "compiled to something permissive". An empty schema is
 * the dangerous failure — it would let any candidate through on a mandate whose
 * frozen requirement was unreadable, turning a corrupt contract into a silent
 * pass. Pure: no database, no clock, no network.
 */

/** The frozen schema subset V1 supports. Anything outside it is a refusal. */
type ScalarType = "string" | "number" | "integer" | "boolean";

const SCALARS: Record<ScalarType, () => z.ZodTypeAny> = {
  string: () => z.string(),
  number: () => z.number(),
  integer: () => z.int(),
  boolean: () => z.boolean(),
};

/**
 * Bounds the recursion. A frozen schema is stored JSON, so a pathological
 * nesting depth is possible and must be a refusal rather than a stack
 * overflow — the same reason the admission resolver is iterative.
 */
const MAX_DEPTH = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns null for anything this module cannot compile honestly. */
function compileNode(node: unknown, depth: number): z.ZodTypeAny | null {
  if (depth > MAX_DEPTH) return null;
  if (!isPlainObject(node)) return null;

  const type = node.type;
  if (typeof type !== "string") return null;

  if (type in SCALARS) return SCALARS[type as ScalarType]();

  if (type === "array") {
    // An array without a declared item type constrains nothing.
    const items = compileNode(node.items, depth + 1);
    return items === null ? null : z.array(items);
  }

  if (type === "object") return compileObject(node, depth);

  // An unrecognised type is not a permissive type.
  return null;
}

function compileObject(node: Record<string, unknown>, depth: number): z.ZodTypeAny | null {
  const properties = node.properties;
  if (!isPlainObject(properties)) return null;

  // `Object.keys` rather than `for..in`: a stored JSON blob must not be able to
  // reach an inherited key, and an object with no own properties describes no
  // requirement at all, which is exactly the permissive schema this refuses.
  const names = Object.keys(properties);
  if (names.length === 0) return null;

  const required = node.required === undefined ? [] : node.required;
  if (!Array.isArray(required)) return null;
  if (!required.every((name) => typeof name === "string")) return null;
  // A required field that is not declared is a contradiction, not a default.
  if (!required.every((name) => names.includes(name as string))) return null;

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const name of names) {
    const compiled = compileNode(properties[name], depth + 1);
    if (compiled === null) return null;
    shape[name] = required.includes(name) ? compiled : compiled.optional();
  }
  return z.object(shape);
}

export function compileFrozenOutputSchema(outputSchema: unknown): z.ZodTypeAny | null {
  try {
    if (!isPlainObject(outputSchema)) return null;
    // The frozen root describes a candidate, which is always an object.
    if (outputSchema.type !== "object") return null;
    return compileObject(outputSchema, 0);
  } catch {
    // A hostile stored blob is a refusal, never an exception on a mandate
    // someone has already paid for.
    return null;
  }
}

export type CandidateValidation =
  | { ok: true; value: unknown }
  | { ok: false; missing: string[] };

/**
 * `missing` names what is absent, because that is what the worker is told. It
 * carries nothing else: no score, no verdict, no field a review screen could
 * render as approval.
 */
export function validateCandidate(
  definition: FrozenHumanUnitDefinition,
  payload: unknown,
  artifactKinds: string[]
): CandidateValidation {
  const missing: string[] = [];

  const schema = compileFrozenOutputSchema(definition.outputSchema);
  if (schema === null) {
    // Fail closed. A frozen requirement this module cannot read is not a
    // requirement that has been met.
    missing.push("output_schema_uncompilable");
  } else {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        // The top-level field name is what the worker acts on.
        const field = issue.path[0];
        const name = typeof field === "string" ? field : String(field ?? "candidate");
        if (!missing.includes(name)) missing.push(name);
      }
      if (missing.length === 0) missing.push("candidate");
    }
  }

  const present = new Set(
    Array.isArray(artifactKinds)
      ? artifactKinds.filter((k): k is string => typeof k === "string")
      : []
  );
  const requiredKinds = Array.isArray(definition.requiredArtifactKinds)
    ? definition.requiredArtifactKinds
    : [];
  for (const kind of requiredKinds) {
    // A duplicate of one kind never satisfies a requirement for another.
    if (!present.has(kind) && !missing.includes(kind)) missing.push(kind);
  }

  if (missing.length > 0) return { ok: false, missing };

  // `schema` is non-null here: a null schema always pushes onto `missing`.
  return { ok: true, value: schema!.parse(payload) };
}
