import {
  personalDeviceClaimSchema,
  personalDeviceCommandSchema,
  personalDeviceRegistrationSchema,
  personalDeviceRevokeSchema,
} from "@/lib/personal-device-bridge";
import { personalApiUser } from "@/server/personal-assistant/api-auth";
import {
  claimDeviceCalendarDirective,
  personalDeviceStatus,
  recordDeviceCalendarReceipt,
  registerPersonalAndroidDevice,
  revokePersonalAndroidDevice,
} from "@/server/personal-assistant/device-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", vary: "Cookie, Authorization, X-Endvera-Device-Id, X-Endvera-Device-Secret" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

function deviceIdentity(request: Request) {
  const deviceId = request.headers.get("x-endvera-device-id");
  const deviceSecret = request.headers.get("x-endvera-device-secret");
  if (!deviceId || !deviceSecret || !/^[0-9a-f-]{36}$/i.test(deviceId)
    || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(deviceSecret)) return null;
  return { deviceId, deviceSecret };
}

export async function GET(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const workspaceId = params.get("workspaceId");
  const identity = deviceIdentity(request);
  if (!workspaceId || workspaceId.length > 191 || params.getAll("workspaceId").length !== 1
    || [...params.keys()].some((key) => key !== "workspaceId") || !identity) return json({ error: "Appareil non lié." }, 400);
  try {
    return json(await personalDeviceStatus({ userId: auth.user.id, workspaceId, ...identity }));
  } catch {
    return json({ error: "Appareil non lié." }, 403);
  }
}

export async function POST(request: Request) {
  const auth = await personalApiUser(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const command = personalDeviceCommandSchema.safeParse(body);
  if (!command.success) return json({ error: "Commande d’appareil invalide." }, 400);
  try {
    if (personalDeviceRegistrationSchema.safeParse(command.data).success) {
      return json(await registerPersonalAndroidDevice(auth.user.id, command.data));
    }
    if (personalDeviceRevokeSchema.safeParse(command.data).success) {
      const revoke = personalDeviceRevokeSchema.parse(command.data);
      return json(await revokePersonalAndroidDevice(auth.user.id, revoke.workspaceId, revoke.deviceId));
    }
    const identity = deviceIdentity(request);
    if (!identity) return json({ error: "Appareil non lié." }, 403);
    if (personalDeviceClaimSchema.safeParse(command.data).success) {
      const claim = personalDeviceClaimSchema.parse(command.data);
      return json(await claimDeviceCalendarDirective(
        { userId: auth.user.id, workspaceId: claim.workspaceId, ...identity },
        { directiveId: claim.directiveId, expectedRequestHash: claim.expectedRequestHash },
      ));
    }
    return json(await recordDeviceCalendarReceipt(
      { userId: auth.user.id, workspaceId: command.data.workspaceId, ...identity },
      command.data,
    ));
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEVICE_BRIDGE_REFUSED";
    const conflict = /CHANGED|CONFLICT|CLAIM_REFUSED|RECEIPT_REFUSED/.test(code);
    return json({ error: code }, conflict ? 409 : 403);
  }
}

