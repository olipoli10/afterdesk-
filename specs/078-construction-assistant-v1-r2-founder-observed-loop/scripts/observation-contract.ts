import { createHash } from "node:crypto";
import { z } from "zod";

export const CONTROL_ID = "STATELESS_CHAT_STYLE_CONTROL" as const;

export const equalInputSequenceSchema = z.object({
  schemaVersion: z.literal(1),
  controlId: z.literal(CONTROL_ID),
  referenceNow: z.string().datetime(),
  timezone: z.literal("America/Toronto"),
  locale: z.literal("fr-CA"),
  workspace: z.literal("ENDVERA Construction — Olivier"),
  project: z.object({ code: z.literal("LAVAL-001"), name: z.literal("Rénovation Laval") }).strict(),
  contact: z.object({ displayName: z.literal("Marc"), role: z.literal("Fournisseur") }).strict(),
  orderedInputs: z.tuple([
    z.literal("Rendez-vous avec Marc mardi à 14 h pour Laval."),
    z.literal("Rendez-vous avec Marc mardi à 2 pour Laval."),
    z.literal("Qu’est-ce que j’ai demain?"),
    z.literal("SMS_LOCAL|r2-founder-observed-001|Le matériel de Laval est prêt pour mardi."),
    z.literal("SMS_LOCAL|r2-founder-observed-001|Le matériel de Laval est prêt pour mardi."),
    z.literal("Texte Marc que je serai 30 minutes en retard."),
  ]),
}).strict();

export const founderObservationSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  observer: z.literal("Olivier"),
  founderCompleted: z.literal(true),
  sessionStartedAtUtc: z.string().datetime(),
  sessionCompletedAtUtc: z.string().datetime(),
  clarificationUnderstandabilityRating: z.number().int().min(1).max(5),
  approvalComprehensionRating: z.number().int().min(1).max(5),
  founderCorrectionCount: z.number().int().min(0).max(100),
  founderActiveMinutes: z.number().positive().max(240),
  manualContextRestatementCount: z.number().int().min(0).max(100),
  nextDecisionIdentified: z.boolean(),
  actionabilityRating: z.number().int().min(1).max(5),
  observableAdvantageRating: z.number().int().min(-2).max(2),
  observedManagedAdvantages: z.array(z.enum([
    "NO_MANUAL_CONTEXT_REPETITION",
    "PERSISTENT_STATE_AFTER_NAVIGATION",
    "PROVENANCE_ACCESSIBLE",
    "DUPLICATE_REPLAY_REFUSAL",
    "EXACT_APPROVAL",
    "RECONSTRUCTIBLE_HISTORY",
  ])).min(1),
  founderNotes: z.string().trim().max(2_000),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.sessionCompletedAtUtc) <= Date.parse(value.sessionStartedAtUtc)) {
    ctx.addIssue({ code: "custom", path: ["sessionCompletedAtUtc"], message: "SESSION_TIMER_INVALID" });
  }
});

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function assertEqualControlInputs(input: unknown, control: unknown): void {
  const accepted = equalInputSequenceSchema.parse(input);
  const candidate = equalInputSequenceSchema.parse(control);
  if (sha256Canonical(accepted) !== sha256Canonical(candidate)) throw new Error("CONTROL_INPUTS_NOT_EQUAL");
}
