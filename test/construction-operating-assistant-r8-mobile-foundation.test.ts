import { describe, expect, it } from "vitest";
import {
  CONSTRUCTION_MOBILE_API_VERSION,
  constructionMobileBootstrapResponseSchema,
} from "@/lib/construction-operating-assistant-r8/mobile-contracts";
import {
  constructionPermissionsForRole,
  constructionProjectionRole,
} from "@/server/construction-operating-assistant-r7/gateway";

function bootstrapFixture() {
  return {
    schemaVersion: CONSTRUCTION_MOBILE_API_VERSION,
    generatedAt: "2026-09-01T12:00:00.000Z",
    user: {
      id: "user-1",
      name: "Olivier",
      email: "olivier@example.invalid",
    },
    workspaces: [
      {
        id: "workspace-1",
        name: "ENDVERA Construction",
        defaultTimezone: "America/Toronto",
        defaultLocale: "fr-CA",
        role: "OWNER" as const,
        permissions: constructionPermissionsForRole("OWNER"),
      },
    ],
  };
}

describe("construction mobile bootstrap contract", () => {
  it("accepts the versioned server-derived bootstrap DTO", () => {
    expect(constructionMobileBootstrapResponseSchema.parse(bootstrapFixture())).toEqual(
      bootstrapFixture(),
    );
  });

  it("rejects unknown fields and external transport authority", () => {
    const unknownField = { ...bootstrapFixture(), sessionToken: "must-not-leak" };
    expect(() => constructionMobileBootstrapResponseSchema.parse(unknownField)).toThrow();

    const transport = bootstrapFixture();
    transport.workspaces[0].permissions.externalTransportAuthorized = true as false;
    expect(() => constructionMobileBootstrapResponseSchema.parse(transport)).toThrow();
  });

  it("rejects a role with an inconsistent permission envelope", () => {
    const fixture = bootstrapFixture();
    const inconsistent = {
      ...fixture,
      workspaces: [{ ...fixture.workspaces[0], role: "FIELD_WORKER" as const }],
    };
    expect(() => constructionMobileBootstrapResponseSchema.parse(inconsistent)).toThrow(
      "CONSTRUCTION_MOBILE_ROLE_PERMISSIONS_INVALID",
    );
  });

  it("derives roles and least-privilege permissions on the server", () => {
    expect(constructionProjectionRole("owner")).toBe("OWNER");
    expect(constructionProjectionRole("admin")).toBe("OFFICE_MANAGER");
    expect(constructionProjectionRole("member")).toBe("FIELD_WORKER");

    expect(constructionPermissionsForRole("OWNER")).toMatchObject({
      financialsVisible: true,
      canManageReceivables: true,
      externalTransportAuthorized: false,
    });
    expect(constructionPermissionsForRole("FIELD_WORKER")).toEqual({
      financialsVisible: false,
      canManageReceivables: false,
      canScheduleFollowUps: false,
      canApprovePreparedActions: false,
      externalTransportAuthorized: false,
    });
  });
});
