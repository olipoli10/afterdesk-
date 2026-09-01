import { describe, expect, it } from "vitest";
import {
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_CALENDAR_WRITE_SCOPE,
  manageCalendarConnectorSchema,
} from "../src/lib/construction-operating-assistant-r3/connector-contracts";
import {
  classifyGoogleCalendarSyncResponse,
  deterministicGoogleEventId,
  executeGoogleCalendarRequest,
  googleCalendarConsentPlan,
  prepareGoogleCalendarInsert,
  prepareGoogleCalendarPatch,
  prepareGoogleCalendarSync,
} from "../src/lib/construction-operating-assistant-r3/google-calendar";

const writeAuthority = {
  accountStatus: "connected" as const,
  grantedScopes: [GOOGLE_CALENDAR_WRITE_SCOPE],
  revokedAt: null,
};

describe("ENDVERA Google Calendar connector R3", () => {
  it("requests the narrowest scope and remains unconfigured for external activation", () => {
    const read = googleCalendarConsentPlan("READ_ONLY");
    const write = googleCalendarConsentPlan("READ_WRITE");
    expect(read.scopes).toEqual([GOOGLE_CALENDAR_READ_SCOPE]);
    expect(write.scopes).toEqual([GOOGLE_CALENDAR_WRITE_SCOPE]);
    expect(read.authorizationUrl).toBeNull();
    expect(read.externalTransportPerformed).toBe(false);
  });

  it("rejects unknown management fields and malformed command IDs", () => {
    expect(() => manageCalendarConnectorSchema.parse({
      schemaVersion: 1,
      action: "PREPARE_CONNECTION",
      commandId: "not-a-uuid",
      workspaceId: "workspace-1",
      mode: "READ_ONLY",
      execute: true,
    })).toThrow();
  });

  it("builds a deterministic, provider-valid insert without attendees or notifications", () => {
    const input = {
      authority: writeAuthority,
      workspaceId: "workspace-1",
      calendarItemId: "calendar-1",
      idempotencyKey: "command-1",
      title: "Visite du chantier Laval",
      startsAt: "2026-09-02T14:00:00.000Z",
      endsAt: "2026-09-02T15:00:00.000Z",
      timezone: "America/Toronto",
    };
    const first = prepareGoogleCalendarInsert(input);
    const second = prepareGoogleCalendarInsert(input);
    const renamed = prepareGoogleCalendarInsert({ ...input, title: "Visite renommée" });
    const body = first.body as Record<string, unknown>;
    expect(body.id).toBe(deterministicGoogleEventId(input));
    expect(body.id).toBe((second.body as Record<string, unknown>).id);
    expect(body.id).toBe((renamed.body as Record<string, unknown>).id);
    expect(body.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(body).not.toHaveProperty("attendees");
    expect(JSON.stringify(body)).not.toContain("workspace-1");
    expect(JSON.stringify(body)).not.toContain("calendar-1");
    expect(first.query.sendUpdates).toBe("none");
    expect(first.externalTransportPerformed).toBe(false);
  });

  it("requires exact write authority and an etag before preparing a patch", () => {
    expect(() => prepareGoogleCalendarInsert({
      authority: { accountStatus: "connected", grantedScopes: [GOOGLE_CALENDAR_READ_SCOPE], revokedAt: null },
      workspaceId: "workspace-1",
      calendarItemId: "calendar-1",
      idempotencyKey: "command-1",
      title: "Visite",
      startsAt: "2026-09-02T14:00:00.000Z",
      endsAt: "2026-09-02T15:00:00.000Z",
      timezone: "America/Toronto",
    })).toThrow("GOOGLE_CALENDAR_WRITE_SCOPE_REQUIRED");
    expect(() => prepareGoogleCalendarPatch({
      authority: writeAuthority,
      providerEventId: "e12345",
      etag: "",
      startsAt: "2026-09-02T15:00:00.000Z",
      endsAt: "2026-09-02T16:00:00.000Z",
      timezone: "America/Toronto",
    })).toThrow("GOOGLE_EVENT_ETAG_REQUIRED");
  });

  it("preserves sync semantics and treats a 410 as a required full resync", () => {
    const request = prepareGoogleCalendarSync({
      authority: { accountStatus: "connected", grantedScopes: [GOOGLE_CALENDAR_READ_SCOPE], revokedAt: null },
      syncToken: "opaque-sync-token",
    });
    expect(request.query.syncToken).toBe("opaque-sync-token");
    expect(request.query.showDeleted).toBe("true");
    expect(classifyGoogleCalendarSyncResponse(410)).toBe("FULL_RESYNC_REQUIRED");
    expect(classifyGoogleCalendarSyncResponse(403)).toBe("REAUTHORIZATION_REQUIRED");
  });

  it("has no external executor in R3", async () => {
    await expect(executeGoogleCalendarRequest()).rejects.toThrow(
      "GOOGLE_CALENDAR_EXTERNAL_TRANSPORT_DISABLED_R3",
    );
  });
});
