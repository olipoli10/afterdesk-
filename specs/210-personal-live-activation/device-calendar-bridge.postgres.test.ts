import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { initializeConstructionWorkspace } from "@/server/construction-assistant-v1/workspace";
import { preparePersonalCalendar } from "@/server/personal-assistant/calendar-actions";
import {
  authorizeDeviceCalendarOperation,
  claimDeviceCalendarDirective,
  personalDeviceStatus,
  recordDeviceCalendarReceipt,
  registerPersonalAndroidDevice,
  revokePersonalAndroidDevice,
} from "@/server/personal-assistant/device-bridge";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
const dbName = process.env.ENDVERA_210_DATABASE_NAME ?? "";
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^endvera_personal_210_[a-f0-9]{32}$/.test(dbName)
  || url.pathname !== `/${dbName}`) throw new Error("DISPOSABLE_PERSONAL_DATABASE_REQUIRED");
afterAll(() => prisma.$disconnect());

const key = randomBytes(32).toString("base64");
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENDVERA_CONNECTOR_ENCRYPTION_KEY: key };
const secret = () => `${"A".repeat(43)}.${"B".repeat(43)}`;
const registration = (workspaceId: string, deviceId = randomUUID(), deviceSecret = secret()) => ({
  schemaVersion: 1 as const, action: "REGISTER" as const, workspaceId, deviceId, deviceSecret,
  platform: "android" as const, pushToken: null, appVersion: "0.3.0-test",
  permissions: { calendar: "GRANTED" as const, notifications: "DENIED" as const, selectedWritableCalendar: true },
});

async function fixture() {
  const user = await prisma.user.create({ data: {
    name: "Synthetic device owner", email: `device-${randomUUID()}@example.invalid`, role: "CLIENT", emailVerified: true,
  } });
  const workspaceId = (await initializeConstructionWorkspace({ userId: user.id, name: "Synthetic device workspace" })).workspaceId;
  const identity = registration(workspaceId);
  await registerPersonalAndroidDevice(user.id, identity, env);
  const prepared = await preparePersonalCalendar({
    userId: user.id, workspaceId, requestId: randomUUID(),
    draft: { title: "Visite synthétique", startsAt: "2031-04-05T14:00:00-04:00", endsAt: "2031-04-05T15:00:00-04:00", timezone: "America/Toronto" },
  });
  const authorized = await authorizeDeviceCalendarOperation({ userId: user.id, workspaceId, operationId: prepared.operationId, expectedRequestHash: prepared.requestHash });
  return { userId: user.id, workspaceId, identity, prepared, authorized };
}

describe("Android device calendar bridge on disposable PostgreSQL", () => {
  it("binds one owner device, admits one claim, commits one receipt and accepts only exact receipt replay", async () => {
    const f = await fixture();
    const claims = await Promise.allSettled(Array.from({ length: 4 }, () => claimDeviceCalendarDirective({
      userId: f.userId, workspaceId: f.workspaceId, deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret,
    }, { directiveId: f.authorized.directiveId, expectedRequestHash: f.authorized.requestHash }, env)));
    const won = claims.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    expect(won).toHaveLength(1);
    const receipt = { schemaVersion: 1 as const, action: "RECEIPT" as const, workspaceId: f.workspaceId,
      directiveId: f.authorized.directiveId, expectedRequestHash: f.authorized.requestHash, receiptToken: won[0].receiptToken,
      outcome: "COMPLETED" as const, nativeEventId: "synthetic-native-event-1" };
    await expect(recordDeviceCalendarReceipt({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, receipt, env))
      .resolves.toMatchObject({ status: "COMPLETED", replayed: false });
    await expect(recordDeviceCalendarReceipt({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, receipt, env))
      .resolves.toMatchObject({ status: "COMPLETED", replayed: true });
    await expect(recordDeviceCalendarReceipt({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, { ...receipt, nativeEventId: "different" },
    env)).rejects.toThrow("DEVICE_RECEIPT_CONFLICT");
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.prepared.operationId } }))
      .toMatchObject({ status: "completed", attempts: 1, externalTransportPerformed: false });
  });

  it("records uncertain exactly once, rejects cross-device access, and revokes only the exact device", async () => {
    const f = await fixture();
    await expect(claimDeviceCalendarDirective({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: randomUUID(), deviceSecret: f.identity.deviceSecret }, { directiveId: f.authorized.directiveId,
      expectedRequestHash: f.authorized.requestHash }, env)).rejects.toThrow("DEVICE_BRIDGE_AUTH_REFUSED");
    const claim = await claimDeviceCalendarDirective({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, { directiveId: f.authorized.directiveId,
      expectedRequestHash: f.authorized.requestHash }, env);
    const uncertain = { schemaVersion: 1 as const, action: "RECEIPT" as const, workspaceId: f.workspaceId,
      directiveId: f.authorized.directiveId, expectedRequestHash: f.authorized.requestHash, receiptToken: claim.receiptToken,
      outcome: "UNCERTAIN" as const, reason: "NATIVE_RESULT_UNKNOWN" as const };
    await expect(recordDeviceCalendarReceipt({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, uncertain, env))
      .resolves.toMatchObject({ status: "UNCERTAIN", automaticRetry: false });
    await expect(revokePersonalAndroidDevice(f.userId, f.workspaceId, randomUUID(), env))
      .rejects.toThrow("DEVICE_BRIDGE_REVOKE_REFUSED");
    await expect(revokePersonalAndroidDevice(f.userId, f.workspaceId, f.identity.deviceId, env))
      .resolves.toMatchObject({ revoked: true, replayed: false });
  });

  it("terminalizes an abandoned claimed directive without retrying the native write", async () => {
    const f = await fixture();
    const claim = await claimDeviceCalendarDirective({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, {
      directiveId: f.authorized.directiveId, expectedRequestHash: f.authorized.requestHash,
    }, env);
    await prisma.personalAssistantOperation.update({
      where: { id: f.authorized.directiveId },
      data: { leaseUntil: new Date(Date.now() - 11 * 60_000) },
    });
    await expect(personalDeviceStatus({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, env))
      .resolves.toMatchObject({ pending: [] });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.authorized.directiveId } }))
      .toMatchObject({ status: "uncertain", attempts: 1, leaseUntil: null });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.prepared.operationId } }))
      .toMatchObject({ status: "uncertain", attempts: 1, leaseUntil: null });
    await expect(recordDeviceCalendarReceipt({ userId: f.userId, workspaceId: f.workspaceId,
      deviceId: f.identity.deviceId, deviceSecret: f.identity.deviceSecret }, {
      schemaVersion: 1, action: "RECEIPT", workspaceId: f.workspaceId,
      directiveId: f.authorized.directiveId, expectedRequestHash: f.authorized.requestHash,
      receiptToken: claim.receiptToken, outcome: "UNCERTAIN", reason: "RECEIPT_RECOVERY_REQUIRED",
    }, env)).resolves.toMatchObject({ status: "UNCERTAIN", replayed: true, automaticRetry: false });
  });

  it("revocation refuses a pending directive and leaves its claimed calendar operation uncertain", async () => {
    const f = await fixture();
    await expect(revokePersonalAndroidDevice(f.userId, f.workspaceId, f.identity.deviceId, env))
      .resolves.toMatchObject({ revoked: true, replayed: false });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.authorized.directiveId } }))
      .toMatchObject({ status: "refused", attempts: 0, leaseUntil: null });
    expect(await prisma.personalAssistantOperation.findUniqueOrThrow({ where: { id: f.prepared.operationId } }))
      .toMatchObject({ status: "uncertain", attempts: 1, leaseUntil: null });
  });
});
