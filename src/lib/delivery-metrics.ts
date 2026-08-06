import { z } from "zod";

/**
 * THE CONTENT HALF OF THE EXECUTION REPORT.
 *
 * The process half (src/lib/queries/tasks.ts, executionReportForClient) proves
 * a delivery was independently reviewed: how many times it was sent back, when
 * each step happened, against which written standard. It says nothing about
 * WHAT was delivered, because nothing structured about the content was ever
 * captured. The only channel that existed was Submission.note, free text the
 * worker writes to the operator, which is deliberately unprojected in every
 * client-facing select precisely because free text can carry a name or an
 * invitation to make contact. RULE 1 closed that door on purpose.
 *
 * So this is a second, closed-shape channel: integers and fixed enums, no
 * string field of any kind, validated by zod on write AND again on read. A
 * value that cannot be a string cannot be a name, an email or a phone number,
 * which is what makes these numbers safe to show the paying client at all.
 *
 * NOT server-only: the same schema validates the worker's form in the browser
 * and the server action, so the two can never drift apart. The server still
 * re-validates independently.
 *
 * DELIBERATELY NOT A SCHEMA ENGINE. Exactly two categories have a shape, they
 * are hardcoded here, and there is no admin UI to configure them. Same posture
 * as disputeCriteria and the Academy curriculum: this codebase freezes content
 * like this in typed source rather than building a CMS for two rows.
 */

const count = z.number().int().min(0).max(1_000_000);
const positiveCount = z.number().int().min(1).max(1_000_000);

/**
 * `category` lives INSIDE the stored object, not just alongside it, because
 * Task.categoryId is admin-editable. Without it, recategorising a task would
 * render last week's numbers under this week's labels.
 */
const researchShape = {
  v: z.literal(1),
  category: z.literal("research"),
  recordsInBrief: positiveCount,
  recordsResearched: count,
  recordsComplete: count,
  recordsWithGap: count,
  findingsWithSavedSource: count,
  sourceEvidence: z.enum(["link", "screenshot", "link_and_screenshot", "not_requested"]),
} as const;

const listBuildingShape = {
  v: z.literal(1),
  category: z.literal("list-building"),
  candidatesScreened: positiveCount,
  recordsQualified: count,
  recordsRejected: count,
  recordsComplete: count,
  recordsWithGap: count,
} as const;

export const researchMetricsSchema = z.object(researchShape).superRefine((m, ctx) => {
  if (m.recordsResearched > m.recordsInBrief) {
    ctx.addIssue({
      code: "custom",
      path: ["recordsResearched"],
      message: "You cannot research more records than the brief contained.",
    });
  }
  if (m.recordsComplete + m.recordsWithGap !== m.recordsResearched) {
    ctx.addIssue({
      code: "custom",
      path: ["recordsComplete"],
      message: "Records with every field found, plus records with a gap, must equal records researched.",
    });
  }
  if (m.findingsWithSavedSource > m.recordsResearched) {
    ctx.addIssue({
      code: "custom",
      path: ["findingsWithSavedSource"],
      message: "You cannot save a source for more records than you researched.",
    });
  }
  if (m.sourceEvidence === "not_requested" && m.findingsWithSavedSource !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["findingsWithSavedSource"],
      message: "Pick the evidence you kept, or set saved sources to zero.",
    });
  }
});

export const listBuildingMetricsSchema = z.object(listBuildingShape).superRefine((m, ctx) => {
  if (m.recordsQualified + m.recordsRejected !== m.candidatesScreened) {
    ctx.addIssue({
      code: "custom",
      path: ["recordsQualified"],
      message: "Qualified plus rejected must equal candidates screened.",
    });
  }
  if (m.recordsComplete + m.recordsWithGap !== m.recordsQualified) {
    ctx.addIssue({
      code: "custom",
      path: ["recordsComplete"],
      message: "Records with every field found, plus records with a gap, must equal qualified records.",
    });
  }
});

/** The ONLY two categories with a shape. Every other one is untouched. */
export const METRICS_SCHEMAS = {
  research: researchMetricsSchema,
  "list-building": listBuildingMetricsSchema,
} as const;

/** Exported for the test that asserts no field is ever free text. */
export const METRIC_SHAPES = {
  research: researchShape,
  "list-building": listBuildingShape,
} as const;

export type MetricsCategory = keyof typeof METRICS_SCHEMAS;
export type ResearchMetrics = z.infer<typeof researchMetricsSchema>;
export type ListBuildingMetrics = z.infer<typeof listBuildingMetricsSchema>;
export type DeliveryMetrics = ResearchMetrics | ListBuildingMetrics;

/**
 * Object.hasOwn and not a bare index lookup, for the same reason
 * clientTimelineEntries uses it: a category slug is an unconstrained string,
 * and METRICS_SCHEMAS["constructor"] returns a truthy inherited member.
 */
export function metricsSchemaFor(slug: string | null | undefined) {
  return slug && Object.hasOwn(METRICS_SCHEMAS, slug)
    ? METRICS_SCHEMAS[slug as MetricsCategory]
    : null;
}

export function isMetricsCategory(slug: string | null | undefined): slug is MetricsCategory {
  return Boolean(slug) && Object.hasOwn(METRICS_SCHEMAS, slug as string);
}

/**
 * Client-facing wording. Every string a client ever reads about these numbers
 * is authored here, never assembled from stored data. Sentence case, no
 * em-dash, no digits, and nothing that implies the client could contact the
 * specialist.
 */
