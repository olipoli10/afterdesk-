import "server-only";
import { z } from "zod";

/**
 * THE SHAPES OF EVERY MODEL OUTPUT IN THE WORK ENGINE.
 *
 * One file on purpose: the classification, the plan and the critique each
 * have a zod schema (what the code trusts after parsing) and a JSON Schema
 * literal (what the model is constrained to at the API level). Keeping the
 * pairs side by side makes a drift between them a code-review problem
 * instead of a runtime surprise.
 *
 * The JSON Schema literals use the structured-outputs subset: nullability is
 * `anyOf: [X, {type: "null"}]` or `type: ["string","null"]` — the same
 * convention src/lib/ai.ts documents for the intake SCHEMA. Every object is
 * `additionalProperties: false` and every property is required: a model that
 * wants to say "nothing" says [] or null explicitly, never by omission.
 *
 * STRING CAPS ARE ABUSE GUARDS, NOT STYLE HINTS. A live critique died in
 * validation because a security flag ran 300+ characters — losing a safety
 * check over sentence length is the worst possible trade. Per-string maxima
 * below are sized so no plausible model output hits them; brevity is asked
 * for in the prompts. Array counts and numeric bounds ARE structural and
 * stay tight.
 */

// ── Vocabulary shared with prisma/schema.prisma (kept in lockstep by tests) ──

export const VERIFICATION_LEVELS = ["light", "standard", "rigorous"] as const;
/**
 * `auto` is deliberately not here. Level-1 instant quoting is banned in code
 * until a workflow has a measured estimation error on real executions
 * (founder decision, Phase 1A adjustment 5) — the ban lives in the vocabulary
 * itself, so no prompt change or code path can produce it by accident.
 */
export const QUOTE_TIERS = ["assisted", "manual"] as const;
export const STEP_EXECUTORS = ["ai", "human", "deterministic_code"] as const;
export const STEP_HUMAN_ROLES = ["worker", "specialist", "reviewer", "admin"] as const;
export const STEP_RISK_LEVELS = ["low", "medium", "high"] as const;
export const CRITIQUE_SEVERITIES = ["none", "minor", "major", "blocking"] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

/**
 * The tools a plan may name. A closed list in the PROMPT and the catalog, a
 * plain string in the database: the model is told this vocabulary, the cost
 * catalog resolves it, and anything outside it costs zero and raises a
 * critique flag instead of crashing a parse. `linkedin` is intentionally not
 * a tool: LinkedIn corroboration is a HUMAN step (its User Agreement bans
 * automation and hiQ v. LinkedIn ended with a breach-of-contract judgment;
 * see docs/VERIFIED-PROSPECT-STANDARD.md).
 */
export const PLAN_TOOLS = ["web_search", "internal_script", "spreadsheet", "manual"] as const;

export const MAX_PLAN_STEPS = 12;

// ── Stage 1: classification ──

export const classificationOutputSchema = z.object({
  category_slug_guess: z.string().max(500).nullable(),
  objective: z.string().min(1).max(2000),
  deliverable_format: z.string().min(1).max(1000),
  required_fields: z.array(z.string().max(500)).max(30),
  quantity_interpreted: z.number().int().min(0).max(1_000_000).nullable(),
  geography: z.array(z.string().max(500)).max(10),
  verification_level: z.enum(VERIFICATION_LEVELS),
  source_requirements: z.array(z.string().max(1000)).max(10),
  sensitive_data: z.boolean(),
  required_access: z.array(z.string().max(1000)).max(10),
  missing_information: z.array(z.string().max(1500)).max(10),
  assumptions: z.array(z.string().max(1500)).max(10),
  quote_tier: z.enum(QUOTE_TIERS),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;

export const CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    category_slug_guess: { type: ["string", "null"] },
    objective: { type: "string" },
    deliverable_format: { type: "string" },
    required_fields: { type: "array", items: { type: "string" } },
    quantity_interpreted: { type: ["number", "null"] },
    geography: { type: "array", items: { type: "string" } },
    verification_level: { type: "string", enum: [...VERIFICATION_LEVELS] },
    source_requirements: { type: "array", items: { type: "string" } },
    sensitive_data: { type: "boolean" },
    required_access: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    quote_tier: { type: "string", enum: [...QUOTE_TIERS] },
    confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
  },
  required: [
    "category_slug_guess",
    "objective",
    "deliverable_format",
    "required_fields",
    "quantity_interpreted",
    "geography",
    "verification_level",
    "source_requirements",
    "sensitive_data",
    "required_access",
    "missing_information",
    "assumptions",
    "quote_tier",
    "confidence",
  ],
  additionalProperties: false,
} as const;

