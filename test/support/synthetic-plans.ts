/**
 * SYNTHETIC MODE — the model outputs a test WANTS, with no provider at all.
 *
 * Replay proves "AfterDesk handles what the model actually said". Synthetic
 * proves the other half: "AfterDesk handles the shape we need to exercise",
 * including shapes a live model may not produce on demand — a chain expensive
 * enough for ac5 to demote, a file plan with three ingests, a payroll mandate
 * that must never reach a provider.
 *
 * Everything here is a CONTROLLED INPUT, and the file says so loudly. Nothing
 * in it may be read as evidence about model behaviour; that question belongs
 * to live mode and to the golden corpus it records.
 */

import { SYNTHETIC_WORLDS } from "./synthetic-web";

export type SyntheticProfile = {
  id: string;
  /** A distinctive phrase from the mandate's own brief, used to route. */
  match: string;
  classification: Record<string, unknown>;
  /** Built lazily so file plans can reference the run's attachment refs. */
  plan: (attachmentRefs: string[]) => Record<string, unknown>;
};

/**
 * The field names a research mandate asks for come from its world, not from a
 * literal typed twice. They travel classification -> brief.requiredFields ->
 * extract's prompt -> split.exceptions' verification bar, so a mismatch
 * between the world and the classification would make every row fail the bar
 * for a reason that has nothing to do with the engine.
 */
function worldFields(id: string): string[] {
  return SYNTHETIC_WORLDS.find((w) => w.id === id)?.fields ?? ["company"];
}

const machine = (
  title: string,
  primitive: string | null,
  params: Record<string, unknown> | null,
  depends: number[],
  executor: "ai" | "deterministic_code" = "deterministic_code",
  aiCents = 0
) => ({
  title,
  description: `${title} (synthetic controlled step).`,
  executor,
  human_role: null,
  tool: null,
  primitive_id: primitive,
  params: params === null ? null : JSON.stringify(params),
  fixed_minutes: null,
  seconds_per_unit: null,
  estimated_minutes_optimistic: 0,
  estimated_minutes_likely: 0,
  estimated_minutes_conservative: 0,
  estimated_ai_cost_cents: aiCents,
  estimated_tool_units: 0,
  verification_method: "operator check",
  acceptance_criteria: ["step produced its declared output"],
  risk_level: "low",
  risk_note: null,
  depends_on_order: depends,
});

const human = (title: string, depends: number[], fixed: number, perUnit: number, likely: number) => ({
  title,
  description: `${title} (synthetic controlled human step).`,
  executor: "human",
  human_role: "worker",
  tool: null,
  primitive_id: null,
  params: null,
  fixed_minutes: fixed,
  seconds_per_unit: perUnit,
  estimated_minutes_optimistic: Math.round(likely * 0.7),
  estimated_minutes_likely: likely,
  estimated_minutes_conservative: Math.round(likely * 1.4),
  estimated_ai_cost_cents: 0,
  estimated_tool_units: 0,
  verification_method: "operator check against the brief",
  acceptance_criteria: ["every delivered row is sourced", "unconfirmed rows are separated"],
  risk_level: "medium",
  risk_note: null,
  depends_on_order: depends,
});

function classification(over: Record<string, unknown>): Record<string, unknown> {
  return {
    category_slug_guess: "research-list-building",
    objective: "Synthetic controlled objective.",
    deliverable_format: "CSV file",
    required_fields: ["company"],
    quantity_interpreted: 50,
    geography: [],
    verification_level: "standard",
    source_requirements: [],
    sensitive_data: false,
    required_access: [],
    missing_information: [],
    assumptions: [],
    quote_tier: "assisted",
    confidence: "medium",
    source_shape: "build_list",
    verification_expectation: "best_available",
    output_format_code: "csv",
    recurrence: "one_off",
    ...over,
  };
}

/** One research pass, funded under ac5 (6.00 + 4.00 + 1.80 = $11.80). */
const researchPlan = () => ({
  deliverable_description: "A sourced CSV of the requested records.",
  assumptions: ["Public sources only."],
  exclusions: ["No contact of the listed organisations."],
  steps: [
    machine("Search for candidates", "research.web_search", null, [], "ai", 90),
    machine("Read the cited pages", "web.fetch", { maxFetches: 3, maxContentTokens: 10_000 }, [1], "ai", 25),
    machine("Structure the findings", "extract.structured_rows", null, [2], "ai", 120),
    machine("Normalise contact fields", "normalize.contact_fields", null, [3]),
    machine("Split the unconfirmed rows", "split.exceptions", null, [4]),
    machine("Build the deliverable", "build.csv", { dataset: "main", columns: [] }, [5]),
    human("Verify every delivered row", [6], 30, 90, 180),
  ],
});

