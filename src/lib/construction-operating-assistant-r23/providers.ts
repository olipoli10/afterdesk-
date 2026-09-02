import { z } from "zod";
import {
  googleCalendarConsentPlan,
  prepareGoogleCalendarInsert,
  type PreparedGoogleCalendarRequest,
} from "@/lib/construction-operating-assistant-r3/google-calendar";
import {
  calendarConnectorProviderSchema,
  calendarProviderScopes,
  googleCalendarAuthoritySchema,
  microsoftCalendarAuthoritySchema,
  MICROSOFT_CALENDAR_READ_SCOPE,
  MICROSOFT_CALENDAR_WRITE_SCOPE,
  type CalendarConnectorProvider,
  type CalendarProviderDisposition,
  type MicrosoftCalendarAuthority,
} from "@/lib/construction-operating-assistant-r23/contracts";
import type { CalendarConnectionMode } from "@/lib/construction-operating-assistant-r3/connector-contracts";

const MICROSOFT_GRAPH_ORIGIN = "https://graph.microsoft.com" as const;

const providerDefinitions = {
  google_calendar: {
    label: "Google Calendar",
    missingConfiguration: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_REDIRECT_URI",
      "ENCRYPTED_TOKEN_STORE",
    ],
  },
  microsoft_calendar: {
    label: "Microsoft Calendar",
    missingConfiguration: [
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_TENANT_MODE",
      "MICROSOFT_REDIRECT_URI",
      "ENCRYPTED_TOKEN_STORE",
    ],
  },
} as const;

export function calendarProviderDefinition(provider: CalendarConnectorProvider) {
  return providerDefinitions[calendarConnectorProviderSchema.parse(provider)];
}

export function prepareCalendarConsentPlan(
  provider: CalendarConnectorProvider,
  mode: CalendarConnectionMode,
) {
  const definition = calendarProviderDefinition(provider);
  if (provider === "google_calendar") {
    const google = googleCalendarConsentPlan(mode);
    return {
      schemaVersion: 1 as const,
      provider,
      label: definition.label,
      mode,
      requestedScopes: google.scopes,
      authorizationEndpoint: google.authorizationEndpoint,
      authorizationUrl: null,
      missingConfiguration: [...definition.missingConfiguration],
      externalTransportPerformed: false as const,
    };
  }
  return {
    schemaVersion: 1 as const,
    provider,
    label: definition.label,
    mode,
    requestedScopes: calendarProviderScopes(provider, mode),
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    authorizationUrl: null,
    missingConfiguration: [...definition.missingConfiguration],
    externalTransportPerformed: false as const,
  };
}

export type PreparedMicrosoftCalendarRequest = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  requiredScope: typeof MICROSOFT_CALENDAR_READ_SCOPE | typeof MICROSOFT_CALENDAR_WRITE_SCOPE;
  externalTransportPerformed: false;
};

