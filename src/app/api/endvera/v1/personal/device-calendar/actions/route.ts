import { z } from "zod";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import { authorizeDeviceCalendarOperation } from "@/server/personal-assistant/device-bridge";
import { wakePersonalAndroidDevice } from "@/server/personal-assistant/device-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };
const commandSchema = z.object({
  schemaVersion: z.literal(1),
  action: z.literal("APPROVE_EXACT_DEVICE_CALENDAR_WRITE"),
  workspaceId: z.string().min(1).max(191),
  operationId: z.string().min(1).max(191),
  expectedRequestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) return auth.response;
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Approbation invalide." }, { status: 400, headers });
  try {
    const result = await authorizeDeviceCalendarOperation({
      userId: auth.user.id,
      workspaceId: parsed.data.workspaceId,
      operationId: parsed.data.operationId,
      expectedRequestHash: parsed.data.expectedRequestHash,
    });
    const wake = await wakePersonalAndroidDevice({ userId: auth.user.id, workspaceId: parsed.data.workspaceId });
    return Response.json({ ...result, wake: wake.status }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVICE_CALENDAR_APPROVAL_REFUSED";
    return Response.json({ error: code }, { status: /CONFLICT/.test(code) ? 409 : 403, headers });
  }
}
