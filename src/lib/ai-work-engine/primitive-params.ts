import { z } from "zod";

/**
 * WHAT EACH CAPABILITY IS ACTUALLY ASKED TO DO.
 *
 * Until 1E-alpha a plan step carried a primitive id and nothing else, which
 * was survivable only because the five original primitives each did exactly
 * one thing to whatever rows they were handed. `data.filter` cannot work that
 * way: "filter" without a predicate is not an instruction, and the moment a
 * step needs configuration the configuration becomes part of the contract.
 *
 * So params are FROZEN, exactly like the step's economics. They are written
 * onto TaskExecutionPlanStep at quote time, they are covered by the same
 * database trigger that makes an accepted plan append-only, and the runner
 * reads them from the frozen step rather than re-deriving anything. A client
 * approved a deduplication on `email`; a later deploy must not turn it into a
 * deduplication on `company`.
 *
 * ── NO IMPORTS BEYOND ZOD ──
 *
 * compile.ts must be able to reject a step whose params do not parse, and
 * compile.ts is pure. Zod is isomorphic and already in every bundle that
 * matters, so this file stays importable from the pure decision core and from
 * the admin plan editor alike.
 *
 * ── THE TWO RULES THAT MATTER MORE THAN THE SCHEMAS ──
 *
 * 1. A mapping is never inferred. `data.schema_map` takes an explicit list of
 *    from/to pairs and, when a column is not in it, produces an exception
 *    rather than a guess. The whole value of a deterministic transform is that
 *    it did what it was told; a helpful guess destroys that in the one place
 *    the client cannot check.
 *
 * 2. Fuzzy duplicates are never merged. `data.dedupe` merges only on an exact
 *    or normalised key match. Anything short of that is emitted as a candidate
 *    pair for a person to judge. Silently collapsing "Jon Smith" into
 *    "Jonathan Smith" is a data-loss bug that surfaces months later at the
 *    client, which is the worst possible place.
 */

/* ───────────────────────────── shared pieces ───────────────────────────── */

/**
 * A dataset name inside the run's payload. Ingestion writes one; transforms
 * read one or two. Constrained rather than free text because it becomes part
 * of the artifact naming and the step summary.
 */
const datasetName = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, "lowercase identifier");

/** A column name as it appears in the client's own file. */
const fieldName = z.string().min(1).max(120);

const DEFAULT_DATASET = "main";

/* ───────────────────────────── the schemas ─────────────────────────────── */

/**
 * `fileId` names a file frozen onto the acceptance snapshot. The runner
 * refuses any id that is not in that frozen set, and refuses a file whose
 * sha256 no longer matches what the client accepted, so this parameter cannot
 * be used to reach a different file than the one that was quoted.
 */
const ingestCsv = z.object({
  fileId: z.string().min(1).max(64),
  datasetName: datasetName.default(DEFAULT_DATASET),
  hasHeaderRow: z.boolean().default(true),
  /** Null means "detect from the first line", which is deterministic. */
  delimiter: z.enum([",", ";", "\t", "|"]).nullable().default(null),
  /** The column that identifies a unit. Null means "use the row number". */
  keyColumn: fieldName.nullable().default(null),
});

const ingestXlsx = z.object({
  fileId: z.string().min(1).max(64),
  datasetName: datasetName.default(DEFAULT_DATASET),
  /** Sheet by name, or by zero-based index. Null means the first sheet. */
  sheet: z.union([z.string().max(120), z.number().int().min(0).max(199)]).nullable().default(null),
  hasHeaderRow: z.boolean().default(true),
  keyColumn: fieldName.nullable().default(null),
});

const dataDedupe = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  /** Rows are duplicates when ALL of these match under `strategy`. */
  keyFields: z.array(fieldName).min(1).max(8),
  /**
   * `exact`      byte-for-byte after trimming.
   * `normalized` case-folded, whitespace-collapsed, punctuation-stripped for
   *              emails and phones. Still an exact comparison of a derived
   *              key, not a similarity score.
   */
  strategy: z.enum(["exact", "normalized"]).default("normalized"),
  keep: z.enum(["first", "last"]).default("first"),
  /**
   * Optional near-duplicate REPORTING. Never merges: pairs above the threshold
   * are written to an exceptions dataset for a person to decide. Off by
   * default, because a candidate list nobody asked for is just noise.
   */
  reportNearDuplicates: z
    .object({
      fields: z.array(fieldName).min(1).max(4),
      /** Normalised edit distance, 0..1. 1 would mean identical. */
      threshold: z.number().min(0.5).max(0.99),
      /** Above this many candidate pairs the step hands the mandate to a
       *  person instead of producing a list nobody can review. */
      maxPairs: z.number().int().min(1).max(5000).default(500),
    })
    .nullable()
    .default(null),
});

