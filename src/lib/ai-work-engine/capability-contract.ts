import { z } from "zod";
import {
  PLAN_PRIMITIVES,
  PLAN_PRIMITIVE_IDS,
  PLAN_PRIMITIVE_MODES,
  PLAN_PRIMITIVE_REACH,
  type PlanPrimitiveId,
  type PlanPrimitiveMode,
  type PlanPrimitiveReach,
} from "@/lib/ai-work-engine/primitive-vocabulary";
import {
  PRIMITIVE_PARAM_SCHEMAS,
  primitiveTakesNoParams,
} from "@/lib/ai-work-engine/primitive-params";

/**
 * THE PLANNER CAPABILITY CONTRACT — what the planning model is told a
 * capability accepts, GENERATED from the same zod schemas the compiler
 * enforces. One source of truth by construction, not by discipline.
 *
 * ── WHY THIS MODULE EXISTS (Level 2, 2026-08-11) ──
 *
 * The first live corpus proved the planner speaks the right conceptual
 * language — 45/45 web runs emitted web.fetch with the correct search
 * dependency, 10/10 file runs used manifest references — and then lost 276
 * steps to `invalid_params`, because the prompt described the capabilities in
 * hand-written prose that never stated the exact contracts. The model asked
 * for 120 fetches where the schema allows 3, invented `keep:"most_complete"`
 * where the enum says first|last, and configured no-parameter primitives that
 * refuse any key. Every demotion was the compiler doing its job against a
 * planner that had never seen the rules.
 *
 * Hand-maintaining those rules in prose is how they drifted once and how they
 * would drift again ("prompt says max 3, zod says max 5, six months later").
 * So the params half of the contract is not written here at all: it is
 * DERIVED, at module load, from PRIMITIVE_PARAM_SCHEMAS via zod's own
 * first-party JSON Schema conversion. Change a bound or an enum in the
 * runtime schema and the planner's contract changes in the same deploy,
 * mechanically. The test suite pins that the plan prompt embeds this exact
 * rendering, which closes the loop: a drift between what the planner sees and
 * what the compiler enforces is no longer expressible in this codebase.
 *
 * What IS authored here is the semantic half — what each capability does and
 * the structural rules no schema can carry (fetch depends on search, ingest
 * reads only manifest references). Those are statements about the system, not
 * about parameter shapes, and they are pinned by the seam tests.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──
 *
 *  - It never relaxes the runtime. The compiler and parsePrimitiveParams stay
 *    exactly as strict as before; this module only teaches the planner what
 *    they will accept. A planner that still writes an invalid params string
 *    still loses the step to a person — fail-closed is unchanged.
 *  - It never teaches inventing a fileId. The ingest note points at the
 *    ATTACHED FILES references and nothing else.
 *  - No `server-only`: pure data derived from pure modules, importable by the
 *    tests and by the pure decision core's neighbours alike.
 */

/** The hand-authored semantic half. `satisfies` makes a new primitive without
 *  prose a type error, so the contract can never silently omit a capability. */
