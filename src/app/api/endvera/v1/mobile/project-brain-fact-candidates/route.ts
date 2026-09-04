import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { factCandidateGenerationCommandSchema } from "@/lib/construction-operating-assistant-r36w/project-brain-fact-candidates";
import {
  generateProjectBrainFactCandidatesForUser,
  projectBrainFactCandidatesForUser,
} from "@/server/construction-operating-assistant-r36w/project-brain-fact-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED_QUERY_FIELDS = new Set(["workspaceId", "projectId", "intakeId"]);

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

async function readBoundedJsonText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function serviceError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "CONSTRUCTION_RESOURCE_NOT_FOUND") return json({ error: "Not found." }, 404);
  if (message === "PROJECT_BRAIN_FACT_CANDIDATE_CONFLICT") return json({ error: "Conflict." }, 409);
  if (message === "PROJECT_BRAIN_FACT_CANDIDATE_CORRUPT") return json({ error: "Canonical input is inconsistent." }, 422);
  return json({ error: "Project Brain fact candidates are unavailable." }, 500);
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type ClientAccess = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };

async function clientUser(): Promise<ClientAccess> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: json({ error: "Not signed in." }, 401) };
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { ok: false, response: json({ error: "Not found." }, 404) };
  }
  return { ok: true, user };
}

export async function POST(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  const allowed = await consumeRateLimit(`construction-mobile-project-brain-fact-candidates:${access.user.id}`, {
    window: 60,
    max: 30,
  });
  if (!allowed) return json({ error: "Too many requests." }, 429);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Invalid JSON." }, 400);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) return json({ error: "Invalid content length." }, 400);
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes > MAX_JSON_BYTES) return json({ error: "Command is too large." }, 413);
  }
  let body: unknown;
  try {
    const text = await readBoundedJsonText(request);
    if (text === null) return json({ error: "Command is too large." }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const command = factCandidateGenerationCommandSchema.safeParse(body);
  if (!command.success) return json({ error: "Invalid command." }, 400);
  try {
    const result = await generateProjectBrainFactCandidatesForUser({ userId: access.user.id, command: command.data });
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    return serviceError(error);
  }
}

export async function GET(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  const allowed = await consumeRateLimit(`construction-mobile-project-brain-fact-candidates-read:${access.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) return json({ error: "Too many requests." }, 429);
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) return json({ error: "Invalid query." }, 400);
  }
  const values = ["workspaceId", "projectId", "intakeId"].map((key) => url.searchParams.getAll(key));
  if (values.some((items) => items.length !== 1 || items[0].trim().length === 0 || items[0].length > 200)) {
    return json({ error: "Invalid query." }, 400);
  }
  try {
    return json(await projectBrainFactCandidatesForUser({
      userId: access.user.id,
      workspaceId: values[0][0],
      projectId: values[1][0],
      intakeId: values[2][0],
    }), 200);
  } catch (error) {
    return serviceError(error);
  }
}
