import { describe, expect, it } from "vitest";
import {
  mobileCalendarConnectorCommandResultSchema,
  mobileCalendarConnectorCommandSchema,
  parseMobileCalendarConnectorCockpit,
} from "../src/lib/calendar-connectors";
import {
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type SecureOutboxStore,
} from "../src/lib/outbox";

const command = {
  schemaVersion: 1 as const,
  commandId: "d1ebcda8-bffa-4502-9ac7-fee05b0754ce",
  requestId: "d1ebcda8-bffa-4502-9ac7-fee05b0754ce",
  idempotencyKey: "d1ebcda8-bffa-4502-9ac7-fee05b0754ce",
  workspaceId: "workspace-1",
  provider: "google_calendar" as const,
  expectedStateVersion: 0,
  action: "PREPARE_CONNECTION" as const,
  mode: "READ_ONLY" as const,
};

const googleStatus = {
  schemaVersion: 1 as const,
  provider: "google_calendar" as const,
  label: "Google Calendar",
  status: "NOT_CONFIGURED" as const,
  requestedScopes: [],
  grantedScopes: [],
  readEnabled: false,
  writeEnabled: false,
  credentialStored: false,
  stateVersion: 0,
  revokedAt: null,
  missingConfiguration: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  nextAction: "Choisir l’accès minimal à préparer pour Google Calendar.",
  externalTransportEnabled: false as const,
};

describe("native R23 calendar connector contracts", () => {
  it("parses both provider cards for owner and a deliberately empty field projection", () => {
    const owner = parseMobileCalendarConnectorCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "owner",
      providers: [
        googleStatus,
        {
          ...googleStatus,
          provider: "microsoft_calendar",
          label: "Microsoft Outlook Calendar",
          missingConfiguration: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
        },
      ],
      externalTransportEnabled: false,
      secretValuesVisible: false,
    });
    const field = parseMobileCalendarConnectorCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "field_worker",
      providers: [],
      externalTransportEnabled: false,
      secretValuesVisible: false,
    });
    expect(owner.providers.map((provider) => provider.provider)).toEqual([
      "google_calendar",
      "microsoft_calendar",
    ]);
    expect(field.providers).toEqual([]);
  });

  it("recursively refuses credential, cursor, token or account references in field data", () => {
    expect(() => parseMobileCalendarConnectorCockpit({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "field_worker",
      providers: [],
      externalTransportEnabled: false,
      secretValuesVisible: false,
      nested: { credentialRef: "forbidden" },
    })).toThrow("MOBILE_CALENDAR_CONNECTOR_FIELD_LEAK_REFUSED");
  });

  it("keeps prepare, revoke and command results strict and zero-transport", () => {
    expect(mobileCalendarConnectorCommandSchema.parse(command)).toEqual(command);
    const { mode: _mode, ...revokeBase } = command;
    expect(mobileCalendarConnectorCommandSchema.parse({
      ...revokeBase,
      action: "REVOKE_LOCAL",
    }).action).toBe("REVOKE_LOCAL");
    expect(() => mobileCalendarConnectorCommandSchema.parse({ ...command, oauthCode: "secret" })).toThrow();
    expect(mobileCalendarConnectorCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      requestId: command.requestId,
      idempotencyKey: command.idempotencyKey,
      workspaceId: command.workspaceId,
      provider: command.provider,
      accountId: "account-1",
      operationId: "operation-1",
      status: "PREPARED",
      stateVersion: 1,
      requestedScopes: ["https://www.googleapis.com/auth/calendar.events.readonly"],
      missingConfiguration: ["GOOGLE_CLIENT_ID"],
      localAccessDisabled: true,
      replayed: false,
      externalTransportPerformed: false,
    }).externalTransportPerformed).toBe(false);
  });

  it("restores the exact calendar command after an application restart", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const entry = await enqueueMobileOutbox({
      kind: "CALENDAR_CONNECTOR_COMMAND",
      command,
      store,
    });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: command.workspaceId, store });
    expect(restored[0]).toMatchObject({
      kind: "CALENDAR_CONNECTOR_COMMAND",
      state: "OUTCOME_UNKNOWN",
      automaticDispatchAllowed: false,
      command,
    });
  });
});
