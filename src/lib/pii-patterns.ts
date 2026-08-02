import "server-only";

/**
 * The three shapes that break RULE 1 and RULE 2 when free text crosses the
 * client↔worker wall: a price, an email address, a phone number.
 *
 * These lived inside assistant-scrub.ts, which was the only place that
 * checked anything — the worker's assistant messages. The audit found the
 * wall open in the other direction on Standing Capacity, where a client's
 * own words reach their assigned worker verbatim, so the patterns move here
 * and both callers share them. One definition, so a pattern improved for one
 * direction improves the other.
 *
 * Deliberately not a general PII detector. It catches the mechanical shapes
 * that let two people contact each other or read each other's number. A name
 * typed in prose ("ask for Jean") is not detectable by regex and is not
 * claimed to be — that is what the operator's review is for, and what
 * /security already tells users in as many words.
 */

const CURRENCY_RE = /(?:[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|dollars?|bucks)\b)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

export type PiiKind = "price" | "contact";

/** The first violating shape found, or null when the text is clean. */
export function findPii(text: string): PiiKind | null {
  if (CURRENCY_RE.test(text)) return "price";
  if (EMAIL_RE.test(text) || PHONE_RE.test(text)) return "contact";
  return null;
}
