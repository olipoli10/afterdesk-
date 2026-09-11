import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { personalDeviceBridgeConstants } from "./device-bridge";
import { openConnectorSecret, requireConnectorKey } from "./credential-cipher";

const tokenSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.string().uuid(),
  platform: z.literal("android"),
  pushToken: z.string().regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/).nullable(),
}).passthrough();

const credentialBinding = (workspaceId: string, accountId: string, credentialId: string) =>
  JSON.stringify(["endvera-android-device-v1", workspaceId, accountId, credentialId]);

export async function wakePersonalAndroidDevice(
  input: { userId: string; workspaceId: string },
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  const disabled = (reason: string) => ({ status: "DISABLED" as const, reason, externalTransportPerformed: false as const });
  if (env.ENDVERA_DEVICE_PUSH_ENABLED !== "ENABLED" || env.ENDVERA_EXTERNAL_TRANSPORT_ENABLED !== "ENABLED") return disabled("SWITCH_OFF");
  if (!(Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "") > Date.now())) return disabled("PILOT_EXPIRED");
  const account = await prisma.constructionConnectorAccount.findFirst({
    where: {
      workspaceId: input.workspaceId, createdByUserId: input.userId,
      provider: personalDeviceBridgeConstants.DEVICE_PROVIDER, status: "connected", revokedAt: null,
      credentialRef: { not: null }, grantedScopes: { has: personalDeviceBridgeConstants.DEVICE_SCOPES.wake },
      grants: { some: { capability: "device_wake", status: "active", revokedAt: null,
        grantedScopes: { has: personalDeviceBridgeConstants.DEVICE_SCOPES.wake } } },
    },
  });
  if (!account?.credentialRef) return disabled("NO_ACTIVE_DEVICE");
  const credential = await prisma.constructionConnectorCredential.findFirst({
    where: { id: account.credentialRef, connectorAccountId: account.id, workspaceId: input.workspaceId, revokedAt: null },
  });
  if (!credential) return disabled("NO_ACTIVE_DEVICE");
  const payload = tokenSchema.parse(JSON.parse(openConnectorSecret(
    credential.ciphertext,
    credentialBinding(input.workspaceId, account.id, credential.id),
    requireConnectorKey(env.ENDVERA_CONNECTOR_ENCRYPTION_KEY),
  )));
  if (!payload.pushToken) return disabled("NO_PUSH_TOKEN");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await transport("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        to: payload.pushToken,
        title: "ENDVERA",
        body: "Une action autorisée attend ton téléphone.",
        data: { type: "ENDVERA_DEVICE_WAKE_V1" },
        priority: "high",
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "UNCONFIRMED" as const, externalTransportPerformed: true as const };
    const parsed = z.object({ data: z.union([
      z.object({ status: z.literal("ok") }).passthrough(),
      z.object({ status: z.literal("error") }).passthrough(),
    ]) }).safeParse(await response.json().catch(() => null));
    return parsed.success && parsed.data.data.status === "ok"
      ? { status: "ACCEPTED" as const, externalTransportPerformed: true as const }
      : { status: "UNCONFIRMED" as const, externalTransportPerformed: true as const };
  } catch {
    return { status: "UNCONFIRMED" as const, externalTransportPerformed: true as const };
  } finally {
    clearTimeout(timeout);
  }
}
