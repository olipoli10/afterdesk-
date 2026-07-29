import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isApprovedVa } from "@/lib/authz";
import { VA_FILE_ACCESS_STATUSES } from "@/lib/status";
import { objectExists, objectStream } from "@/lib/storage";

/**
 * The only way to read a stored file. Authorization is evaluated per file
 * against role + task relationship + task status, every access is logged,
 * and VA access ends the moment a task leaves their hands.
 *
 * RULE 1: filenames are anonymized in BOTH directions — a VA never sees the
 * client's original filename ("AcmeCorp_CRM_export.xlsx"), a client never sees
 * the VA's ("juan_delacruz_final.xlsx"). Only the owner of a file and the
 * admin see its real name.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.emailVerified) {
    return NextResponse.json({ error: "Confirm your email address first." }, { status: 403 });
  }

  const { id } = await params;
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      task: { select: { id: true, clientId: true, claimedById: true, status: true } },
      submission: { select: { qcStatus: true } },
    },
  });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const ext = path.extname(file.fileName);
  const shortId = file.task ? file.task.id.slice(-6) : file.id.slice(-6);

  let allowed = false;
  // Default to the real name; only the owner and the admin ever keep it.
  let downloadName = file.fileName;

  if (user.role === "ADMIN") {
    allowed = true;
  } else if (user.role === "CLIENT") {
    if (file.task && file.task.clientId === user.id) {
      if (file.kind === "input") {
        // Their own upload — they already know the name.
        allowed = true;
      } else if (file.kind === "deliverable") {
        // RULE 3: only admin-approved deliverables ever reach a client —
        // rejected revisions stay invisible forever.
        allowed = file.submission?.qcStatus === "approved";
        downloadName = `task-${shortId}-deliverable${ext}`;
      }
    }
  } else if (user.role === "VA") {
    const activeForVa =
      file.task &&
      file.task.claimedById === user.id &&
      VA_FILE_ACCESS_STATUSES.includes(file.task.status) &&
      (await isApprovedVa(user.id));
    if (activeForVa) {
      if (file.uploaderId === user.id) {
        // Their own deliverable — real name.
        allowed = true;
      } else if (file.kind === "input") {
        allowed = true;
        // RULE 1: the client's filename can identify them.
        downloadName = `task-${shortId}-input-${file.id.slice(-4)}${ext}`;
      }
    }
  }

  // Authorization first: an unauthorized caller gets an indistinguishable 404
  // whether the file is missing, purged, or simply not theirs.
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (file.purgedAt) {
    return NextResponse.json(
      { error: "This file has been deleted per retention policy." },
      { status: 410 }
    );
  }

  if (!(await objectExists(file.storageKey))) {
    return NextResponse.json({ error: "File data missing." }, { status: 404 });
  }

  await prisma.fileAccessLog.create({
    data: { fileId: file.id, userId: user.id, action: "download" },
  });

  return new NextResponse(objectStream(file.storageKey), {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename="${downloadName.replace(/[^\w.\- ()]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
