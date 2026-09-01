import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { preparedActionDecisionCommandSchema } from "@/lib/construction-operating-assistant-r11/prepared-action-decisions";
import { decidePreparedAction } from "@/server/construction-operating-assistant-r11/decisions";

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
  const allowed = await consumeRateLimit(`prepared-action-decision:${user.id}`, {
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
  const parsed = preparedActionDecisionCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  try {
    const result = await decidePreparedAction({
      userId: user.id,
      command: parsed.data,
    });
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: PRIVATE_NO_STORE,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "STALE_VERSION",
        "PAYLOAD_CHANGED",
        "CONCURRENT_OR_STALE",
        "DECISION_STATE_CHANGED",
        "EXACT_APPROVAL_REQUIRED",
        "DECISION_IDEMPOTENCY_MISMATCH",
      ].includes(error.message)
    ) {
      return NextResponse.json(
        { error: "Prepared action changed." },
        { status: 409, headers: PRIVATE_NO_STORE },
      );
    }
    return NextResponse.json(
      { error: "Prepared action not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
}
