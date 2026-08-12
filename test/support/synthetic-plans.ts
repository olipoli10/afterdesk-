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
  /**
   * Stage 4's independent critique of THIS profile's plan. Every profile
   * carries one — `shouldCritique()` triggers on cost as well as on
   * classification flags, and the exact set of mandates that cross the cost
   * threshold at runtime is not knowable ahead of a real run. A responder
   * that only covered the three named cases would leave every OTHER
   * mandate's critique call one runtime cost figure away from an unhandled
   * "no responder for stage critique" crash.
   */
  critique: Record<string, unknown>;
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
 * Every dataset is NAMED, and none of them is `main`. That is not style: the
 * working-set alias resolves to whatever the previous step produced, so a plan
 * that ingests a second file and later says `main` is asking a question with
 * two answers — which now refuses rather than picking one.
 *
 * Three ingests, two schema maps onto the shared column names, then ONE
 * `data.concat` that stacks all three. Ground truth: 40 + 35 + 30 = 105.
 */
const consolidationPlan = (refs: string[]) => {
  const steps: Record<string, unknown>[] = [];
  const datasets = ["src1", "src2", "src3"];
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
      "Stack the three lists into one",
      "data.concat",
      { datasets: ["src1", "src2", "src3"], columns: "union", into: "combined" },
      [1, n + 1, n + 2]
    ),
    machine("Split what a person must check", "split.exceptions", null, [n + 3]),
    machine("Build the deliverable", "build.csv", { dataset: "combined", columns: [] }, [n + 4]),
    human("Review and finish the file", [n + 5], 20, 15, 45)
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

/**
 * Stage 4's independent critique output, in its own wire shape
 * (critiqueOutputSchema). Base case is a clean pass — most of these plans
 * genuinely have no missing coverage or unsafe tool use — and each profile
 * below overrides only the fields that make ITS scenario's critique real
 * rather than a rubber stamp.
 */
function critique(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    missing_steps: [],
    wrong_tool_flags: [],
    time_risk_flags: [],
    security_risk_flags: [],
    overall_assessment:
      "Plan covers the brief's stated deliverable with a defensible sequence of steps; no missing coverage or unsafe tool use found.",
    severity: "none",
    ...over,
  };
}

