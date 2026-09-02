import { describe, expect, it } from "vitest";
import {
  createPrepareEmailAccountCommand,
  mobileEmailDraftCommandSchema,
  parseMobileEmailCockpit,
} from "@/lib/email-inbox";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  type SecureOutboxStore,
} from "@/lib/outbox";

const ref = `email_${"a".repeat(64)}`;
const workspace = {
  id: "w1",
  name: "ENDVERA Construction",
  defaultTimezone: "America/Toronto",
  defaultLocale: "fr-CA",
  role: "OWNER" as const,
  permissions: {
    financialsVisible: true,
    canManageReceivables: true,
    canScheduleFollowUps: true,
    canApprovePreparedActions: true,
    canAddEvidence: true,
    externalTransportAuthorized: false as const,
  },
};

function store(): SecureOutboxStore {
  const memory = new Map<string, string>();
  return {
    getItemAsync: async (key) => memory.get(key) ?? null,
    setItemAsync: async (key, value) => {
      memory.set(key, value);
    },
    deleteItemAsync: async (key) => {
      memory.delete(key);
    },
  };
}

describe("mobile R26 email", () => {
  it("builds a local disabled account command and persists retry", async () => {
    const command = createPrepareEmailAccountCommand({
      workspace,
      commandId: "6bcd0e57-12ce-432d-a0fc-17547c193521",
      provider: "GOOGLE_GMAIL",
      accountRef: ref,
      mailboxScopeRef: `email_${"b".repeat(64)}`,
    });
    const secureStore = store();
    await enqueueMobileOutbox({
      kind: "EMAIL_ACCOUNT_COMMAND",
      command,
      store: secureStore,
    });
    expect((await loadMobileOutbox({ workspaceId: workspace.id, store: secureStore }))[0])
      .toMatchObject({
        kind: "EMAIL_ACCOUNT_COMMAND",
        state: "QUEUED",
        automaticDispatchAllowed: false,
      });
  });

  it("refuses field detail leakage", () => {
    expect(() => parseMobileEmailCockpit({
      schemaVersion: 1,
      workspaceId: "w1",
      role: "field_worker",
      accounts: [],
      contacts: [],
      events: [{ subject: "secret" }],
      drafts: [],
      counts: { accounts: 0, events: 1, preparedUnsent: 0 },
      providerObserved: false,
      externalTransportEnabled: false,
    })).toThrow("MOBILE_EMAIL_FIELD_LEAK_REFUSED");
  });

  it("requires an exact approval hash", () => {
    expect(mobileEmailDraftCommandSchema.safeParse({
      schemaVersion: 1,
      action: "APPROVE_EMAIL_DRAFT",
      commandId: crypto.randomUUID(),
      workspaceId: "w1",
      draftId: "d1",
      expectedVersion: 1,
      expectedPayloadHash: "bad",
    }).success).toBe(false);
  });
});
