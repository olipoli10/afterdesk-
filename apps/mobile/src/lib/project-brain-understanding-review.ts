import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const base = { schemaVersion: z.literal(1), commandId: z.string().uuid(), workspaceId: id, projectId: id };
const mutation = { ...base, reviewId: id, expectedStateVersion: z.number().int().positive() };
export const mobileProjectBrainUnderstandingCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW") }).strict(),
  z.object({ ...mutation, action: z.literal("DISPOSITION_PROJECT_BRAIN_CANDIDATE"), candidateId: id, disposition: z.enum(["ACCEPT_AS_REVIEWED", "REJECT_AS_UNSUPPORTED", "RETAIN_FOR_CONTRADICTION"]) }).strict(),
  z.object({ ...mutation, action: z.literal("DECLARE_PROJECT_BRAIN_CONTRADICTION"), candidateIds: z.array(id).min(2).max(146) }).strict(),
  z.object({ ...mutation, action: z.literal("RESOLVE_PROJECT_BRAIN_CONTRADICTION"), contradictionId: id, resolution: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("SELECT_SUPPORTED_CANDIDATES"), selectedCandidateIds: z.array(id).min(1).max(146) }).strict(),
    z.object({ mode: z.literal("REJECT_ALL_UNSUPPORTED") }).strict(),
    z.object({ mode: z.literal("OWNER_RESOLUTION"), ownerResolutionText: z.string().min(1).max(4_000) }).strict(),
  ]) }).strict(),
  z.object({ ...mutation, action: z.literal("PREPARE_PROJECT_BRAIN_UNDERSTANDING") }).strict(),
  z.object({ ...mutation, action: z.literal("CONFIRM_PROJECT_BRAIN_UNDERSTANDING"), reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
]);

export type MobileProjectBrainUnderstandingCommand = z.infer<typeof mobileProjectBrainUnderstandingCommandSchema>;

export type MobileProjectBrainUnderstandingProjection = {
  schemaVersion: 1;
  review: null | {
    id: string; workspaceId: string; projectId: string; intakeId: string; candidateBatchId: string;
    stateVersion: number; status: "DRAFT" | "READY_FOR_CONFIRMATION" | "CONFIRMED";
    reviewFingerprint: string | null; confirmedUnderstandingSequence: number | null;
    sources: { id: string; ordinal: number; kind: string; displayName: string; mimeType: string; sizeBytes: number; durationMs: number | null; contentHash: string }[];
    candidates: { id: string; value: string; status: "CANDIDATE_UNCONFIRMED"; confidenceClass: string; provenance: Record<string, unknown>; dispositions: { id: string; disposition: "ACCEPT_AS_REVIEWED" | "REJECT_AS_UNSUPPORTED" | "RETAIN_FOR_CONTRADICTION"; nextStateVersion: number }[] }[];
    contradictions: { id: string; memberCandidateIds: string[]; resolutions: { id: string; resolution: { mode: string; selectedCandidateIds?: string[]; ownerResolutionText?: string }; nextStateVersion: number }[] }[];
    proposedSnapshotHash: string | null; confirmedSnapshotHash: string | null; limitations: string[];
  };
  falseEffects: Record<string, false>;
};

export function projectBrainUnderstandingRoute(projectId: string): string {
  return `/(app)/project-brain-understanding-review?projectId=${encodeURIComponent(projectId)}`;
}

export function selectedContradictionCandidates(current: string[], candidateId: string): string[] {
  return current.includes(candidateId) ? current.filter((item) => item !== candidateId) : [...current, candidateId];
}

export function parseProjectBrainUnderstandingProjection(value: unknown): MobileProjectBrainUnderstandingProjection {
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1) throw new Error("PROJECT_BRAIN_UNDERSTANDING_RESPONSE_INVALID");
  return value as MobileProjectBrainUnderstandingProjection;
}