const CAPABILITY_PROSE = {
  "research.web_search": {
    summary:
      "Public web search for candidate facts about each unit. Produces candidates with source URLs. Never a final verification.",
    notes: [],
  },
  "extract.structured_rows": {
    summary:
      "Turn fetched content into typed rows, one source URL per field. Runs on the evidence earlier research/fetch steps recorded.",
    notes: [],
  },
  "normalize.contact_fields": {
    summary: "Pure code. Phone, email and URL formatting, casing, whitespace.",
    notes: [],
  },
  "split.exceptions": {
    summary:
      "Pure code. Split rows into the confidently-sourced ones and the ones a person must check.",
    notes: [],
  },
  "build.csv": {
    summary: "Pure code. Write the candidate CSV a person then finishes.",
    notes: [],
  },
  "ingest.csv": {
    summary: "Pure code. Read ONE attached CSV file into rows.",
    notes: [
      "fileId MUST be one of the references from the ATTACHED FILES list (file_1, file_2, ...), copied exactly — never a file name, never an invented id. If the list shows no csv attachment, there is nothing to ingest: that work is a person's.",
      "Use a different datasetName per file when the mandate has several.",
    ],
  },
  "ingest.xlsx": {
    summary: "Pure code. Read ONE attached XLSX workbook into rows.",
    notes: [
      "fileId MUST be one of the references from the ATTACHED FILES list (file_1, file_2, ...), copied exactly — never a file name, never an invented id. If the list shows no xlsx attachment, there is nothing to ingest: that work is a person's.",
    ],
  },
  "data.dedupe": {
    summary:
      "Pure code. Merge rows whose key fields match exactly or after normalisation.",
    notes: [
      "It never merges near-matches: reportNearDuplicates only writes a candidate list for a person to judge — set it only when the client asked for one.",
    ],
  },
  "data.normalize": {
    summary:
      "Pure code. Reformat fields to a declared type. A value that does not parse is left as written and flagged.",
    notes: [],
  },
  "data.join": {
    summary: "Pure code. Join two ingested sets on a declared key.",
    notes: [],
  },
  "data.filter": {
    summary: "Pure code. Keep or drop rows by declared predicates.",
    notes: [],
  },
  "data.aggregate": {
    summary: "Pure code. Group and total into a summary set.",
    notes: [],
  },
  "data.compare": {
    summary: "Pure code. Difference two sets by key: added, removed, changed.",
    notes: [],
  },
  "data.schema_map": {
    summary: "Pure code. Rename columns per an EXPLICIT mapping.",
    notes: [
      "Nothing is inferred: a source column absent from the mapping becomes an exception unless the plan explicitly says unmapped: \"drop\".",
    ],
  },
  "build.xlsx": {
    summary: "Pure code. Write a candidate workbook a person then finishes.",
    notes: [],
  },
  "web.fetch": {
    summary:
      "Read the full text of pages research.web_search already cited, so extraction works from page content instead of titles.",
    notes: [
      "Plan it ONLY directly after a research.web_search step, with depends_on_order naming that step. It cannot search.",
      "Fetches pages only — never PDFs or files — and a mandate that reads a client file never includes it.",
      "The maxima in the schema are FROZEN CONTRACT BOUNDS enforced as provider API parameters. They are not suggestions: writing a larger number does not buy more fetching, it hands the step to a person.",
    ],
  },
} as const satisfies Record<PlanPrimitiveId, { summary: string; notes: readonly string[] }>;

export type CapabilityDescriptor = {
  id: PlanPrimitiveId;
  version: number;
  /**
   * Typed via the vocabulary's own unions, DELIBERATELY not inline literals:
   * the capability-substrate pin allows only three files to name the reach
   * values in source, because naming them is the first step toward granting
   * on them. This module only ever DISPLAYS what the vocabulary declared.
   */
  mode: PlanPrimitiveMode;
  reach: PlanPrimitiveReach;
  /** Null for the no-configuration primitives: their params IS null. */
  paramsJsonSchema: Record<string, unknown> | null;
  summary: string;
  notes: readonly string[];
};

function paramsJsonSchemaOf(id: PlanPrimitiveId): Record<string, unknown> | null {
  if (primitiveTakesNoParams(id)) return null;
  // `io: "input"` describes what the PLANNER may write: fields with defaults
  // are optional, exactly as the runtime parse treats them.
  const schema = z.toJSONSchema(PRIMITIVE_PARAM_SCHEMAS[id], { io: "input" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

/** Built once at module load. A schema zod cannot convert throws HERE, in
 *  every test run, never silently at plan time. */
const DESCRIPTORS: readonly CapabilityDescriptor[] = PLAN_PRIMITIVE_IDS.map((id) => ({
  id,
  version: PLAN_PRIMITIVES[id],
  mode: PLAN_PRIMITIVE_MODES[id],
  reach: PLAN_PRIMITIVE_REACH[id],
  paramsJsonSchema: paramsJsonSchemaOf(id),
  summary: CAPABILITY_PROSE[id].summary,
  notes: CAPABILITY_PROSE[id].notes,
}));

export function capabilityDescriptors(): readonly CapabilityDescriptor[] {
  return DESCRIPTORS;
}

function renderDescriptor(d: CapabilityDescriptor): string {
  const head = `- ${d.id}@${d.version} [${d.mode}, ${d.reach}] — ${d.summary}`;
  const params =
    d.paramsJsonSchema === null
      ? `  params: null — this capability takes NO configuration. Any key at all (queries, fields, anything) makes the step a person's work.`
      : `  params schema (your "params" string must decode to an object satisfying it; an unknown enum value or an out-of-range number makes the step a person's work):\n  ${JSON.stringify(d.paramsJsonSchema)}`;
  const notes = d.notes.map((n) => `  note: ${n}`);
  return [head, params, ...notes].join("\n");
}

const CONTRACT_TEXT = DESCRIPTORS.map(renderDescriptor).join("\n");

/**
 * The exact capability block the plan prompt embeds. The seam test pins
 * PLAN_SYSTEM_PROMPT.includes(plannerCapabilityContract()), which is the
 * whole invariant: what the planner reads IS what this module derived from
 * the runtime schemas, never a copy that can age.
 */
export function plannerCapabilityContract(): string {
  return CONTRACT_TEXT;
}
