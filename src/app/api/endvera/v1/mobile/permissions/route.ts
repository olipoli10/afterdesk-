import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  permissionCenterQuerySchema,
  revokePermissionCommandSchema,
} from "@/lib/construction-operating-assistant-r16/permissions";
import {
  constructionPermissionCenterForUser,
  revokeConstructionPermission,
} from "@/server/construction-operating-assistant-r16/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function clientUser() {
  const user = await getSessionUser();
  return user?.role === "CLIENT" && user.emailVerified ? user : null;
}

export async function GET(request: Request) {
  const user = await clientUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-mobile-permissions-read:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const parsed = permissionCenterQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid permission query." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await constructionPermissionCenterForUser({ userId: user.id, ...parsed.data }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

export async function POST(request: Request) {
  const user = await clientUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE });
  }
  const allowed = await consumeRateLimit(`construction-mobile-permissions-write:${user.id}`, {
    window: 60,
    max: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  const parsed = revokePermissionCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid revocation." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = await revokeConstructionPermission({ userId: user.id, command: parsed.data });
    return NextResponse.json(result, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "PERMISSION_REVOCATION_STALE_STATE",
        "PERMISSION_REVOCATION_IDEMPOTENCY_CONFLICT",
      ].includes(error.message)
    ) {
      return NextResponse.json({ error: "Permission state changed." }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
