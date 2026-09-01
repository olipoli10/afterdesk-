/**
 * LOT C — INTAKE FRAMING: the closed vocabulary of what a brief actually IS.
 *
 * Three distinctions the Commercial Readiness audit showed the intake was
 * blurring, plus one commercial guard, all made explicit and machine-checkable:
 *
 *   source_shape — where the units come from. A pasted list is not a file
 *   (there is nothing to ingest), and a list to build is research. Before
 *   LOT A the planner papered over this by inventing fileIds; now that refs
 *   are real, the DISTINCTION is what prevents the next hack: an ingest step
 *   exists only for a file that exists.
 *
 *   verification_expectation — the standard the client asked for, read out
 *   loud instead of implied. It sizes the HUMAN verification step; it never
 *   unlocks automated verification (conflicts@3 / authority-source are out of
 *   scope and nothing here may promise them). Units that cannot meet the bar
 *   are delivered separately as exceptions, never silently included.
 *
 *   output_format_code — what artifact the client expects, as a code the
 *   engine can route on. "other" means no built primitive produces it, so an
 *   operator decides how it gets delivered.
 *
 *   recurrence — a recurring ask is a commercial arrangement, not a plan
 *   shape. The engine plans ONE occurrence and the operator decides the
 *   arrangement; nothing reactivates Standing Capacity automatically.
 *
 * NO IMPORTS, like primitive-vocabulary.ts: client components render these
 * labels and the schema module re-exports the vocabulary, so this file must
 * pull neither "server-only" nor anything that transitively does.
 */

export const SOURCE_SHAPES = ["existing_file", "pasted_targets", "build_list", "mixed"] as const;
export type SourceShape = (typeof SOURCE_SHAPES)[number];

export const VERIFICATION_EXPECTATIONS = [
  "best_available",
  "two_independent_sources",
  "official_source",
] as const;
export type VerificationExpectation = (typeof VERIFICATION_EXPECTATIONS)[number];

export const OUTPUT_FORMAT_CODES = ["csv", "xlsx", "table_in_message", "other"] as const;
export type OutputFormatCode = (typeof OUTPUT_FORMAT_CODES)[number];

export const RECURRENCES = ["one_off", "recurring"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** Operator-facing labels — shown on the pricing screen's classification block. */
export const SOURCE_SHAPE_LABELS: Record<SourceShape, string> = {
  existing_file: "Existing file (attached)",
  pasted_targets: "Targets pasted in the brief",
  build_list: "List to build from research",
  mixed: "Mixed / unclear source",
};
export const VERIFICATION_EXPECTATION_LABELS: Record<VerificationExpectation, string> = {
  best_available: "Best available, sources cited",
  two_independent_sources: "Two independent sources per unit",
  official_source: "Official source required",
};
export const OUTPUT_FORMAT_LABELS: Record<OutputFormatCode, string> = {
  csv: "CSV file",
  xlsx: "Excel workbook",
  table_in_message: "Table in the delivery message",
  other: "Other — operator decides delivery",
};
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  one_off: "One-off",
  recurring: "Recurring request",
};

/**
 * THE CODE-ENFORCED HALF OF THE FRAMING. Prompt rules can drift; this cannot.
 *
 * Two corrections, both applied to the model output BEFORE anything reads it,
 * on the live path and the resume path alike, so shouldCritique, the
 * persisted row and the admin screen all see the same framed values:
 *
 * 1. A recurring ask or an artifact no primitive produces is forced to the
 *    "manual" quote tier — the strongest admin-review signal the vocabulary
 *    has (there is no automatic tier at all; see QUOTE_TIERS).
 *
 * 2. `source_shape: "existing_file"` requires an attachment that EXISTS.
 *    The Level-2 corpus caught the classifier answering "existing_file" for
 *    a brief that says "attached" while nothing is attached (g07) — and
 *    whether a file exists is a fact the code owns, not an opinion the model
 *    holds. With zero attachments the shape becomes "mixed" (source unclear)
 *    and the absence is recorded in missing_information, so the operator
 *    reads the contradiction instead of a claim about a phantom file. The
 *    runtime walls (no ingest without a manifest ref) stay untouched — this
 *    correction removes the lie from the intake, it was never the last line
 *    of defence.
 *
 * Both only ever tighten: nothing here can turn "manual" into "assisted",
 * and nothing here can conjure a file that is not there.
 */
export function applyIntakeFraming<
  T extends {
    quote_tier: "assisted" | "manual";
    recurrence: Recurrence;
    output_format_code: OutputFormatCode;
    source_shape: SourceShape;
    missing_information: string[];
  },
>(output: T, context: { attachmentCount: number }): T {
  let framed = output;
  if (framed.source_shape === "existing_file" && context.attachmentCount === 0) {
    framed = {
      ...framed,
      source_shape: "mixed" as SourceShape,
      // Bounded append: the classification schema caps this list at 10, and
      // a framed output must stay re-validatable.
      missing_information:
        framed.missing_information.length < 10
          ? [
              ...framed.missing_information,
              "The brief refers to an attached file, but nothing is attached.",
            ]
          : framed.missing_information,
    };
  }
  if (framed.recurrence === "recurring" || framed.output_format_code === "other") {
    framed = { ...framed, quote_tier: "manual" };
  }
  return framed;
}
