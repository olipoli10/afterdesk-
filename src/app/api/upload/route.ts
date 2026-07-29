import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { deleteObject, putObject } from "@/lib/storage";

/**
 * Upload-first, attach-later (mirrors the future R2 presigned flow):
 * files are uploaded before the task exists (taskId null) and are claimed by
 * the submit action, which verifies uploaderId. Unattached files are reaped
 * by the orphan sweep (src/server/sweeps.ts).
 *
 * V1 scope: client input files only (VA deliverables arrive at build step 6).
 */

/** Unattached uploads a single client may hold at once. */
const MAX_PENDING_UPLOADS = 40;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only clients can upload input files." }, { status: 403 });
  }

  const settings = await getSettings();
  const maxBytes = settings.maxFileSizeMB * 1024 * 1024;

  // Reject oversized bodies BEFORE buffering them into memory.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes + 1024 * 1024) {
    return NextResponse.json(
      { error: `File exceeds the ${settings.maxFileSizeMB} MB limit.` },
      { status: 413 }
    );
  }

  // Quota: cap how many unattached uploads one account can accumulate.
  const pending = await prisma.file.count({
    where: { uploaderId: user.id, taskId: null },
  });
  if (pending >= MAX_PENDING_UPLOADS) {
    return NextResponse.json(
      { error: "Too many pending uploads. Submit or discard your current task first." },
      { status: 429 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds the ${settings.maxFileSizeMB} MB limit.` },
      { status: 413 }
    );
  }

  const originalName = path.basename(file.name || "file");
  const ext = path.extname(originalName).toLowerCase().replace(".", "");
  if (!settings.allowedExtensions.includes(ext)) {
    return NextResponse.json(
      { error: `File type ".${ext}" is not supported.` },
      { status: 415 }
    );
  }

  // Opaque server-generated key — original filename never appears in keys/URLs.
  const storageKey = `input/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObject(storageKey, buffer);

  try {
    const record = await prisma.file.create({
      data: {
        taskId: null,
        kind: "input",
        uploaderId: user.id,
        storageKey,
        fileName: originalName,
        // Server-derived from the validated extension, never the browser's
        // claim: this value is echoed back as Content-Type on download.
        mime: mimeForExtension(ext),
        sizeBytes: file.size,
      },
    });
    await prisma.fileAccessLog.create({
      data: { fileId: record.id, userId: user.id, action: "upload" },
    });

    return NextResponse.json({
      id: record.id,
      fileName: record.fileName,
      sizeBytes: record.sizeBytes,
    });
  } catch (e) {
    // Compensate: never leave a blob with no row pointing at it.
    await deleteObject(storageKey);
    throw e;
  }
}

function mimeForExtension(ext: string): string {
  switch (ext) {
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}