/** Deliberately over ac5's $32 ceiling: 3 searches + 3 fetches + extract. */
const expensivePlan = () => ({
  deliverable_description: "A triple-sourced CSV with an exceptions file.",
  assumptions: ["Three independent sources per field."],
  exclusions: ["No paid data providers."],
  steps: [
    machine("Search source A", "research.web_search", null, [], "ai", 90),
    machine("Read source A pages", "web.fetch", { maxFetches: 3, maxContentTokens: 10_000 }, [1], "ai", 25),
    machine("Search source B", "research.web_search", null, [], "ai", 90),
    machine("Read source B pages", "web.fetch", { maxFetches: 3, maxContentTokens: 10_000 }, [3], "ai", 25),
    machine("Search source C", "research.web_search", null, [], "ai", 90),
    machine("Read source C pages", "web.fetch", { maxFetches: 3, maxContentTokens: 10_000 }, [5], "ai", 25),
    machine("Structure and cross-check", "extract.structured_rows", null, [2, 4, 6], "ai", 120),
    machine("Build the deliverable", "build.csv", { dataset: "main", columns: [] }, [7]),
    human("Resolve the conflicts", [8], 30, 120, 90),
  ],
});

/**
 * W8's own chain: three files, three schemas, one list out.
 *
 * Written with the vocabulary AS IT EXISTS, deliberately, and separated from
 * the generic file plan because it is the mandate that tests whether the
 * vocabulary can do the job at all. Three ingests, two schema maps onto the
 * shared column names, then `data.join` twice — the only capability in the
 * frozen list that takes two datasets and returns one.
 *
 * The ground truth is 105 rows. A join is not a union, so this plan cannot
 * reach it; nothing here is bent to make it look like it can. What the run
 * produces is the measurement, and the gap between it and 105 is the finding.
 */
const consolidationPlan = (refs: string[]) => {
  const steps: Record<string, unknown>[] = [];
  const datasets = ["main", "src2", "src3"];
  refs.slice(0, 3).forEach((ref, i) => {
    steps.push(
      machine(`Read the attached file ${i + 1}`, "ingest.csv", { fileId: ref, datasetName: datasets[i] }, [])
    );
  });
  const n = Math.min(refs.length, 3);
  steps.push(
    machine(
      "Map the second file onto our columns",
      "data.schema_map",
      {
        dataset: "src2",
        mapping: [
          { from: "Company Name", to: "company" },
          { from: "Web Site", to: "website" },
          { from: "E-mail", to: "email" },
          { from: "Town", to: "city" },
        ],
        unmapped: "drop",
        into: "src2",
      },
      [2]
    ),
    machine(
      "Map the third file onto our columns",
      "data.schema_map",
      {
        dataset: "src3",
        mapping: [
          { from: "supplier", to: "company" },
          { from: "domain", to: "website" },
          { from: "contact_email", to: "email" },
          { from: "location", to: "city" },
        ],
        unmapped: "drop",
        into: "src3",
      },
      [3]
    ),
    machine(
      "Combine the first two lists",
      "data.join",
      { left: "main", right: "src2", leftKey: "company", rightKey: "company", type: "left", onConflict: "prefer_left", into: "main" },
      [1, n + 1]
    ),
    machine(
      "Combine the third list in",
      "data.join",
      { left: "main", right: "src3", leftKey: "company", rightKey: "company", type: "left", onConflict: "prefer_left", into: "main" },
      [n + 3]
    ),
    machine("Split what a person must check", "split.exceptions", null, [n + 4]),
    machine("Build the deliverable", "build.csv", { dataset: "main", columns: [] }, [n + 5]),
    human("Review and finish the file", [n + 6], 20, 15, 45)
  );
  return {
    deliverable_description: "One combined supplier list with our column names.",
    assumptions: ["The three files describe the same kind of supplier."],
    exclusions: ["No data is invented for blank cells."],
    steps,
  };
};

