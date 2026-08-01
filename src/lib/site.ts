/**
 * Canonical site origin for metadata, sitemaps and share cards.
 * Falls back to the intended production domain; override per environment.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://afterdesk.co";

/**
 * The worker side's brand name — one word, states the value directly, reads
 * clearly to a non-native English speaker. Not translated (same treatment as
 * the AfterDesk wordmark itself staying literal inside French/Spanish/Tagalog
 * copy): used verbatim on the audience toggle in every language, which is
 * the one place a first-time visitor decides which door is theirs. Change it
 * here — nowhere else references the literal string.
 */
export const WORKER_SIDE_LABEL = "EARN";
