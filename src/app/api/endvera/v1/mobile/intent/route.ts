import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { unifiedIntentEnvelopeSchema } from "@/lib/construction-operating-assistant-r18/contracts";
import {
  processUnifiedIntent,
  UnifiedIntentConflict,
} from "@/server/construction-operating-assistant-r18/unified-intent";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }
  if (user.role !== "CLIENT" || !user.emailVerified) {
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
  const allowed = await consumeRateLimit(`construction-mobile-intent:${user.id}`, {
    window: 60,
    max: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: PRIVATE_NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  const parsed = unifiedIntentEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  try {
    const result = await processUnifiedIntent({ userId: user.id, envelope: parsed.data });
    const status = result.transition.performed && !result.transition.replayed ? 201 : 200;
    return NextResponse.json(result, { status, headers: PRIVATE_NO_STORE });
  } catch (error) {
    if (error instanceof UnifiedIntentConflict) {
      return NextResponse.json(
        { error: "Intent identifier conflict." },
        { status: 409, headers: PRIVATE_NO_STORE },
      );
    }
    return NextResponse.json(
      { error: "Intent refused." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
}
