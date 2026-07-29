import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { objectExists, objectStream } from "@/lib/storage";

/**
 * The only way to read a stored file. Authorization is evaluated per file
 * against role + task relationship + task status, every access is logged,
 * and VA access ends the moment a task leaves their hands.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      task: { select: { id: true, clientId: true, claimedById: true, status: true } },
      submission: { select: { qcStatus: true } },
    },
  });
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (file.purgedAt) {
    return NextResponse.json({ error: "This file has been deleted per retention policy." }, { status: 410 });
  }

  let allowed = false;
  let downloadName = file.fileName;

  if (user.role === "ADMIN") {
    allowed = true;
  } else if (user.role === "CLIENT") {
    if (file.task && file.task.clientId === user.id) {
      if (file.kind === "input") {
        // Clients can always re-download their own uploads.
        allowed = true;
      } else if (file.kind === "deliverable") {
        // RULE 3: only admin-approved deliverables ever reach a client —
        // rejected revisions stay invisible forever.
        allowed = file.submission?.qcStatus === "approved";
        const ext = path.extname(file.fileName);
        downloadName = `task-${file.task.id.slice(-6)}-deliverable${ext}`;
      }
    }
  } else if (user.role === "VA") {
    const activeForVa =
      file.task &&
      file.task.claimedById === user.id &&
      ["claimed", "submitted_for_qc", "qc_rejected"].includes(file.task.status);
    if (activeForVa) {
      // Input files while the task is in their hands; their own deliverables.
      allowed = file.kind === "input" || file.uploaderId === user.id;
    }
  }

  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

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