/** A file chain, wired to the run's REAL attachment references. */
const filePlan = (refs: string[], transform: "normalize" | "dedupe" | "consolidate") => {
  const steps: Record<string, unknown>[] = [];
  refs.forEach((ref, i) => {
    steps.push(
      machine(
        `Read the attached file ${i + 1}`,
        "ingest.csv",
        { fileId: ref, datasetName: i === 0 ? "main" : `src${i + 1}` },
        []
      )
    );
  });
  const afterIngest = refs.map((_, i) => i + 1);
  let order = refs.length;
  if (transform === "normalize") {
    steps.push(machine("Normalise the contact fields", "normalize.contact_fields", null, afterIngest));
    order += 1;
  } else if (transform === "dedupe") {
    steps.push(
      machine(
        "Remove exact duplicates",
        "data.dedupe",
        { dataset: "main", keyFields: ["contact_email"], strategy: "exact", keep: "first" },
        afterIngest
      )
    );
    order += 1;
  } else {
    steps.push(
      machine(
        "Map the second file onto our columns",
        "data.schema_map",
        {
          dataset: "src2",
          mapping: [
            { from: "Company Name", to: "company" },
            { from: "Web Site", to: "website" },
            { from: "E-mail", to: "email" },
            { from: "Town", to: "city" },
          ],
          unmapped: "drop",
          into: "src2",
        },
        afterIngest
      )
    );
    order += 1;
  }
  steps.push(machine("Split what a person must check", "split.exceptions", null, [order]));
  order += 1;
  steps.push(machine("Build the deliverable", "build.csv", { dataset: "main", columns: [] }, [order]));
  order += 1;
  steps.push(human("Review and finish the file", [order], 20, 15, 45));
  return {
    deliverable_description: "The cleaned file, ready to use.",
    assumptions: ["The attached file is the authoritative source."],
    exclusions: ["No data is invented for blank cells."],
    steps,
  };
};

export const SYNTHETIC_PROFILES: SyntheticProfile[] = [
  {
    id: "W1",
    match: "still operating",
    classification: classification({ quantity_interpreted: 45, required_fields: worldFields("W1") }),
    plan: () => researchPlan(),
  },
  {
    id: "W2",
    match: "industrial packaging",
    classification: classification({
      verification_expectation: "two_independent_sources",
      quantity_interpreted: 50,
      required_fields: worldFields("W2"),
    }),
    plan: () => researchPlan(),
  },
  {
    id: "W3",
    match: "independent bookshops",
    classification: classification({ quantity_interpreted: 80, required_fields: worldFields("W3") }),
    plan: () => researchPlan(),
  },
  {
    id: "W4",
    match: "runs operations",
    classification: classification({ quantity_interpreted: 30, required_fields: worldFields("W4") }),
    plan: () => researchPlan(),
  },
  {
    id: "W5",
    match: "project-management tools",
    classification: classification({ quantity_interpreted: 30, required_fields: worldFields("W5") }),
    plan: () => researchPlan(),
  },
  {
    id: "W6",
    match: "five different formats",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 120 }),
    plan: (refs) => filePlan(refs, "normalize"),
  },
  {
    id: "W7",
    match: "duplicate signups",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 108 }),
    plan: (refs) => filePlan(refs, "dedupe"),
  },
  {
    id: "W8",
    match: "different column names",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 105 }),
    plan: (refs) => consolidationPlan(refs),
  },
  {
    id: "W9",
    match: "still active today",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 12 }),
    plan: (refs) => filePlan(refs, "normalize"),
  },
  {
    id: "W10",
    match: "verified independently across separate sources",
    classification: classification({ source_shape: "mixed", verification_expectation: "two_independent_sources", quantity_interpreted: 25 }),
    plan: () => expensivePlan(),
  },
  {
    id: "R1",
    match: "payroll export",
    classification: classification({
      source_shape: "existing_file",
      sensitive_data: true,
      quote_tier: "manual",
      quantity_interpreted: 40,
      missing_information: ["Confirm the legal basis for processing employee records."],
    }),
    plan: (refs) => filePlan(refs, "dedupe"),
  },
  {
    id: "R2",
    match: "log into our HubSpot",
    classification: classification({
      source_shape: "mixed",
      recurrence: "recurring",
      output_format_code: "other",
      quote_tier: "manual",
      required_access: ["access to their HubSpot", "send email from the client's address"],
      quantity_interpreted: null,
    }),
    plan: () => researchPlan(),
  },
];

/** Wrap a JSON payload the way the provider returns a structured output. */
export function asProviderResponse(payload: unknown, model: string): Record<string, unknown> {
  return {
    id: "msg_synthetic",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    // Zero tokens: a synthetic answer costs nothing and must never be
    // mistaken for a measurement of what a real call would bill.
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}