// ── Stage 2: execution plan ──

export const planStepOutputSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(4000),
    executor: z.enum(STEP_EXECUTORS),
    human_role: z.enum(STEP_HUMAN_ROLES).nullable(),
    // An off-vocabulary tool is priced at zero and critique-flagged — a
    // plan must never die in validation because of a weird tool string.
    tool: z.string().max(200).nullable(),
    estimated_minutes_optimistic: z.number().int().min(0).max(6000),
    estimated_minutes_likely: z.number().int().min(0).max(6000),
    estimated_minutes_conservative: z.number().int().min(0).max(6000),
    estimated_ai_cost_cents: z.number().int().min(0).max(100_000),
    estimated_tool_units: z.number().int().min(0).max(100_000),
    verification_method: z.string().min(1).max(2000),
    acceptance_criteria: z.array(z.string().max(1000)).max(8),
    risk_level: z.enum(STEP_RISK_LEVELS),
    risk_note: z.string().max(2000).nullable(),
    depends_on_order: z.array(z.number().int().min(1).max(MAX_PLAN_STEPS)).max(MAX_PLAN_STEPS),
  })
  .superRefine((s, ctx) => {
    if (s.estimated_minutes_optimistic > s.estimated_minutes_likely) {
      ctx.addIssue({
        code: "custom",
        path: ["estimated_minutes_optimistic"],
        message: "Optimistic minutes cannot exceed likely minutes.",
      });
    }
    if (s.estimated_minutes_likely > s.estimated_minutes_conservative) {
      ctx.addIssue({
        code: "custom",
        path: ["estimated_minutes_conservative"],
        message: "Conservative minutes cannot be below likely minutes.",
      });
    }
    if (s.executor === "human" && s.human_role === null) {
      ctx.addIssue({
        code: "custom",
        path: ["human_role"],
        message: "A human step needs a human role.",
      });
    }
  });

export const planOutputSchema = z.object({
  deliverable_description: z.string().min(1).max(2000),
  assumptions: z.array(z.string().max(1500)).max(10),
  exclusions: z.array(z.string().max(1500)).max(10),
  steps: z.array(planStepOutputSchema).min(1).max(MAX_PLAN_STEPS),
});
export type PlanOutput = z.infer<typeof planOutputSchema>;
export type PlanStepOutput = z.infer<typeof planStepOutputSchema>;

const PLAN_STEP_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    executor: { type: "string", enum: [...STEP_EXECUTORS] },
    // anyOf nullability, not enum-with-null: the structured-outputs subset
    // rejected maxItems at runtime, so every construct here sticks to forms
    // the existing intake SCHEMA already proved accepted (see ai.ts).
    human_role: {
      anyOf: [{ type: "string", enum: [...STEP_HUMAN_ROLES] }, { type: "null" }],
    },
    tool: { type: ["string", "null"] },
    estimated_minutes_optimistic: { type: "number" },
    estimated_minutes_likely: { type: "number" },
    estimated_minutes_conservative: { type: "number" },
    estimated_ai_cost_cents: { type: "number" },
    estimated_tool_units: { type: "number" },
    verification_method: { type: "string" },
    acceptance_criteria: { type: "array", items: { type: "string" } },
    risk_level: { type: "string", enum: [...STEP_RISK_LEVELS] },
    risk_note: { type: ["string", "null"] },
    depends_on_order: { type: "array", items: { type: "number" } },
  },
  required: [
    "title",
    "description",
    "executor",
    "human_role",
    "tool",
    "estimated_minutes_optimistic",
    "estimated_minutes_likely",
    "estimated_minutes_conservative",
    "estimated_ai_cost_cents",
    "estimated_tool_units",
    "verification_method",
    "acceptance_criteria",
    "risk_level",
    "risk_note",
    "depends_on_order",
  ],
  additionalProperties: false,
} as const;

export const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    deliverable_description: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    exclusions: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: PLAN_STEP_JSON_SCHEMA },
  },
  required: ["deliverable_description", "assumptions", "exclusions", "steps"],
  additionalProperties: false,
} as const;

