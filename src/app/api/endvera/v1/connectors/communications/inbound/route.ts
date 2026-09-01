import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { communicationInboundEventSchema } from "@/lib/construction-operating-assistant-r4/communication-contracts";
import { opaqueCommunicationIdentityRef } from "@/lib/construction-operating-assistant-r4/communications";
import { processCommunicationInbound } from "@/server/construction-operating-assistant-r4/inbound";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "CLIENT") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const allowed = await consumeRateLimit(`communication-inbound:${user.id}`, { window: 60, max: 60 });
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = communicationInboundEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid communication event." }, { status: 400 });
  const expectedIdentity = opaqueCommunicationIdentityRef({
    userId: user.id,
    workspaceId: parsed.data.workspaceId,
    channel: parsed.data.channel,
  });
  if (parsed.data.senderIdentityRef !== expectedIdentity) {
    return NextResponse.json({ error: "Communication event refused." }, { status: 404 });
  }
  try {
    const result = await processCommunicationInbound({
      event: parsed.data,
      assertion: {
        adapterId: "ENDVERA_LOCAL_AUTHENTICATED_R4",
        authenticityVerified: true,
        externalTransportPerformed: false,
      },
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "Communication event refused." }, { status: 404 });
  }
}
