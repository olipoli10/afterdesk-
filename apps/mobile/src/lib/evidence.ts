import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

export const evidenceKindSchema = z.enum(["WRITTEN_APPROVAL", "PHOTO", "DOCUMENT"]);

export const mobileEvidenceUploadCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    loopId: z.string().min(1),
    expectedStateVersion: z.number().int().positive(),
    kind: evidenceKindSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    uri: z.string().min(1),
  })
  .strict();

export const mobileEvidenceUploadResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    loopId: z.string().min(1),
    evidenceId: z.string().min(1),
    kind: evidenceKindSchema,
    state: z.literal("PRESENT_UNVERIFIED"),
    stateVersion: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    fileName: z.string().min(1),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type MobileEvidenceUploadCommand = z.infer<
  typeof mobileEvidenceUploadCommandSchema
>;
export type MobileEvidenceUploadResult = z.infer<
  typeof mobileEvidenceUploadResultSchema
>;
export type EvidenceAttemptState =
  | "READY"
  | "SENDING"
  | "CONFIRMED"
  | "REPLAYED"
  | "CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "REFUSED";

export type EvidenceAttempt = Readonly<{
  command: MobileEvidenceUploadCommand;
  state: EvidenceAttemptState;
  result: MobileEvidenceUploadResult | null;
  publicError: string | null;
}>;

function defaultId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("MOBILE_RANDOM_ID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

export function createEvidenceAttempt(input: {
  workspace: MobileWorkspace;
  projectId: string;
  loopId: string;
  expectedStateVersion: number;
  kind: EvidenceKind;
  file: { uri: string; name: string; mimeType: string | null; size: number | null };
  idFactory?: () => string;
}): EvidenceAttempt {
  if (!input.workspace.permissions.canAddEvidence) {
    throw new Error("MOBILE_EVIDENCE_PERMISSION_REFUSED");
  }
  const command = mobileEvidenceUploadCommandSchema.parse({
    schemaVersion: 1,
    commandId: (input.idFactory ?? defaultId)(),
    workspaceId: input.workspace.id,
    projectId: input.projectId,
    loopId: input.loopId,
    expectedStateVersion: input.expectedStateVersion,
    kind: input.kind,
    fileName: input.file.name,
    mimeType: input.file.mimeType,
    sizeBytes: input.file.size,
    uri: input.file.uri,
  });
  return Object.freeze({ command, state: "READY", result: null, publicError: null });
}

export function beginEvidenceAttempt(value: EvidenceAttempt): EvidenceAttempt {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_EVIDENCE_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING", publicError: null });
}

export function finishEvidenceAttempt(
  value: EvidenceAttempt,
  input: {
    state: Exclude<EvidenceAttemptState, "READY" | "SENDING">;
    result?: MobileEvidenceUploadResult | null;
    publicError?: string | null;
  },
): EvidenceAttempt {
  if (value.state !== "SENDING") throw new Error("MOBILE_EVIDENCE_NOT_SENDING");
  return Object.freeze({
    ...value,
    state: input.state,
    result: input.result ?? null,
    publicError: input.publicError ?? null,
  });
}