export const SYNTHETIC_PROFILES: SyntheticProfile[] = [
  {
    id: "W1",
    match: "still operating",
    classification: classification({ quantity_interpreted: 45, required_fields: worldFields("W1") }),
    plan: () => researchPlan(),
    // The "at least one normal case" the harness must exercise: a real flag,
    // non-blocking, on an otherwise sound plan — not a rubber-stamped pass.
    critique: critique({
      time_risk_flags: [
        "Step 7 (manual verification) budgets 180 likely minutes for up to 45 companies — under 4 " +
          "minutes/company for a from-scratch trading-status and contact check; plausible only if most " +
          "rows are quick confirms rather than genuine investigation.",
      ],
      overall_assessment:
        "Sound research chain with a sourced deliverable and an honest unconfirmed-items path. One " +
        "time estimate on the human verification step is optimistic for the stated volume; not blocking.",
      severity: "minor",
    }),
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
    critique: critique(),
  },
  {
    id: "W3",
    match: "independent bookshops",
    classification: classification({ quantity_interpreted: 80, required_fields: worldFields("W3") }),
    plan: () => researchPlan(),
    critique: critique(),
  },
  {
    id: "W4",
    match: "runs operations",
    classification: classification({ quantity_interpreted: 30, required_fields: worldFields("W4") }),
    plan: () => researchPlan(),
    critique: critique({
      security_risk_flags: [
        "Brief explicitly restricts this to business contacts only — plan has no step that would ever " +
          "surface a personal email or phone, which is correct, but nothing enforces it structurally " +
          "beyond the extraction prompt. Worth an operator spot-check on the delivered rows.",
      ],
      severity: "minor",
    }),
  },
  {
    id: "W5",
    match: "project-management tools",
    classification: classification({ quantity_interpreted: 30, required_fields: worldFields("W5") }),
    plan: () => researchPlan(),
    critique: critique(),
  },
  {
    id: "W6",
    match: "five different formats",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 120 }),
    plan: (refs) => filePlan(refs, "normalize"),
    critique: critique(),
  },
  {
    id: "W7",
    match: "duplicate signups",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 108 }),
    plan: (refs) => filePlan(refs, "dedupe"),
    critique: critique({
      missing_steps: [
        "Brief distinguishes exact-email duplicates (merge) from same-company different-email pairs " +
          "(list separately, do not merge) — confirm the dedupe step's keyFields is exactly " +
          "contact_email, not a broader company-name match that would conflate the two cases.",
      ],
      severity: "minor",
    }),
  },
  {
    id: "W8",
    match: "different column names",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 105 }),
    plan: (refs) => consolidationPlan(refs),
    critique: critique(),
  },
  {
    id: "W9",
    match: "still active today",
    classification: classification({ source_shape: "existing_file", quantity_interpreted: 12 }),
    plan: (refs) => filePlan(refs, "normalize"),
    critique: critique(),
  },
  {
    id: "W10",
    match: "verified independently across separate sources",
    classification: classification({ source_shape: "mixed", verification_expectation: "two_independent_sources", quantity_interpreted: 25 }),
    plan: () => expensivePlan(),
    critique: critique({
      time_risk_flags: [
        "Step 9 (resolve conflicts across three sources) budgets 90 likely minutes for up to 25 " +
          "companies × 3 fields each — roughly 7 minutes per company if every field disagrees across " +
          "sources; plausible only when disagreement is the exception, not the rule.",
      ],
      overall_assessment:
        "Thorough three-source verification chain matching the brief's explicit request for " +
        "independent corroboration. Cost is high for the volume — expect the economic preflight to " +
        "demote some automated steps if the budget is tight. No missing coverage.",
      severity: "minor",
    }),
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
    // R1: the sensitive/personal_sensitive refusal case. The critique runs on
    // the RAW plan before compile.ts's mandate-level gate ever touches it, so
    // its job is to name the reason no step here may ever run automated.
    critique: critique({
      security_risk_flags: [
        "The attached file carries employee SIN numbers, dates of birth and salaries — " +
          "personal_sensitive data by definition — into a plan whose steps are otherwise machine " +
          "executor (dedupe, sort). No automated step may ever see this file; every step must run " +
          "human-only regardless of how the plan is currently labelled.",
      ],
      missing_steps: [
        "No explicit legal-basis / consent check for processing SIN numbers appears before any " +
          "work begins.",
      ],
      overall_assessment:
        "This plan cannot run as automation at any step: SIN, date of birth and salary data make it " +
        "personal_sensitive, and no tool or model call may see this file. Must be entirely " +
        "human-handled and admin-reviewed before acceptance, not priced as if any step were machine work.",
      severity: "blocking",
    }),
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
    // R2: the recurring/client-access refusal case. Flags the two separate
    // reasons this cannot run as a standard automated plan: credentials
    // AfterDesk does not hold, and an unbounded recurring commitment.
    critique: critique({
      security_risk_flags: [
        "Brief asks the system to log into the client's HubSpot and send email from the client's own " +
          "address — both require credentials AfterDesk does not hold, and sending as the client " +
          "violates the platform's zero-contact / no-impersonation rule.",
      ],
      missing_steps: [
        "No access-provisioning step exists for the client's HubSpot, and 'every week, ongoing' has " +
          "no defined stop condition or review cadence.",
      ],
      wrong_tool_flags: [
        "Plan reuses the standard research chain, but this mandate needs authenticated CRM access and " +
          "a recurring schedule, neither of which any listed primitive provides.",
      ],
      overall_assessment:
        "Recurring, credentialed access to a client system and sending email as the client are both " +
        "out of scope for automated execution. Needs a manual quote and a custom recurring-service " +
        "agreement, not a standard one-off plan.",
      severity: "blocking",
    }),
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
