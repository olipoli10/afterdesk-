import { z } from "zod";

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.string().datetime();
const kind = z.enum(["CONTACTS_CSV", "PROJECTS_CSV"]);
const rowState = z.enum(["READY", "DUPLICATE", "CONFLICT", "INVALID"]);
const reason = z.enum(["MISSING_REQUIRED_VALUE", "FIELD_TOO_LONG", "INVALID_PHONE", "INVALID_EMAIL", "PROJECT_NOT_FOUND", "PROJECT_LINK_AMBIGUOUS", "PROJECT_CODE_DUPLICATE", "CONTACT_IDENTITY_DUPLICATE", "CONTACT_IDENTITY_AMBIGUOUS"]);
const decision = z.enum(["SKIP", "CREATE_NEW", "USE_EXISTING"]);
const commandBase = { schemaVersion: z.literal(1), commandId: z.string().uuid() };
const workspaceBase = { ...commandBase, workspaceId: id };

const decide = z.object({ ...workspaceBase, action: z.literal("DECIDE_IMPORT_ROW"), batchId: id, rowId: id, expectedBatchVersion: z.number().int().positive(), decision, matchedCanonicalId: id.optional() }).strict().superRefine((value, context) => {
  if ((value.decision === "USE_EXISTING") !== Boolean(value.matchedCanonicalId)) context.addIssue({ code: "custom", path: ["matchedCanonicalId"], message: "Exact candidate required." });
});
const batchBase = { ...workspaceBase, batchId: id, expectedBatchVersion: z.number().int().positive(), sourceHash: hash, previewFingerprint: hash };
export const mobileOnboardingCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...commandBase, action: z.literal("INITIALIZE_WORKSPACE"), name: z.string().trim().min(1).max(160), timezone: z.string().trim().min(1).max(120), locale: z.enum(["fr-CA", "en-CA"]) }).strict(),
  z.object({ ...workspaceBase, action: z.literal("CREATE_FIRST_PROJECT"), code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(160), address: z.string().trim().max(300).optional() }).strict(),
  z.object({ ...workspaceBase, action: z.literal("CREATE_FIRST_CONTACT"), projectId: id.optional(), displayName: z.string().trim().min(1).max(160), role: z.string().trim().min(1).max(120), phone: z.string().trim().max(40).optional(), email: z.string().trim().max(254).optional() }).strict(),
  z.object({ ...workspaceBase, action: z.literal("PREVIEW_IMPORT"), kind, csvText: z.string().min(1).max(1_048_576) }).strict(),
  decide,
  z.object({ ...batchBase, action: z.literal("COMMIT_IMPORT") }).strict(),
  z.object({ ...batchBase, action: z.literal("DISCARD_IMPORT") }).strict(),
  z.object({ ...workspaceBase, action: z.literal("COMPLETE_ONBOARDING"), expectedSessionVersion: z.number().int().positive() }).strict(),
]);

const project = z.object({ id, code: z.string().min(1), name: z.string().min(1) }).strict();
const contact = z.object({ id, displayName: z.string().min(1), roleLabel: z.string().nullable(), projectId: id.nullable() }).strict();
const activeBatch = z.object({
  id, kind, status: z.enum(["PREVIEW", "DECISIONS_REQUIRED", "READY_TO_COMMIT", "COMMITTED", "DISCARDED", "REFUSED"]), stateVersion: z.number().int().positive(), sourceHash: hash, previewFingerprint: hash,
  rowCount: z.number().int().min(0).max(500), counts: z.object({ ready: z.number().int().nonnegative(), duplicate: z.number().int().nonnegative(), conflict: z.number().int().nonnegative(), invalid: z.number().int().nonnegative() }).strict(),
  rows: z.array(z.object({ id, rowNumber: z.number().int().positive(), state: rowState, reasonCodes: z.array(reason), normalizedProposal: z.record(z.string(), z.string().nullable()), candidateCanonicalIds: z.array(id), decision: z.object({ action: decision, matchedCanonicalId: id.nullable() }).strict().nullable() }).strict()).max(500),
}).strict();
const manager = z.object({
  schemaVersion: z.literal(1), generatedAt: instant, role: z.enum(["OWNER", "OFFICE_MANAGER"]),
  session: z.object({ id, workspaceId: id.nullable(), stage: z.enum(["COMPANY", "FIRST_PROJECT", "FIRST_CONTACT", "OPTIONAL_IMPORT", "READY", "COMPLETE"]), status: z.enum(["ACTIVE", "COMPLETED"]), stateVersion: z.number().int().positive(), firstValueReady: z.boolean(), nextAction: z.string().min(1).max(80) }).strict().nullable(),
  workspace: z.object({ id, name: z.string().min(1), timezone: z.string().min(1), locale: z.enum(["fr-CA", "en-CA"]) }).strict().nullable(),
  projects: z.array(project), contacts: z.array(contact), activeBatch: activeBatch.nullable(), providerObserved: z.literal(false), externalEffectCount: z.literal(0),
}).strict();
const field = z.object({ schemaVersion: z.literal(1), generatedAt: instant, role: z.literal("FIELD_WORKER"), workspace: z.object({ id, name: z.string().min(1) }).strict(), assignedProjects: z.array(project), nextAction: z.string().min(1).max(80), providerObserved: z.literal(false), externalEffectCount: z.literal(0) }).strict();
export const mobileOnboardingCockpitSchema = z.discriminatedUnion("role", [manager, field]);

const FIELD_FORBIDDEN = new Set(["activeBatch", "contacts", "sourceHash", "previewFingerprint", "rowCount", "counts", "normalizedPhone", "normalizedEmail", "candidateCanonicalIds"]);
function rejectFieldLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN.has(key)) throw new Error("MOBILE_ONBOARDING_FIELD_LEAK_REFUSED");
    rejectFieldLeaks(child);
  }
}
export function parseMobileOnboardingCockpit(value: unknown) {
  const parsed = mobileOnboardingCockpitSchema.parse(value);
  if (parsed.role === "FIELD_WORKER") rejectFieldLeaks(parsed);
  return parsed;
}

export const mobileOnboardingResultSchema = z.object({ schemaVersion: z.literal(1), commandId: z.string().uuid(), replayed: z.boolean(), providerObserved: z.literal(false), externalEffectCount: z.literal(0), resultType: z.enum(["WORKSPACE", "PROJECT", "CONTACT", "IMPORT_PREVIEW", "IMPORT_DECISION", "IMPORT_COMMIT", "ONBOARDING"]), workspaceId: id }).passthrough();
export type MobileOnboardingCockpit = ReturnType<typeof parseMobileOnboardingCockpit>;
export type MobileOnboardingCommand = z.infer<typeof mobileOnboardingCommandSchema>;
