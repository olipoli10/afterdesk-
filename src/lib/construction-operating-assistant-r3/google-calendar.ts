import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_CALENDAR_WRITE_SCOPE,
  type CalendarConnectionMode,
} from "@/lib/construction-operating-assistant-r3/connector-contracts";

export const GOOGLE_CALENDAR_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth" as const;

export function googleCalendarScopesForMode(mode: CalendarConnectionMode): string[] {
  return mode === "READ_ONLY"
    ? [GOOGLE_CALENDAR_READ_SCOPE]
    : [GOOGLE_CALENDAR_WRITE_SCOPE];
}

export function googleCalendarConsentPlan(mode: CalendarConnectionMode) {
  return {
    provider: "google_calendar" as const,
    mode,
    authorizationEndpoint: GOOGLE_CALENDAR_AUTHORIZATION_ENDPOINT,
    accessType: "offline" as const,
    includeGrantedScopes: true,
    prompt: "consent" as const,
    scopes: googleCalendarScopesForMode(mode),
    authorizationUrl: null,
    missingConfiguration: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_REDIRECT_URI",
      "ENCRYPTED_TOKEN_STORE",
    ] as const,
    externalTransportPerformed: false as const,
  };
}

const googleAuthoritySchema = z
  .object({
    accountStatus: z.literal("connected"),
    grantedScopes: z.array(z.string().min(1)),
    revokedAt: z.null(),
  })
  .strict();

export type GoogleCalendarAuthority = z.infer<typeof googleAuthoritySchema>;

function requireScope(authority: GoogleCalendarAuthority, required: "read" | "write") {
  const parsed = googleAuthoritySchema.parse(authority);
  const hasWrite = parsed.grantedScopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE);
  const allowed = required === "write"
    ? hasWrite
    : hasWrite || parsed.grantedScopes.includes(GOOGLE_CALENDAR_READ_SCOPE);
  if (!allowed) throw new Error(`GOOGLE_CALENDAR_${required.toUpperCase()}_SCOPE_REQUIRED`);
}

function requireTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date(0));
  } catch {
    throw new Error("INVALID_IANA_TIMEZONE");
  }
}

function requireOrderedTimes(start: string, end: string): void {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("INVALID_CALENDAR_TIME_RANGE");
  }
}

export function deterministicGoogleEventId(input: {
  workspaceId: string;
  calendarItemId: string;
  idempotencyKey: string;
}): string {
  // SHA-256 hexadecimal already uses a valid base32hex subset (0-9, a-f).
  // Prefixing the truncated digest gives a stable 32-character provider ID.
  return `e${sha256Canonical({
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    calendarItemId: input.calendarItemId,
    idempotencyKey: input.idempotencyKey,
  }).slice(0, 31)}`;
}

export type PreparedGoogleCalendarRequest = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  requiredScope: typeof GOOGLE_CALENDAR_READ_SCOPE | typeof GOOGLE_CALENDAR_WRITE_SCOPE;
  externalTransportPerformed: false;
};

export function prepareGoogleCalendarInsert(input: {
  authority: GoogleCalendarAuthority;
  workspaceId: string;
  calendarItemId: string;
  idempotencyKey: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
}): PreparedGoogleCalendarRequest {
  requireScope(input.authority, "write");
  requireTimezone(input.timezone);
  requireOrderedTimes(input.startsAt, input.endsAt);
  if (!input.title.trim() || input.title.length > 240) throw new Error("INVALID_CALENDAR_TITLE");
  return {
    method: "POST",
    path: "/calendar/v3/calendars/primary/events",
    query: { sendUpdates: "none", supportsAttachments: "false" },
    headers: { "content-type": "application/json" },
    body: {
      id: deterministicGoogleEventId(input),
      summary: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      start: { dateTime: input.startsAt, timeZone: input.timezone },
      end: { dateTime: input.endsAt, timeZone: input.timezone },
      reminders: { useDefault: true },
      extendedProperties: {
        private: {
          endveraLinkKey: sha256Canonical({
            schemaVersion: 1,
            workspaceId: input.workspaceId,
            calendarItemId: input.calendarItemId,
          }),
        },
      },
    },
    requiredScope: GOOGLE_CALENDAR_WRITE_SCOPE,
    externalTransportPerformed: false,
  };
}

export function prepareGoogleCalendarPatch(input: {
  authority: GoogleCalendarAuthority;
  providerEventId: string;
  etag: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}): PreparedGoogleCalendarRequest {
  requireScope(input.authority, "write");
  requireTimezone(input.timezone);
  requireOrderedTimes(input.startsAt, input.endsAt);
  if (!/^[a-v0-9]{5,1024}$/.test(input.providerEventId)) throw new Error("INVALID_GOOGLE_EVENT_ID");
  if (!input.etag.trim()) throw new Error("GOOGLE_EVENT_ETAG_REQUIRED");
  return {
    method: "PATCH",
    path: `/calendar/v3/calendars/primary/events/${encodeURIComponent(input.providerEventId)}`,
    query: { sendUpdates: "none", supportsAttachments: "false" },
    headers: { "content-type": "application/json", "if-match": input.etag },
    body: {
      start: { dateTime: input.startsAt, timeZone: input.timezone },
      end: { dateTime: input.endsAt, timeZone: input.timezone },
    },
    requiredScope: GOOGLE_CALENDAR_WRITE_SCOPE,
    externalTransportPerformed: false,
  };
}

export function prepareGoogleCalendarSync(input: {
  authority: GoogleCalendarAuthority;
  syncToken?: string | null;
  pageToken?: string | null;
}): PreparedGoogleCalendarRequest {
  requireScope(input.authority, "read");
  const query: Record<string, string> = {
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
  };
  if (input.syncToken) query.syncToken = input.syncToken;
  if (input.pageToken) query.pageToken = input.pageToken;
  return {
    method: "GET",
    path: "/calendar/v3/calendars/primary/events",
    query,
    headers: {},
    body: null,
    requiredScope: GOOGLE_CALENDAR_READ_SCOPE,
    externalTransportPerformed: false,
  };
}

export type GoogleCalendarSyncDisposition =
  | "APPLY_PAGE"
  | "FULL_RESYNC_REQUIRED"
  | "REAUTHORIZATION_REQUIRED"
  | "RETRY_LATER"
  | "REFUSED";

export function classifyGoogleCalendarSyncResponse(status: number): GoogleCalendarSyncDisposition {
  if (status >= 200 && status < 300) return "APPLY_PAGE";
  if (status === 410) return "FULL_RESYNC_REQUIRED";
  if (status === 401 || status === 403) return "REAUTHORIZATION_REQUIRED";
  if (status === 429 || status >= 500) return "RETRY_LATER";
  return "REFUSED";
}

export async function executeGoogleCalendarRequest(): Promise<never> {
  throw new Error("GOOGLE_CALENDAR_EXTERNAL_TRANSPORT_DISABLED_R3");
}
