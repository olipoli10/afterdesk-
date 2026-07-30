import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeRateLimit, getSessionUser, isApprovedVa } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { deleteObject, putObject } from "@/lib/storage";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
  ScannerUnavailableError,
} from "@/lib/file-security";

/**
 * Upload-first, attach-later:
 * files are uploaded before the task exists (taskId null) and are claimed by
 * the submit action, which verifies uploaderId. Unattached files are reaped
 * by the orphan sweep (src/server/sweeps.ts).
 */

/** Unattached uploads a single client may hold at once. */
const MAX_PENDING_UPLOADS = 40;

/** Requests per user per minute — uploads cost a full in-memory buffer each. */
const UPLOAD_RATE = { window: 60, max: 10 };

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const settings = await getSettings();
  const maxBytes = settings.maxFileSizeMB * 1024 * 1024;

  // Reject oversized bodies BEFORE buffering them into memory. A missing
  // Content-Length (Transfer-Encoding: chunked) would make the declared size
  // read as 0 and skip the guard entirely, so it is refused outright — every
  // legitimate browser/fetch upload declares a length. The declared value is
  // advisory (clients can lie); the authoritative cap is enforced on the
  // actual parsed bytes below, before anything is written.
  const declaredHeader = request.headers.get("content-length");
  if (!declaredHeader) {
    return NextResponse.json({ error: "Length required." }, { status: 411 });
  }
  const declaredLength = Number(declaredHeader);
  if (!Number.isFinite(declaredLength) || declaredLength > maxBytes + 1024 * 1024) {
    return NextResponse.json(
      { error: `File exceeds the ${settings.maxFileSizeMB} MB limit.` },
      { status: 413 }
    );
  }

  // Time-window throttle (database-backed, same storage as the auth limiter):
  // the pending-uploads quota alone lets an account churn indefinitely by
  // cycling uploads under the cap.
  const allowed = await consumeRateLimit(`upload:${user.id}`, UPLOAD_RATE);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Wait a minute and try again." },
      { status: 429 }
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

  // Each role has exactly one lane: clients upload the source data, workers
  // upload finished work. Nobody can write into the other's kind.
  const requestedKind = form.get("kind") === "deliverable" ? "deliverable" : "input";
  if (requestedKind === "input" && user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only clients upload input files." }, { status: 403 });
  }
  if (requestedKind === "deliverable" && user.role !== "VA") {
    return NextResponse.json({ error: "Only workers upload deliverables." }, { status: 403 });
  }
  // Same gate as the download route and every VA task action: a pending,
  // rejected or suspended worker loses the deliverable lane on their next
  // request — they have no task these files could ever attach to.
  if (requestedKind === "deliverable" && !(await isApprovedVa(user.id))) {
    return NextResponse.json(
      { error: "Only approved workers upload deliverables." },
      { status: 403 }
    );
  }

  // Authoritative size check on the ACTUAL parsed bytes (file.size comes from
  // the multipart body itself, not any header), before writing to storage.
  if (file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds the ${settings.maxFileSizeMB} MB limit.` },
      { status: 413 }
    );
  }

  const originalName = path.basename(file.name || "file");
  if (
    Buffer.byteLength(originalName, "utf8") > 255 ||
    /[\u0000-\u001f\u007f]/.test(originalName)
  ) {
    return NextResponse.json({ error: "The filename is invalid or too long." }, { status: 400 });
  }
  const ext = path.extname(originalName).toLowerCase().replace(".", "");
  if (!settings.allowedExtensions.includes(ext)) {
    return NextResponse.json(
      { error: `File type ".${ext}" is not supported.` },
      { status: 415 }
    );
  }

  // Opaque server-generated key — original filename never appears in keys/URLs.
  const storageKey = `${requestedKind}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  let inspected;
  try {
    inspected = await inspectAndSanitizeFile(buffer, ext);
  } catch (error) {
    if (error instanceof FileRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof ScannerUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
  await putObject(storageKey, inspected.buffer);

  try {
    const record = await prisma.file.create({
      data: {
        taskId: null,
        kind: requestedKind,
        uploaderId: user.id,
        storageKey,
        fileName: originalName,
        // Server-derived from the validated extension, never the browser's
        // claim: this value is echoed back as Content-Type on download.
        mime: inspected.detectedMime,
        sizeBytes: inspected.buffer.length,
        scanStatus: "clean",
        detectedMime: inspected.detectedMime,
        sha256: inspected.sha256,
        scanDetails: inspected.details,
        scannedAt: new Date(),
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
