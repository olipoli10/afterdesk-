import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { projectBrainUnderstandingCommandSchema } from "@/lib/construction-operating-assistant-r36x/project-brain-understanding-review";
import {
  applyProjectBrainUnderstandingCommandForUser,
  projectBrainUnderstandingForUser,
} from "@/server/construction-operating-assistant-r36x/project-brain-understanding-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED_QUERY_FIELDS = new Set(["workspaceId", "projectId"]);

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

async function readBoundedJsonText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_JSON_BYTES) { await reader.cancel(); return null; }
      value += decoder.decode(part.value, { stream: true });
    }
    return value + decoder.decode();
  } finally { reader.releaseLock(); }
}

function serviceError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "CONSTRUCTION_RESOURCE_NOT_FOUND") return json({ error: "Not found." }, 404);
  if (message === "PROJECT_BRAIN_UNDERSTANDING_CONFLICT") return json({ error: "Conflict." }, 409);
  if (["PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE", "CONFLICTING_RESOLUTIONS", "PROJECT_BRAIN_UNDERSTANDING_CORRUPT"].includes(message)) {
    return json({ error: message }, 422);
  }
  return json({ error: "Project Brain understanding is unavailable." }, 500);
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type Access = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };
async function clientUser(): Promise<Access> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: json({ error: "Not signed in." }, 401) };
  if (user.role !== "CLIENT" || !user.emailVerified) return { ok: false, response: json({ error: "Not found." }, 404) };
  return { ok: true, user };
}

export async function POST(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  if (!await consumeRateLimit(`construction-mobile-project-brain-understanding:${access.user.id}`, { window: 60, max: 60 })) {
    return json({ error: "Too many requests." }, 429);
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Invalid JSON." }, 400);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_JSON_BYTES)) return json({ error: "Command is too large." }, 413);
  let body: unknown;
  try {
    const raw = await readBoundedJsonText(request);
    if (raw === null) return json({ error: "Command is too large." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "Invalid JSON." }, 400); }
  const command = projectBrainUnderstandingCommandSchema.safeParse(body);
  if (!command.success) return json({ error: "Invalid command." }, 400);
  try {
    const response = await applyProjectBrainUnderstandingCommandForUser({ userId: access.user.id, command: command.data });
    return json(response, response.replayed ? 200 : 201);
  } catch (error) { return serviceError(error); }
}

export async function GET(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  if (!await consumeRateLimit(`construction-mobile-project-brain-understanding-read:${access.user.id}`, { window: 60, max: 120 })) {
    return json({ error: "Too many requests." }, 429);
  }
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) if (!ALLOWED_QUERY_FIELDS.has(key)) return json({ error: "Invalid query." }, 400);
  const values = ["workspaceId", "projectId"].map((key) => url.searchParams.getAll(key));
  if (values.some((items) => items.length !== 1 || !items[0].trim() || items[0].length > 200)) return json({ error: "Invalid query." }, 400);
  try {
    return json(await projectBrainUnderstandingForUser({ userId: access.user.id, workspaceId: values[0][0], projectId: values[1][0] }), 200);
  } catch (error) { return serviceError(error); }
}
