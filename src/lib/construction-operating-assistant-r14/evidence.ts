import { z } from "zod";

export const MOBILE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export const mobileEvidenceKindSchema = z.enum([
  "WRITTEN_APPROVAL",
  "PHOTO",
  "DOCUMENT",
]);

export const mobileEvidenceUploadCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    workspaceId: z.string().min(1).max(160),
    projectId: z.string().min(1).max(160),
    loopId: z.string().min(1).max(160),
    expectedStateVersion: z.number().int().positive(),
    kind: mobileEvidenceKindSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum([
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    sizeBytes: z.number().int().positive().max(MOBILE_EVIDENCE_MAX_BYTES),
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
    kind: mobileEvidenceKindSchema,
    state: z.literal("PRESENT_UNVERIFIED"),
    stateVersion: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    fileName: z.string().min(1),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type MobileEvidenceUploadCommand = z.infer<
  typeof mobileEvidenceUploadCommandSchema
>;
export type MobileEvidenceUploadResult = z.infer<
  typeof mobileEvidenceUploadResultSchema
>;