export const METRIC_LABELS: Record<MetricsCategory, Record<string, string>> = {
  research: {
    recordsInBrief: "Records in the brief",
    recordsResearched: "Records researched",
    recordsComplete: "Records with every field found",
    recordsWithGap: "Records with a field marked unavailable",
    findingsWithSavedSource: "Records with a saved source",
    sourceEvidence: "Source evidence kept",
  },
  "list-building": {
    candidatesScreened: "Candidates screened",
    recordsQualified: "Records that met the criteria",
    recordsRejected: "Candidates rejected against the criteria",
    recordsComplete: "Records with every field found",
    recordsWithGap: "Records with a field marked unavailable",
  },
};

export const METRIC_ENUM_LABELS: Record<
  MetricsCategory,
  Record<string, Record<string, string>>
> = {
  research: {
    sourceEvidence: {
      link: "A link for each finding",
      screenshot: "A screenshot for each finding",
      link_and_screenshot: "A link and a screenshot",
      not_requested: "Not requested in the brief",
    },
  },
  "list-building": {},
};

/** One array drives form order, QC order and client order. */
export const METRIC_FIELD_ORDER: Record<MetricsCategory, readonly string[]> = {
  research: [
    "recordsInBrief",
    "recordsResearched",
    "recordsComplete",
    "recordsWithGap",
    "findingsWithSavedSource",
    "sourceEvidence",
  ],
  "list-building": [
    "candidatesScreened",
    "recordsQualified",
    "recordsRejected",
    "recordsComplete",
    "recordsWithGap",
  ],
};

export type MetricField =
  | { key: string; kind: "number"; min: number }
  | { key: string; kind: "enum"; options: readonly string[] };

/** What the worker's form renders, in order. */
export const METRIC_FIELDS: Record<MetricsCategory, readonly MetricField[]> = {
  research: [
    { key: "recordsInBrief", kind: "number", min: 1 },
    { key: "recordsResearched", kind: "number", min: 0 },
    { key: "recordsComplete", kind: "number", min: 0 },
    { key: "recordsWithGap", kind: "number", min: 0 },
    { key: "findingsWithSavedSource", kind: "number", min: 0 },
    {
      key: "sourceEvidence",
      kind: "enum",
      options: ["link", "screenshot", "link_and_screenshot", "not_requested"],
    },
  ],
  "list-building": [
    { key: "candidatesScreened", kind: "number", min: 1 },
    { key: "recordsQualified", kind: "number", min: 0 },
    { key: "recordsRejected", kind: "number", min: 0 },
    { key: "recordsComplete", kind: "number", min: 0 },
    { key: "recordsWithGap", kind: "number", min: 0 },
  ],
};

export type MetricRow = { label: string; value: string };

/**
 * THE LEAK BOUNDARY. Nothing from the stored blob is ever passed through as a
 * string: numbers go through String(), enums are replaced by a label authored
 * above, and any key not named in METRIC_FIELD_ORDER is dropped. So this is an
 * allowlist projection, not a serialisation, and a property somebody adds to
 * the JSON later cannot appear on a client's page by default.
 *
 * Re-validated here rather than trusted from the write path: a blob can also
 * arrive from a backfill, a manual SQL edit, or a schema that drifted. Anything
 * that fails renders nothing at all rather than something half-checked.
 */
export function formatMetricsForClient(raw: unknown): MetricRow[] | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const slug = (raw as { category?: unknown }).category;
  const schema = typeof slug === "string" ? metricsSchemaFor(slug) : null;
  if (!schema) return null;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;

  const m = parsed.data as Record<string, unknown> & { category: MetricsCategory };
  const rows: MetricRow[] = [];
  for (const key of METRIC_FIELD_ORDER[m.category]) {
    const value = m[key];
    const label = METRIC_LABELS[m.category][key];
    if (!label) continue;
    if (typeof value === "number") {
      rows.push({ label, value: String(value) });
      continue;
    }
    const enumLabel =
      typeof value === "string"
        ? METRIC_ENUM_LABELS[m.category][key]?.[value]
        : undefined;
    if (enumLabel) rows.push({ label, value: enumLabel });
  }
  return rows.length > 0 ? rows : null;
}

export type QcCheck = { label: string; tone: "flag" | "note" };

/**
 * Operator-only. These are the questions the numbers raise, not the numbers
 * themselves, and they never leave the QC page. The point is that a reviewer
 * approving a delivery should be nudged at the patterns the two dispute
 * standards are actually written against.
 */
export function qcChecks(raw: unknown): QcCheck[] {
  if (raw === null || typeof raw !== "object") return [];
  const slug = (raw as { category?: unknown }).category;
  const schema = typeof slug === "string" ? metricsSchemaFor(slug) : null;
  if (!schema) return [];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [];
  const m = parsed.data;

  const checks: QcCheck[] = [];

  // A perfect fill rate on public data is the classic fabrication signature.
  // Both dispute standards treat "explicitly marked unavailable after a real
  // search" as a correct answer, so zero gaps is the number to question.
  if (m.recordsWithGap === 0) {
    checks.push({
      label: "Nothing was marked unavailable. Confirm that is real.",
      tone: "flag",
    });
  }

  if (m.category === "research") {
    const unresearched = m.recordsInBrief - m.recordsResearched;
    if (unresearched > 0) {
      checks.push({
        label: `${unresearched} records in the brief were not researched.`,
        tone: "flag",
      });
    }
    if (
      m.sourceEvidence !== "not_requested" &&
      m.findingsWithSavedSource < m.recordsResearched
    ) {
      checks.push({
        label: `${m.recordsResearched - m.findingsWithSavedSource} researched records have no saved source.`,
        tone: "flag",
      });
    }
  }

  if (m.category === "list-building" && m.recordsRejected === 0) {
    checks.push({
      label: "No candidate was rejected against the criteria. Confirm the screening happened.",
      tone: "flag",
    });
  }

  return checks;
}
