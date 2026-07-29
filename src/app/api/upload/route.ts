import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { putObject } from "@/lib/storage";

/**
 * Upload-first, attach-later (mirrors the future R2 presigned flow):
 * files are uploaded before the task exists (taskId null) and are claimed by
 * the submit action, which verifies uploaderId. Orphans are cleaned up later.
 *
 * V1 scope: client input files only (VA deliverables arrive at build step 6).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only clients can upload input files." }, { status: 403 });
  }

  const settings = await getSettings();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const maxBytes = settings.maxFileSizeMB * 1024 * 1024;
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

  const record = await prisma.file.create({
    data: {
      taskId: null,
      kind: "input",
      uploaderId: user.id,
      storageKey,
      fileName: originalName,
      mime: file.type || "application/octet-stream",
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
}
