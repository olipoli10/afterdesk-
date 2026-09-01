import { describe, expect, it } from "vitest";
import {
  mobileRevokePermissionCommandSchema,
  parseMobilePermissionCenter,
} from "../src/lib/permissions";

const owner = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-01T22:30:00.000Z",
  workspace: { id: "workspace-1", name: "ENDVERA Construction" },
  currentUser: { userId: "owner-1", role: "OWNER" as const },
  capabilities: [{ key: "CONNECTOR_REVOKE", label: "Révoquer", state: "INTERNAL" as const, effective: true }],
  members: [{ userId: "owner-1", displayName: "Olivier", role: "OWNER" as const, status: "ACTIVE" as const, isCurrentUser: true }],
  connectors: [{
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
  }],
  canManageConnectors: true as const,
  externalTransportEnabled: false as const,
};

describe("native R16 permission parser", () => {
  it("accepts exact owner state and strict local revocation commands", () => {
    expect(parseMobilePermissionCenter(owner).workspace.id).toBe("workspace-1");
    expect(mobileRevokePermissionCommandSchema.parse({
      schemaVersion: 1,
      action: "REVOKE_GRANT_LOCAL",
      commandId: "00000000-0000-4000-8000-000000000116",
      workspaceId: "workspace-1",
      accountId: "account-1",
      grantId: "grant-1",
      expectedStateVersion: 1,
    }).action).toBe("REVOKE_GRANT_LOCAL");
  });

  it("recursively refuses credential, account hash and financial leakage", () => {
    expect(() => parseMobilePermissionCenter({
      ...owner,
      connectors: [{ ...owner.connectors[0], credentialRef: "secret" }],
    })).toThrow("MOBILE_PERMISSION_SECRET_LEAK_REFUSED");
    expect(() => parseMobilePermissionCenter({
      ...owner,
      connectors: [{ ...owner.connectors[0], grants: [{ ...owner.connectors[0].grants[0], amountMinor: 120000 }] }],
    })).toThrow("MOBILE_PERMISSION_SECRET_LEAK_REFUSED");
  });

  it("requires a field worker to receive only their own membership and zero connectors", () => {
    const field = {
      ...owner,
      currentUser: { userId: "field-1", role: "FIELD_WORKER" as const },
      capabilities: [{ key: "EVIDENCE_ADD", label: "Ajouter une preuve", state: "INTERNAL" as const, effective: true }],
      members: [{ userId: "field-1", displayName: "Terrain", role: "FIELD_WORKER" as const, status: "ACTIVE" as const, isCurrentUser: true }],
      connectors: [],
      canManageConnectors: false as const,
    };
    expect(parseMobilePermissionCenter(field).currentUser.role).toBe("FIELD_WORKER");
    expect(() => parseMobilePermissionCenter({ ...field, members: owner.members })).toThrow(
      "MOBILE_PERMISSION_FIELD_SCOPE_REFUSED",
    );
  });
});
