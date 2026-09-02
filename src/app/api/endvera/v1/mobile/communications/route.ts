import { NextResponse } from "next/server";
import { consumeRateLimit, getSessionUser } from "@/lib/authz";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { messagingMobileApiCommandSchema } from "@/lib/construction-operating-assistant-r24/contracts";
import {
  applyMessagingPolicyCommandR24,
  messagingCockpitForUserR24,
  preparePolicyBoundSmsR24,
} from "@/server/construction-operating-assistant-r24/messaging";

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

export async function GET(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(
    `construction-mobile-communications-read:${auth.user.id}`,
    { window: 60, max: 60 },
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || workspaceId.length > 160) {
    return NextResponse.json({ error: "Invalid communications query." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    return NextResponse.json(
      await messagingCockpitForUserR24({ userId: auth.user.id, workspaceId }),
      { headers: PRIVATE_NO_STORE },
    );
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}

const CONFLICT_CODES = new Set([
  "MESSAGING_POLICY_IDEMPOTENCY_CONFLICT",
  "MESSAGING_POLICY_STALE_STATE",
  "MESSAGING_IDEMPOTENCY_CONFLICT",
  "EXACT_APPROVAL_REQUIRED",
  "MESSAGING_CONSENT_REQUIRED",
  "MESSAGING_SUPPRESSED",
  "MESSAGING_CONSENT_REVIEW_REQUIRED",
  "SMS_CONNECTOR_NOT_PREPARED",
]);

export async function POST(request: Request) {
  const auth = await authorizedUser();
  if ("response" in auth) return auth.response;
  const allowed = await consumeRateLimit(
    `construction-mobile-communications-write:${auth.user.id}`,
    { window: 60, max: 30 },
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: PRIVATE_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const parsed = messagingMobileApiCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid communications command." }, { status: 400, headers: PRIVATE_NO_STORE });
  }
  try {
    const result = parsed.data.action === "PREPARE_POLICY_BOUND_SMS"
      ? await preparePolicyBoundSmsR24({ userId: auth.user.id, command: parsed.data })
      : parsed.data.action === "RECORD_CONSENT_ATTESTATION"
        ? await applyMessagingPolicyCommandR24({
            userId: auth.user.id,
            command: {
              schemaVersion: 1,
              action: "RECORD_CONSENT",
              commandId: parsed.data.commandId,
              workspaceId: parsed.data.workspaceId,
              contactId: parsed.data.contactId,
              purpose: parsed.data.purpose,
              expectedStateVersion: parsed.data.expectedStateVersion,
              evidenceRef: `consent_${sha256Canonical({
                schemaVersion: 1,
                kind: "OWNER_CONSENT_ATTESTATION",
                commandId: parsed.data.commandId,
                workspaceId: parsed.data.workspaceId,
                contactId: parsed.data.contactId,
                purpose: parsed.data.purpose,
                actorUserId: auth.user.id,
                statementAccepted: parsed.data.statementAccepted,
              })}`,
            },
          })
        : await applyMessagingPolicyCommandR24({ userId: auth.user.id, command: parsed.data });
    return NextResponse.json(result, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (CONFLICT_CODES.has(code)) {
      return NextResponse.json({ error: code }, { status: 409, headers: PRIVATE_NO_STORE });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: PRIVATE_NO_STORE });
  }
}
