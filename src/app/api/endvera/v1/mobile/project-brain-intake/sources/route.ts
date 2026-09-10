import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  PROJECT_BRAIN_MAX_SOURCE_BYTES,
  projectBrainSourceCommandSchema,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import { FileRejectedError, ScannerUnavailableError } from "@/lib/file-security";
import { LocalObjectStorageError } from "@/lib/storage-local";
import { admitProjectBrainSource } from "@/server/construction-operating-assistant-r36v/project-brain-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const ALLOWED_FIELDS = new Set(["command", "file"]);
const MAX_MULTIPART_BYTES = PROJECT_BRAIN_MAX_SOURCE_BYTES + 128 * 1024;
const MAX_SOURCE_COMMAND_BYTES = 64 * 1024;
const MAX_CONCURRENT_SOURCE_ADMISSIONS_PER_PROCESS = 2;
const activeSourceAdmissionsByUser = new Map<string, number>();
const CONFLICT_CODES = new Set([
  "PROJECT_BRAIN_IDEMPOTENCY_CONFLICT",
  "PROJECT_BRAIN_SOURCE_LIMIT_REACHED",
  "PROJECT_BRAIN_VOICE_NOTE_LIMIT_REACHED",
  "PROJECT_BRAIN_STALE_STATE_VERSION",
  "PROJECT_BRAIN_STATE_REFUSED",
]);

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE });
}

function tryAcquireSourceAdmission(userId: string): (() => void) | null {
  const active = activeSourceAdmissionsByUser.get(userId) ?? 0;
  if (active >= MAX_CONCURRENT_SOURCE_ADMISSIONS_PER_PROCESS) return null;
  activeSourceAdmissionsByUser.set(userId, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (activeSourceAdmissionsByUser.get(userId) ?? 1) - 1;
    if (remaining <= 0) activeSourceAdmissionsByUser.delete(userId);
    else activeSourceAdmissionsByUser.set(userId, remaining);
  };
}

async function readBoundedMultipartBody(request: Request, deadlineAt: number): Promise<Buffer | null> {
  if (request.signal.aborted || Date.now() >= deadlineAt) throw new Error("SOURCE_BODY_INTERRUPTED");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interrupt!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = () => { void reader.cancel().catch(() => undefined); reject(new Error("SOURCE_BODY_INTERRUPTED")); };
    timer = setTimeout(interrupt, Math.max(1, deadlineAt - Date.now()));
    request.signal.addEventListener("abort", interrupt, { once: true });
  });
  try {
  while (true) {
    if (request.signal.aborted || Date.now() >= deadlineAt) throw new Error("SOURCE_BODY_INTERRUPTED");
    const { done, value } = await Promise.race([reader.read(), interrupted]);
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MULTIPART_BYTES) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  if (request.signal.aborted || Date.now() >= deadlineAt) throw new Error("SOURCE_BODY_INTERRUPTED");
  return Buffer.concat(chunks, total);
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", interrupt);
    try { reader.releaseLock(); } catch { /* An interrupted read is not a completed admission. */ }
  }
}

export async function POST(request: Request) {
  const bodyDeadlineAt = Date.now() + 60_000;
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);
  if (user.role !== "CLIENT" || !user.emailVerified) return json({ error: "Not found." }, 404);
  const allowed = await consumeRateLimit(`construction-mobile-project-brain-source:${user.id}`, {
    window: 60,
    max: 20,
  });
  if (!allowed) return json({ error: "Too many requests." }, 429);

  // Multipart parsing holds bounded in-memory copies. Refuse excess parallel
  // admissions before consuming their bodies so one authenticated caller
  // cannot multiply that bounded cost by the whole per-minute allowance.
  const releaseAdmission = tryAcquireSourceAdmission(user.id);
  if (!releaseAdmission) return json({ error: "Source admission is busy." }, 429);

  try {

    const contentType = request.headers.get("content-type")?.trim() ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return json({ error: "Invalid form." }, 400);
    }
    const declaredLengthHeader = request.headers.get("content-length");
    if (declaredLengthHeader !== null) {
      if (!/^[1-9]\d*$/u.test(declaredLengthHeader)) {
        return json({ error: "Invalid content length." }, 400);
      }
      const declaredLength = Number(declaredLengthHeader);
      if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_MULTIPART_BYTES) {
        return json({ error: "Source request is too large." }, 413);
      }
    }

    let form: FormData;
    try {
      const body = await readBoundedMultipartBody(request, bodyDeadlineAt);
      if (body === null) return json({ error: "Source request is too large." }, 413);
      form = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: Uint8Array.from(body),
      }).formData();
    } catch {
      if (request.signal.aborted || Date.now() >= bodyDeadlineAt) return json({ error: "Source upload interrupted." }, 408);
      return json({ error: "Invalid form." }, 400);
    }
    const entries = [...form.entries()];
    if (
      entries.some(([key]) => !ALLOWED_FIELDS.has(key)) ||
      form.getAll("command").length !== 1 ||
      form.getAll("file").length !== 1 ||
      entries.length !== 2
    ) {
      return json({ error: "Invalid form fields." }, 400);
    }

    const rawCommand = form.get("command");
    const file = form.get("file");
    if (typeof rawCommand !== "string" || !(file instanceof File)) {
      return json({ error: "Invalid form fields." }, 400);
    }
    if (Buffer.byteLength(rawCommand, "utf8") > MAX_SOURCE_COMMAND_BYTES) {
      return json({ error: "Source command is too large." }, 413);
    }
    if (file.size <= 0 || file.size > PROJECT_BRAIN_MAX_SOURCE_BYTES) {
      return json({ error: "Invalid file size." }, 413);
    }

    let input: unknown;
    try {
      input = JSON.parse(rawCommand);
    } catch {
      return json({ error: "Invalid source command." }, 400);
    }
    const command = projectBrainSourceCommandSchema.safeParse(input);
    if (!command.success) return json({ error: "Invalid source command." }, 400);
    if (
      command.data.sizeBytes !== file.size ||
      command.data.mimeType !== file.type ||
      command.data.fileName !== file.name
    ) {
      return json({ error: "Source metadata does not match the file." }, 422);
    }

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      if (request.signal.aborted || Date.now() >= bodyDeadlineAt) return json({ error: "Source upload interrupted." }, 408);
      const result = await admitProjectBrainSource({
        userId: user.id,
        command: command.data,
        bytes,
      });
      return json(result, result.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof ScannerUnavailableError) {
        return json({ error: "Source scanner unavailable." }, 503);
      }
      if (error instanceof LocalObjectStorageError) {
        return json({ error: "Local source storage unavailable." }, 503);
      }
      if (error instanceof FileRejectedError) {
        return json({ error: error.message }, 422);
      }
      if (error instanceof Error && CONFLICT_CODES.has(error.message)) {
        return json({ error: "Project brain state changed." }, 409);
      }
      if (error instanceof Error && error.message === "CONSTRUCTION_RESOURCE_NOT_FOUND") {
        return json({ error: "Not found." }, 404);
      }
      return json({ error: "Project brain service unavailable." }, 500);
    }
  } finally {
    releaseAdmission();
  }
}
