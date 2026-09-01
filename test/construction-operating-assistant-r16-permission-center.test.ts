import { describe, expect, it } from "vitest";
import {
  constructionPermissionCenterSchema,
  revokePermissionCommandSchema,
} from "@/lib/construction-operating-assistant-r16/permissions";

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-01T22:30:00.000Z",
  workspace: { id: "workspace-1", name: "ENDVERA Construction" },
  externalTransportEnabled: false as const,
};

describe("Construction Operating Assistant R16 permission contracts", () => {
  it("accepts an exact office projection without secret-bearing fields", () => {
    const value = {
      ...base,
      currentUser: { userId: "owner-1", role: "OWNER" as const },
      capabilities: [
        { key: "CONNECTOR_REVOKE", label: "Révoquer les accès locaux", state: "INTERNAL" as const, effective: true },
      ],
      members: [
        { userId: "owner-1", displayName: "Olivier", role: "OWNER" as const, status: "ACTIVE" as const, isCurrentUser: true },
      ],
      connectors: [
        {
          id: "account-1",
          provider: "google_calendar",
          label: "Google Calendar",
          state: "PREPARED_DISABLED" as const,
          stateVersion: 1,
          grants: [{
            id: "grant-1",
            capability: "calendar_read",
            state: "PREPARED_DISABLED" as const,
            stateVersion: 1,
            requestedScopes: ["calendar.read"],
            grantedScopes: [],
            revocable: true,
          }],
          revocable: true,
          externalTransportEnabled: false as const,
        },
      ],
      canManageConnectors: true as const,
    };
    expect(constructionPermissionCenterSchema.parse(value)).toEqual(value);
    expect(() => constructionPermissionCenterSchema.parse({
      ...value,
      connectors: [{ ...value.connectors[0], credentialRef: "secret-ref" }],
    })).toThrow();
  });

  it("requires the field projection to contain only the current member and no connector", () => {
    const field = {
      ...base,
      currentUser: { userId: "field-1", role: "FIELD_WORKER" as const },
      capabilities: [
        { key: "PROJECT_STATE_READ", label: "Voir le chantier", state: "INTERNAL" as const, effective: true },
      ],
      members: [
        { userId: "field-1", displayName: "Travailleur", role: "FIELD_WORKER" as const, status: "ACTIVE" as const, isCurrentUser: true },
      ],
      connectors: [],
      canManageConnectors: false as const,
    };
    expect(constructionPermissionCenterSchema.parse(field)).toEqual(field);
    expect(() => constructionPermissionCenterSchema.parse({
      ...field,
      capabilities: [{ key: "FINANCIALS_READ", label: "Finances", state: "INTERNAL", effective: true }],
    })).toThrow("FIELD_PERMISSION_PROJECTION_INVALID");
    expect(() => constructionPermissionCenterSchema.parse({
      ...field,
      members: [...field.members, { ...field.members[0], userId: "owner-1", isCurrentUser: false }],
    })).toThrow("FIELD_PERMISSION_PROJECTION_INVALID");
  });

  it("rejects ambiguous, stale-shaped or externally executable revocation commands", () => {
    const command = {
      schemaVersion: 1,
      action: "REVOKE_ACCOUNT_LOCAL",
      commandId: "00000000-0000-4000-8000-000000000116",
      workspaceId: "workspace-1",
      accountId: "account-1",
      expectedStateVersion: 1,
    };
    expect(revokePermissionCommandSchema.parse(command)).toEqual(command);
    expect(() => revokePermissionCommandSchema.parse({ ...command, execute: true })).toThrow();
    expect(() => revokePermissionCommandSchema.parse({ ...command, providerToken: "secret" })).toThrow();
  });
});
