import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import {
  communicationChannelSchema,
  manageCommunicationConnectorSchema,
} from "@/lib/construction-operating-assistant-r4/communication-contracts";
import {
  communicationChannelStatusForUser,
  prepareCommunicationChannel,
  revokeCommunicationChannel,
} from "@/server/construction-operating-assistant-r4/connectors";
import {
  approveOutboundWithoutDispatch,
  prepareApprovedSmsDispatch,
} from "@/server/construction-operating-assistant-r4/outbound";

const statusQuerySchema = z
  .object({
    workspaceId: z.string().min(1).max(160),
    channel: communicationChannelSchema,
  })
  .strict();

async function requireClient() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  if (user.role !== "CLIENT") return { error: NextResponse.json({ error: "Not found." }, { status: 404 }) } as const;
  const allowed = await consumeRateLimit(`communication-connector:${user.id}`, { window: 60, max: 60 });
  if (!allowed) return { error: NextResponse.json({ error: "Too many requests." }, { status: 429 }) } as const;
  return { user } as const;
}

export async function GET(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const parsed = statusQuerySchema.safeParse({
    workspaceId: url.searchParams.get("workspaceId"),
    channel: url.searchParams.get("channel"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid status request." }, { status: 400 });
  try {
    return NextResponse.json(await communicationChannelStatusForUser({ userId: auth.user.id, ...parsed.data }));
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const auth = await requireClient();
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = manageCommunicationConnectorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid communication command." }, { status: 400 });
  try {
    const result = parsed.data.action === "PREPARE_CHANNEL"
      ? await prepareCommunicationChannel({ userId: auth.user.id, command: parsed.data })
      : parsed.data.action === "REVOKE_LOCAL"
        ? await revokeCommunicationChannel({ userId: auth.user.id, command: parsed.data })
        : parsed.data.action === "APPROVE_OUTBOUND"
          ? await approveOutboundWithoutDispatch({ userId: auth.user.id, command: parsed.data })
          : await prepareApprovedSmsDispatch({ userId: auth.user.id, command: parsed.data });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && [
      "STALE_VERSION",
      "PAYLOAD_CHANGED",
      "CONCURRENT_OR_STALE",
      "EXACT_APPROVAL_REQUIRED",
      "CONNECTOR_IDEMPOTENCY_INPUT_MISMATCH",
    ].includes(error.message)) {
      return NextResponse.json({ error: "Communication state changed." }, { status: 409 });
    }
    return NextResponse.json({ error: "Communication command refused." }, { status: 404 });
  }
}
