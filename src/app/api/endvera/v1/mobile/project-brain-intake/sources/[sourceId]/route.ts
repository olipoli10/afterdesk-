import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { LocalObjectStorageError } from "@/lib/storage-local";
import { projectBrainSourceBytesForUser } from "@/server/construction-operating-assistant-r36v/project-brain-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return json({ error: "Not found." }, 404);
  }
  const allowed = await consumeRateLimit(
    `construction-mobile-project-brain-source-read:${user.id}`,
    { window: 60, max: 60 },
  );
  if (!allowed) return json({ error: "Too many requests." }, 429);

  const { sourceId } = await context.params;
  if (!sourceId || sourceId.trim() !== sourceId || sourceId.length > 200) {
    return json({ error: "Not found." }, 404);
  }

  try {
    const source = await projectBrainSourceBytesForUser({
      userId: user.id,
      sourceId,
    });
    const downloadName = source.fileName.replace(/[^\w.\- ()]/gu, "_");
    return new NextResponse(Uint8Array.from(source.bytes), {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE,
        "Content-Type": source.mimeType,
        "Content-Length": String(source.bytes.length),
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "X-Content-SHA256": source.contentHash,
      },
    });
  } catch (error) {
    if (error instanceof LocalObjectStorageError) {
      return json({ error: "Local source storage unavailable." }, 503);
    }
    if (error instanceof Error && error.message === "CONSTRUCTION_RESOURCE_NOT_FOUND") {
      return json({ error: "Not found." }, 404);
    }
    return json({ error: "Project brain source unavailable." }, 500);
  }
}
