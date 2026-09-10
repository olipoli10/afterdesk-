import { z } from "zod";

export const personalGoogleStatusSchema = z.object({ configured: z.boolean(), connected: z.boolean(), readEnabled: z.boolean(), writeConsentGranted: z.boolean() }).strict();
export type PersonalGoogleStatus = z.infer<typeof personalGoogleStatusSchema>;
export const personalGoogleLaunchSchema = z.object({ launchUrl: z.string().url(), expiresAt: z.string().datetime() }).strict();
export const personalGoogleDisconnectSchema = z.object({ disconnected: z.literal(true), googleGrantRevoked: z.literal(false) }).strict();
export const personalGoogleEventsSchema = z.object({
  events: z.array(z.object({ id: z.string(), summary: z.string(), status: z.string().optional(), start: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }), end: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }) })),
  timeZone: z.string().nullable(), complete: z.literal(true), source: z.literal("GOOGLE_CALENDAR"),
}).strict();
export type PersonalGoogleEvents = z.infer<typeof personalGoogleEventsSchema>;
export const personalGoogleActionsSchema = z.object({ operations: z.array(z.object({ id: z.string(), requestHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.string(), draft: z.object({ title: z.string(), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string() }).strict() }).strict()) }).strict();
export type PersonalGoogleActions = z.infer<typeof personalGoogleActionsSchema>;

export function validatePersonalGoogleLaunch(value: unknown, apiBaseUrl: string) {
  const parsed = personalGoogleLaunchSchema.parse(value);
  const url = new URL(parsed.launchUrl);
  if (url.protocol !== "https:" || url.origin !== new URL(apiBaseUrl).origin || url.pathname !== "/api/endvera/v1/personal/google/launch" || url.username || url.password || url.hash || Date.parse(parsed.expiresAt) <= Date.now()) throw new Error("GOOGLE_LAUNCH_REFUSED");
  return parsed;
}
