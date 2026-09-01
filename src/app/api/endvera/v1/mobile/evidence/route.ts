import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  MOBILE_EVIDENCE_MAX_BYTES,
  mobileEvidenceUploadCommandSchema,
} from "@/lib/construction-operating-assistant-r14/evidence";
import {
  FileRejectedError,
  ScannerUnavailableError,
} from "@/lib/file-security";
import { admitMobileConstructionEvidence } from "@/server/construction-operating-assistant-r14/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const ALLOWED_FIELDS = new Set([
  "schemaVersion",
  "commandId",
  "workspaceId",
  "projectId",
  "loopId",
  "expectedStateVersion",
  "kind",
  "fileName",
  "mimeType",
  "sizeBytes",
  "file",
]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-mobile-evidence:${user.id}`, {
    window: 60,
    max: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  for (const key of form.keys()) {
    if (!ALLOWED_FIELDS.has(key)) {
      return NextResponse.json({ error: "Invalid field." }, { status: 400, headers: PRIVATE_NO_STORE });
    }
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > MOBILE_EVIDENCE_MAX_BYTES) {
    return NextResponse.json({ error: "Invalid file." }, { status: 413, headers: PRIVATE_NO_STORE });
  }
  const parsed = mobileEvidenceUploadCommandSchema.safeParse({
    schemaVersion: Number(form.get("schemaVersion")),
    commandId: form.get("commandId"),
    workspaceId: form.get("workspaceId"),
    projectId: form.get("projectId"),
    loopId: form.get("loopId"),
    expectedStateVersion: Number(form.get("expectedStateVersion")),
    kind: form.get("kind"),
    fileName: form.get("fileName"),
    mimeType: form.get("mimeType"),
    sizeBytes: Number(form.get("sizeBytes")),
  });
  if (!parsed.success || parsed.data.sizeBytes !== file.size) {
    return NextResponse.json({ error: "Invalid evidence metadata." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await admitMobileConstructionEvidence({
      userId: user.id,
      command: parsed.data,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: PRIVATE_NO_STORE,
    });
  } catch (error) {
    if (error instanceof ScannerUnavailableError) {
      return NextResponse.json({ error: "Evidence scanner unavailable." }, { status: 503, headers: PRIVATE_NO_STORE });
    }
    if (error instanceof FileRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: PRIVATE_NO_STORE });
    }
    if (
      error instanceof Error &&
      [
        "OPEN_LOOP_STALE_STATE_VERSION",
        "OPEN_LOOP_IDEMPOTENCY_CONFLICT",
        "EVIDENCE_IDEMPOTENCY_CONFLICT",
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: "Evidence state changed." }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Evidence refused." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