const dataNormalize = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  rules: z
    .array(
      z.object({
        field: fieldName,
        /**
         * Every transform here is total and reversible in meaning: it may
         * reformat a value, never replace or invent one. A value that does not
         * parse is left exactly as written and flagged, which is the only
         * honest behaviour for data a client will reconcile against.
         */
        as: z.enum([
          "trim",
          "collapse_space",
          "lower",
          "upper",
          "title_case",
          "email",
          "phone_na",
          "url",
          "number",
          "date_iso",
          "postal_ca",
          "postal_us",
        ]),
      })
    )
    .min(1)
    .max(40),
});

const dataJoin = z.object({
  left: datasetName,
  right: datasetName,
  leftKey: fieldName,
  rightKey: fieldName,
  /** `inner` keeps matches only; `left` keeps every left row. */
  type: z.enum(["inner", "left"]).default("left"),
  /**
   * What to do when both sides carry the same column with different values.
   * `exception` is the default because a silent winner is a silent data loss.
   */
  onConflict: z.enum(["prefer_left", "prefer_right", "exception"]).default("exception"),
  into: datasetName.default(DEFAULT_DATASET),
});

/**
 * STACKING, NOT MATCHING, and the schema says so in its own shape: `datasets`
 * is a LIST and there is no key field anywhere. The planner reads this
 * rendering, and the one mistake that matters is reaching for `data.join` when
 * the mandate said "combine these files" — a join answers a different question
 * and returns the left side, which looks like success.
 */
const dataConcat = z.object({
  /** Two or more sets, stacked in this order. Each must appear once. */
  datasets: z
    .array(datasetName)
    .min(2)
    .max(10)
    .refine((names) => new Set(names).size === names.length, {
      message:
        "a dataset may appear only once: stacking a set with itself gives two rows one lineage",
    }),
  /**
   * `union` keeps every column any input carries, filling the gaps with null.
   * `intersection` keeps only the columns present in every input.
   */
  columns: z.enum(["union", "intersection"]).default("union"),
  into: datasetName.default(DEFAULT_DATASET),
});

const condition = z.object({
  field: fieldName,
  op: z.enum(["eq", "neq", "contains", "not_contains", "empty", "not_empty", "gt", "lt"]),
  /** Absent for `empty`/`not_empty`. Compared as a number for gt/lt. */
  value: z.string().max(500).nullable().default(null),
});

const dataFilter = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  conditions: z.array(condition).min(1).max(20),
  match: z.enum(["all", "any"]).default("all"),
  action: z.enum(["keep", "drop"]).default("keep"),
  into: datasetName.default(DEFAULT_DATASET),
});

const dataAggregate = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  groupBy: z.array(fieldName).min(1).max(6),
  metrics: z
    .array(
      z.object({
        fn: z.enum(["count", "sum", "min", "max", "avg"]),
        /** Null only for `count`, which counts rows. */
        field: fieldName.nullable().default(null),
        as: fieldName,
      })
    )
    .min(1)
    .max(12),
  into: datasetName.default(DEFAULT_DATASET),
});

const dataCompare = z.object({
  left: datasetName,
  right: datasetName,
  key: fieldName,
  /** Columns to compare. Empty means every column present on both sides. */
  compareFields: z.array(fieldName).max(60).default([]),
  into: datasetName.default(DEFAULT_DATASET),
});

const dataSchemaMap = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  /** EXPLICIT and exhaustive by intent. Nothing here is inferred. */
  mapping: z
    .array(z.object({ from: fieldName, to: fieldName }))
    .min(1)
    .max(120),
  /**
   * A source column absent from `mapping`. `exception` (the default) refuses
   * to decide and sends the mandate to a person; `drop` is a deliberate
   * instruction that the operator has to have written down.
   */
  unmapped: z.enum(["exception", "drop"]).default("exception"),
  into: datasetName.default(DEFAULT_DATASET),
});

const buildCsv = z.object({
  dataset: datasetName.default(DEFAULT_DATASET),
  /** Explicit column order. Empty means the dataset's own field order. */
  columns: z.array(fieldName).max(200).default([]),
});

const buildXlsx = buildCsv.extend({
  sheetName: z.string().min(1).max(31).default("Sheet1"),
});

