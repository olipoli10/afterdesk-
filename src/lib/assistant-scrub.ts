import "server-only";

/**
 * A worker types free text into the assistant widget, and the architecture
 * deliberately has no automatic access to task data — which means a price
 * or a client's email/phone the worker copy-pastes by habit is the ONE way
 * protected data could reach this feature at all. Runs twice: once before
 * the message is sent to Anthropic (never let it leave at all), and once
 * before AssistantMessage.content is written to the database (the admin
 * pattern-clustering view renders that column — an unscrubbed row would be
 * a new disclosure surface that doesn't exist anywhere else on the
 * platform). Same blocked string either way.
 */

const CURRENCY_RE = /(?:[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|dollars?|bucks)\b)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

export type ScrubResult = { ok: true } | { ok: false; reason: string };

export function scrubCheck(text: string): ScrubResult {
  if (CURRENCY_RE.test(text)) {
    return {
      ok: false,
      reason: "Remove any price or dollar figure before sending — the assistant never discusses pricing.",
    };
  }
  if (EMAIL_RE.test(text) || PHONE_RE.test(text)) {
    return {
      ok: false,
      reason: "Remove any email address or phone number before sending — never paste contact details here.",
    };
  }
  return { ok: true };
}
