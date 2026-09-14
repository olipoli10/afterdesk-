import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

const db = vi.hoisted(() => ({
  account: vi.fn(),
  credential: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  constructionConnectorAccount: { findFirst: db.account },
  constructionConnectorCredential: { findFirst: db.credential },
} }));

import { sealConnectorSecret } from "@/server/personal-assistant/credential-cipher";
import { wakePersonalAndroidDevice } from "@/server/personal-assistant/device-push";

describe("generic Android device wake", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is fail-closed before database or transport", async () => {
    const transport = vi.fn();
    await expect(wakePersonalAndroidDevice({ userId: "u", workspaceId: "w" }, { NODE_ENV: "test" }, transport as never))
      .resolves.toMatchObject({ status: "DISABLED", externalTransportPerformed: false });
    expect(db.account).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends a generic wake without operation, calendar or owner data", async () => {
    const key = randomBytes(32);
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      ENDVERA_DEVICE_PUSH_ENABLED: "ENABLED",
      ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED",
      ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2099-01-01T00:00:00Z",
      ENDVERA_CONNECTOR_ENCRYPTION_KEY: key.toString("base64"),
    };
    const account = { id: "account", credentialRef: "credential" };
    const token = "ExponentPushToken[synthetic_device_token]";
    db.account.mockResolvedValue(account);
    db.credential.mockResolvedValue({
      id: "credential",
      ciphertext: sealConnectorSecret(JSON.stringify({
        schemaVersion: 1, deviceId: randomUUID(), platform: "android", pushToken: token,
      }), JSON.stringify(["endvera-android-device-v1", "workspace", "account", "credential"]), key),
    });
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "ok" } }), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    await expect(wakePersonalAndroidDevice({ userId: "owner", workspaceId: "workspace" }, env, transport))
      .resolves.toMatchObject({ status: "ACCEPTED", externalTransportPerformed: true });
    const request = transport.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toBe("https://exp.host/--/api/v2/push/send");
    const body = JSON.parse(String(request[1].body));
    expect(body).toEqual({
      to: token, data: { type: "ENDVERA_DEVICE_WAKE_V1" }, priority: "high", ttl: 900,
    });
    expect(JSON.stringify(body)).not.toMatch(/workspace|owner|calendar|operation|rendez-vous/i);
  });
});
