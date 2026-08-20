import type { ClassificationOutput } from "@/lib/ai-work-engine/schemas";

export const CLASSIFICATION_BASELINE = {
  source: "src/lib/ai-work-engine/classify.ts",
  model: "claude-sonnet-5",
  maxOutputTokens: 4_000,
  sdkMaxRetries: 0,
  effort: "low",
  systemPromptOpening:
    "You are the task classifier for AfterDesk, a managed back-office execution service.",
  failureMappings: [
    "stop_reason=refusal",
    "stop_reason=max_tokens",
    "no text block",
    "output is not JSON",
    "failed zod validation",
  ] as const,
} as const;

export const CLASSIFICATION_BASELINE_INPUT = {
  title: "Normalize supplier records",
  description: "Clean the supplied business supplier list and return an XLSX file.",
  quantity: "25",
  attachmentLines: ["ref=file-1 name=suppliers.csv kind=input size=2048"],
  categories: [
    { slug: "data-cleanup", name: "Data cleanup", disputeCriteria: "Required fields preserved" },
  ],
} as const;

export const CLASSIFICATION_BASELINE_OUTPUT: ClassificationOutput = {
  category_slug_guess: "data-cleanup",
  objective: "Produce a normalized supplier list.",
  deliverable_format: "XLSX file",
  required_fields: ["supplier_name"],
  quantity_interpreted: 25,
  geography: [],
  verification_level: "standard",
  source_requirements: [],
  sensitive_data: false,
  required_access: [],
  missing_information: [],
  assumptions: [],
  quote_tier: "assisted",
  confidence: "high",
  source_shape: "existing_file",
  verification_expectation: "best_available",
  output_format_code: "xlsx",
  recurrence: "one_off",
};
