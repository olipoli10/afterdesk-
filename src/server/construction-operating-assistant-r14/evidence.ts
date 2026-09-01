import "server-only";

import path from "node:path";
import { Prisma } from "@prisma-client";
import {
  MOBILE_EVIDENCE_MAX_BYTES,
  mobileEvidenceUploadCommandSchema,
  mobileEvidenceUploadResultSchema,
  type MobileEvidenceUploadCommand,
} from "@/lib/construction-operating-assistant-r14/evidence";
import { prisma } from "@/lib/db";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
} from "@/lib/file-security";
import { deleteObject, putObject } from "@/lib/storage";
import { addInvoiceReadinessEvidenceInTransaction } from "@/server/construction-operating-assistant-r0/open-loops";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

const MIME_EXTENSION = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
} satisfies Record<MobileEvidenceUploadCommand["mimeType"], readonly string[]>;

function safeFileName(value: string) {
  const base = path.basename(value);
  if (
    base !== value ||
    Buffer.byteLength(base, "utf8") > 255 ||
    /[\u0000-\u001f\u007f]/u.test(base)
  ) {
    throw new FileRejectedError("The filename is invalid or too long.");
  }
  return base;
}

function extensionFor(command: MobileEvidenceUploadCommand) {
  const extension = path.extname(command.fileName).slice(1).toLowerCase();
  const allowed = MIME_EXTENSION[command.mimeType];
  if (!allowed.includes(extension)) {
    throw new FileRejectedError("The filename and media type do not match.");
  }
  if (
    command.kind === "PHOTO" &&
    command.mimeType !== "image/jpeg" &&
    command.mimeType !== "image/png"
  ) {
    throw new FileRejectedError("Photo evidence must be a JPEG or PNG.");
  }
  return extension;
}

async function replayResult(input: {
  command: MobileEvidenceUploadCommand;
  contentHash: string;
}) {
  const evidenceKey = `mobile-evidence:${input.command.commandId}`;
  const evidence = await prisma.constructionOpenLoopEvidence.findFirst({
    where: {
      loopId: input.command.loopId,
      workspaceId: input.command.workspaceId,
      projectId: input.command.projectId,
      evidenceKey,
    },
    select: {
      id: true,
      kind: true,
      state: true,
      contentHash: true,
      sourceRef: true,
      loop: { select: { stateVersion: true } },
    },
  });
  if (!evidence) return null;
  const fileId = evidence.sourceRef.startsWith("file:")
    ? evidence.sourceRef.slice("file:".length)
    : "";
  const sourceFile = fileId
    ? await prisma.file.findUnique({
        where: { id: fileId },
        select: { fileName: true, detectedMime: true },
      })
    : null;
  const expectedKind = {
    WRITTEN_APPROVAL: "written_approval",
    PHOTO: "photo",
    DOCUMENT: "document",
  }[input.command.kind];
  if (
    evidence.contentHash !== input.contentHash ||
    evidence.kind !== expectedKind ||
    evidence.state === "revoked" ||
    !sourceFile ||
    sourceFile.fileName !== input.command.fileName ||
    sourceFile.detectedMime !== input.command.mimeType
  ) {
    throw new Error("EVIDENCE_IDEMPOTENCY_CONFLICT");
  }
  return mobileEvidenceUploadResultSchema.parse({
    schemaVersion: 1,
    commandId: input.command.commandId,
    workspaceId: input.command.workspaceId,
    projectId: input.command.projectId,
    loopId: input.command.loopId,
    evidenceId: evidence.id,
    kind: input.command.kind,
    state: "PRESENT_UNVERIFIED",
    stateVersion: evidence.loop.stateVersion,
    contentHash: input.contentHash,
    fileName: input.command.fileName,
    replayed: true,
    externalTransportPerformed: false,
  });
}

export async function admitMobileConstructionEvidence(input: {
  userId: string;
  command: unknown;
  bytes: Buffer;
}) {
  const command = mobileEvidenceUploadCommandSchema.parse(input.command);
  await prisma.$transaction((tx) =>
    requireActiveConstructionMember(tx, input.userId, command.workspaceId),
  );
  const fileName = safeFileName(command.fileName);
  if (
    input.bytes.length <= 0 ||
    input.bytes.length > MOBILE_EVIDENCE_MAX_BYTES ||
    input.bytes.length !== command.sizeBytes
  ) {
    throw new FileRejectedError("The selected file size is invalid.");
  }
  const extension = extensionFor(command);
  const inspected = await inspectAndSanitizeFile(input.bytes, extension);
  const replay = await replayResult({ command, contentHash: inspected.sha256 });
  if (replay) return replay;

  const storageKey = [
    "construction-evidence",
    command.workspaceId,
    command.projectId,
    `${command.commandId}-${inspected.sha256.slice(0, 16)}.${extension}`,
  ].join("/");
  await putObject(storageKey, inspected.buffer);
  try {
    return await prisma.$transaction(async (tx) => {
      await requireActiveConstructionMember(tx, input.userId, command.workspaceId);
      const loop = await tx.constructionOpenLoop.findFirst({
        where: {
          id: command.loopId,
          workspaceId: command.workspaceId,
          projectId: command.projectId,
          status: { notIn: ["closed", "revoked"] },
        },
        select: { id: true },
      });
      if (!loop) throw new Error("CONSTRUCTION_RESOURCE_NOT_FOUND");

      const file = await tx.file.create({
        data: {
          taskId: null,
          submissionId: null,
          kind: "input",
          uploaderId: input.userId,
          storageKey,
          fileName,
          mime: inspected.detectedMime,
          sizeBytes: inspected.buffer.length,
          scanStatus: "clean",
          detectedMime: inspected.detectedMime,
          sha256: inspected.sha256,
          scanDetails: inspected.details,
          scannedAt: new Date(),
        },
      });
      await tx.fileAccessLog.create({
        data: { fileId: file.id, userId: input.userId, action: "upload" },
      });
      const result = await addInvoiceReadinessEvidenceInTransaction(tx, {
        schemaVersion: 1,
        eventId: `mobile-evidence:${command.commandId}`,
        userId: input.userId,
        workspaceId: command.workspaceId,
        loopId: command.loopId,
        expectedStateVersion: command.expectedStateVersion,
        kind: command.kind,
        state: "PRESENT_UNVERIFIED",
        sourceRef: `file:${file.id}`,
        contentHash: inspected.sha256,
      });
      const evidence = await tx.constructionOpenLoopEvidence.findUniqueOrThrow({
        where: {
          loopId_evidenceKey: {
            loopId: command.loopId,
            evidenceKey: `mobile-evidence:${command.commandId}`,
          },
        },
        select: { id: true },
      });
      return mobileEvidenceUploadResultSchema.parse({
        schemaVersion: 1,
        commandId: command.commandId,
        workspaceId: command.workspaceId,
        projectId: command.projectId,
        loopId: command.loopId,
        evidenceId: evidence.id,
        kind: command.kind,
        state: "PRESENT_UNVERIFIED",
        stateVersion: result.decision.stateVersion,
        contentHash: inspected.sha256,
        fileName,
        replayed: result.replayed,
        externalTransportPerformed: false,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const replayAfterConflict = await replayResult({
      command,
      contentHash: inspected.sha256,
    }).catch(() => null);
    if (replayAfterConflict) return replayAfterConflict;
    await deleteObject(storageKey);
    throw error;
  }
}
