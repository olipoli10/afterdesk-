import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  selectedVoiceNoteCommandSchema,
  VOICE_NOTE_MAX_BYTES,
} from "@/lib/construction-operating-assistant-r25/contracts";
import { FileRejectedError, ScannerUnavailableError } from "@/lib/file-security";
import { admitSelectedVoiceNoteR25 } from "@/server/construction-operating-assistant-r25/voice-calls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const ALLOWED_FIELDS = new Set([
  "schemaVersion",
  "action",
  "commandId",
  "workspaceId",
  "projectId",
  "fileName",
  "mimeType",
  "durationMs",
  "sizeBytes",
  "foregroundRecorded",
  "transcriptionRequested",
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
  const allowed = await consumeRateLimit(`construction-mobile-voice-note:${user.id}`, {
    window: 60,
    max: 12,
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
  if (!(file instanceof File) || file.size <= 0 || file.size > VOICE_NOTE_MAX_BYTES) {
    return NextResponse.json({ error: "Invalid file." }, { status: 413, headers: PRIVATE_NO_STORE });
  }
  const command = selectedVoiceNoteCommandSchema.safeParse({
    schemaVersion: Number(form.get("schemaVersion")),
    action: form.get("action"),
    commandId: form.get("commandId"),
    workspaceId: form.get("workspaceId"),
    projectId: form.get("projectId"),
    fileName: form.get("fileName"),
    mimeType: form.get("mimeType"),
    durationMs: Number(form.get("durationMs")),
    sizeBytes: Number(form.get("sizeBytes")),
    foregroundRecorded: form.get("foregroundRecorded") === "true",
    transcriptionRequested: form.get("transcriptionRequested") === "true",
  });
  if (!command.success || command.data.sizeBytes !== file.size) {
    return NextResponse.json({ error: "Invalid voice-note metadata." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await admitSelectedVoiceNoteR25({
      userId: user.id,
      command: command.data,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: PRIVATE_NO_STORE,
    });
  } catch (error) {
    if (error instanceof ScannerUnavailableError) {
      return NextResponse.json({ error: "Voice-note scanner unavailable." }, { status: 503, headers: PRIVATE_NO_STORE });
    }
    if (error instanceof FileRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 422, headers: PRIVATE_NO_STORE });
    }
    if (error instanceof Error && error.message === "VOICE_NOTE_IDEMPOTENCY_CONFLICT") {
      return NextResponse.json({ error: error.message }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Voice note refused." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
