import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  planVirtualSecretaryAction,
  virtualSecretaryActionCommandSchema,
  virtualSecretaryCapabilityCatalog,
} from "@/lib/construction-operating-assistant-r38b/virtual-secretary-actions";
import { prisma } from "@/lib/db";
import { requireActiveConstructionMember } from "@/server/construction-assistant-v1/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

async function authorizedUser() {
  const user = await getSessionUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: PRIVATE_NO_STORE }) } as const;
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return { response: NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE }) } as const;
  }
  return { user } as const;
}

export async function GET() {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-virtual-secretary-catalog:${auth.user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  return NextResponse.json({ schemaVersion: 1, capabilities: virtualSecretaryCapabilityCatalog(), externalTransportPerformed: false }, { headers: PRIVATE_NO_STORE });
}

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(`construction-mobile-virtual-secretary-plan:${auth.user.id}`, {
    window: 60,
    max: 30,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = virtualSecretaryActionCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid secretary action." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const membership = await requireActiveConstructionMember(
      prisma,
      auth.user.id,
      parsed.data.workspaceId,
    );
    const plan = planVirtualSecretaryAction(parsed.data, {
      actorVerified: true,
      actorAuthorized: membership.role === "owner" || membership.role === "admin",
      workspaceBound: true,
    });
    return NextResponse.json(plan, { headers: PRIVATE_NO_STORE });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
