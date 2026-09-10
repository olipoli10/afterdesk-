import { z } from "zod";

// Shared grammar only. Authority, temporal ordering and execution stay with callers.
export const personalCalendarDraftSchema = z.object({ title: z.string().trim().min(1).max(240), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(80) }).strict();