// ── Admin plan edit (round-trip of the generated plan) ──

/**
 * The edit form ROUND-TRIPS model-generated text: whatever the generation
 * schemas above allow must re-validate here unchanged, or a long honest
 * sentence makes the plan uneditable (found live: an AI assumption over the
 * edit cap blocked every save). Caps below therefore mirror the generation
 * caps field for field — colocated so a future cap change touches both or
 * fails the alignment test.
 */
export const editStepInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(4000),
    executor: z.enum(STEP_EXECUTORS),
    humanRole: z.enum(STEP_HUMAN_ROLES).nullable(),
    tool: z.string().trim().max(200).nullable(),
    estimatedMinutesOptimistic: z.coerce.number().int().min(0).max(6000),
    estimatedMinutesLikely: z.coerce.number().int().min(0).max(6000),
    estimatedMinutesConservative: z.coerce.number().int().min(0).max(6000),
    estimatedAiCostCents: z.coerce.number().int().min(0).max(100_000),
    estimatedToolUnits: z.coerce.number().int().min(0).max(100_000),
    verificationMethod: z.string().trim().min(1).max(2000),
    acceptanceCriteria: z.array(z.string().trim().max(1000)).max(8),
    riskLevel: z.enum(STEP_RISK_LEVELS),
    riskNote: z.string().trim().max(2000).nullable(),
    dependsOnOrder: z.array(z.coerce.number().int().min(1).max(MAX_PLAN_STEPS)).max(MAX_PLAN_STEPS),
  })
  .superRefine((s, ctx) => {
    if (s.estimatedMinutesOptimistic > s.estimatedMinutesLikely) {
      ctx.addIssue({
        code: "custom",
        path: ["estimatedMinutesOptimistic"],
        message: "Optimistic minutes cannot exceed likely minutes.",
      });
    }
    if (s.estimatedMinutesLikely > s.estimatedMinutesConservative) {
      ctx.addIssue({
        code: "custom",
        path: ["estimatedMinutesConservative"],
        message: "Conservative minutes cannot be below likely minutes.",
      });
    }
    if (s.executor === "human" && s.humanRole === null) {
      ctx.addIssue({
        code: "custom",
        path: ["humanRole"],
        message: "A human step needs a human role.",
      });
    }
  });

export const editPlanInputSchema = z.object({
  taskId: z.string(),
  /** The version the admin was looking at — becomes parentVersionId. */
  baseVersionId: z.string(),
  editNote: z.string().trim().max(500).optional(),
  deliverableDescription: z.string().trim().min(1).max(2000),
  assumptions: z.array(z.string().trim().max(1500)).max(10),
  exclusions: z.array(z.string().trim().max(1500)).max(10),
  steps: z.array(editStepInputSchema).min(1).max(MAX_PLAN_STEPS),
});
export type EditPlanInput = z.infer<typeof editPlanInputSchema>;

// ── Stage 4: critique ──

export const critiqueOutputSchema = z.object({
  // The exact live incident: a 300-char cap here silently killed a whole
  // critique. 2000 is unhittable by an honest flag and still bounds abuse.
  missing_steps: z.array(z.string().max(2000)).max(10),
  wrong_tool_flags: z.array(z.string().max(2000)).max(10),
  time_risk_flags: z.array(z.string().max(2000)).max(10),
  security_risk_flags: z.array(z.string().max(2000)).max(10),
  overall_assessment: z.string().min(1).max(4000),
  severity: z.enum(CRITIQUE_SEVERITIES),
});
export type CritiqueOutput = z.infer<typeof critiqueOutputSchema>;

export const CRITIQUE_JSON_SCHEMA = {
  type: "object",
  properties: {
    missing_steps: { type: "array", items: { type: "string" } },
    wrong_tool_flags: { type: "array", items: { type: "string" } },
    time_risk_flags: { type: "array", items: { type: "string" } },
    security_risk_flags: { type: "array", items: { type: "string" } },
    overall_assessment: { type: "string" },
    severity: { type: "string", enum: [...CRITIQUE_SEVERITIES] },
  },
  required: [
    "missing_steps",
    "wrong_tool_flags",
    "time_risk_flags",
    "security_risk_flags",
    "overall_assessment",
    "severity",
  ],
  additionalProperties: false,
} as const;