function requireMicrosoftScope(authority: MicrosoftCalendarAuthority, required: "read" | "write") {
  const parsed = microsoftCalendarAuthoritySchema.parse(authority);
  const hasWrite = parsed.grantedScopes.includes(MICROSOFT_CALENDAR_WRITE_SCOPE);
  const allowed = required === "write"
    ? hasWrite
    : hasWrite || parsed.grantedScopes.includes(MICROSOFT_CALENDAR_READ_SCOPE);
  if (!allowed) throw new Error(`MICROSOFT_CALENDAR_${required.toUpperCase()}_SCOPE_REQUIRED`);
  return required === "write" || hasWrite
    ? MICROSOFT_CALENDAR_WRITE_SCOPE
    : MICROSOFT_CALENDAR_READ_SCOPE;
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

const microsoftEventIdSchema = z.string().min(5).max(512).regex(/^[A-Za-z0-9_=+.-]+$/);

function microsoftDateTime(value: string, timezone: string) {
  return { dateTime: value, timeZone: timezone };
}

export function prepareGoogleCalendarCreate(
  input: Parameters<typeof prepareGoogleCalendarInsert>[0],
): PreparedGoogleCalendarRequest {
  googleCalendarAuthoritySchema.parse(input.authority);
  return prepareGoogleCalendarInsert(input);
}

export function prepareMicrosoftCalendarSync(input: {
  authority: MicrosoftCalendarAuthority;
  startsAt: string;
  endsAt: string;
  timezone: string;
  deltaCursor: string | null;
}): PreparedMicrosoftCalendarRequest {
  const requiredScope = requireMicrosoftScope(input.authority, "read");
  requireTimezone(input.timezone);
  requireOrderedTimes(input.startsAt, input.endsAt);
  if (input.deltaCursor) {
    const cursor = new URL(input.deltaCursor);
    if (
      cursor.origin !== MICROSOFT_GRAPH_ORIGIN ||
      !cursor.pathname.startsWith("/v1.0/me/calendarView/delta")
    ) {
      throw new Error("INVALID_MICROSOFT_DELTA_CURSOR");
    }
    return {
      method: "GET",
      path: `${cursor.pathname}${cursor.search}`,
      query: {},
      headers: { Prefer: "odata.maxpagesize=250" },
      body: null,
      requiredScope,
      externalTransportPerformed: false,
    };
  }
  return {
    method: "GET",
    path: "/v1.0/me/calendarView/delta",
    query: { startDateTime: input.startsAt, endDateTime: input.endsAt },
    headers: { Prefer: "odata.maxpagesize=250" },
    body: null,
    requiredScope,
    externalTransportPerformed: false,
  };
}

export function prepareMicrosoftCalendarCreate(input: {
  authority: MicrosoftCalendarAuthority;
  workspaceId: string;
  calendarItemId: string;
  idempotencyKey: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
}): PreparedMicrosoftCalendarRequest {
  const requiredScope = requireMicrosoftScope(input.authority, "write");
  requireTimezone(input.timezone);
  requireOrderedTimes(input.startsAt, input.endsAt);
  if (!input.title.trim() || input.title.length > 240) throw new Error("INVALID_CALENDAR_TITLE");
  return {
    method: "POST",
    path: "/v1.0/me/events",
    query: {},
    headers: { "content-type": "application/json" },
    body: {
      subject: input.title.trim(),
      body: {
        contentType: "text",
        content: input.description?.trim() ?? "",
      },
      start: microsoftDateTime(input.startsAt, input.timezone),
      end: microsoftDateTime(input.endsAt, input.timezone),
      isReminderOn: true,
      responseRequested: false,
      transactionId: input.idempotencyKey,
      extensions: [
        {
          "@odata.type": "microsoft.graph.openTypeExtension",
          extensionName: "com.endvera.calendar",
          workspaceId: input.workspaceId,
          calendarItemId: input.calendarItemId,
        },
      ],
    },
    requiredScope,
    externalTransportPerformed: false,
  };
}

export function prepareMicrosoftCalendarUpdate(input: {
  authority: MicrosoftCalendarAuthority;
  providerEventId: string;
  changeKey: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}): PreparedMicrosoftCalendarRequest {
  const requiredScope = requireMicrosoftScope(input.authority, "write");
  requireTimezone(input.timezone);
  requireOrderedTimes(input.startsAt, input.endsAt);
  const providerEventId = microsoftEventIdSchema.parse(input.providerEventId);
  if (!input.changeKey.trim() || input.changeKey.length > 2048) {
    throw new Error("MICROSOFT_EVENT_CHANGE_KEY_REQUIRED");
  }
  return {
    method: "PATCH",
    path: `/v1.0/me/events/${encodeURIComponent(providerEventId)}`,
    query: {},
    headers: {
      "content-type": "application/json",
      "if-match": input.changeKey,
    },
    body: {
      start: microsoftDateTime(input.startsAt, input.timezone),
      end: microsoftDateTime(input.endsAt, input.timezone),
      responseRequested: false,
    },
    requiredScope,
    externalTransportPerformed: false,
  };
}

export function classifyCalendarProviderResponse(
  provider: CalendarConnectorProvider,
  status: number,
): CalendarProviderDisposition {
  calendarConnectorProviderSchema.parse(provider);
  if (status >= 200 && status < 300) return "APPLY_PAGE";
  if (status === 401 || status === 403) return "REAUTHORIZATION_REQUIRED";
  if (status === 409 || status === 412) return "CONFLICT_REQUIRES_REVIEW";
  if (status === 410) return "FULL_RESYNC_REQUIRED";
  if (status === 429 || status >= 500) return "RETRY_LATER";
  return "REFUSED";
}

export async function executeCalendarProviderRequest(): Promise<never> {
  throw new Error("CALENDAR_PROVIDER_EXTERNAL_TRANSPORT_DISABLED_R23");
}