/**
 * web.fetch — the two numbers the client's acceptance freezes, both enforced
 * as PROVIDER API PARAMETERS (max_uses, max_content_tokens), never as prompt
 * requests. The schema MAXIMA are load-bearing: ac4's per-attempt ceiling is
 * computed against them (test/automation-cost-policy.test.ts pins the
 * arithmetic), so raising either maximum is an economic change that requires
 * a new policy version, not a schema tweak.
 *
 * The fetch TARGETS are deliberately NOT params. They are discovered at run
 * time from the evidence research.web_search recorded, exactly as extract's
 * inputs are runtime data: frozen params pin what may be spent and how far it
 * may reach; the payload carries what it is spent on. A URL list here would
 * be a list the planner model writes, and a param the planner writes is a
 * param the planner can widen.
 */
const webFetch = z.object({
  /** Pages one invocation may fetch. The beta1 bound is deliberately small. */
  maxFetches: z.number().int().min(1).max(3).default(3),
  /** Provider-side truncation per fetched page, in tokens. Text only: the
   *  1E-beta1 probe proved PDFs escape this bound, which is why harvest
   *  refuses binary content outright. */
  maxContentTokens: z.number().int().min(1_000).max(10_000).default(10_000),
});

/**
 * The five original primitives take no parameters and must keep taking none:
 * they are pinned inside accepted contracts, and adding a required parameter
 * would be a behaviour change wearing a version that says otherwise.
 */
const noParams = z.object({}).strict();

export const PRIMITIVE_PARAM_SCHEMAS = {
  "research.web_search": noParams,
  "extract.structured_rows": noParams,
  "normalize.contact_fields": noParams,
  "split.exceptions": noParams,
  "build.csv": buildCsv,
  "ingest.csv": ingestCsv,
  "ingest.xlsx": ingestXlsx,
  "data.dedupe": dataDedupe,
  "data.normalize": dataNormalize,
  "data.join": dataJoin,
  "data.concat": dataConcat,
  "data.filter": dataFilter,
  "data.aggregate": dataAggregate,
  "data.compare": dataCompare,
  "data.schema_map": dataSchemaMap,
  "build.xlsx": buildXlsx,
  "web.fetch": webFetch,
} as const;

export type PrimitiveParamsFor<K extends keyof typeof PRIMITIVE_PARAM_SCHEMAS> = z.infer<
  (typeof PRIMITIVE_PARAM_SCHEMAS)[K]
>;

export type IngestCsvParams = z.infer<typeof ingestCsv>;
export type IngestXlsxParams = z.infer<typeof ingestXlsx>;
export type DataDedupeParams = z.infer<typeof dataDedupe>;
export type DataNormalizeParams = z.infer<typeof dataNormalize>;
export type DataJoinParams = z.infer<typeof dataJoin>;
export type DataConcatParams = z.infer<typeof dataConcat>;
export type DataFilterParams = z.infer<typeof dataFilter>;
export type DataAggregateParams = z.infer<typeof dataAggregate>;
export type DataCompareParams = z.infer<typeof dataCompare>;
export type DataSchemaMapParams = z.infer<typeof dataSchemaMap>;
export type BuildCsvParams = z.infer<typeof buildCsv>;
export type BuildXlsxParams = z.infer<typeof buildXlsx>;
export type WebFetchParams = z.infer<typeof webFetch>;

/**
 * Parse a step's frozen params against its capability.
 *
 * Returns null for an unknown id or params that do not satisfy the schema, and
 * the CALLER MUST TREAT NULL AS "a person does this step". That is the whole
 * contract: an unparseable parameter set is not an error to surface at run
 * time and not a default to fill in, because both of those decide something on
 * the client's behalf that the client never approved.
 */
export function parsePrimitiveParams(
  primitiveId: string | null,
  raw: unknown
): Record<string, unknown> | null {
  if (primitiveId === null) return null;
  if (!Object.hasOwn(PRIMITIVE_PARAM_SCHEMAS, primitiveId)) return null;
  const schema = PRIMITIVE_PARAM_SCHEMAS[primitiveId as keyof typeof PRIMITIVE_PARAM_SCHEMAS];
  // `null`/`undefined` are offered to the schema as `{}` so the four
  // no-parameter primitives keep compiling from plans written before params
  // existed. A schema with required fields still refuses, which is correct.
  const candidate = raw === null || raw === undefined ? {} : raw;
  const result = schema.safeParse(candidate);
  return result.success ? (result.data as Record<string, unknown>) : null;
}

/** True when the id takes no parameters at all. Used by the plan editor. */
export function primitiveTakesNoParams(primitiveId: string): boolean {
  return (
    Object.hasOwn(PRIMITIVE_PARAM_SCHEMAS, primitiveId) &&
    PRIMITIVE_PARAM_SCHEMAS[primitiveId as keyof typeof PRIMITIVE_PARAM_SCHEMAS] === noParams
  );
}
