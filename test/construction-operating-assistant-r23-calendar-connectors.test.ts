import { describe, expect, it } from "vitest";
import {
  calendarConnectorCommandSchema,
  calendarConnectorCockpitSchema,
  calendarProviderScopes,
  microsoftCalendarAuthoritySchema,
} from "@/lib/construction-operating-assistant-r23/contracts";
import {
  classifyCalendarProviderResponse,
  executeCalendarProviderRequest,
  prepareCalendarConsentPlan,
  prepareGoogleCalendarCreate,
  prepareMicrosoftCalendarCreate,
  prepareMicrosoftCalendarSync,
  prepareMicrosoftCalendarUpdate,
} from "@/lib/construction-operating-assistant-r23/providers";

const microsoftAuthority = microsoftCalendarAuthoritySchema.parse({
  accountStatus: "connected",
  grantedScopes: ["Calendars.ReadWrite"],
  revokedAt: null,
});

describe("R23 calendar connector contracts", () => {
  it("keeps Google and Microsoft least-privilege scopes explicit", () => {
    expect(calendarProviderScopes("google_calendar", "READ_ONLY")).toEqual([
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ]);
    expect(calendarProviderScopes("microsoft_calendar", "READ_WRITE")).toEqual([
      "Calendars.ReadWrite",
    ]);
    expect(prepareCalendarConsentPlan("microsoft_calendar", "READ_ONLY")).toMatchObject({
      provider: "microsoft_calendar",
      requestedScopes: ["Calendars.Read"],
      authorizationUrl: null,
      externalTransportPerformed: false,
    });
  });

  it("rejects unknown command and cockpit fields", () => {
    const base = {
      schemaVersion: 1 as const,
      action: "PREPARE_CONNECTION" as const,
      commandId: "5fc8cf6f-0e0d-4a12-8913-930f9b3d9105",
      requestId: "r23-request-1",
      idempotencyKey: "r23-idempotency-1",
      workspaceId: "workspace-1",
      provider: "google_calendar" as const,
      mode: "READ_ONLY" as const,
      expectedStateVersion: 0,
    };
    expect(calendarConnectorCommandSchema.safeParse({ ...base, unknown: true }).success).toBe(false);
    expect(calendarConnectorCockpitSchema.safeParse({
      schemaVersion: 1,
      workspaceId: "workspace-1",
      role: "owner",
      providers: [],
      externalTransportEnabled: false,
      secretValuesVisible: false,
      unknown: true,
    }).success).toBe(false);
  });

  it("prepares deterministic notification-free Google and Microsoft creates", () => {
    const common = {
      workspaceId: "workspace-1",
      calendarItemId: "calendar-item-1",
      idempotencyKey: "calendar-write-1",
      title: "Visite chantier Laval",
      description: "Vérifier les fenêtres",
      startsAt: "2026-09-08T13:00:00.000Z",
      endsAt: "2026-09-08T14:00:00.000Z",
      timezone: "America/Toronto",
    };
    const google = prepareGoogleCalendarCreate({
      authority: {
        accountStatus: "connected",
        grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
        revokedAt: null,
      },
      ...common,
    });
    const microsoft = prepareMicrosoftCalendarCreate({ authority: microsoftAuthority, ...common });
    expect(google.query).toEqual({ sendUpdates: "none", supportsAttachments: "false" });
    expect(google.externalTransportPerformed).toBe(false);
    expect(microsoft.path).toBe("/v1.0/me/events");
    expect(microsoft.body).toMatchObject({
      subject: "Visite chantier Laval",
      isReminderOn: true,
      responseRequested: false,
    });
    expect(microsoft.externalTransportPerformed).toBe(false);
  });

  it("binds Microsoft delta and updates to exact ranges and preconditions", () => {
    const sync = prepareMicrosoftCalendarSync({
      authority: microsoftAuthority,
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      timezone: "America/Toronto",
      deltaCursor: null,
    });
    expect(sync).toMatchObject({
      method: "GET",
      path: "/v1.0/me/calendarView/delta",
      requiredScope: "Calendars.ReadWrite",
      externalTransportPerformed: false,
    });
    expect(sync.query).toEqual({
      startDateTime: "2026-09-01T00:00:00.000Z",
      endDateTime: "2026-10-01T00:00:00.000Z",
    });

    const update = prepareMicrosoftCalendarUpdate({
      authority: microsoftAuthority,
      providerEventId: "synthetic-event-123",
      changeKey: "W/\"synthetic-change-key\"",
      startsAt: "2026-09-08T15:00:00.000Z",
      endsAt: "2026-09-08T16:00:00.000Z",
      timezone: "America/Toronto",
    });
    expect(update.headers["if-match"]).toBe("W/\"synthetic-change-key\"");
    expect(update.path).toBe("/v1.0/me/events/synthetic-event-123");
  });

  it("classifies provider failures explicitly and exposes no executor", async () => {
    expect(classifyCalendarProviderResponse("google_calendar", 410)).toBe("FULL_RESYNC_REQUIRED");
    expect(classifyCalendarProviderResponse("microsoft_calendar", 412)).toBe(
      "CONFLICT_REQUIRES_REVIEW",
    );
    expect(classifyCalendarProviderResponse("microsoft_calendar", 401)).toBe(
      "REAUTHORIZATION_REQUIRED",
    );
    expect(classifyCalendarProviderResponse("google_calendar", 429)).toBe("RETRY_LATER");
    await expect(executeCalendarProviderRequest()).rejects.toThrow(
      "CALENDAR_PROVIDER_EXTERNAL_TRANSPORT_DISABLED_R23",
    );
  });
});
