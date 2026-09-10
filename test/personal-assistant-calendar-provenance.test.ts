import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  operation: vi.fn(), claim: vi.fn(), workspace: vi.fn(), transaction: vi.fn(),
  legacyItem: vi.fn(), prepareGoogle: vi.fn(), admission: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  personalAssistantOperation: { findUnique: mocks.operation, updateMany: mocks.claim }, $executeRawUnsafe: mocks.claim,
  constructionWorkspace: { findUniqueOrThrow: mocks.workspace },
  constructionCalendarItem: { findFirst: mocks.legacyItem }, $transaction: mocks.transaction,
} }));
vi.mock("@/server/personal-assistant/sms-inbox", () => ({ enqueuePersonalSms: mocks.admission }));
vi.mock("@/server/personal-assistant/calendar-actions", () => ({ preparePersonalCalendar: mocks.prepareGoogle }));
vi.mock("@/server/construction-operating-assistant-r36c/orchestrator", () => ({ processUnifiedAssistantRequest: vi.fn() }));
vi.mock("@/server/personal-assistant/google-connection", () => ({ readGoogleCalendar: vi.fn() }));
vi.mock("@/server/personal-assistant/outbox", () => ({ sendAutomaticPersonalReply: vi.fn() }));
import { processPersonalSms } from "@/server/personal-assistant/sms-worker";

describe("legacy calendar end provenance", () => {
  it("never prepares a Google write from the legacy default one-hour end", async () => {
    const request = { schemaVersion: 1, accountSid: "synthetic", messageSid: "synthetic", from: "+15005550001", to: "+15005550006",
      body: "Rendez-vous avec Marc pour Laval mardi à 14 h", contentHash: "synthetic", identityId: "identity" };
    mocks.operation.mockResolvedValue({ id: "inbound", kind: "personal_sms_inbound", status: "received", attempts: 0, requestHash: "synthetic", request,
      workspaceId: "workspace", createdByUserId: "owner", connectorAccountId: "account", createdAt: new Date("2026-09-10T03:00:00Z") });
    mocks.admission.mockResolvedValue({ operationId: "inbound" }); mocks.claim.mockResolvedValue(1);
    mocks.workspace.mockResolvedValue({ defaultTimezone: "America/Toronto" });
    mocks.legacyItem.mockResolvedValue({ title: "Marc", startsAt: new Date("2026-09-15T18:00:00Z"), endsAt: new Date("2026-09-15T19:00:00Z"), timezone: "America/Toronto" });
    const createReply = vi.fn(); const update = vi.fn().mockResolvedValue(1);
    mocks.transaction.mockImplementation(async work => work({ constructionCommunicationIdentity: { findFirst: async () => ({ id: "identity" }) },
      $executeRawUnsafe: update, personalAssistantOperation: { create: createReply } }));
    const env = { ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: "synthetic-authority", ENDVERA_EXTERNAL_OWNER_REF: "synthetic-owner",
      ENDVERA_SMS_PROVIDER_ENABLED: "ENABLED", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: "synthetic-key-id", TWILIO_API_KEY_SECRET: "synthetic-secret",
      TWILIO_AUTH_TOKEN: "synthetic-token", TWILIO_PHONE_NUMBER: request.to, ENDVERA_PROVIDER_WEBHOOK_ORIGIN: "https://endvera.example",
      ENDVERA_PERSONAL_SMS_WORKER_ENABLED: "true", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() };
    const result = await processPersonalSms("inbound", env, { engine: async () => ({ reply: "Rendez-vous créé dans ENDVERA.", intent: "CALENDAR_ITEM_CREATE", canonicalEffectId: "item" }) });
    expect(result.status).toBe("COMPLETED_REPLY_PREPARED");
    expect(mocks.prepareGoogle).not.toHaveBeenCalled();
    expect(createReply.mock.calls[0][0].data.request.text).toContain("durée par défaut");
    expect(createReply.mock.calls[0][0].data.status).toBe("pending");
    expect(JSON.parse(update.mock.calls[0][6]).replyDelivery).toBe("PREPARED_UNSENT");
  });
});
