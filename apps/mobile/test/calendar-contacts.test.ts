import { describe, expect, it } from "vitest";
import { parseMobileCockpit } from "../src/lib/contracts";

function cockpit(role: "OWNER" | "FIELD_WORKER") {
  const owner = role === "OWNER";
  const project = {
    id: "project-1",
    code: "LAVAL-001",
    name: "Rénovation Laval",
  };
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-01T13:00:00.000Z",
    workspace: {
      id: "workspace-1",
      name: "ENDVERA Construction",
      defaultTimezone: "America/Toronto",
      defaultLocale: "fr-CA",
      projects: [{ ...project, status: "active", _count: { contacts: 1, calendarItems: 1, openLoops: 0 } }],
      role,
    },
    permissions: {
      financialsVisible: owner,
      canManageReceivables: owner,
      canScheduleFollowUps: owner,
      canApprovePreparedActions: owner,
      canAddEvidence: true,
      externalTransportAuthorized: false,
    },
    projects: [{ ...project, status: "active", _count: { contacts: 1, calendarItems: 1, openLoops: 0 } }],
    contacts: [
      {
        id: "contact-1",
        displayName: "Marc",
        companyName: "Portes Laval",
        role: "Fournisseur",
        preferredLanguage: "fr",
        project,
        ...(owner
          ? { normalizedPhone: "+15555550184", normalizedEmail: "marc@example.invalid" }
          : {}),
      },
    ],
    calendar: [
      {
        id: "calendar-1",
        startsAt: "2026-09-02T18:00:00.000Z",
        endsAt: null,
        timezone: "America/Toronto",
        verificationState: "verified",
        project,
        contact: { id: "contact-1", displayName: "Marc" },
        ...(owner ? { title: "Rendez-vous avec Marc" } : {}),
      },
    ],
    openLoops: [],
    actions: [],
    receivables: [],
  };
}

describe("R13 native Calendar and Contacts contracts", () => {
  it("accepts exact owner contact and calendar projections", () => {
    const parsed = parseMobileCockpit(cockpit("OWNER"));
    expect(parsed.contacts[0]).toMatchObject({
      displayName: "Marc",
      normalizedPhone: "+15555550184",
      normalizedEmail: "marc@example.invalid",
      project: { code: "LAVAL-001" },
    });
    expect(parsed.calendar[0]).toMatchObject({
      title: "Rendez-vous avec Marc",
      project: { code: "LAVAL-001" },
    });
  });

  it("accepts the redacted field projection and refuses private contact leakage", () => {
    const parsed = parseMobileCockpit(cockpit("FIELD_WORKER"));
    expect(parsed.contacts[0]).not.toHaveProperty("normalizedPhone");
    expect(parsed.calendar[0]).not.toHaveProperty("title");

    const leaked = cockpit("FIELD_WORKER");
    leaked.contacts[0] = {
      ...leaked.contacts[0],
      normalizedPhone: "+15555550184",
    } as never;
    expect(() => parseMobileCockpit(leaked)).toThrow("MOBILE_FIELD_PROJECTION_REFUSED");
  });
});
