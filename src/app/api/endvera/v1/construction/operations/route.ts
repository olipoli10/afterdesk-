import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  constructionCockpitQuerySchema,
} from "@/lib/construction-operating-assistant-r7/api-contracts";
import {
  ConstructionApiRequestError,
  parseConstructionCommandRequest,
} from "@/lib/construction-operating-assistant-r7/http";
import {
  constructionSharedCockpitForUser,
  processConstructionSharedApiCommand,
} from "@/server/construction-operating-assistant-r7/gateway";

async function requireClient() {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    } as const;
  }
  if (user.role !== "CLIENT") {
    return {
      error: NextResponse.json({ error: "Not found." }, { status: 404 }),
    } as const;
  }
  const allowed = await consumeRateLimit(`construction-shared-api:${user.id}`, {
    window: 60,
    max: 90,
  });
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests." },
        { status: 429 },
      ),
    } as const;
  }
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = constructionCockpitQuerySchema.safeParse({
    workspaceId: url.searchParams.get("workspaceId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid cockpit request." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await constructionSharedCockpitForUser({
        userId: auth.user.id,
        workspaceId: parsed.data.workspaceId,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  let command;
  try {
    command = await parseConstructionCommandRequest(request);
  } catch (error) {
    if (error instanceof ConstructionApiRequestError) {
      return NextResponse.json(
        { error: error.publicMessage },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await processConstructionSharedApiCommand({
      userId: auth.user.id,
      command,
    });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "CONSTRUCTION_RECEIVABLE_IDEMPOTENCY_CONFLICT",
        "CONSTRUCTION_RECEIVABLE_PAYMENT_IDEMPOTENCY_CONFLICT",
        "CONSTRUCTION_RECEIVABLE_STALE_VERSION",
        "CONSTRUCTION_RECEIVABLE_NOT_PAYABLE",
        "CONSTRUCTION_RECEIVABLE_PAYMENT_EXCEEDS_BALANCE",
        "CONSTRUCTION_FOLLOW_UP_IDEMPOTENCY_CONFLICT",
      ].includes(error.message)
    ) {
      return NextResponse.json(
        { error: "Construction state changed." },
        { status: 409 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid construction command." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Construction command refused." },
      { status: 404 },
    );
  }
}
