import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authz";
import {
  checkoutUrlForTask,
  PaymentUnavailableError,
} from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role !== "CLIENT") {
    return NextResponse.json({ error: "Only clients can pay for tasks." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const taskId =
    typeof body === "object" && body !== null && "taskId" in body
      ? String((body as { taskId: unknown }).taskId)
      : "";
  if (!taskId || taskId.length > 100) {
    return NextResponse.json({ error: "Invalid task." }, { status: 400 });
  }

  try {
    const url = await checkoutUrlForTask(taskId, user.id);
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof PaymentUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[payments] checkout session failed", error);
    return NextResponse.json(
      { error: "Secure checkout could not start. Your approved price is unchanged." },
      { status: 502 }
    );
  }
}

