import { describe, expect, it } from "vitest";
import { findPii } from "@/lib/pii-patterns";

/**
 * RULE 1 / RULE 2 on free text that crosses the wall.
 *
 * These patterns used to guard one direction only — the worker's assistant
 * messages on their way out. The audit found the other direction wide open:
 * on Standing Capacity a client's own words (account preferences, and the
 * task brief itself) reach their assigned worker verbatim, with no operator
 * in between, because that flow has no pricing stop.
 *
 * Two failure modes matter equally here, so both are pinned. Letting contact
 * details through breaks the wall. Rejecting ordinary working instructions
 * breaks the product — a client who cannot say "call sheet" or "3 rounds"
 * without being refused will stop using the field, and a filter people route
 * around protects nothing.
 */
describe("findPii — what must be blocked", () => {
  const contacts = [
    "call me at 514-555-0199",
    "reach me on (514) 555-0199",
    "+1 514 555 0199 anytime",
    "email jean@acme.ca directly",
    "my address is Jean.Tremblay+work@sub.domain.co.uk",
    "5145550199",
  ];
  for (const text of contacts) {
    it(`blocks contact details: ${text}`, () => {
      expect(findPii(text)).toBe("contact");
    });
  }

  const prices = ["my budget is $500", "I paid 74 USD for this", "around 1,200 dollars", "€300 max"];
  for (const text of prices) {
    it(`blocks price figures: ${text}`, () => {
      expect(findPii(text)).toBe("price");
    });
  }
});

describe("findPii — what must still get through", () => {
  /**
   * Real working instructions a Standing Capacity client would plausibly
   * write. If any of these start failing, the filter has become a product
   * defect rather than a guard.
   */
  const legitimate = [
    "Short bullet points, no long paragraphs please.",
    "Deliver as .xlsx with one tab per region.",
    "I prefer 3 rounds of review before anything is final.",
    "Use the 2026 template, not the old one.",
    "Sort by column C, then by date descending.",
    "Flag anything that looks like a duplicate rather than deleting it.",
    "Our fiscal year starts in April, so Q1 means April to June.",
    "Keep phone numbers in the source format, do not reformat them.",
    "Deadline is tight this week — prioritise the supplier list.",
    "Write in Canadian English, not American.",
  ];
  for (const text of legitimate) {
    it(`allows ordinary instructions: ${text}`, () => {
      expect(findPii(text)).toBeNull();
    });
  }
});
