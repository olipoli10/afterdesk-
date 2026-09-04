import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { projectBrainCommandSchema } from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import {
  processProjectBrainIntakeCommand,
  projectBrainIntakeProjectionForUser,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED_QUERY_FIELDS = new Set(["workspaceId", "projectId"]);
const CONFLICT_CODES = new Set([
  "PROJECT_BRAIN_ACTIVE_INTAKE_EXISTS",
  "PROJECT_BRAIN_IDEMPOTENCY_CONFLICT",
  "PROJECT_BRAIN_INCOMPLETE",
  "PROJECT_BRAIN_REVIEW_FINGERPRINT_CONFLICT",
  "PROJECT_BRAIN_SOURCE_LIMIT_REACHED",
  "PROJECT_BRAIN_STALE_STATE_VERSION",
  "PROJECT_BRAIN_STATE_REFUSED",
]);

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE });
}

async function readBoundedJsonText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function serviceError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (CONFLICT_CODES.has(code)) {
    return json({ error: "Project brain state changed." }, 409);
  }
  if (code === "CONSTRUCTION_RESOURCE_NOT_FOUND") {
    return json({ error: "Not found." }, 404);
  }
  return json({ error: "Project brain service unavailable." }, 500);
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type ClientAccess =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

async function clientUser(): Promise<ClientAccess> {
  const user = await getSessionUser();
  if (!user) return { ok: false, response: json({ error: "Not signed in." }, 401) };
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { ok: false, response: json({ error: "Not found." }, 404) };
  }
  return { ok: true, user };
}

export async function GET(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  const allowed = await consumeRateLimit(`construction-mobile-project-brain-read:${access.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) return json({ error: "Too many requests." }, 429);

  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_FIELDS.has(key)) return json({ error: "Invalid query." }, 400);
  }
  const workspaceIds = url.searchParams.getAll("workspaceId");
  const projectIds = url.searchParams.getAll("projectId");
  if (
    workspaceIds.length !== 1 ||
    projectIds.length !== 1 ||
    workspaceIds[0].trim().length === 0 ||
    workspaceIds[0].length > 200 ||
    projectIds[0].trim().length === 0 ||
    projectIds[0].length > 200
  ) {
    return json({ error: "Invalid query." }, 400);
  }

  try {
    const projection = await projectBrainIntakeProjectionForUser({
      userId: access.user.id,
      workspaceId: workspaceIds[0],
      projectId: projectIds[0],
    });
    return json(projection, 200);
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const access = await clientUser();
  if (!access.ok) return access.response;
  const allowed = await consumeRateLimit(`construction-mobile-project-brain-command:${access.user.id}`, {
    window: 60,
    max: 30,
  });
  if (!allowed) return json({ error: "Too many requests." }, 429);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "Invalid JSON." }, 400);
  const declaredLengthHeader = request.headers.get("content-length");
  if (declaredLengthHeader !== null) {
    if (!/^\d+$/u.test(declaredLengthHeader)) {
      return json({ error: "Invalid content length." }, 400);
    }
    const declaredLength = Number(declaredLengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > MAX_JSON_BYTES) {
      return json({ error: "Command is too large." }, 413);
    }
  }

  let input: unknown;
  try {
    const body = await readBoundedJsonText(request);
    if (body === null) {
      return json({ error: "Command is too large." }, 413);
    }
    input = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const command = projectBrainCommandSchema.safeParse(input);
  if (!command.success) return json({ error: "Invalid command." }, 400);

  try {
    const result = await processProjectBrainIntakeCommand({
      userId: access.user.id,
      command: command.data,
    });
    return json(result, result.replayed ? 200 : 201);
  } catch (error) {
    return serviceError(error);
  }
}
