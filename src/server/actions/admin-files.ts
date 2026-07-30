"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/authz";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
  ScannerUnavailableError,
} from "@/lib/file-security";
import { putObject, readObject } from "@/lib/storage";

export type RecheckFileResult = { ok: true } | { ok: false; error: string };

export async function recheckFile(fileId: string): Promise<RecheckFileResult> {
  const admin = await requireRole("ADMIN");
  if (!fileId || fileId.length > 100) return { ok: false, error: "Invalid file." };

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      taskId: true,
      storageKey: true,
      fileName: true,
      purgedAt: true,
    },
  });
  if (!file || file.purgedAt) return { ok: false, error: "File is unavailable." };

  const ext = path.extname(file.fileName).slice(1).toLowerCase();
  try {
    const original = await readObject(file.storageKey);
    const checked = await inspectAndSanitizeFile(original, ext);
    await putObject(file.storageKey, checked.buffer);
    await prisma.$transaction([
      prisma.file.update({
        where: { id: file.id },
        data: {
          scanStatus: "clean",
          detectedMime: checked.detectedMime,
          mime: checked.detectedMime,
          sizeBytes: checked.buffer.length,
          sha256: checked.sha256,
          scanDetails: checked.details,
          scannedAt: new Date(),
        },
      }),
      prisma.adminEvent.create({
        data: {
          actorId: admin.id,
          entity: "File",
          entityId: file.id,
          action: "file_rechecked",
          after: { scanStatus: "clean", sha256: checked.sha256 },
        },
      }),
    ]);
  } catch (error) {
    const status = error instanceof FileRejectedError ? "rejected" : "error";
    const message =
      error instanceof FileRejectedError || error instanceof ScannerUnavailableError
        ? error.message
        : "The stored file could not be inspected.";
    await prisma.file.update({
      where: { id: file.id },
      data: {
        scanStatus: status,
        scanDetails: message.slice(0, 1000),
        scannedAt: new Date(),
      },
    });
    if (file.taskId) revalidatePath(`/admin/tasks/${file.taskId}`);
    return { ok: false, error: message };
  }

  if (file.taskId) revalidatePath(`/admin/tasks/${file.taskId}`);
  return { ok: true };
}
